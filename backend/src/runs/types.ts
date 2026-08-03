import { z } from "zod";

import {
  PdfRenderConfigSchema,
  UseCaseSchema,
  type PdfRenderConfig,
  type UseCase,
} from "../shared/useCaseSchema.js";
import type {
  DocumentStrategy,
  IntakeAssessment,
  LayoutPlan,
} from "../shared/agentTypes.js";
import type { TemplateDefinition } from "../shared/templates.js";

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

// Claimable states are picked up by the worker. Transient states mean a worker
// holds a lease and is mid-stage; they are NEVER claimed directly — only the
// recovery sweep moves them back to a claimable state. Gate states wait on a
// human. FAILED is reserved for infrastructure failures and exhausted retries;
// anything a human can correct routes to REVIEW instead.
export const RUN_STATUSES = [
  "QUEUED",
  "EXTRACTING",
  "REVIEW",
  "READY_TO_RENDER",
  "RENDERING",
  "APPROVAL",
  "APPROVED",
  "REJECTED",
  "FAILED",
] as const;
export const RunStatusEnum = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatusEnum>;

export const CLAIMABLE_STATUSES = ["QUEUED", "READY_TO_RENDER"] as const;
export const TRANSIENT_STATUSES = ["EXTRACTING", "RENDERING"] as const;
export const TERMINAL_STATUSES = ["APPROVED", "REJECTED", "FAILED"] as const;

export type ClaimableStatus = (typeof CLAIMABLE_STATUSES)[number];
export type TransientStatus = (typeof TRANSIENT_STATUSES)[number];

export function isTerminal(status: RunStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

// Which claimable status a transient status falls back to when its lease is
// reclaimed. EXTRACTING replays from the immutable raw_content; RENDERING
// replays from content_json, which may hold human edits — so a reclaimed
// render must NOT restart extraction.
export const TRANSIENT_FALLBACK: Record<TransientStatus, ClaimableStatus> = {
  EXTRACTING: "QUEUED",
  RENDERING: "READY_TO_RENDER",
};

export type Stage = "extract" | "render";

export const STAGE_FOR_CLAIMABLE: Record<ClaimableStatus, Stage> = {
  QUEUED: "extract",
  READY_TO_RENDER: "render",
};

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export const ReviewPolicyEnum = z.enum(["only_when_flagged", "always"]);
export type ReviewPolicy = z.infer<typeof ReviewPolicyEnum>;

export const ApprovalModeEnum = z.enum(["required", "auto_if_clean"]);
export type ApprovalMode = z.infer<typeof ApprovalModeEnum>;

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export const ISSUE_SEVERITIES = ["blocking", "warning", "info"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_SOURCES = [
  "render_validation",
  "quality_review",
  "extraction",
  "intake",
] as const;
export type IssueSource = (typeof ISSUE_SOURCES)[number];

// 'resolved' is set ONLY by reconciliation, when the detector stops emitting the
// finding. 'waived' is the only manual disposition. A human cannot declare a
// still-detected finding fixed — that would let a live blocking finding walk
// straight through the gate.
export const ISSUE_STATUSES = ["open", "resolved", "waived"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_RESOLUTION_ACTIONS = ["auto_cleared", "waived"] as const;
export type IssueResolutionAction = (typeof ISSUE_RESOLUTION_ACTIONS)[number];

// What a detector emits. issueKey/findingFingerprint are derived, not supplied.
export interface DetectedIssue {
  code: string;
  severity: IssueSeverity;
  source: IssueSource;
  // Stable structural coordinate, e.g. "summary.solutions". Must NOT include
  // observed values — those belong in `detail`, which feeds the finding
  // fingerprint so a changed finding at the same location reopens.
  locator: string;
  message: string;
  detail?: string;
}

export interface RunIssue {
  id: string;
  runId: string;
  issueKey: string;
  findingFingerprint: string;
  /** Structural coordinate the issue refers to, e.g. "summary.solutions.bullet_count_exact". */
  locator: string;
  code: string;
  severity: IssueSeverity;
  source: IssueSource;
  message: string;
  status: IssueStatus;
  resolutionAction: IssueResolutionAction | null;
  resolutionReviewerName: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  detectedAt: string;
  lastSeenAt: string;
}

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------

export const QA_VERDICTS = ["pass", "warn", "fail"] as const;
export type QaVerdict = (typeof QA_VERDICTS)[number];

export interface QaCheck {
  // Phase 1 emits only 'pre_render'. Phase 3 adds 'render' checks measured off
  // the live Playwright page; until then nothing observes the produced bytes.
  stage: "pre_render" | "render";
  code: string;
  verdict: QaVerdict;
  message: string;
}

export interface QaReport {
  verdict: QaVerdict;
  checks: QaCheck[];
}

// ---------------------------------------------------------------------------
// Decisions / audit
// ---------------------------------------------------------------------------

export const GATES = ["review", "approval"] as const;
export type Gate = (typeof GATES)[number];

export const DECISIONS = ["approve", "request_changes", "reject"] as const;
export type Decision = (typeof DECISIONS)[number];

export interface ApprovalRecord {
  id: string;
  runId: string;
  gate: Gate;
  decision: Decision;
  reviewerName: string;
  note: string | null;
  contentFingerprint: string;
  artifactSha256: string | null;
  decidedAt: string;
}

export const RUN_EVENT_TYPES = [
  "claimed",
  "transition",
  "retry_scheduled",
  "recovered",
  "issue_opened",
  "issue_reopened",
  "issue_resolved",
  "issue_waived",
  "issue_auto_cleared",
  "decision",
  "render_committed",
  "render_discarded",
  "paused",
  "resumed",
  "failed",
] as const;
export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

export interface RunEvent {
  id: string;
  runId: string;
  seq: number;
  type: RunEventType;
  fromStatus: RunStatus | null;
  toStatus: RunStatus | null;
  // 'worker:<id>' | 'user:<reviewerName>' | 'system'
  actor: string;
  detail: unknown;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Run / batch
// ---------------------------------------------------------------------------

export interface Batch {
  id: string;
  name: string | null;
  reviewPolicy: ReviewPolicy;
  approvalMode: ApprovalMode;
  createdAt: string;
}

// Agent decisions captured at extraction, surfaced read-only to the client.
export interface RunAgentSnapshot {
  intake: IntakeAssessment;
  strategy: DocumentStrategy;
  layoutPlan: LayoutPlan;
  warnings: string[];
  recommendedTemplate: TemplateDefinition;
}

export interface Run {
  id: string;
  batchId: string;
  name: string;
  status: RunStatus;
  paused: boolean;

  reviewPolicy: ReviewPolicy;
  approvalMode: ApprovalMode;

  rawContent: string;
  content: UseCase | null;
  config: PdfRenderConfig;
  agent: RunAgentSnapshot | null;
  qa: QaReport | null;

  pdfPath: string | null;
  renderedFingerprint: string | null;
  artifactSha256: string | null;

  extractAttempts: number;
  renderAttempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  lastErrorStage: Stage | null;

  lockedAt: string | null;
  lockedBy: string | null;

  createdAt: string;
  updatedAt: string;
}

// Cheap list projection — deliberately excludes content_json/config_json, which
// carry base64 logo/hero data URLs and would make a list query enormous.
export interface RunSummary {
  id: string;
  batchId: string;
  name: string;
  status: RunStatus;
  paused: boolean;
  reviewPolicy: ReviewPolicy;
  approvalMode: ApprovalMode;
  openBlockingCount: number;
  qaVerdict: QaVerdict | null;
  hasArtifact: boolean;
  extractAttempts: number;
  renderAttempts: number;
  lastError: string | null;
  lastErrorStage: Stage | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const CreateRunsRequestSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        rawContent: z.string().min(20).max(50_000),
      })
    )
    .min(1)
    .max(500),
  options: z
    .object({
      name: z.string().max(200).optional(),
      reviewPolicy: ReviewPolicyEnum.default("only_when_flagged"),
      approvalMode: ApprovalModeEnum.default("required"),
      config: PdfRenderConfigSchema.optional(),
    })
    .default({ reviewPolicy: "only_when_flagged", approvalMode: "required" }),
});
export type CreateRunsRequest = z.infer<typeof CreateRunsRequestSchema>;

// One request performs exactly one explicit action.
export const RunActionSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("update_content"), content: UseCaseSchema }),
    z.object({ action: z.literal("update_config"), config: PdfRenderConfigSchema }),
    z.object({ action: z.literal("pause") }),
    z.object({ action: z.literal("resume") }),
    z.object({
      action: z.literal("waive_issue"),
      issueId: z.string().min(1),
      expectedFindingFingerprint: z.string().min(1),
      reviewerName: z.string().min(1),
      // Required, not optional: waiving a blocking finding without a stated
      // reason defeats the audit trail.
      note: z.string().min(1),
    }),
    z.object({
      action: z.literal("approve_gate"),
      gate: z.enum(GATES),
      reviewerName: z.string().min(1),
      note: z.string().optional(),
      expectedFingerprint: z.string().min(1),
      expectedArtifactSha256: z.string().min(1).optional(),
    }),
    z.object({
      action: z.literal("request_changes"),
      reviewerName: z.string().min(1),
      note: z.string().min(1),
    }),
    z.object({
      action: z.literal("reject"),
      reviewerName: z.string().min(1),
      note: z.string().min(1),
    }),
    z.object({ action: z.literal("retry") }),
  ])
  .superRefine((v, ctx) => {
    if (v.action === "approve_gate" && v.gate === "approval" && !v.expectedArtifactSha256) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedArtifactSha256"],
        message: "expectedArtifactSha256 is required for final approval",
      });
    }
  });
export type RunAction = z.infer<typeof RunActionSchema>;

export const ListRunsQuerySchema = z.object({
  status: RunStatusEnum.optional(),
  batchId: z.string().optional(),
});
