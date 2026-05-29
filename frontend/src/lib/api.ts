import type { UseCase, PdfRenderConfig } from "@shared/useCaseSchema";
import type { ExtractAgentResponse } from "@shared/agentTypes";

export interface ApiError {
  status: number;
  error: string;
  message: string;
  provider?: string;
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    return {
      status: res.status,
      error: body.error ?? "unknown_error",
      message: body.message ?? res.statusText,
      provider: body.provider,
    };
  } catch {
    return { status: res.status, error: "unknown_error", message: res.statusText };
  }
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
