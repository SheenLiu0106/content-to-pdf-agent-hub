// Two independent timers.
//
//   execution loop — recursive setTimeout, so ticks can never overlap
//   watchdog       — setInterval, synchronous, never awaits work
//
// They must stay separate: a tick that awaits a hung LLM or render call cannot
// run the recovery sweep, and a hang is exactly when recovery is needed. The
// lease-ownership guards in the store are what make a reclaimed run's eventual
// late write safe to discard.

import { runExtractAgent, runRenderAgent } from "../agents/contentToPdfAgent/agent.js";
import { LLMProviderError } from "../llm/provider.js";
import { RenderValidationError } from "../shared/normalizeUseCase.js";
import {
  buildQaReport,
  deriveIssues,
  nextAfterExtract,
  shouldRetry,
} from "./machine.js";
import { RunStore, fingerprint } from "./store.js";
import type { Run, RunAgentSnapshot, Stage } from "./types.js";

export const IDLE_TICK_MS = 1_000;
export const RECOVERY_SWEEP_MS = 30_000;

export interface WorkerLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface WorkerOptions {
  store: RunStore;
  workerId: string;
  logger?: WorkerLogger;
  idleTickMs?: number;
  recoverySweepMs?: number;
}

const noopLogger: WorkerLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Transient provider/infrastructure errors are worth retrying; nothing else is. */
function isRetryable(err: unknown): boolean {
  if (err instanceof RenderValidationError) return false;
  if (err instanceof LLMProviderError) {
    // invalid_output is retryable too: a fresh call often parses where one
    // malformed response did not. Bounded by MAX_EXTRACT_ATTEMPTS.
    return err.kind === "api_error" || err.kind === "invalid_output";
  }
  // Unknown failures are treated as infrastructure and retried within budget.
  return true;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

export class RunWorker {
  private readonly store: RunStore;
  private readonly workerId: string;
  private readonly log: WorkerLogger;
  private readonly idleTickMs: number;
  private readonly recoverySweepMs: number;

  private stopping = false;
  private tickTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  /** In-flight tick, awaited by stop() so shutdown never abandons a leased run. */
  private inFlight: Promise<void> | null = null;

  constructor(opts: WorkerOptions) {
    this.store = opts.store;
    this.workerId = opts.workerId;
    this.log = opts.logger ?? noopLogger;
    this.idleTickMs = opts.idleTickMs ?? IDLE_TICK_MS;
    this.recoverySweepMs = opts.recoverySweepMs ?? RECOVERY_SWEEP_MS;
  }

  start(): void {
    this.stopping = false;
    // Independent of the execution loop by design.
    this.watchdogTimer = setInterval(() => this.runWatchdog(), this.recoverySweepMs);
    this.watchdogTimer.unref?.();
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.tickTimer = null;
    this.watchdogTimer = null;
    if (this.inFlight) {
      try {
        await this.inFlight;
      } catch {
        // Already logged in tick().
      }
    }
  }

  private runWatchdog(): void {
    if (this.stopping) return;
    try {
      const recovered = this.store.recoverStale();
      if (recovered > 0) {
        this.log.warn({ recovered }, "recovered stale runs whose lease expired");
      }
    } catch (err) {
      this.log.error({ err }, "recovery sweep failed");
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopping) return;
    this.tickTimer = setTimeout(() => {
      this.inFlight = this.tick().finally(() => {
        this.inFlight = null;
      });
    }, delayMs);
    this.tickTimer.unref?.();
  }

  private async tick(): Promise<void> {
    if (this.stopping) return;

    let run: Run | null = null;
    try {
      run = this.store.claimNext(this.workerId);
    } catch (err) {
      this.log.error({ err }, "claim failed");
      this.schedule(this.idleTickMs);
      return;
    }

    if (!run) {
      this.schedule(this.idleTickMs);
      return;
    }

    try {
      await this.advance(run);
    } catch (err) {
      this.recordFailure(run, err);
    }

    // Drain the batch rather than idling between items.
    this.schedule(0);
  }

  /** Runs one stage of one claimed run. */
  private async advance(run: Run): Promise<void> {
    if (run.status === "EXTRACTING") return this.doExtract(run);
    if (run.status === "RENDERING") return this.doRender(run);
    this.log.warn({ runId: run.id, status: run.status }, "claimed run in unexpected status");
  }

  private async doExtract(run: Run): Promise<void> {
    const result = await runExtractAgent(run.rawContent, {
      templateId: run.config.templateId,
      documentLabel: run.config.documentLabel,
      pdfLengthMode: run.config.pdfLengthMode,
    });

    const agent: RunAgentSnapshot = {
      intake: result.intake,
      strategy: result.strategy,
      layoutPlan: result.layoutPlan,
      warnings: result.warnings,
      recommendedTemplate: result.recommendedTemplate,
    };

    const detected = deriveIssues({
      content: result.content,
      config: run.config,
      intakeRisks: result.intake.risks,
    });

    const committed = this.store.commitExtraction({
      runId: run.id,
      workerId: this.workerId,
      content: result.content,
      agent,
      detected,
      // Policy lives in machine.ts; the store only supplies the count.
      chooseStatus: (openBlocking) => nextAfterExtract(run.reviewPolicy, openBlocking),
    });

    if (!committed) {
      this.log.warn(
        { runId: run.id },
        "lease lost during extraction — discarding result"
      );
    }
  }

  private async doRender(run: Run): Promise<void> {
    if (!run.content) {
      // Nothing to render: this is a data problem, not a transient one.
      this.store.markFailed({
        runId: run.id,
        workerId: this.workerId,
        stage: "render",
        error: "Run reached RENDERING with no extracted content.",
      });
      return;
    }

    const content = run.content;

    let result: Awaited<ReturnType<typeof runRenderAgent>>;
    try {
      result = await runRenderAgent(content, run.config, { filename: run.name });
    } catch (err) {
      if (err instanceof RenderValidationError) {
        // Correctable by a human — route to REVIEW, never FAILED.
        this.store.syncAndCountOpenBlocking(
          run.id,
          deriveIssues({ content, config: run.config }),
          `worker:${this.workerId}`
        );
        this.store.routeRenderToReview({
          runId: run.id,
          workerId: this.workerId,
          reason: "render_validation_failed",
        });
        return;
      }
      throw err;
    }

    const qa = buildQaReport(result.finalReport);
    const detected = deriveIssues({
      content,
      config: run.config,
      qualityReport: result.finalReport,
      intakeRisks: run.agent?.intake.risks,
    });

    // Reconcile, then gate on the OPEN blocking count — never on the raw detected
    // list. A waived finding is re-detected on every render; treating detection as
    // blocking would bounce the run back to review forever and no waiver could
    // ever take effect.
    const openBlocking = this.store.syncAndCountOpenBlocking(
      run.id,
      detected,
      `worker:${this.workerId}`
    );

    // A failing QA verdict or an unresolved blocking finding is human-correctable,
    // so it goes back to REVIEW rather than terminating the run.
    if (qa.verdict === "fail" || openBlocking > 0) {
      this.store.routeRenderToReview({
        runId: run.id,
        workerId: this.workerId,
        qa,
        reason: qa.verdict === "fail" ? "qa_failed" : "blocking_issues_after_render",
      });
      return;
    }

    // Phase 1 always stops at the APPROVAL gate: auto-approval is gated behind
    // RENDER_QA_ENABLED, which stays false until real rendered-output QA exists.
    const commit = this.store.commitRender({
      runId: run.id,
      workerId: this.workerId,
      pdf: result.pdf,
      qa,
      renderedFingerprint: fingerprint(content, run.config),
      nextStatus: "APPROVAL",
    });

    if (!commit.committed) {
      this.log.warn(
        { runId: run.id, artifactSha256: commit.artifactSha256 },
        "lease lost during render — artifact discarded"
      );
    }
  }

  private recordFailure(run: Run, err: unknown): void {
    const stage: Stage = run.status === "RENDERING" ? "render" : "extract";
    const message = errorMessage(err);

    try {
      if (shouldRetry(run, stage, isRetryable(err))) {
        this.store.scheduleRetry({
          runId: run.id,
          workerId: this.workerId,
          stage,
          error: message,
          attempts: stage === "extract" ? run.extractAttempts : run.renderAttempts,
        });
        this.log.warn({ runId: run.id, stage, err: message }, "stage failed, retry scheduled");
        return;
      }

      this.store.markFailed({
        runId: run.id,
        workerId: this.workerId,
        stage,
        error: message,
      });
      this.log.error({ runId: run.id, stage, err: message }, "stage failed permanently");
    } catch (bookkeepingError) {
      this.log.error(
        { runId: run.id, err: bookkeepingError },
        "failed to record stage failure"
      );
    }
  }
}
