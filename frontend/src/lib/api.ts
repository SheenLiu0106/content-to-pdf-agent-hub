import type { UseCase, PdfRenderConfig } from "@shared/useCaseSchema";
import type { ExtractAgentResponse } from "@shared/agentTypes";
import type {
  ApprovalMode,
  ApprovalRecord,
  Gate,
  ReviewPolicy,
  Run,
  RunEvent,
  RunIssue,
  RunStatus,
  RunSummary,
} from "./runTypes";

export interface ApiError {
  status: number;
  error: string;
  message: string;
  provider?: string;
  /** Guard detail from a 409 (e.g. currentFingerprint, openBlocking). */
  detail?: unknown;
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    return {
      status: res.status,
      error: body.error ?? "unknown_error",
      message: body.message ?? res.statusText,
      provider: body.provider,
      detail: body.detail,
    };
  } catch {
    return { status: res.status, error: "unknown_error", message: res.statusText };
  }
}

/**
 * Optimistic-concurrency / wrong-state failure, as opposed to a generic error.
 * The runs API answers EVERY guard failure with 409 (see routes/runs.ts), so the
 * status code alone is the signal — the frontend does not enumerate guard codes.
 */
export function isConflict(err: unknown): err is ApiError {
  return typeof err === "object" && err !== null && (err as ApiError).status === 409;
}

export async function extract(rawContent: string): Promise<ExtractAgentResponse> {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawContent }),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as ExtractAgentResponse;
}

// Re-normalize extracted content for a specific template (no LLM). Keeps the
// editable content in lockstep with the selected template so the Review/Edit
// screen shows exactly what the PDF will render.
export async function normalize(
  content: UseCase,
  templateId: PdfRenderConfig["templateId"]
): Promise<UseCase> {
  const res = await fetch("/api/normalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, templateId }),
  });
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as { content: UseCase };
  return body.content;
}

export async function validateMermaid(
  code: string
): Promise<{ ok: boolean; svg: string }> {
  const res = await fetch("/api/validate-mermaid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return { ok: false, svg: "" };
  const body = (await res.json()) as { ok?: boolean; svg?: string };
  const ok = Boolean(body.ok);
  return { ok, svg: ok ? (body.svg ?? "") : "" };
}

export async function renderPdf(
  content: UseCase,
  config: PdfRenderConfig
): Promise<{
  blob: Blob;
  filename: string;
  repairAttempts: number;
  repairActions: string[];
}> {
  const res = await fetch("/api/render-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, config }),
  });
  if (!res.ok) throw await readError(res);
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? "document.pdf";
  const repairAttempts = Number(res.headers.get("x-agent-repair-attempts") ?? 0) || 0;
  const repairActionsHeader = res.headers.get("x-agent-repair-actions") ?? "none";
  const repairActions =
    repairActionsHeader === "none" ? [] : repairActionsHeader.split(",").filter(Boolean);
  const blob = await res.blob();
  return { blob, filename, repairAttempts, repairActions };
}

// ---------------------------------------------------------------------------
// Production runs
// ---------------------------------------------------------------------------

/** The run projection GET /api/runs/:id returns — no pdfPath, no lease fields. */
export type RunDetailRun = Omit<
  Run,
  "pdfPath" | "renderedFingerprint" | "artifactSha256" | "lockedAt" | "lockedBy"
>;

export interface RunDetail {
  run: RunDetailRun;
  currentFingerprint: string;
  renderedFingerprint: string | null;
  artifactSha256: string | null;
  hasArtifact: boolean;
  openBlockingCount: number;
  issues: RunIssue[];
  approvals: ApprovalRecord[];
  events: RunEvent[];
}

export interface CreateBatchItem {
  name: string;
  rawContent: string;
}

export interface CreateBatchOptions {
  name?: string;
  reviewPolicy: ReviewPolicy;
  approvalMode: ApprovalMode;
  config?: PdfRenderConfig;
}

export interface CreateBatchResult {
  batchId: string;
  reviewPolicy: ReviewPolicy;
  approvalMode: ApprovalMode;
  runs: { id: string; name: string; status: RunStatus }[];
}

/** Exactly the discriminated union RunActionSchema accepts on PATCH /api/runs/:id. */
export type RunActionRequest =
  | { action: "update_content"; content: UseCase }
  | { action: "update_config"; config: PdfRenderConfig }
  | { action: "pause" }
  | { action: "resume" }
  | {
      action: "waive_issue";
      issueId: string;
      expectedFindingFingerprint: string;
      reviewerName: string;
      note: string;
    }
  | {
      action: "approve_gate";
      gate: Gate;
      reviewerName: string;
      note?: string;
      expectedFingerprint: string;
      expectedArtifactSha256?: string;
    }
  | { action: "request_changes"; reviewerName: string; note: string }
  | { action: "reject"; reviewerName: string; note: string }
  | { action: "retry" };

export type RunActionName = RunActionRequest["action"];

export interface RunActionResult {
  status: RunStatus;
  paused: boolean;
  currentFingerprint: string;
  openBlockingCount: number;
  [key: string]: unknown;
}

export async function listRuns(
  filter: { status?: RunStatus; batchId?: string } = {},
  signal?: AbortSignal
): Promise<RunSummary[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.batchId) params.set("batchId", filter.batchId);
  const query = params.toString();
  const res = await fetch(`/api/runs${query ? `?${query}` : ""}`, { signal });
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as { runs: RunSummary[] };
  return body.runs;
}

export async function getRun(id: string, signal?: AbortSignal): Promise<RunDetail> {
  const res = await fetch(`/api/runs/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as RunDetail;
}

export async function createBatch(
  items: CreateBatchItem[],
  options: CreateBatchOptions
): Promise<CreateBatchResult> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, options }),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as CreateBatchResult;
}

export async function runAction(
  id: string,
  action: RunActionRequest
): Promise<RunActionResult> {
  const res = await fetch(`/api/runs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as RunActionResult;
}

/** Direct download URL — the route sets Content-Disposition: attachment. */
export function runPdfUrl(id: string): string {
  return `/api/runs/${encodeURIComponent(id)}/pdf`;
}

/**
 * The artifact bytes. Fetched rather than pointed at from an iframe because the
 * route sends `Content-Disposition: attachment`, which makes a browser download
 * the file instead of previewing it; a blob URL carries no disposition header.
 */
export async function fetchRunPdf(id: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(runPdfUrl(id), { signal });
  if (!res.ok) throw await readError(res);
  return await res.blob();
}
