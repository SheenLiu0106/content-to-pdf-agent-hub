import type { UseCase, UseCaseContentType } from "../../shared/useCaseSchema.js";
import type { IntakeAssessment, ContentLength } from "../../shared/agentTypes.js";
import { recommendTemplate } from "../../shared/templates.js";

// Intake assessment runs *before* extraction on raw pasted content. We do
// the cheap signals locally — length bucket, missing-field hints from naive
// keyword scans — so the LLM call in extraction can be parameterized. An LLM
// call here is deliberately avoided: it doubles latency for signal we can
// get deterministically from word count alone.

const SHORT_WORD_THRESHOLD = 120;
const LONG_WORD_THRESHOLD = 900;

function bucketLength(raw: string): ContentLength {
  const words = raw.trim().split(/\s+/).filter(Boolean).length;
  if (words < SHORT_WORD_THRESHOLD) return "short";
  if (words > LONG_WORD_THRESHOLD) return "long";
  return "medium";
}

// Memo orientation cues beyond the explicit `memo`/`executive summary` phrases.
const MEMO_PHRASE_RE =
  /\binternal memo\b|\bleadership update\b|\baction items?\b|\bnext steps\b/i;

// Article-style title openers ("Why X matters", "How X works"). Tested only
// against the first non-empty line to avoid matching mid-body sentences.
const ARTICLE_TITLE_RE = /^(?:why|how|what)\b/i;

// Conceptual / thought-leadership vocabulary. A handful of these in
// combination (or one with an article-style title) is a strong signal that
// the source is explaining a framework rather than reporting a deployment.
const ARTICLE_CUE_RE =
  /\b(framework|concept|principle|architecture|governance|autonomous|context graphs?|thought leadership|paradigm|reasoning|introduces?|argues?|explores?|compares?|discusses?|trend|approach|model|strategy|ai agents?)\b/gi;

// Case-study cues — implementation, outcome, and structure. We require ALL
// three to fire (and the implementation cue must be specific, not just a
// passing "use case" mention) before the heuristic returns a case-study
// label. Single-word triggers were the historical bug.
const IMPL_CUE_RE =
  /\b(customer|client|operator|facility|plant|deployed|implemented|rolled out|pilot|case study|success story|customer story)\b/gi;

const OUTCOME_CUE_RE =
  /\b(reduced|increased|improved|enabled|saved|cut by|grew by|achieved|resulted in|accelerated|decreased|\d+\s*%|\d+\s*hours?|\d+\s*days?|\d+\s*months?|roi)\b/gi;

const STRUCTURE_CUE_RE =
  /\b(challenges?|solutions?|results?|goals?|key benefits|deployment|outcomes?)\b/gi;

function countMatches(re: RegExp, text: string): number {
  return text.match(re)?.length ?? 0;
}

function detectContentTypeHeuristic(raw: string): UseCaseContentType {
  const lower = raw.toLowerCase();
  const firstLine = (raw.trim().split(/\r?\n/)[0] ?? "").trim();

  // Explicit, unambiguous named phrases first. These are anchored on
  // document-type vocabulary, not incidental words.
  if (/\bsuccess story\b|\bcustomer story\b/.test(lower)) return "success_story";
  if (/\bcase study\b/.test(lower)) return "case_study";
  if (/\bdecision brief\b/.test(lower)) return "decision_brief";
  if (/\bmeeting (?:summary|notes)\b/.test(lower)) return "meeting_summary";
  if (/\bproject summary\b|\bproject report\b/.test(lower)) return "project_summary";
  if (/\bthought leadership\b/.test(lower)) return "thought_leadership";
  if (/\bnewsletter\b/.test(lower)) return "newsletter";
  if (/\bmarketing\b|\bcampaign\b/.test(lower)) return "marketing_brief";
  if (/\bmemo\b|\bexecutive summary\b/.test(lower) || MEMO_PHRASE_RE.test(lower)) {
    return "executive_memo";
  }

  // Scored check. A bare "use case" mention or a single "results"/"challenge"
  // is no longer enough — articles routinely mention those in passing. We
  // require an implementation cue, an outcome cue, AND at least two
  // structure cues before classifying as a true case study.
  const implCount = countMatches(IMPL_CUE_RE, lower);
  const outcomeCount = countMatches(OUTCOME_CUE_RE, lower);
  const structureCount = countMatches(STRUCTURE_CUE_RE, lower);
  const articleCueCount = countMatches(ARTICLE_CUE_RE, lower);
  const titleIsArticle = ARTICLE_TITLE_RE.test(firstLine);

  const strongCaseStudy =
    implCount >= 1 && outcomeCount >= 1 && structureCount >= 2;
  const strongArticle = titleIsArticle || articleCueCount >= 3;

  if (strongCaseStudy && !strongArticle) {
    return "use_case";
  }

  // Default to the article family. The LLM gets the final say in extraction
  // and has stronger context to disambiguate — the heuristic must not bias
  // conceptual content toward Customer Case Study.
  if (titleIsArticle || articleCueCount >= 2) {
    return "thought_leadership";
  }
  return "general_article";
}

// --- Deterministic use-case signal layer ---------------------------------
// Applied *after* the LLM verdict (see agent.ts). The extraction prompt is
// intentionally conservative — it requires all of {named customer, specific
// challenge, implemented solution, measurable outcome} and otherwise prefers
// `general_article`. That mis-files narratively-written success stories that
// lack a named customer or a quantified metric. This layer upgrades an
// article-family verdict to the use-case family when the source carries
// explicit success-story/case-study framing or a concrete
// challenge→solution→outcome structure. Explicit signals beat the article
// default; the article-cue + article-title guards keep genuinely conceptual
// pieces (Test 4: "Why Context Graphs Matter…") on Article Report.

export interface UseCaseSignal {
  isUseCase: boolean;
  contentType: UseCaseContentType;
  rationale: string;
}

// Tier-2 structural categories. We require >= 3 distinct categories to fire,
// so single passing mentions of "solution"/"results" (common in articles)
// are not enough. Impl cues are broadened vs IMPL_CUE_RE — note "deployment"
// and "project", which real success stories use but the older regex missed.
const UC_CHALLENGE_RE =
  /\b(challenges?|problems?|manual|bottlenecks?|pain points?|struggl\w*|difficult|time-consuming|error-prone|inconsisten\w*|lack of|legacy|silos?)\b/i;
const UC_SOLUTION_RE =
  /\b(solutions?|implemented|deployed|deployment|built|developed|introduced|rolled out|platform|automat\w*|pipelines?|integrat\w*)\b/i;
const UC_OUTCOME_RE =
  /\b(results?|outcomes?|achieved|improved|reduced|increased|transform\w*|enabled|saved|accelerated|faster|\d+\s*%|roi|business impact|operational impact)\b/i;
const UC_SPECIFICITY_RE =
  /\b(customers?|clients?|operators?|facilit(?:y|ies)|plants?|projects?|deployment|pilots?)\b/i;

export function detectUseCaseSignal(raw: string): UseCaseSignal {
  const lower = raw.toLowerCase();
  const firstLine = (raw.trim().split(/\r?\n/)[0] ?? "").trim().toLowerCase();

  // Tier 1 — explicit document-type phrases beat everything.
  if (/\bcustomer success story\b/.test(lower) || /\bsuccess story\b|\bcustomer story\b/.test(lower)) {
    return {
      isUseCase: true,
      contentType: "success_story",
      rationale:
        'Recommended Customer Case Study because the source is explicitly framed as a success story.',
    };
  }
  if (/\bcase study\b/.test(lower)) {
    return {
      isUseCase: true,
      contentType: "case_study",
      rationale:
        'Recommended Customer Case Study because the source is explicitly framed as a case study.',
    };
  }
  // "use case" only counts in the title/first line — articles mention "use
  // cases" in passing, but a titled "Use Case" is a deliberate framing.
  if (/\buse case\b/.test(firstLine)) {
    return {
      isUseCase: true,
      contentType: "use_case",
      rationale:
        'Recommended Customer Case Study because the title frames the source as a use case.',
    };
  }

  // Tier 2 — structural triad, suppressed for strong-article signals so
  // conceptual/thought-leadership pieces are not upgraded.
  const titleIsArticle = ARTICLE_TITLE_RE.test(firstLine);
  const articleCueCount = countMatches(ARTICLE_CUE_RE, lower);
  const strongArticle = titleIsArticle || articleCueCount >= 3;

  if (!strongArticle) {
    const categories =
      Number(UC_CHALLENGE_RE.test(lower)) +
      Number(UC_SOLUTION_RE.test(lower)) +
      Number(UC_OUTCOME_RE.test(lower)) +
      Number(UC_SPECIFICITY_RE.test(lower));
    if (categories >= 3) {
      return {
        isUseCase: true,
        contentType: "use_case",
        rationale:
          'Recommended Customer Case Study because the source describes a specific implementation with a concrete challenge, solution, and outcome.',
      };
    }
  }

  return { isUseCase: false, contentType: "general_article", rationale: "" };
}

function detectRisks(raw: string, length: ContentLength): string[] {
  const risks: string[] = [];
  if (length === "short") {
    risks.push("Source content is short — extracted page 2 narrative may feel sparse.");
  }
  if (length === "long" && raw.length > 30_000) {
    risks.push("Source content is very long — extraction may over-compress key details.");
  }
  if (!/\b(goal|objective|aim|target)/i.test(raw)) {
    risks.push("No explicit goals detected — the Goals card may rely on inference.");
  }
  if (!/\b(result|outcome|impact|benefit)/i.test(raw)) {
    risks.push("No explicit results detected — the Results card may rely on inference.");
  }
  return risks;
}

// Run before extraction. Pure-function over the raw paste; no I/O, no LLM.
// Acceptable for Phase 2 MVP — Intake can graduate to a single cheap LLM
// call later if heuristics prove insufficient for content-type detection.
export function runIntake(rawContent: string): IntakeAssessment {
  const contentLength = bucketLength(rawContent);
  const detectedContentType = detectContentTypeHeuristic(rawContent);
  const templateRecommendation = recommendTemplate(detectedContentType, rawContent);

  return {
    contentLength,
    detectedContentType,
    confidence: 0.6, // heuristic; raised if/when an LLM call backs this
    needsExpansion: contentLength === "short",
    needsCompression: contentLength === "long",
    missingFields: [],
    recommendedTemplate: templateRecommendation.templateId,
    templateRecommendation,
    risks: detectRisks(rawContent, contentLength),
  };
}

// Re-runnable from an extracted UseCase, in case downstream stages want to
// re-assess length signals against the structured shape rather than the raw
// paste. Not used in Phase 2; reserved for future repair-loop heuristics.
export function reassessFromUseCase(content: UseCase): Pick<IntakeAssessment, "missingFields"> {
  return { missingFields: content.missingFields };
}
