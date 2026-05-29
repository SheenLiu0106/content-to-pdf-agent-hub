import type { UseCase, NarrativeSection } from "../../shared/useCaseSchema.js";
import type { DocumentStrategy } from "../../shared/agentTypes.js";
import { splitSentences, truncateToSentence } from "../../shared/sentenceSafe.js";

// Content Editor stage. Re-checks the normalized UseCase for sentence-level
// problems and, when the strategy disagrees with the extracted volume,
// applies a final sentence-safe compression pass. Never adds factual content.

const TRANSITION_ORPHANS = new Set([
  "ultimately",
  "therefore",
  "however",
  "moreover",
  "furthermore",
  "additionally",
  "consequently",
  "meanwhile",
  "specifically",
  "notably",
  "importantly",
  "indeed",
  "finally",
  "thus",
  "hence",
]);

const TERMINATORS = /[.!?]["')\]]?$/;

function endsCleanly(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return TERMINATORS.test(t);
}

// Detect a body that *would* read as a fragment to a human: ends without a
// terminator, or last sentence opens with a transition orphan and never
// completes. Reuses the same orphan vocabulary as sentenceSafe so detection
// and repair stay aligned.
export function isSentenceFragment(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!endsCleanly(t)) return true;
  const sentences = splitSentences(t);
  if (sentences.length === 0) return true;
  const last = sentences[sentences.length - 1]!;
  const firstWord = last.split(/\s+/)[0]?.replace(/[,.;:]$/, "").toLowerCase() ?? "";
  if (TRANSITION_ORPHANS.has(firstWord) && !endsCleanly(last)) return true;
  return false;
}

// Repair a body by dropping a trailing fragment sentence. If the remaining
// body would be empty, return the original — we'd rather ship a fragment
// the user can edit than lose the whole section.
export function repairSentenceFragments(text: string): string {
  const t = text.trim();
  if (!t || !isSentenceFragment(t)) return t;
  const sentences = splitSentences(t);
  if (sentences.length <= 1) return t;
  const kept: string[] = [];
  for (const s of sentences) {
    if (endsCleanly(s)) kept.push(s);
  }
  const joined = kept.join(" ").trim();
  return joined.length > 0 ? joined : t;
}

// Word budget targets per narrativeMode. Tighter than normalizeUseCase's
// hard cap of 120 — those caps prevent overflow; these targets shape the
// final feel.
const NARRATIVE_BUDGETS: Record<DocumentStrategy["narrativeMode"], number> = {
  concise: 85,
  balanced: 100,
  expanded: 115,
};

const EXEC_SUMMARY_BUDGETS: Record<DocumentStrategy["narrativeMode"], number> = {
  concise: 80,
  balanced: 95,
  expanded: 110,
};

function editNarrativeSection(
  section: NarrativeSection,
  budget: number
): NarrativeSection {
  const fragmentRepaired = repairSentenceFragments(section.body);
  const compressed = truncateToSentence(fragmentRepaired, { maxWords: budget });
  return { heading: section.heading, body: compressed };
}

export function runContentEditor(
  content: UseCase,
  strategy: DocumentStrategy
): UseCase {
  const narrativeBudget = NARRATIVE_BUDGETS[strategy.narrativeMode];
  const summaryBudget = EXEC_SUMMARY_BUDGETS[strategy.narrativeMode];

  return {
    ...content,
    executiveSummary: truncateToSentence(
      repairSentenceFragments(content.executiveSummary),
      { maxWords: summaryBudget }
    ),
    narrativeSections: content.narrativeSections.map((s) =>
      editNarrativeSection(s, narrativeBudget)
    ),
    callToAction:
      content.callToAction && isSentenceFragment(content.callToAction)
        ? repairSentenceFragments(content.callToAction)
        : content.callToAction,
  };
}
