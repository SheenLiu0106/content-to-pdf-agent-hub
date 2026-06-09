import type { UseCase, PdfRenderConfig } from "../../shared/useCaseSchema.js";
import type {
  DocumentStrategy,
  LayoutPlan,
  PdfQualityReport,
  QualityIssue,
  RepairAction,
  CoverDensity,
} from "../../shared/agentTypes.js";
import { runContentEditor } from "./contentEditor.js";
import {
  CASE_STUDY_BULLET_TIGHT_CHAR_CAP,
  normalizeCaseStudySummary,
  tightenCaseStudyBullets,
} from "../../shared/normalizeUseCase.js";

// Repair stage. Maps quality issues → RepairAction[], applies them to the
// content/layout/config triple, and signals whether anything actually
// changed. The orchestrator calls runQualityReview again after applying,
// up to maxRepairAttempts. Each repair attempt mutates the three pieces
// of state we own (content, strategy, layoutPlan); the renderer config is
// almost entirely user-owned and we deliberately do not mutate it.

const MAX_ATTEMPTS = 2;

export const MAX_REPAIR_ATTEMPTS = MAX_ATTEMPTS;

interface RepairState {
  content: UseCase;
  strategy: DocumentStrategy;
  layoutPlan: LayoutPlan;
}

// Heuristic: decide whether a sparse cover should resolve via spacious or
// compact density. Visual verification step (the plan's "fixture matrix")
// has not been run yet, so when signals are ambiguous we return null and
// the repair becomes a no-op rather than a guess.
function pickDensityForSparseCover(content: UseCase): CoverDensity | null {
  const totalChars = [
    ...content.goals,
    ...content.challenges,
    ...content.solutions,
    ...content.results,
  ].reduce((acc, b) => acc + b.length, 0);
  const totalBullets =
    content.goals.length +
    content.challenges.length +
    content.solutions.length +
    content.results.length;
  const titleLen = content.title.length;

  // Truly light content — short title and few short bullets — wants spacious
  // density to fill the page without forcing a sparse-third-page.
  if (titleLen <= 55 && totalChars <= 300 && totalBullets <= 6) return "spacious";

  // Dense bullet load with a long title is the "fragile" pattern: page 1
  // is fragile and a render-time overflow is the real risk. Tighten with
  // compact.
  if (titleLen > 70 || totalChars > 600) return "compact";

  // Ambiguous — let the user decide, surface as warning only.
  return null;
}

function planActionsForIssue(
  issue: QualityIssue,
  state: RepairState
): RepairAction[] {
  switch (issue.code) {
    case "dangling_sentence":
      return [{ type: "repair_sentence_fragments" }];

    case "short_cover_blank_space": {
      const target = pickDensityForSparseCover(state.content);
      if (!target || target === state.layoutPlan.coverDensity) return [];
      return [{ type: "switch_cover_density", density: target }];
    }

    case "summary_spill": {
      if (state.layoutPlan.coverDensity === "compact") return [];
      return [{ type: "switch_cover_density", density: "compact" }];
    }

    case "sparse_page":
      if (state.layoutPlan.visualPlacement === "omit") return [];
      return [{ type: "omit_supporting_visual" }];

    case "failed_visual":
      if (state.layoutPlan.visualPlacement === "omit") return [];
      return [{ type: "omit_supporting_visual" }];

    // Customer Case Study page-1 repairs. Re-normalize restores the exactly-4
    // contract; overflow risk tightens bullets via semantic compression.
    case "summary_count_mismatch":
      return [{ type: "renormalize_case_study_summary" }];

    case "summary_overflow_risk":
      return [
        { type: "compress_case_study_summary", maxChars: CASE_STUDY_BULLET_TIGHT_CHAR_CAP },
      ];

    // User-config issues — no automatic repair.
    case "missing_footer":
    case "copyright_error":
    case "filename_error":
      return [];
  }
}

// Dedupe identical actions (a "switch density → compact" issued by both
// summary_spill and short_cover_blank_space should only apply once).
function dedupeActions(actions: RepairAction[]): RepairAction[] {
  const out: RepairAction[] = [];
  const seen = new Set<string>();
  for (const a of actions) {
    const key = JSON.stringify(a);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

// Reject an action that would *undo* a previous repair attempt. Tracks the
// most recent value of each mutable knob so the loop can't oscillate
// (e.g., compact → spacious → compact). Returns true if the action is
// safe to apply, false if it would revert.
function isReverting(
  action: RepairAction,
  history: RepairAction[]
): boolean {
  if (action.type !== "switch_cover_density") return false;
  for (let i = history.length - 1; i >= 0; i--) {
    const prev = history[i]!;
    if (prev.type === "switch_cover_density" && prev.density === action.density) {
      continue;
    }
    if (prev.type === "switch_cover_density" && prev.density !== action.density) {
      // The previous density action moved us *away* from action.density.
      // Re-applying action.density would reverse it.
      return true;
    }
  }
  return false;
}

export function planRepair(
  report: PdfQualityReport,
  state: RepairState,
  history: RepairAction[]
): RepairAction[] {
  const raw = report.issues.flatMap((issue) => planActionsForIssue(issue, state));
  const deduped = dedupeActions(raw);
  return deduped.filter((a) => !isReverting(a, history));
}

function applyAction(action: RepairAction, state: RepairState): RepairState {
  switch (action.type) {
    case "switch_cover_density":
      return {
        ...state,
        layoutPlan: {
          ...state.layoutPlan,
          coverDensity: action.density,
          notes: [...state.layoutPlan.notes, `repair: density → ${action.density}`],
        },
      };
    case "omit_supporting_visual":
      return {
        ...state,
        layoutPlan: {
          ...state.layoutPlan,
          visualPlacement: "omit",
          estimatedPages: 2,
          notes: [...state.layoutPlan.notes, "repair: visual omitted"],
        },
      };
    case "repair_sentence_fragments":
      return {
        ...state,
        content: runContentEditor(state.content, state.strategy),
      };
    case "renormalize_case_study_summary":
      return {
        ...state,
        content: normalizeCaseStudySummary(state.content),
      };
    case "compress_case_study_summary":
      return {
        ...state,
        content: tightenCaseStudyBullets(state.content, action.maxChars),
      };
    case "compress_narrative":
      // Compression already happens in runContentEditor; an explicit
      // tighter pass would require a new narrativeMode. Reserved for
      // future use.
      return state;
    case "rerender_pdf":
      // Caller handles re-render; no state change.
      return state;
  }
}

export function applyActions(
  actions: RepairAction[],
  state: RepairState
): RepairState {
  let next = state;
  for (const a of actions) {
    next = applyAction(a, next);
  }
  return next;
}

// Map the agent's final LayoutPlan back into the render config. The renderer
// reads pdfLengthMode (compact-2-page vs standard) from config; coverDensity
// is recomputed by the template. We pass density via a config override that
// the template can honor — but to keep the renderer untouched, we *also*
// adjust pdfLengthMode when the planner decided to drop to 2 pages.
export function applyLayoutToRenderConfig(
  config: PdfRenderConfig,
  layoutPlan: LayoutPlan
): PdfRenderConfig {
  if (layoutPlan.estimatedPages === 2 && config.pdfLengthMode !== "compact-2-page") {
    return { ...config, pdfLengthMode: "compact-2-page" };
  }
  return config;
}
