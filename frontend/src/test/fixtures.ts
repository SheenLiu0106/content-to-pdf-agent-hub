import { vi } from "vitest";

// Real backend fixtures — schema-valid UseCase / PdfRenderConfig / agent snapshot,
// so a test payload can never drift from what the API actually returns.
import { TEST_AGENT, TEST_CONFIG, TEST_CONTENT } from "../../../backend/src/runs/fixtures";
import type { RunDetail } from "../lib/api";
import type {
  ApprovalRecord,
  RunEvent,
  RunIssue,
  RunSummary,
} from "../lib/runTypes";

export { TEST_AGENT, TEST_CONFIG, TEST_CONTENT };

export const FINGERPRINT = "fp-current-0001";
export const ARTIFACT_SHA = "sha-artifact-0001";

export function makeSummary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run-1",
    batchId: "batch-abcdef12",
    name: "acme-story.md",
    status: "REVIEW",
    paused: false,
    reviewPolicy: "only_when_flagged",
    approvalMode: "required",
    openBlockingCount: 0,
    qaVerdict: null,
    hasArtifact: false,
    extractAttempts: 1,
    renderAttempts: 0,
    lastError: null,
    lastErrorStage: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:05:00.000Z",
    ...over,
  };
}

export function makeIssue(over: Partial<RunIssue> = {}): RunIssue {
  return {
    id: "issue-1",
    runId: "run-1",
    issueKey: "render_validation:summary.solutions.bullet_count_exact",
    findingFingerprint: "ff-0001",
    locator: "summary.solutions.bullet_count_exact",
    code: "render_validation",
    severity: "blocking",
    source: "render_validation",
    message: "Solutions must contain exactly 4 bullets.",
    status: "open",
    resolutionAction: null,
    resolutionReviewerName: null,
    resolutionNote: null,
    resolvedAt: null,
    detectedAt: "2026-08-01T10:02:00.000Z",
    lastSeenAt: "2026-08-01T10:02:00.000Z",
    ...over,
  };
}

export function makeEvent(over: Partial<RunEvent> = {}): RunEvent {
  return {
    id: "event-1",
    runId: "run-1",
    seq: 1,
    type: "claimed",
    fromStatus: null,
    toStatus: "EXTRACTING",
    actor: "worker:4321",
    detail: { stage: "extract" },
    createdAt: "2026-08-01T10:01:00.000Z",
    ...over,
  };
}

export function makeApproval(over: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: "approval-1",
    runId: "run-1",
    gate: "review",
    decision: "approve",
    reviewerName: "Dana",
    note: "Reads well.",
    contentFingerprint: FINGERPRINT,
    artifactSha256: null,
    decidedAt: "2026-08-01T10:10:00.000Z",
    ...over,
  };
}

type RunPatch = Partial<RunDetail["run"]>;

export function makeDetail(
  over: Partial<Omit<RunDetail, "run">> & { run?: RunPatch } = {}
): RunDetail {
  const { run: runPatch, ...rest } = over;
  return {
    run: {
      id: "run-1",
      batchId: "batch-abcdef12",
      name: "acme-story.md",
      status: "REVIEW",
      paused: false,
      reviewPolicy: "only_when_flagged",
      approvalMode: "required",
      rawContent:
        "Acme replaced a manual onboarding process with an automated workflow last quarter.",
      content: TEST_CONTENT,
      config: TEST_CONFIG,
      agent: TEST_AGENT,
      qa: null,
      extractAttempts: 1,
      renderAttempts: 0,
      nextAttemptAt: null,
      lastError: null,
      lastErrorStage: null,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:05:00.000Z",
      ...runPatch,
    },
    currentFingerprint: FINGERPRINT,
    renderedFingerprint: null,
    artifactSha256: null,
    hasArtifact: false,
    openBlockingCount: 0,
    issues: [],
    approvals: [],
    events: [makeEvent()],
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// fetch harness
// ---------------------------------------------------------------------------

export interface FetchCall {
  method: string;
  url: string;
  /** Parsed JSON request body, when there was one. */
  body: any;
}

export interface MockResponse {
  status?: number;
  json?: unknown;
  blob?: Blob;
}

/**
 * Replaces global fetch with a router over (method, url) and records every call,
 * so a test can assert the exact action payload the UI submitted.
 */
export function installFetch(handler: (call: FetchCall) => MockResponse | Promise<MockResponse>) {
  const calls: FetchCall[] = [];

  const fn = vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: any;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: FetchCall = { method, url, body };
    calls.push(call);

    const result = await handler(call);
    const status = result.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: `status ${status}`,
      headers: new Headers(),
      json: async () => result.json,
      blob: async () => result.blob ?? new Blob(["%PDF-1.7"], { type: "application/pdf" }),
      text: async () => JSON.stringify(result.json ?? null),
    } as unknown as Response;
  });

  globalThis.fetch = fn as unknown as typeof fetch;
  return { calls, fn, patches: () => calls.filter((c) => c.method === "PATCH") };
}

/** The 409 shape every guard failure uses (see routes/runs.ts sendGuardFailure). */
export function conflict(code: string, message: string, detail?: unknown): MockResponse {
  return { status: 409, json: { error: code, message, ...(detail ? { detail } : {}) } };
}
