import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { PdfRenderConfig, UseCase } from "../shared/useCaseSchema.js";
import {
  type ApprovalMode,
  type ApprovalRecord,
  type Batch,
  type Decision,
  type DetectedIssue,
  type Gate,
  type QaReport,
  type QaVerdict,
  type ReviewPolicy,
  type Run,
  type RunAgentSnapshot,
  type RunEvent,
  type RunEventType,
  type RunIssue,
  type RunStatus,
  type RunSummary,
  type Stage,
  type TransientStatus,
  TRANSIENT_FALLBACK,
} from "./types.js";

// This module deliberately does NOT import ../config.js: config throws at import
// time when the selected provider's API key is missing, which would make the
// store untestable. Callers pass paths in.

const DDL = `
CREATE TABLE IF NOT EXISTS batches (
  id             TEXT PRIMARY KEY,
  name           TEXT,
  review_policy  TEXT NOT NULL,
  approval_mode  TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id                   TEXT PRIMARY KEY,
  batch_id             TEXT NOT NULL REFERENCES batches(id),
  name                 TEXT NOT NULL,
  status               TEXT NOT NULL,
  paused               INTEGER NOT NULL DEFAULT 0,

  review_policy        TEXT NOT NULL,
  approval_mode        TEXT NOT NULL,

  raw_content          TEXT NOT NULL,
  content_json         TEXT,
  config_json          TEXT NOT NULL,
  agent_json           TEXT,
  qa_json              TEXT,

  pdf_path             TEXT,
  rendered_fingerprint TEXT,
  artifact_sha256      TEXT,

  extract_attempts     INTEGER NOT NULL DEFAULT 0,
  render_attempts      INTEGER NOT NULL DEFAULT 0,
  next_attempt_at      TEXT,
  last_error           TEXT,
  last_error_stage     TEXT,

  locked_at            TEXT,
  locked_by            TEXT,

  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_claim
  ON runs(status, paused, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_lease ON runs(status, locked_at);

CREATE TABLE IF NOT EXISTS run_issues (
  id                       TEXT PRIMARY KEY,
  run_id                   TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  issue_key                TEXT NOT NULL,
  finding_fingerprint      TEXT NOT NULL,
  -- Human-readable structural coordinate (e.g. summary.solutions.bullet_count_exact).
  -- issue_key is a hash of it; keeping the plain value lets a client anchor an
  -- issue to the field it refers to.
  locator                  TEXT NOT NULL DEFAULT '',
  code                     TEXT NOT NULL,
  severity                 TEXT NOT NULL,
  source                   TEXT NOT NULL,
  message                  TEXT NOT NULL,
  status                   TEXT NOT NULL,
  resolution_action        TEXT,
  resolution_reviewer_name TEXT,
  resolution_note          TEXT,
  resolved_at              TEXT,
  detected_at              TEXT NOT NULL,
  last_seen_at             TEXT NOT NULL,
  UNIQUE(run_id, issue_key)
);

CREATE INDEX IF NOT EXISTS idx_run_issues_open
  ON run_issues(run_id, status, severity);

CREATE TABLE IF NOT EXISTS approvals (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES runs(id),
  gate                TEXT NOT NULL,
  decision            TEXT NOT NULL,
  reviewer_name       TEXT NOT NULL,
  note                TEXT,
  content_fingerprint TEXT NOT NULL,
  artifact_sha256     TEXT,
  decided_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approvals_run ON approvals(run_id, decided_at);

CREATE TABLE IF NOT EXISTS run_events (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  type        TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  actor       TEXT NOT NULL,
  detail_json TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE(run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, seq);
`;

// ---------------------------------------------------------------------------
// Fingerprints
// ---------------------------------------------------------------------------

// Recursively key-sorted JSON, so two structurally identical payloads always
// hash the same regardless of property insertion order.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

// Covers content AND config because the rendered PDF depends on both.
export function fingerprint(content: unknown, config: unknown): string {
  return sha256Hex(JSON.stringify(canonicalize({ content, config })));
}

// The LOGICAL LOCATION of a finding. Deliberately excludes the message and the
// observed values, so re-detecting at the same place matches the same row.
export function issueKeyOf(d: DetectedIssue): string {
  return sha256Hex([d.code, d.source, d.locator].join("\0"));
}

// The CONCRETE FINDING at that location, including observed values. A changed
// finding at an unchanged location yields a different fingerprint, which is what
// makes a stale waiver reopen instead of silently absolving the new finding.
export function findingFingerprintOf(d: DetectedIssue): string {
  const normalizedMessage = d.message.trim().replace(/\s+/g, " ");
  return sha256Hex(
    [d.code, d.source, d.locator, normalizedMessage, d.detail ?? ""].join("\0")
  );
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface RunRow {
  id: string;
  batch_id: string;
  name: string;
  status: string;
  paused: number;
  review_policy: string;
  approval_mode: string;
  raw_content: string;
  content_json: string | null;
  config_json: string;
  agent_json: string | null;
  qa_json: string | null;
  pdf_path: string | null;
  rendered_fingerprint: string | null;
  artifact_sha256: string | null;
  extract_attempts: number;
  render_attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  last_error_stage: string | null;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(raw: string | null): T | null {
  return raw === null ? null : (JSON.parse(raw) as T);
}

function mapRun(row: RunRow): Run {
  return {
    id: row.id,
    batchId: row.batch_id,
    name: row.name,
    status: row.status as RunStatus,
    paused: row.paused === 1,
    reviewPolicy: row.review_policy as ReviewPolicy,
    approvalMode: row.approval_mode as ApprovalMode,
    rawContent: row.raw_content,
    content: parseJson<UseCase>(row.content_json),
    config: JSON.parse(row.config_json) as PdfRenderConfig,
    agent: parseJson<RunAgentSnapshot>(row.agent_json),
    qa: parseJson<QaReport>(row.qa_json),
    pdfPath: row.pdf_path,
    renderedFingerprint: row.rendered_fingerprint,
    artifactSha256: row.artifact_sha256,
    extractAttempts: row.extract_attempts,
    renderAttempts: row.render_attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    lastErrorStage: row.last_error_stage as Stage | null,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface IssueRow {
  id: string;
  run_id: string;
  issue_key: string;
  finding_fingerprint: string;
  locator: string;
  code: string;
  severity: string;
  source: string;
  message: string;
  status: string;
  resolution_action: string | null;
  resolution_reviewer_name: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  detected_at: string;
  last_seen_at: string;
}

function mapIssue(row: IssueRow): RunIssue {
  return {
    id: row.id,
    runId: row.run_id,
    issueKey: row.issue_key,
    findingFingerprint: row.finding_fingerprint,
    locator: row.locator,
    code: row.code,
    severity: row.severity as RunIssue["severity"],
    source: row.source as RunIssue["source"],
    message: row.message,
    status: row.status as RunIssue["status"],
    resolutionAction: row.resolution_action as RunIssue["resolutionAction"],
    resolutionReviewerName: row.resolution_reviewer_name,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
    detectedAt: row.detected_at,
    lastSeenAt: row.last_seen_at,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface StoreOptions {
  /** SQLite file path, or ":memory:" for tests. */
  dbPath: string;
  /** Root for rendered artifacts: <artifactRoot>/<run_id>/<sha256>.pdf */
  artifactRoot: string;
  /** Injectable for tests that need to age a lease or advance a backoff. */
  clock?: () => Date;
}

// Comfortably longer than any single extraction + render, so a healthy worker is
// never reclaimed mid-stage. Ownership guards make a spurious reclaim safe
// rather than corrupting, so erring long costs only recovery latency.
// ponytail: fixed lease, no heartbeat renewal. Add renewal only if a legitimate
// stage can ever exceed LEASE_MS.
export const LEASE_MS = 10 * 60_000;
export const MAX_EXTRACT_ATTEMPTS = 3;
export const MAX_RENDER_ATTEMPTS = 3;

/** Exponential backoff per stage, capped so a stuck provider is retried hourly-ish. */
export function backoffMs(attempts: number): number {
  return Math.min(2 ** Math.max(0, attempts) * 5_000, 5 * 60_000);
}

export interface CreateRunInput {
  name: string;
  rawContent: string;
  config: PdfRenderConfig;
}

export interface AppendEventInput {
  runId: string;
  type: RunEventType;
  actor: string;
  fromStatus?: RunStatus | null;
  toStatus?: RunStatus | null;
  detail?: unknown;
}

export class RunStore {
  readonly db: Database.Database;
  readonly artifactRoot: string;
  private readonly clock: () => Date;

  constructor(opts: StoreOptions) {
    if (opts.dbPath !== ":memory:") {
      mkdirSync(path.dirname(opts.dbPath), { recursive: true });
    }
    this.db = new Database(opts.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(DDL);
    this.artifactRoot = opts.artifactRoot;
    this.clock = opts.clock ?? (() => new Date());
  }

  close(): void {
    this.db.close();
  }

  private now(): string {
    return this.clock().toISOString();
  }

  private leaseCutoff(): string {
    return new Date(this.clock().getTime() - LEASE_MS).toISOString();
  }

  /** Directory holding this run's immutable, content-addressed artifacts. */
  artifactDir(runId: string): string {
    return path.join(this.artifactRoot, runId);
  }

  artifactPath(runId: string, sha256: string): string {
    return path.join(this.artifactDir(runId), `${sha256}.pdf`);
  }

  // -- events ---------------------------------------------------------------

  // Callers inside a transaction get correct sequencing for free: seq is read
  // and written within the enclosing transaction, so a rolled-back change
  // leaves no event behind and no gap.
  appendEvent(input: AppendEventInput): RunEvent {
    const seqRow = this.db
      .prepare<[string], { next: number }>(
        `SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM run_events WHERE run_id = ?`
      )
      .get(input.runId)!;

    const event: RunEvent = {
      id: randomUUID(),
      runId: input.runId,
      seq: seqRow.next,
      type: input.type,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actor: input.actor,
      detail: input.detail ?? null,
      createdAt: this.now(),
    };

    this.db
      .prepare(
        `INSERT INTO run_events
           (id, run_id, seq, type, from_status, to_status, actor, detail_json, created_at)
         VALUES (@id, @runId, @seq, @type, @fromStatus, @toStatus, @actor, @detailJson, @createdAt)`
      )
      .run({
        id: event.id,
        runId: event.runId,
        seq: event.seq,
        type: event.type,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        actor: event.actor,
        detailJson: event.detail === null ? null : JSON.stringify(event.detail),
        createdAt: event.createdAt,
      });

    return event;
  }

  listEvents(runId: string): RunEvent[] {
    const rows = this.db
      .prepare<[string], Record<string, unknown>>(
        `SELECT * FROM run_events WHERE run_id = ? ORDER BY seq`
      )
      .all(runId);
    return rows.map((r) => ({
      id: r.id as string,
      runId: r.run_id as string,
      seq: r.seq as number,
      type: r.type as RunEventType,
      fromStatus: (r.from_status as RunStatus | null) ?? null,
      toStatus: (r.to_status as RunStatus | null) ?? null,
      actor: r.actor as string,
      detail: r.detail_json === null ? null : JSON.parse(r.detail_json as string),
      createdAt: r.created_at as string,
    }));
  }

  // -- batches / runs -------------------------------------------------------

  /** Creates the batch and all its runs in one transaction. */
  createBatch(args: {
    name?: string | null;
    reviewPolicy: ReviewPolicy;
    approvalMode: ApprovalMode;
    items: CreateRunInput[];
  }): { batch: Batch; runs: Run[] } {
    const tx = this.db.transaction(() => {
      const createdAt = this.now();
      const batch: Batch = {
        id: randomUUID(),
        name: args.name ?? null,
        reviewPolicy: args.reviewPolicy,
        approvalMode: args.approvalMode,
        createdAt,
      };

      this.db
        .prepare(
          `INSERT INTO batches (id, name, review_policy, approval_mode, created_at)
           VALUES (@id, @name, @reviewPolicy, @approvalMode, @createdAt)`
        )
        .run(batch);

      const insertRun = this.db.prepare(
        `INSERT INTO runs
           (id, batch_id, name, status, paused, review_policy, approval_mode,
            raw_content, content_json, config_json, agent_json, qa_json,
            pdf_path, rendered_fingerprint, artifact_sha256,
            extract_attempts, render_attempts, next_attempt_at,
            last_error, last_error_stage, locked_at, locked_by,
            created_at, updated_at)
         VALUES
           (@id, @batchId, @name, 'QUEUED', 0, @reviewPolicy, @approvalMode,
            @rawContent, NULL, @configJson, NULL, NULL,
            NULL, NULL, NULL,
            0, 0, NULL,
            NULL, NULL, NULL, NULL,
            @createdAt, @createdAt)`
      );

      const runs: Run[] = [];
      for (const item of args.items) {
        const id = randomUUID();
        insertRun.run({
          id,
          batchId: batch.id,
          name: item.name,
          // Policy is snapshotted onto the run so a later batch edit cannot
          // retroactively change in-flight work.
          reviewPolicy: batch.reviewPolicy,
          approvalMode: batch.approvalMode,
          rawContent: item.rawContent,
          configJson: JSON.stringify(item.config),
          createdAt,
        });
        this.appendEvent({
          runId: id,
          type: "transition",
          actor: "system",
          fromStatus: null,
          toStatus: "QUEUED",
          detail: { reason: "created", batchId: batch.id },
        });
        runs.push(this.getRun(id)!);
      }

      return { batch, runs };
    });

    return tx();
  }

  getRun(id: string): Run | null {
    const row = this.db
      .prepare<[string], RunRow>(`SELECT * FROM runs WHERE id = ?`)
      .get(id);
    return row ? mapRun(row) : null;
  }

  getBatch(id: string): Batch | null {
    const row = this.db
      .prepare<[string], Record<string, unknown>>(`SELECT * FROM batches WHERE id = ?`)
      .get(id);
    if (!row) return null;
    return {
      id: row.id as string,
      name: (row.name as string | null) ?? null,
      reviewPolicy: row.review_policy as ReviewPolicy,
      approvalMode: row.approval_mode as ApprovalMode,
      createdAt: row.created_at as string,
    };
  }

  /**
   * List projection. Deliberately avoids content_json/config_json, which carry
   * base64 image data URLs and would make this query enormous.
   */
  listRuns(filter: { status?: RunStatus; batchId?: string } = {}): RunSummary[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.status) {
      clauses.push("r.status = @status");
      params.status = filter.status;
    }
    if (filter.batchId) {
      clauses.push("r.batch_id = @batchId");
      params.batchId = filter.batchId;
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const rows = this.db
      .prepare<Record<string, unknown>, Record<string, unknown>>(
        `SELECT r.id, r.batch_id, r.name, r.status, r.paused, r.review_policy,
                r.approval_mode, r.qa_json, r.pdf_path, r.extract_attempts,
                r.render_attempts, r.last_error, r.last_error_stage,
                r.created_at, r.updated_at,
                (SELECT COUNT(*) FROM run_issues i
                  WHERE i.run_id = r.id AND i.status = 'open'
                    AND i.severity = 'blocking') AS open_blocking
           FROM runs r
           ${where}
          ORDER BY r.created_at`
      )
      .all(params);

    return rows.map((r) => {
      const qa = parseJson<QaReport>((r.qa_json as string | null) ?? null);
      return {
        id: r.id as string,
        batchId: r.batch_id as string,
        name: r.name as string,
        status: r.status as RunStatus,
        paused: (r.paused as number) === 1,
        reviewPolicy: r.review_policy as ReviewPolicy,
        approvalMode: r.approval_mode as ApprovalMode,
        openBlockingCount: r.open_blocking as number,
        qaVerdict: (qa?.verdict as QaVerdict | undefined) ?? null,
        hasArtifact: r.pdf_path !== null,
        extractAttempts: r.extract_attempts as number,
        renderAttempts: r.render_attempts as number,
        lastError: (r.last_error as string | null) ?? null,
        lastErrorStage: (r.last_error_stage as Stage | null) ?? null,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      };
    });
  }

  // -- issues (read side) ---------------------------------------------------

  listIssues(runId: string): RunIssue[] {
    const rows = this.db
      .prepare<[string], IssueRow>(
        `SELECT * FROM run_issues WHERE run_id = ? ORDER BY rowid`
      )
      .all(runId);
    return rows.map(mapIssue);
  }

  getIssue(id: string): RunIssue | null {
    const row = this.db
      .prepare<[string], IssueRow>(`SELECT * FROM run_issues WHERE id = ?`)
      .get(id);
    return row ? mapIssue(row) : null;
  }

  // -- claim / recovery -----------------------------------------------------

  /**
   * Atomically claim the oldest actionable run. One statement, so two claimants
   * cannot take the same row even from separate connections: the trailing
   * `AND status IN (...)` is a compare-and-swap against the subquery's pick.
   *
   * Transient rows (EXTRACTING / RENDERING) are NEVER claimed here — only
   * recoverStale() returns them to a claimable state.
   */
  claimNext(workerId: string): Run | null {
    const now = this.now();
    // SQLite evaluates every SET expression against the pre-update row, so
    // `status = 'QUEUED'` below reads the ORIGINAL status (1 or 0).
    const row = this.db
      .prepare<{ now: string; workerId: string }, RunRow>(
        `UPDATE runs
            SET status = CASE status WHEN 'QUEUED' THEN 'EXTRACTING' ELSE 'RENDERING' END,
                extract_attempts = extract_attempts + (status = 'QUEUED'),
                render_attempts  = render_attempts  + (status = 'READY_TO_RENDER'),
                locked_at = @now,
                locked_by = @workerId,
                updated_at = @now
          WHERE id = (
            SELECT id FROM runs
             WHERE status IN ('QUEUED', 'READY_TO_RENDER')
               AND paused = 0
               AND (next_attempt_at IS NULL OR next_attempt_at <= @now)
             ORDER BY created_at
             LIMIT 1
          )
            AND status IN ('QUEUED', 'READY_TO_RENDER')
        RETURNING *`
      )
      .get({ now, workerId });

    if (!row) return null;

    const run = mapRun(row);
    this.appendEvent({
      runId: run.id,
      type: "claimed",
      actor: `worker:${workerId}`,
      toStatus: run.status,
      detail: {
        extractAttempts: run.extractAttempts,
        renderAttempts: run.renderAttempts,
      },
    });
    return run;
  }

  /**
   * Return transient runs whose lease has expired to their claimable state.
   * Runs at boot and from an independent watchdog timer — never from inside the
   * execution loop, which cannot sweep while awaiting a hung stage.
   *
   * Only ever touches EXTRACTING / RENDERING. REVIEW, APPROVAL, APPROVED,
   * REJECTED and FAILED are left alone, which is what stops a crash from
   * discarding human edits or reopening a signed-off run.
   */
  recoverStale(opts: { ignoreLease?: boolean } = {}): number {
    const tx = this.db.transaction(() => {
      const now = this.now();
      // At boot, ignoreLease is correct and necessary: no worker of this process
      // exists yet, so every transient run is by definition abandoned. Waiting out
      // a 10-minute lease would stall a crashed batch for no reason. The periodic
      // watchdog keeps the lease check, since a live worker may hold one.
      // Caveat: two servers sharing one DATA_DIR would let the second's boot
      // reclaim the first's in-flight runs — the ownership guards make that safe
      // (the victim discards its result), and a shared DATA_DIR is not a supported
      // single-node configuration.
      const cutoff = opts.ignoreLease ? null : this.leaseCutoff();

      const stale = this.db
        .prepare<{ cutoff: string | null }, { id: string; status: string; locked_by: string | null }>(
          `SELECT id, status, locked_by FROM runs
            WHERE status IN ('EXTRACTING', 'RENDERING')
              AND (@cutoff IS NULL OR locked_at IS NULL OR locked_at < @cutoff)`
        )
        .all({ cutoff });

      if (stale.length === 0) return 0;

      const update = this.db.prepare(
        `UPDATE runs
            SET status = @toStatus,
                locked_at = NULL,
                locked_by = NULL,
                updated_at = @now
          WHERE id = @id AND status = @fromStatus`
      );

      let recovered = 0;
      for (const row of stale) {
        const fromStatus = row.status as TransientStatus;
        const toStatus = TRANSIENT_FALLBACK[fromStatus];
        const info = update.run({ id: row.id, fromStatus, toStatus, now });
        if (info.changes !== 1) continue;
        recovered++;
        this.appendEvent({
          runId: row.id,
          type: "recovered",
          actor: "system",
          fromStatus,
          toStatus,
          detail: { reclaimedFrom: row.locked_by, cutoff },
        });
      }
      return recovered;
    });

    return tx();
  }

  // -- ownership-guarded worker writes --------------------------------------

  /**
   * Commit a successful extraction. Reconciles issues first, then lets the
   * caller pick the next status from the resulting open-blocking count — so
   * policy stays in machine.ts and the store stays dumb.
   *
   * Returns false when the lease was lost; the caller must discard its result.
   */
  commitExtraction(args: {
    runId: string;
    workerId: string;
    content: UseCase;
    agent: RunAgentSnapshot;
    detected: DetectedIssue[];
    chooseStatus: (openBlocking: number) => RunStatus;
  }): boolean {
    const tx = this.db.transaction(() => {
      const now = this.now();
      const actor = `worker:${args.workerId}`;

      // Ownership pre-check inside the transaction; the guarded UPDATE below is
      // the authoritative check.
      const owned = this.db
        .prepare<{ id: string; workerId: string }, { n: number }>(
          `SELECT COUNT(*) AS n FROM runs
            WHERE id = @id AND locked_by = @workerId AND status = 'EXTRACTING'`
        )
        .get({ id: args.runId, workerId: args.workerId })!;
      if (owned.n !== 1) return false;

      this.db
        .prepare(
          `UPDATE runs
              SET content_json = @contentJson,
                  agent_json = @agentJson,
                  updated_at = @now
            WHERE id = @id AND locked_by = @workerId AND status = 'EXTRACTING'`
        )
        .run({
          id: args.runId,
          workerId: args.workerId,
          contentJson: JSON.stringify(args.content),
          agentJson: JSON.stringify(args.agent),
          now,
        });

      this.syncIssues(args.runId, args.detected, actor);
      const nextStatus = args.chooseStatus(this.countOpenBlocking(args.runId));

      const info = this.db
        .prepare(
          `UPDATE runs
              SET status = @nextStatus,
                  locked_at = NULL,
                  locked_by = NULL,
                  next_attempt_at = NULL,
                  last_error = NULL,
                  last_error_stage = NULL,
                  updated_at = @now
            WHERE id = @id AND locked_by = @workerId AND status = 'EXTRACTING'`
        )
        .run({ id: args.runId, workerId: args.workerId, nextStatus, now });

      if (info.changes !== 1) return false;

      this.appendEvent({
        runId: args.runId,
        type: "transition",
        actor,
        fromStatus: "EXTRACTING",
        toStatus: nextStatus,
        detail: { reason: "extraction_complete" },
      });
      return true;
    });

    return tx();
  }

  /**
   * Send a RENDERING run back to REVIEW because of a correctable failure
   * (render-validation violation or a failing QA verdict). Never FAILED — a
   * human can fix these.
   */
  routeRenderToReview(args: {
    runId: string;
    workerId: string;
    qa?: QaReport | null;
    reason: string;
  }): boolean {
    const tx = this.db.transaction(() => {
      const now = this.now();
      const actor = `worker:${args.workerId}`;

      const info = this.db
        .prepare(
          `UPDATE runs
              SET status = 'REVIEW',
                  qa_json = @qaJson,
                  locked_at = NULL,
                  locked_by = NULL,
                  updated_at = @now
            WHERE id = @id AND locked_by = @workerId AND status = 'RENDERING'`
        )
        .run({
          id: args.runId,
          workerId: args.workerId,
          qaJson: args.qa ? JSON.stringify(args.qa) : null,
          now,
        });

      if (info.changes !== 1) return false;

      this.appendEvent({
        runId: args.runId,
        type: "transition",
        actor,
        fromStatus: "RENDERING",
        toStatus: "REVIEW",
        detail: { reason: args.reason },
      });
      return true;
    });

    return tx();
  }

  /** Schedule a stage retry with backoff, returning the run to its claimable state. */
  scheduleRetry(args: {
    runId: string;
    workerId: string;
    stage: Stage;
    error: string;
    attempts: number;
  }): boolean {
    const fromStatus: TransientStatus = args.stage === "extract" ? "EXTRACTING" : "RENDERING";
    const toStatus = TRANSIENT_FALLBACK[fromStatus];
    const delay = backoffMs(args.attempts);
    const nextAttemptAt = new Date(this.clock().getTime() + delay).toISOString();

    const tx = this.db.transaction(() => {
      const now = this.now();
      const info = this.db
        .prepare(
          `UPDATE runs
              SET status = @toStatus,
                  next_attempt_at = @nextAttemptAt,
                  last_error = @error,
                  last_error_stage = @stage,
                  locked_at = NULL,
                  locked_by = NULL,
                  updated_at = @now
            WHERE id = @id AND locked_by = @workerId AND status = @fromStatus`
        )
        .run({
          id: args.runId,
          workerId: args.workerId,
          fromStatus,
          toStatus,
          nextAttemptAt,
          error: args.error,
          stage: args.stage,
          now,
        });

      if (info.changes !== 1) return false;

      this.appendEvent({
        runId: args.runId,
        type: "retry_scheduled",
        actor: `worker:${args.workerId}`,
        fromStatus,
        toStatus,
        detail: { stage: args.stage, attempts: args.attempts, delayMs: delay, error: args.error },
      });
      return true;
    });

    return tx();
  }

  /** Terminal infrastructure failure: fatal error or exhausted retries. */
  markFailed(args: {
    runId: string;
    workerId: string;
    stage: Stage;
    error: string;
  }): boolean {
    const fromStatus: TransientStatus = args.stage === "extract" ? "EXTRACTING" : "RENDERING";

    const tx = this.db.transaction(() => {
      const now = this.now();
      const info = this.db
        .prepare(
          `UPDATE runs
              SET status = 'FAILED',
                  last_error = @error,
                  last_error_stage = @stage,
                  locked_at = NULL,
                  locked_by = NULL,
                  updated_at = @now
            WHERE id = @id AND locked_by = @workerId AND status = @fromStatus`
        )
        .run({
          id: args.runId,
          workerId: args.workerId,
          fromStatus,
          error: args.error,
          stage: args.stage,
          now,
        });

      if (info.changes !== 1) return false;

      this.appendEvent({
        runId: args.runId,
        type: "failed",
        actor: `worker:${args.workerId}`,
        fromStatus,
        toStatus: "FAILED",
        detail: { stage: args.stage, error: args.error },
      });
      return true;
    });

    return tx();
  }

  // -- artifact commit ------------------------------------------------------

  /**
   * Commit a rendered PDF. Order matters and is load-bearing:
   *
   *   1. write to a unique temp path
   *   2. hash the bytes
   *   3. pre-check lease ownership
   *   4. rename to the content-addressed immutable path
   *   5. ownership-guarded DB update + event, in one transaction
   *   6. on a failed commit, delete the artifact THIS worker created
   *
   * The run never points at a path before the artifact exists. Because the path
   * is content-addressed, a stale worker cannot overwrite a different artifact:
   * identical bytes land on the identical path, different bytes on a different one.
   */
  commitRender(args: {
    runId: string;
    workerId: string;
    pdf: Buffer;
    qa: QaReport;
    renderedFingerprint: string;
    nextStatus: Extract<RunStatus, "APPROVAL" | "APPROVED">;
  }): { committed: boolean; artifactSha256: string; artifactPath: string } {
    const sha256 = sha256Hex(args.pdf);
    const dir = this.artifactDir(args.runId);
    const artifactPath = this.artifactPath(args.runId, sha256);
    mkdirSync(dir, { recursive: true });

    const tmpPath = path.join(dir, `.tmp-${args.workerId}-${randomUUID()}.pdf`);
    writeFileSync(tmpPath, args.pdf);

    // Cheap pre-check so a reclaimed worker does not bother renaming.
    const preOwned = this.db
      .prepare<{ id: string; workerId: string }, { n: number }>(
        `SELECT COUNT(*) AS n FROM runs
          WHERE id = @id AND locked_by = @workerId AND status = 'RENDERING'`
      )
      .get({ id: args.runId, workerId: args.workerId })!;
    if (preOwned.n !== 1) {
      rmSync(tmpPath, { force: true });
      this.appendEvent({
        runId: args.runId,
        type: "render_discarded",
        actor: `worker:${args.workerId}`,
        detail: { reason: "lease_lost_before_rename", artifactSha256: sha256 },
      });
      return { committed: false, artifactSha256: sha256, artifactPath };
    }

    renameSync(tmpPath, artifactPath);

    const tx = this.db.transaction(() => {
      const now = this.now();
      const info = this.db
        .prepare(
          `UPDATE runs
              SET pdf_path = @artifactPath,
                  artifact_sha256 = @sha256,
                  rendered_fingerprint = @renderedFingerprint,
                  qa_json = @qaJson,
                  status = @nextStatus,
                  locked_at = NULL,
                  locked_by = NULL,
                  next_attempt_at = NULL,
                  last_error = NULL,
                  last_error_stage = NULL,
                  updated_at = @now
            WHERE id = @id AND locked_by = @workerId AND status = 'RENDERING'`
        )
        .run({
          id: args.runId,
          workerId: args.workerId,
          artifactPath,
          sha256,
          renderedFingerprint: args.renderedFingerprint,
          qaJson: JSON.stringify(args.qa),
          nextStatus: args.nextStatus,
          now,
        });

      if (info.changes === 1) {
        this.appendEvent({
          runId: args.runId,
          type: "render_committed",
          actor: `worker:${args.workerId}`,
          fromStatus: "RENDERING",
          toStatus: args.nextStatus,
          detail: { artifactSha256: sha256, qaVerdict: args.qa.verdict },
        });
        return true;
      }

      // Lease lost between the pre-check and here. Delete only if the committed
      // row does not already point at this exact path — a worker that produced
      // byte-identical output must not delete the winner's artifact.
      const current = this.db
        .prepare<[string], { pdf_path: string | null }>(
          `SELECT pdf_path FROM runs WHERE id = ?`
        )
        .get(args.runId);
      if (current?.pdf_path !== artifactPath) {
        rmSync(artifactPath, { force: true });
      }
      this.appendEvent({
        runId: args.runId,
        type: "render_discarded",
        actor: `worker:${args.workerId}`,
        detail: {
          reason: "lease_lost_at_commit",
          artifactSha256: sha256,
          keptBecauseCommitted: current?.pdf_path === artifactPath,
        },
      });
      return false;
    });

    const committed = tx();
    // Only ever this worker's own leftovers.
    this.cleanupOwnTempFiles(args.runId, args.workerId);
    return { committed, artifactSha256: sha256, artifactPath };
  }

  /**
   * Delete temp files THIS worker created for this run, and nothing else.
   *
   * Ownership is the only safe signal available. Deliberately NOT done:
   *  - no boot-wide temp deletion. A second local backend process may share this
   *    DATA_DIR with a worker actively rendering, so "nothing is in flight at
   *    boot" does not hold and a boot-wide sweep could delete a live worker's
   *    in-flight artifact.
   *  - no age-based deletion. Filesystem mtime and the injectable clock are two
   *    time sources that can disagree.
   *  - no deletion of committed `<sha>.pdf` artifacts. A stale worker could
   *    otherwise race another worker's rename-then-commit window and delete an
   *    artifact that is about to be referenced.
   *
   * A temp file whose ownership cannot be established is left alone. Orphan
   * cleanup, age-based retention and process-wide locking are later work.
   * ponytail: superseded artifacts accumulate under <run_id>/ until then.
   */
  cleanupOwnTempFiles(runId: string, workerId: string): string[] {
    const dir = this.artifactDir(runId);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }

    const ownPrefix = `.tmp-${workerId}-`;
    const removed: string[] = [];
    for (const entry of entries) {
      if (!entry.startsWith(ownPrefix)) continue;
      const full = path.join(dir, entry);
      rmSync(full, { force: true });
      removed.push(full);
    }
    return removed;
  }

  // -- pause / resume -------------------------------------------------------

  /**
   * Pause is pause-AFTER-current-stage: it stops the run being claimed again but
   * does not cancel an in-flight LLM or render call (Phase 1 has no cancellation).
   */
  setPaused(runId: string, paused: boolean, actor: string): boolean {
    const tx = this.db.transaction(() => {
      const now = this.now();
      const info = this.db
        .prepare(
          `UPDATE runs SET paused = @paused, updated_at = @now
            WHERE id = @id AND paused = @previous`
        )
        .run({ id: runId, paused: paused ? 1 : 0, previous: paused ? 0 : 1, now });
      if (info.changes !== 1) return false;
      this.appendEvent({
        runId,
        type: paused ? "paused" : "resumed",
        actor,
      });
      return true;
    });
    return tx();
  }

  // -- issues (reconciliation) ---------------------------------------------

  /**
   * Reconcile a detector run against stored issues. Safe to call inside an outer
   * transaction (better-sqlite3 nests via savepoints), so it can share a
   * transaction with the content write that triggered it.
   *
   * A resolution survives only when BOTH issue_key and finding_fingerprint
   * match. Same location + different finding reopens.
   */
  syncIssues(runId: string, detected: DetectedIssue[], actor: string): void {
    const tx = this.db.transaction(() => {
      const now = this.now();
      const existing = new Map(this.listIssues(runId).map((i) => [i.issueKey, i]));
      const seenKeys = new Set<string>();

      for (const d of detected) {
        const issueKey = issueKeyOf(d);
        const findingFingerprint = findingFingerprintOf(d);
        seenKeys.add(issueKey);

        const prior = existing.get(issueKey);

        if (!prior) {
          const id = randomUUID();
          this.db
            .prepare(
              `INSERT INTO run_issues
                 (id, run_id, issue_key, finding_fingerprint, locator, code, severity,
                  source, message, status, detected_at, last_seen_at)
               VALUES (@id, @runId, @issueKey, @findingFingerprint, @locator, @code,
                       @severity, @source, @message, 'open', @now, @now)`
            )
            .run({
              id,
              runId,
              issueKey,
              findingFingerprint,
              locator: d.locator,
              code: d.code,
              severity: d.severity,
              source: d.source,
              message: d.message,
              now,
            });
          this.appendEvent({
            runId,
            type: "issue_opened",
            actor,
            detail: { issueId: id, code: d.code, severity: d.severity, locator: d.locator },
          });
          continue;
        }

        if (prior.findingFingerprint === findingFingerprint) {
          // Identical finding: preserve status and resolution. A waived finding
          // stays waived even though the detector keeps emitting it.
          this.db
            .prepare(`UPDATE run_issues SET last_seen_at = @now WHERE id = @id`)
            .run({ id: prior.id, now });
          continue;
        }

        // Same location, different finding — the reviewed finding is gone and a
        // new one has taken its place. Any prior disposition no longer applies.
        this.db
          .prepare(
            `UPDATE run_issues
                SET finding_fingerprint = @findingFingerprint,
                    message = @message,
                    severity = @severity,
                    status = 'open',
                    resolution_action = NULL,
                    resolution_reviewer_name = NULL,
                    resolution_note = NULL,
                    resolved_at = NULL,
                    last_seen_at = @now
              WHERE id = @id`
          )
          .run({
            id: prior.id,
            findingFingerprint,
            message: d.message,
            severity: d.severity,
            now,
          });
        this.appendEvent({
          runId,
          type: "issue_reopened",
          actor,
          detail: {
            issueId: prior.id,
            code: d.code,
            locator: d.locator,
            previousStatus: prior.status,
          },
        });
      }

      // Open issues the detector no longer emits are cleared automatically —
      // this is the ONLY way an issue becomes 'resolved'. Already waived or
      // resolved rows are left alone so the audit fact survives.
      for (const prior of existing.values()) {
        if (prior.status !== "open" || seenKeys.has(prior.issueKey)) continue;
        this.db
          .prepare(
            `UPDATE run_issues
                SET status = 'resolved',
                    resolution_action = 'auto_cleared',
                    resolved_at = @now
              WHERE id = @id`
          )
          .run({ id: prior.id, now });
        this.appendEvent({
          runId,
          type: "issue_auto_cleared",
          actor,
          detail: { issueId: prior.id, code: prior.code },
        });
      }
    });

    tx();
  }

  /**
   * Reconcile, then report how many blocking issues are still OPEN — in one
   * transaction, so a caller deciding what to do next can never act on a stale
   * count. Callers must gate on this, never on the raw detected list: a waived
   * finding is still detected every time, and treating detection as blocking
   * would bounce the run back to review forever.
   */
  syncAndCountOpenBlocking(
    runId: string,
    detected: DetectedIssue[],
    actor: string
  ): number {
    const tx = this.db.transaction(() => {
      this.syncIssues(runId, detected, actor);
      return this.countOpenBlocking(runId);
    });
    return tx();
  }

  /**
   * The only manual disposition. Fails (returns false) when the finding has
   * changed since the reviewer read it — the caller maps that to 409.
   */
  waiveIssue(args: {
    issueId: string;
    expectedFindingFingerprint: string;
    reviewerName: string;
    note: string;
  }): boolean {
    const info = this.db
      .prepare(
        `UPDATE run_issues
            SET status = 'waived',
                resolution_action = 'waived',
                resolution_reviewer_name = @reviewerName,
                resolution_note = @note,
                resolved_at = @now
          WHERE id = @issueId
            AND finding_fingerprint = @expectedFindingFingerprint`
      )
      .run({
        issueId: args.issueId,
        expectedFindingFingerprint: args.expectedFindingFingerprint,
        reviewerName: args.reviewerName,
        note: args.note,
        now: this.now(),
      });
    return info.changes === 1;
  }

  /** The guard input: only OPEN blocking issues gate a transition. */
  countOpenBlocking(runId: string): number {
    const row = this.db
      .prepare<[string], { n: number }>(
        `SELECT COUNT(*) AS n FROM run_issues
          WHERE run_id = ? AND status = 'open' AND severity = 'blocking'`
      )
      .get(runId)!;
    return row.n;
  }

  // -- approvals ------------------------------------------------------------

  insertApproval(args: {
    runId: string;
    gate: Gate;
    decision: Decision;
    reviewerName: string;
    note?: string | null;
    contentFingerprint: string;
    artifactSha256?: string | null;
  }): ApprovalRecord {
    const record: ApprovalRecord = {
      id: randomUUID(),
      runId: args.runId,
      gate: args.gate,
      decision: args.decision,
      reviewerName: args.reviewerName,
      note: args.note ?? null,
      contentFingerprint: args.contentFingerprint,
      artifactSha256: args.artifactSha256 ?? null,
      decidedAt: this.now(),
    };

    this.db
      .prepare(
        `INSERT INTO approvals
           (id, run_id, gate, decision, reviewer_name, note,
            content_fingerprint, artifact_sha256, decided_at)
         VALUES (@id, @runId, @gate, @decision, @reviewerName, @note,
                 @contentFingerprint, @artifactSha256, @decidedAt)`
      )
      .run(record);

    return record;
  }

  listApprovals(runId: string): ApprovalRecord[] {
    const rows = this.db
      .prepare<[string], Record<string, unknown>>(
        // rowid is insertion order. decided_at alone ties when two decisions land
        // in the same millisecond, and an audit trail must not reorder.
        `SELECT * FROM approvals WHERE run_id = ? ORDER BY rowid`
      )
      .all(runId);
    return rows.map((r) => ({
      id: r.id as string,
      runId: r.run_id as string,
      gate: r.gate as Gate,
      decision: r.decision as Decision,
      reviewerName: r.reviewer_name as string,
      note: (r.note as string | null) ?? null,
      contentFingerprint: r.content_fingerprint as string,
      artifactSha256: (r.artifact_sha256 as string | null) ?? null,
      decidedAt: r.decided_at as string,
    }));
  }

  /**
   * Every artifact hash this run's audit history refers to. Informational in
   * Phase 1 (nothing deletes committed artifacts); it encodes the retention
   * invariant that later age-based cleanup must respect.
   */
  referencedArtifactShas(runId: string): Set<string> {
    const rows = this.db
      .prepare<[string], { artifact_sha256: string | null }>(
        `SELECT DISTINCT artifact_sha256 FROM approvals
          WHERE run_id = ? AND artifact_sha256 IS NOT NULL`
      )
      .all(runId);
    return new Set(rows.map((r) => r.artifact_sha256!).filter(Boolean));
  }
}
