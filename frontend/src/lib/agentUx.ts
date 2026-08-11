// The AI-interaction vocabulary, and every derivation behind it.
//
// One module, deliberately: Create, the processing states, Review, Approval and the
// recovery states all read their wording and their signals from here, so the product
// cannot end up with four different ways of saying "the agent stopped".
//
// Nothing here invents a signal. Every function below reads fields the run API
// actually returns — status, paused, reviewPolicy, approvalMode, issues, approvals,
// events, attempts, fingerprints — and each one names what it is derived from. There
// are no percentages, no durations and no completed steps the backend did not report.

import type { RunDetail, ApiError } from "./api";
import { RUN_STATUS_LABELS, type RunEvent, type RunIssue, type RunStatus } from "./runTypes";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * The product-wide phrases. Used verbatim everywhere — a screen never re-words them,
 * because a reviewer learns one vocabulary, not one per page.
 */
export const PHASE_LABELS = {
  agentWorking: "Agent working",
  agentPaused: "Agent paused for review",
  humanDecision: "Human decision required",
  humanApproved: "Human approved",
  artifactReady: "Artifact ready for sign-off",
} as const;

/** What kind of thing the interface is reporting. Drives tone, never colour alone. */
export type PhaseKind = "system" | "agent" | "human" | "approved";

export interface AgentPhase {
  kind: PhaseKind;
  label: string;
}

export const PHASE_KIND_LABELS: Record<PhaseKind, string> = {
  system: "System state",
  agent: "Agent action",
  human: "Human decision",
  approved: "Approved artifact",
};

const PHASE_BY_STATUS: Record<RunStatus, AgentPhase> = {
  QUEUED: { kind: "system", label: "Queued for the agent" },
  EXTRACTING: { kind: "agent", label: PHASE_LABELS.agentWorking },
  REVIEW: { kind: "human", label: PHASE_LABELS.humanDecision },
  READY_TO_RENDER: { kind: "system", label: "Queued for the render stage" },
  RENDERING: { kind: "agent", label: PHASE_LABELS.agentWorking },
  APPROVAL: { kind: "human", label: PHASE_LABELS.artifactReady },
  APPROVED: { kind: "approved", label: PHASE_LABELS.humanApproved },
  REJECTED: { kind: "human", label: "Rejected by a reviewer" },
  FAILED: { kind: "system", label: "Stopped after a failure" },
};

// A pause only re-labels the phases where the agent would otherwise act next. At a
// human gate the thing being waited on is still the human decision, so pausing there
// is reported by the separate Paused badge instead of replacing the phase.
const PAUSE_RELABELS: readonly RunStatus[] = [
  "QUEUED",
  "EXTRACTING",
  "READY_TO_RENDER",
  "RENDERING",
];

/** Derived from run.status and run.paused. */
export function agentPhase(status: RunStatus, paused: boolean): AgentPhase {
  if (paused && PAUSE_RELABELS.includes(status)) {
    return { kind: "agent", label: PHASE_LABELS.agentPaused };
  }
  return PHASE_BY_STATUS[status];
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export type StageState = "done" | "current" | "next" | "later";

export interface AgentStage {
  key: string;
  label: string;
  /** Who acts at this stage — the distinction the whole product is built on. */
  actor: "system" | "agent" | "human";
  state: StageState;
  /** Real policy or attempt information, never an estimate. */
  note?: string;
  /** A timestamp the backend recorded, or undefined. Never predicted. */
  at?: string;
}

// The five lifecycle positions the nine statuses collapse into, matching StageTrack
// so a reviewer sees one shape everywhere. This is a read-only projection: it decides
// nothing and cannot drift from the backend state machine.
const POSITION_BY_STATUS: Record<RunStatus, number> = {
  QUEUED: 1,
  EXTRACTING: 1,
  REVIEW: 2,
  READY_TO_RENDER: 3,
  RENDERING: 3,
  APPROVAL: 4,
  APPROVED: 5,
  REJECTED: 5,
  FAILED: 1,
};

function lastEventAt(events: RunEvent[], pred: (e: RunEvent) => boolean): string | undefined {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .filter(pred)
    .at(-1)?.createdAt;
}

function stateFor(index: number, position: number): StageState {
  if (index < position) return "done";
  if (index === position) return "current";
  if (index === position + 1) return "next";
  return "later";
}

/**
 * The run's real stages.
 *
 * Completion is only claimed where the backend recorded it: a transition away from
 * EXTRACTING, a render_committed event, or an approval record. A stage with no such
 * evidence carries no timestamp rather than a guessed one.
 */
export function runStages(detail: RunDetail): AgentStage[] {
  const { run } = detail;

  // FAILED is not a lifecycle position — the run is stopped at whichever stage threw.
  const position =
    run.status === "FAILED"
      ? run.lastErrorStage === "render"
        ? 3
        : 1
      : POSITION_BY_STATUS[run.status];

  const extractedAt = lastEventAt(
    detail.events,
    (e) => e.type === "transition" && e.fromStatus === "EXTRACTING"
  );
  const renderedAt = lastEventAt(detail.events, (e) => e.type === "render_committed");
  const reviewApprovedAt = detail.approvals
    .filter((a) => a.gate === "review" && a.decision === "approve")
    .at(-1)?.decidedAt;
  const signedAt = detail.approvals
    .filter((a) => a.gate === "approval" && a.decision === "approve")
    .at(-1)?.decidedAt;

  const stages: Omit<AgentStage, "state">[] = [
    {
      key: "source",
      label: "Source received",
      actor: "system",
      note: `${run.rawContent.length.toLocaleString()} characters, stored immutably. Extraction always replays from this.`,
      at: run.createdAt,
    },
    {
      key: "extract",
      label: "Extract structured content",
      actor: "agent",
      note:
        run.extractAttempts > 0
          ? `Attempt ${run.extractAttempts}. The agent chooses a template, extracts fields and normalizes them to the template's structure.`
          : "The agent chooses a template, extracts fields and normalizes them to the template's structure.",
      at: extractedAt,
    },
    {
      key: "review",
      label: "Review gate",
      actor: "human",
      note:
        run.reviewPolicy === "always"
          ? "This run always stops here for a human decision."
          : "Entered whenever a blocking finding is open — a blocking finding is never skippable by policy.",
      at: reviewApprovedAt,
    },
    {
      key: "render",
      label: "Render the PDF",
      actor: "agent",
      note:
        run.renderAttempts > 0
          ? `Attempt ${run.renderAttempts}. Renders the stored content, including your edits.`
          : "Renders the stored content, including your edits.",
      at: renderedAt,
    },
    {
      key: "approval",
      label: "Final sign-off",
      actor: "human",
      note:
        run.approvalMode === "required"
          ? "A human signs every artifact."
          : "Configured to auto-approve when clean, but automatic approval stays disabled until rendered-output QA ships — so a human still signs.",
      at: signedAt,
    },
  ];

  return stages.map((stage, i) => ({ ...stage, state: stateFor(i, position) }));
}

/**
 * Create-screen stages, while a submission is actually in flight.
 *
 * The single-document path is one /api/extract request that runs Intake → Strategy →
 * Extraction → Content Editor → Layout Planner server-side. The response arrives as a
 * whole, so those inner stages are reported as one activity — ticking them off
 * individually would be an invented progress claim.
 */
export function createStages(mode: "single" | "batch", fileCount: number): AgentStage[] {
  if (mode === "single") {
    return [
      {
        key: "source",
        label: "Source received",
        actor: "system",
        state: "done",
        note: "Held in the browser until the agent is called.",
      },
      {
        key: "extract",
        label: "Agent analysing the source and extracting structure",
        actor: "agent",
        state: "current",
        note: "One request: intake assessment, document strategy, extraction, content editing and layout planning. It reports back when the whole draft is ready.",
      },
      {
        key: "review",
        label: "Your review of the draft",
        actor: "human",
        state: "next",
        note: "Every extracted field is editable before any PDF is produced.",
      },
    ];
  }
  return [
    {
      key: "staged",
      label: `${fileCount} source file${fileCount === 1 ? "" : "s"} staged`,
      actor: "system",
      state: "done",
    },
    {
      key: "create",
      label: "Creating one durable run per file and queueing extraction",
      actor: "system",
      state: "current",
    },
    {
      key: "extract",
      label: "Agent extraction, per run, on the server",
      actor: "agent",
      state: "next",
      note: "Progress for each run appears in the Runs workbench.",
    },
    {
      key: "review",
      label: "Review gate, per run",
      actor: "human",
      state: "later",
    },
  ];
}

// ---------------------------------------------------------------------------
// Content origin
// ---------------------------------------------------------------------------

export type OriginKind =
  | "source"
  | "restructured"
  | "expansion"
  | "human_approved"
  | "unsupported";

export const ORIGIN_LABELS: Record<OriginKind, string> = {
  source: "Source-backed",
  restructured: "AI restructured",
  expansion: "Source expansion",
  human_approved: "Human approved",
  unsupported: "Unsupported / needs review",
};

/**
 * The signal each label is derived from, shown as the badge's tooltip so the claim is
 * auditable rather than decorative.
 *
 * `source` is deliberately only ever applied to the stored raw source itself. This
 * codebase has no claim-grounding detector — only a source_expansion note — so no
 * extracted sentence is ever labelled source-backed.
 */
export const ORIGIN_BASIS: Record<OriginKind, string> = {
  source: "The raw source text stored with this run. Extraction always replays from it.",
  restructured:
    "The agent reshaped source material into this template's structure and bullet policy. The wording is the agent's; there is no claim-level grounding check.",
  expansion:
    "The extraction agent recorded a source_expansion note here: this content goes beyond what the source stated.",
  human_approved:
    "A reviewer recorded a decision against this exact content fingerprint.",
  unsupported:
    "An open finding covers this content, or the source did not supply the field. It needs your judgement.",
};

export interface OriginItem {
  kind: OriginKind;
  text: string;
  /** The backend's structural coordinate, e.g. "expansionNotes.0". */
  locator: string;
  /** Present when a real RunIssue backs this item. */
  issue?: RunIssue;
}

/**
 * Provenance items worth labelling — only content that needs the reviewer's judgement.
 *
 * Sources: content.expansionNotes, content.missingFields, and open findings. Content
 * with no signal is left unlabelled rather than given a reassuring badge the backend
 * cannot support.
 */
export function contentOrigins(detail: RunDetail): OriginItem[] {
  const content = detail.run.content;
  if (!content) return [];
  const byLocator = new Map(detail.issues.map((i) => [i.locator, i]));
  const items: OriginItem[] = [];

  for (const [i, note] of (content.expansionNotes ?? []).entries()) {
    const locator = `expansionNotes.${i}`;
    items.push({ kind: "expansion", text: note, locator, issue: byLocator.get(locator) });
  }

  for (const [i, field] of (content.missingFields ?? []).entries()) {
    const locator = `missingFields.${i}`;
    items.push({
      kind: "unsupported",
      text: `Source did not supply: ${field}`,
      locator,
      issue: byLocator.get(locator),
    });
  }

  // Open findings that sit on the document itself, rather than on a note we already
  // listed above.
  for (const issue of detail.issues) {
    if (issue.status !== "open") continue;
    if (issue.locator.startsWith("expansionNotes.") || issue.locator.startsWith("missingFields.")) {
      continue;
    }
    items.push({
      kind: "unsupported",
      text: issue.message,
      locator: issue.locator,
      issue,
    });
  }

  return items;
}

export interface DocumentOrigin {
  /** True once the agent produced structured content for this run. */
  restructured: boolean;
  expansions: number;
  unsupported: number;
  /** A reviewer approved THIS content fingerprint, not merely the run at some point. */
  humanApproved: boolean;
  /** Human dispositions recorded against findings. */
  waived: number;
}

export function documentOrigin(detail: RunDetail): DocumentOrigin {
  const origins = contentOrigins(detail);
  return {
    restructured: detail.run.content !== null && detail.run.agent !== null,
    expansions: origins.filter((o) => o.kind === "expansion").length,
    unsupported: origins.filter((o) => o.kind === "unsupported").length,
    humanApproved: detail.approvals.some(
      (a) => a.decision === "approve" && a.contentFingerprint === detail.currentFingerprint
    ),
    waived: detail.issues.filter((i) => i.status === "waived").length,
  };
}

// ---------------------------------------------------------------------------
// Why the agent stopped
// ---------------------------------------------------------------------------

export interface IssueExplanation {
  /** Why the agent stopped — or why it is asking — for this finding's code. */
  why: string;
  /** The judgement being asked of the reviewer. */
  decide: string;
  origin: OriginKind;
}

// Keyed on the issue codes deriveIssues() actually emits. An unknown code falls back
// to a truthful generic rather than a confident guess.
const EXPLANATIONS: Record<string, IssueExplanation> = {
  render_validation: {
    why: "The selected template requires a specific structure here, and the stored content does not satisfy it. The agent will not render a document it already knows is out of contract.",
    decide:
      "Edit the content until the check passes, or waive the finding if the content is right and the rule is wrong for this document.",
    origin: "unsupported",
  },
  source_expansion: {
    why: "The extraction agent added content that goes beyond your source, and recorded it. It blocks the gate because nothing in this system verifies an added claim against the source — only you can.",
    decide:
      "Edit or delete the added wording, or waive the finding if the addition is accurate and you are willing to stand behind it.",
    origin: "expansion",
  },
  missing_field: {
    why: "Your source did not supply this field, so the agent left it out instead of inventing a value.",
    decide: "Supply the field yourself, or accept the gap — this one does not block the gate.",
    origin: "unsupported",
  },
  intake_risk: {
    why: "The intake assessment flagged a risk about the source before extraction ran.",
    decide: "Judge whether it affects the document; it does not block the gate.",
    origin: "unsupported",
  },
  quality_error: {
    why: "The pre-render quality review found a problem the agent could not repair by itself.",
    decide: "Fix the content, or waive the finding if the output is acceptable as it stands.",
    origin: "unsupported",
  },
  quality_warning: {
    why: "The pre-render quality review noted something worth a look. It does not block the gate.",
    decide: "Judge whether it matters for this document.",
    origin: "unsupported",
  },
};

export function explainIssue(issue: RunIssue): IssueExplanation {
  return (
    EXPLANATIONS[issue.code] ?? {
      why:
        issue.severity === "blocking"
          ? "The agent recorded a blocking finding here and stopped rather than proceeding past it."
          : "The agent recorded a finding here for you to judge.",
      decide:
        issue.severity === "blocking"
          ? "Resolve it in the content, or waive it with a reason."
          : "No decision is required; it does not block the gate.",
      origin: "unsupported",
    }
  );
}

// ---------------------------------------------------------------------------
// Consequences
// ---------------------------------------------------------------------------

/**
 * What actually happens when a decision is submitted, per action, in the server's own
 * terms. Hashes are never the explanation here — they live under technical detail.
 */
export const CONSEQUENCES = {
  waive_issue: [
    "The waiver applies only to this finding fingerprint. If the finding changes, it reopens as a new decision.",
    "The content is not modified. The finding stays visible, marked waived, with your name and reason.",
    "One fewer blocking finding. The review gate can clear once nothing blocking is open.",
  ],
  approve_review: [
    "Approval is recorded against the content and configuration stored right now — not an unsaved draft on screen.",
    "The run moves to the render stage and a worker renders the PDF.",
    "You get a second decision afterwards: the rendered PDF still needs final sign-off.",
  ],
  approve_final: [
    "Final approval signs the exact content fingerprint and artifact hash you are looking at.",
    "The run becomes approved and closed — no further edits, renders or decisions.",
    "If either the content or the PDF moved since you loaded this page, the server refuses instead of signing the wrong thing.",
  ],
  request_changes: [
    "Request changes invalidates the current active artifact — this PDF stops being the active one. The file stays on disk as audit evidence.",
    "The run returns to the review gate, where content and configuration become editable again.",
    "A new render is required, and final sign-off happens again on the new artifact.",
  ],
  reject: [
    "Rejection is final. The run cannot be resumed, retried or re-rendered.",
    "It is recorded permanently against your name with the reason you give.",
  ],
  pause: [
    "Pause stops the next stage from starting. A stage already running still finishes and is saved.",
  ],
  resume: ["The agent may claim the next stage again."],
} as const;

/** A retry resumes the stage that failed — real behaviour, from run.lastErrorStage. */
export function retryConsequences(lastErrorStage: "extract" | "render" | null): string[] {
  if (lastErrorStage === "render") {
    return [
      "A render retry resumes from the render stage. It does not repeat extraction, so human edits to the content are kept.",
      "Attempt counters increase; nothing else about the run changes.",
    ];
  }
  return [
    "This retry restarts extraction from the immutable source. Content the agent produced earlier is replaced.",
    "Human edits made to the extracted content will not survive a re-extraction.",
  ];
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

/**
 * What went stale, in words, when the 409 body actually says.
 *
 * The runs API answers every guard failure with 409 and a `detail` object (see
 * routes/runs.ts). This reads that detail and returns null when it does not support a
 * specific statement — a vague guess would be worse than the generic reload notice.
 */
export function describeStaleness(err: ApiError): string | null {
  const detail = (err.detail ?? {}) as Record<string, unknown>;

  switch (err.error) {
    case "fingerprint_mismatch":
      if (typeof detail.currentArtifactSha256 === "string") {
        return "A different PDF is now the active artifact for this run, so the one you loaded is no longer the thing being signed.";
      }
      if (typeof detail.currentFingerprint === "string") {
        return "The stored content or configuration changed after you loaded this page.";
      }
      return null;
    case "artifact_fingerprint_stale":
      return "The content changed after this PDF was rendered, so the artifact no longer represents what is stored. It has to be re-rendered before it can be signed.";
    case "artifact_mismatch":
      return "The PDF on disk no longer matches the hash recorded for it, so it cannot be signed.";
    case "artifact_missing":
      return "This run no longer has an active rendered PDF.";
    case "blocking_issues_open":
      return typeof detail.openBlocking === "number"
        ? `${detail.openBlocking} blocking finding${detail.openBlocking === 1 ? "" : "s"} became open again and must be resolved or waived first.`
        : null;
    case "wrong_state":
      return typeof detail.status === "string" && detail.status in RUN_STATUS_LABELS
        ? `The run is now “${RUN_STATUS_LABELS[detail.status as RunStatus]}”, so that decision no longer applies to it.`
        : null;
    case "illegal_transition":
      return typeof detail.from === "string" && typeof detail.to === "string"
        ? `The run moved on already: ${detail.from} → ${detail.to} is not something it can do from here.`
        : null;
    case "qa_failed":
      return "Output QA failed for this artifact, so it cannot be approved.";
    default:
      return null;
  }
}
