import { createReadStream, existsSync } from "node:fs";
import type { FastifyInstance, FastifyReply } from "fastify";

import { PdfRenderConfigSchema } from "../shared/useCaseSchema.js";
import { applyAction, currentFingerprintOf, type ActionOutcome } from "../runs/actions.js";
import { getRunStore } from "../runs/instance.js";
import type { GuardResult } from "../runs/machine.js";
import {
  CreateRunsRequestSchema,
  ListRunsQuerySchema,
  RunActionSchema,
} from "../runs/types.js";

// Every guard failure is a 409: the request is well-formed, the run is simply not
// in a state where it can be honoured. 400 is reserved for malformed input.
function sendGuardFailure(reply: FastifyReply, guard: GuardResult): FastifyReply {
  if (guard.ok) throw new Error("sendGuardFailure called with a passing guard");
  return reply.status(409).send({
    error: guard.code,
    message: guard.message,
    ...(guard.detail ? { detail: guard.detail } : {}),
  });
}

export async function registerRunRoutes(app: FastifyInstance): Promise<void> {
  // -- create a batch -------------------------------------------------------

  app.post("/api/runs", async (req, reply) => {
    const parsed = CreateRunsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_request",
        message: "Invalid batch payload.",
        issues: parsed.error.flatten(),
      });
    }

    const { items, options } = parsed.data;
    const config = options.config ?? PdfRenderConfigSchema.parse({});

    const { batch, runs } = getRunStore().createBatch({
      name: options.name ?? null,
      reviewPolicy: options.reviewPolicy,
      approvalMode: options.approvalMode,
      items: items.map((item) => ({
        name: item.name,
        rawContent: item.rawContent,
        config,
      })),
    });

    return reply.status(201).send({
      batchId: batch.id,
      reviewPolicy: batch.reviewPolicy,
      approvalMode: batch.approvalMode,
      runs: runs.map((r) => ({ id: r.id, name: r.name, status: r.status })),
    });
  });

  // -- list -----------------------------------------------------------------

  app.get("/api/runs", async (req, reply) => {
    const parsed = ListRunsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_query",
        message: "Invalid filter.",
        issues: parsed.error.flatten(),
      });
    }
    return reply.send({ runs: getRunStore().listRuns(parsed.data) });
  });

  // -- detail ---------------------------------------------------------------

  app.get<{ Params: { id: string } }>("/api/runs/:id", async (req, reply) => {
    const store = getRunStore();
    const run = store.getRun(req.params.id);
    if (!run) {
      return reply.status(404).send({ error: "not_found", message: "No such run." });
    }

    return reply.send({
      run: {
        id: run.id,
        batchId: run.batchId,
        name: run.name,
        status: run.status,
        paused: run.paused,
        reviewPolicy: run.reviewPolicy,
        approvalMode: run.approvalMode,
        rawContent: run.rawContent,
        content: run.content,
        config: run.config,
        agent: run.agent,
        qa: run.qa,
        extractAttempts: run.extractAttempts,
        renderAttempts: run.renderAttempts,
        nextAttemptAt: run.nextAttemptAt,
        lastError: run.lastError,
        lastErrorStage: run.lastErrorStage,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      },
      // The client needs currentFingerprint to submit an optimistic approval.
      currentFingerprint: currentFingerprintOf(run),
      renderedFingerprint: run.renderedFingerprint,
      artifactSha256: run.artifactSha256,
      hasArtifact: run.pdfPath !== null && existsSync(run.pdfPath),
      openBlockingCount: store.countOpenBlocking(run.id),
      issues: store.listIssues(run.id),
      approvals: store.listApprovals(run.id),
      events: store.listEvents(run.id),
    });
  });

  // -- artifact -------------------------------------------------------------

  app.get<{ Params: { id: string } }>("/api/runs/:id/pdf", async (req, reply) => {
    const run = getRunStore().getRun(req.params.id);
    if (!run) {
      return reply.status(404).send({ error: "not_found", message: "No such run." });
    }
    // After request_changes the active pointer is cleared, so this 404s even
    // though the immutable file may still exist as audit evidence.
    if (!run.pdfPath || !existsSync(run.pdfPath)) {
      return reply
        .status(404)
        .send({ error: "no_artifact", message: "This run has no active rendered PDF." });
    }

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${run.id}.pdf"`)
      .header("X-Artifact-Sha256", run.artifactSha256 ?? "")
      .send(createReadStream(run.pdfPath));
  });

  // -- actions --------------------------------------------------------------

  app.patch<{ Params: { id: string } }>("/api/runs/:id", async (req, reply) => {
    const parsed = RunActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_action",
        message: "Invalid action payload.",
        issues: parsed.error.flatten(),
      });
    }

    const action = parsed.data;
    const store = getRunStore();
    const runId = req.params.id;

    // BEGIN IMMEDIATE: validation, audit insert, event insert and status update
    // all commit or roll back together, and the run is re-read inside.
    const apply = store.db.transaction((): ActionOutcome =>
      applyAction({ store }, runId, action)
    );

    let outcome: ActionOutcome;
    try {
      outcome = apply.immediate();
    } catch (err) {
      app.log.error({ err, runId, action: action.action }, "run action failed");
      return reply
        .status(500)
        .send({ error: "action_failed", message: "The action could not be applied." });
    }

    if (outcome.kind === "not_found") {
      return reply.status(404).send({ error: "not_found", message: outcome.message });
    }
    if (outcome.kind === "guard") return sendGuardFailure(reply, outcome.guard);

    const after = store.getRun(runId)!;
    return reply.send({
      ...outcome.body,
      status: after.status,
      paused: after.paused,
      currentFingerprint: currentFingerprintOf(after),
      openBlockingCount: store.countOpenBlocking(runId),
    });
  });
}
