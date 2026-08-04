import { randomUUID } from "node:crypto";
import type { InlineVisualBlock, UseCase } from "./useCaseSchema.js";
import { HERO_IMAGE_DATA_URL_RE } from "./useCaseSchema.js";
import {
  splitSentences,
  truncateBulletSafe,
  truncateToSentence,
} from "./sentenceSafe.js";
import type { TemplateId } from "./templates.js";
import { templateIdForContentType } from "./templates.js";

const REQUIRED_NON_EMPTY: (keyof UseCase)[] = [
  "title",
  "executiveSummary",
  "goals",
  "challenges",
  "solutions",
  "results",
  "narrativeSections",
];

const OPTIONAL_TRACKED: (keyof UseCase)[] = [
  "subtitle",
  "solutionName",
  "industry",
  "useCaseFocus",
  "pullQuotes",
  "callToAction",
];

// Layout-safe caps. Enforced after LLM extraction so the PDF renderer never
// has to absorb a verbose payload — even if the prompt's length guidance is
// ignored. Tuned to the cover/narrative layout in templates/usecase.
//
// These uneven caps are the LEGACY policy, used for the Article Report and
// Executive Memo templates (which reuse these arrays for Key Takeaways /
// Key Points / Risks / Next Steps). The Customer Case Study template uses a
// different policy — exactly 4 bullets per section — see normalizeCaseStudy-
// Summary below. Keeping the legacy caps untouched is what guarantees the
// other two templates render identically to before.
const BULLET_LIMITS: Record<SummaryKey, number> = {
  goals: 2,
  challenges: 2,
  solutions: 3,
  results: 3,
};
const BULLET_CHAR_CAP = 95;

type SummaryKey = "goals" | "challenges" | "solutions" | "results";
const SUMMARY_KEYS: SummaryKey[] = ["goals", "challenges", "solutions", "results"];

// Customer Case Study summary policy: every section renders EXACTLY this many
// bullets so the page-1 grid is symmetric and predictable.
export const CASE_STUDY_BULLET_COUNT = 4;
// Layout-safe per-bullet char cap for the case study cover grid. Lower than
// the legacy 95 because the cover now carries 16 bullets in a 2×2 grid and
// each must stay short (≈8–16 words) to fit page 1 without spilling. Prefer
// semantic clause-trimming over a blunt cut (see compressCaseStudyBullet).
export const CASE_STUDY_BULLET_CHAR_CAP = 90;
// Lower bound the repair loop tightens to if (and only if) a page-1 overflow
// risk is ever detected. Stays readable at the dense-summary 9pt bullet size.
export const CASE_STUDY_BULLET_TIGHT_CHAR_CAP = 72;
// A derived/source-mined candidate bullet must carry at least this many words
// to be worth promoting — drops sentence fragments and stray headings.
const MIN_DERIVED_BULLET_WORDS = 4;

// Conservative, claim-free fallbacks used ONLY when a section has fewer than
// four bullets and the source/narrative yields no more usable material. They
// state no metrics, customer names, or unsupported specifics — just neutral,
// section-appropriate framing — so a sparse source still renders four
// readable bullets without fabrication.
const CASE_STUDY_FALLBACK_BULLETS: Record<SummaryKey, string[]> = {
  goals: [
    "Clarify the primary objective described in the source.",
    "Align the initiative with stated business priorities.",
    "Define what a successful outcome should look like.",
    "Establish a basis for measuring future progress.",
  ],
  challenges: [
    "Address the key constraints noted in the source.",
    "Reduce manual effort across the current process.",
    "Manage complexity in the existing workflow.",
    "Preserve quality while scaling the approach.",
  ],
  solutions: [
    "Apply the described approach to the core problem.",
    "Introduce a structured, repeatable workflow.",
    "Build on existing tools and available context.",
    "Create a foundation for future improvement.",
  ],
  results: [
    "Improved clarity over the previous approach.",
    "Established a more repeatable, scalable process.",
    "Reduced manual effort in routine work.",
    "Created a foundation for continued progress.",
  ],
};
const META_CHAR_CAPS = { solutionName: 45, useCaseFocus: 45, industry: 30 } as const;
const NARRATIVE_MAX_SECTIONS = 3;
const INLINE_VISUAL_MAX_COUNT = 6;
const INLINE_VISUAL_CAPTION_CAP = 120;
// MVP renderer only honors these two; other enum values fall back to
// after_section. Schema still accepts all values so future renderer work
// doesn't have to migrate persisted data.
const INLINE_VISUAL_RENDERER_PLACEMENTS = new Set([
  "after_first_paragraph",
  "after_section",
]);
// Word-based caps. Narrative target is 70–110 words/section; cap allows a
// small overshoot buffer so sentence-safe truncation can keep the final
// complete sentence rather than cutting it.
const NARRATIVE_BODY_WORD_CAP = 120;
const EXECUTIVE_SUMMARY_WORD_CAP = 120;
const VISUAL_DESC_WORD_CAP = 45;

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function shortenBullet(value: string): string {
  return truncateBulletSafe(value, BULLET_CHAR_CAP);
}

function capMeta(value: string | null, cap: number): string | null {
  if (!value) return value;
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (collapsed.length <= cap) return collapsed;
  const cut = collapsed.slice(0, cap);
  return cut.replace(/\s+\S*$/, "").trim() || cut.trim();
}

function capNarrativeBody(body: string): string {
  return truncateToSentence(body, { maxWords: NARRATIVE_BODY_WORD_CAP });
}

function capExecutiveSummary(text: string): string {
  return truncateToSentence(text, { maxWords: EXECUTIVE_SUMMARY_WORD_CAP });
}

function capVisualDescription(text: string | null): string | null {
  if (!text) return text;
  return truncateToSentence(text, { maxWords: VISUAL_DESC_WORD_CAP });
}

function trimBullets(
  items: string[] | null | undefined,
  key: keyof typeof BULLET_LIMITS
): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, BULLET_LIMITS[key])
    .map(shortenBullet)
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Customer Case Study summary normalization — exactly 4 bullets per section.
// ---------------------------------------------------------------------------

// Semantic-first bullet compression. If a bullet exceeds the cap we first try
// to drop a trailing dependent clause at a separator (comma/semicolon/dash);
// only if no clean clause boundary exists do we fall back to the word-safe
// char cut. Never cuts a word in half.
function compressCaseStudyBullet(
  value: string,
  cap: number = CASE_STUDY_BULLET_CHAR_CAP
): string {
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (collapsed.length <= cap) return collapsed;

  const window = collapsed.slice(0, cap);
  const sep = Math.max(
    window.lastIndexOf(", "),
    window.lastIndexOf("; "),
    window.lastIndexOf(" — "),
    window.lastIndexOf(" – "),
    window.lastIndexOf(" - ")
  );
  if (sep >= 40) {
    const clause = window.slice(0, sep).replace(/[,;:–—-]\s*$/, "").trim();
    if (clause.length >= 24) return clause;
  }
  return truncateBulletSafe(collapsed, cap);
}

// Layout-tightening repair: re-compress an already-normalized case-study
// summary to a smaller per-bullet cap, without changing bullet counts. Used by
// the repair loop only if a page-1 overflow risk is ever detected (the 90-char
// cap + dense CSS make that path effectively unreachable in normal flows, but
// it provides a real semantic-compression fallback as the spec requires).
export function tightenCaseStudyBullets(
  content: UseCase,
  maxChars: number
): UseCase {
  const tighten = (arr: string[]): string[] =>
    (arr ?? []).map((b) => compressCaseStudyBullet(b, maxChars));
  return {
    ...content,
    goals: tighten(content.goals),
    challenges: tighten(content.challenges),
    solutions: tighten(content.solutions),
    results: tighten(content.results),
  };
}

// Normalize a bullet to a stable comparison key so we can detect near-duplicate
// bullets (same idea, different punctuation/casing) and avoid repeating points.
function bulletKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isDuplicateBullet(candidate: string, taken: Set<string>): boolean {
  const key = bulletKey(candidate);
  if (!key) return true;
  if (taken.has(key)) return true;
  const candTokens = new Set(key.split(" ").filter(Boolean));
  if (candTokens.size === 0) return true;
  for (const existing of taken) {
    if (existing.includes(key) || key.includes(existing)) return true;
    const exTokens = existing.split(" ").filter(Boolean);
    if (exTokens.length === 0) continue;
    const overlap = exTokens.filter((t) => candTokens.has(t)).length;
    const ratio = overlap / Math.max(candTokens.size, exTokens.length);
    if (ratio >= 0.7) return true;
  }
  return false;
}

// Mine concise candidate bullets from already-present material (narrative
// bodies, then the executive summary). Used to top up a sparse section to four
// without inventing facts — every candidate is a sentence the source/extraction
// already produced, compressed to bullet length.
function deriveCandidateBullets(content: UseCase): string[] {
  const sources: string[] = [
    ...(content.narrativeSections ?? []).map((s) => s.body ?? ""),
    content.executiveSummary ?? "",
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const text of sources) {
    for (const sentence of splitSentences(text)) {
      const bullet = compressCaseStudyBullet(sentence);
      if (bullet.split(/\s+/).filter(Boolean).length < MIN_DERIVED_BULLET_WORDS) {
        continue;
      }
      const key = bulletKey(bullet);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(bullet);
    }
  }
  return out;
}

// Reduce a section to exactly CASE_STUDY_BULLET_COUNT bullets.
//  - More than four: keep the first four distinct points (the model emits in
//    rough priority order); near-duplicates within the section are merged out.
//  - Fewer than four: top up from derived candidates, then from conservative
//    section fallbacks.
//
// Dedup scope is deliberately split. REAL source bullets are deduped only
// against this section — a Goal and a Result may legitimately mirror each
// other ("Preserve engineering context" → "Preserved engineering context"),
// and stripping that would defeat the four-per-section contract. DERIVED and
// FALLBACK filler is additionally deduped against `usedFiller` (shared across
// the four sections) so top-up material is never repeated cover-wide.
function toExactlyFour(
  rawItems: string[] | null | undefined,
  key: SummaryKey,
  candidates: string[],
  usedFiller: Set<string>
): string[] {
  const result: string[] = [];
  const localKeys = new Set<string>();

  const pushReal = (value: string): void => {
    if (result.length >= CASE_STUDY_BULLET_COUNT) return;
    const bullet = compressCaseStudyBullet(value);
    if (bullet.length === 0) return;
    if (isDuplicateBullet(bullet, localKeys)) return;
    result.push(bullet);
    localKeys.add(bulletKey(bullet));
  };

  const pushFiller = (value: string): void => {
    if (result.length >= CASE_STUDY_BULLET_COUNT) return;
    const bullet = compressCaseStudyBullet(value);
    if (bullet.length === 0) return;
    if (isDuplicateBullet(bullet, localKeys)) return;
    if (isDuplicateBullet(bullet, usedFiller)) return;
    const k = bulletKey(bullet);
    result.push(bullet);
    localKeys.add(k);
    usedFiller.add(k);
  };

  for (const item of Array.isArray(rawItems) ? rawItems : []) {
    pushReal(item);
  }
  for (const cand of candidates) pushFiller(cand);
  for (const fb of CASE_STUDY_FALLBACK_BULLETS[key]) pushFiller(fb);

  // Absolute backstop — unreachable in practice since the fallback set holds
  // four distinct phrases, but guarantees the length contract regardless of
  // what filler was already taken cover-wide.
  const fallback = CASE_STUDY_FALLBACK_BULLETS[key];
  let i = 0;
  while (result.length < CASE_STUDY_BULLET_COUNT) {
    result.push(fallback[i % fallback.length]!);
    i++;
  }

  return result.slice(0, CASE_STUDY_BULLET_COUNT);
}

// Legacy (Article Report / Executive Memo) summary policy applied on its own.
// Used at render time to re-assert the uneven caps when content that was
// extracted for one template is rendered under another — so switching a
// case-study draft to Article/Memo can never inflate their bullet counts.
export function trimSummaryToLegacyCaps(content: UseCase): UseCase {
  return {
    ...content,
    goals: trimBullets(content.goals, "goals"),
    challenges: trimBullets(content.challenges, "challenges"),
    solutions: trimBullets(content.solutions, "solutions"),
    results: trimBullets(content.results, "results"),
  };
}

// Public entry point for the exactly-4 policy. Applied for the Customer Case
// Study template only (see normalizeUseCase + the render-time enforcement in
// the agent). Idempotent: content already at four clean bullets per section
// passes through unchanged.
export function normalizeCaseStudySummary(content: UseCase): UseCase {
  const candidates = deriveCandidateBullets(content);
  const usedFiller = new Set<string>();
  const next: Partial<Record<SummaryKey, string[]>> = {};
  for (const key of SUMMARY_KEYS) {
    next[key] = toExactlyFour(content[key], key, candidates, usedFiller);
  }
  return {
    ...content,
    goals: next.goals!,
    challenges: next.challenges!,
    solutions: next.solutions!,
    results: next.results!,
  };
}

// ---------------------------------------------------------------------------
// Pre-render validation (Mode B / BUG-001).
//
// The render pipeline must NOT silently mutate user-confirmed content. Instead
// of re-normalizing at render time (which dropped surplus user bullets,
// injected fabricated filler, and truncated text behind the user's back), the
// render agent now validates the draft against the active template's content
// contract BEFORE rendering and blocks with a clear, user-facing message when
// it doesn't conform. A draft that passes validation is rendered exactly as the
// user confirmed it. See backend/src/agents/contentToPdfAgent/agent.ts.
// ---------------------------------------------------------------------------

// Small tolerance over the layout-safe per-bullet cap. Mirrors the quality
// review's overflow trigger (cap + 8) so validation and the renderer agree on
// what "too long to fit page 1" means — we don't block borderline bullets the
// layout already tolerates, and we never silently truncate the rest.
const BULLET_CAP_TOLERANCE = 8;

const SUMMARY_SECTION_LABELS: Record<SummaryKey, string> = {
  goals: "Goals",
  challenges: "Challenges",
  solutions: "Solutions",
  results: "Results",
};

// Thrown by validateRenderContent's caller when a draft violates the selected
// template's content contract. The route maps it to a 422 so the frontend can
// surface the violations before any PDF is produced.
export class RenderValidationError extends Error {
  readonly violations: string[];
  constructor(violations: string[]) {
    super(
      `Draft does not satisfy the selected template's content contract: ${violations.join(" ")}`
    );
    this.name = "RenderValidationError";
    this.violations = violations;
  }
}

function nonEmptyBullets(items: unknown): string[] {
  return (Array.isArray(items) ? (items as string[]) : []).filter(
    (s) => typeof s === "string" && s.trim().length > 0
  );
}

// Validate a UseCase against the bullet contract for the template it will be
// rendered with. Returns human-readable violations (empty array = valid).
//
//  - Customer Case Study (usecase): EXACTLY four non-empty bullets per section.
//  - Article Report / Executive Memo (legacy): AT MOST the per-section cap.
//
// In both cases every bullet must fit the layout-safe length so the renderer
// never has to truncate silently. This replaces the old render-time
// re-normalization: rather than rewriting the user's content to fit, we tell
// the user exactly what to fix and render their content unchanged once it
// conforms.
export function validateRenderContent(
  content: UseCase,
  opts: { templateId: TemplateId }
): string[] {
  return validateRenderContentStructured(content, opts).map((v) => v.message);
}

// What kind of contract violation this is. Stable identifiers — the durable run
// store uses (kind, section) as an issue's structural coordinate, so it can tell
// "this same finding again" from "a different finding in the same place" without
// parsing the human-readable message.
export type RenderViolationKind =
  | "empty_bullet"
  | "bullet_count_exact"
  | "bullet_count_max"
  | "bullet_too_long";

export interface RenderViolation {
  section: SummaryKey;
  kind: RenderViolationKind;
  message: string;
  /** Observed value, so a changed finding at the same coordinate is detectable. */
  observed: number;
}

// Structured form of the same single contract check. validateRenderContent is a
// thin projection of this, so there is exactly one implementation of the rules
// and the string output is unchanged for existing callers.
export function validateRenderContentStructured(
  content: UseCase,
  opts: { templateId: TemplateId }
): RenderViolation[] {
  const violations: RenderViolation[] = [];
  const isCaseStudy = opts.templateId === "usecase";
  const charCap =
    (isCaseStudy ? CASE_STUDY_BULLET_CHAR_CAP : BULLET_CHAR_CAP) +
    BULLET_CAP_TOLERANCE;

  for (const key of SUMMARY_KEYS) {
    const label = SUMMARY_SECTION_LABELS[key];
    const all = Array.isArray(content[key]) ? (content[key] as string[]) : [];
    const filled = nonEmptyBullets(all);

    if (filled.length !== all.length) {
      violations.push({
        section: key,
        kind: "empty_bullet",
        message: `${label} contains an empty bullet — remove it or add text.`,
        observed: all.length - filled.length,
      });
    }

    if (isCaseStudy) {
      if (filled.length !== CASE_STUDY_BULLET_COUNT) {
        violations.push({
          section: key,
          kind: "bullet_count_exact",
          message: `${label} needs exactly ${CASE_STUDY_BULLET_COUNT} bullets (currently ${filled.length}).`,
          observed: filled.length,
        });
      }
    } else {
      const cap = BULLET_LIMITS[key];
      if (filled.length > cap) {
        violations.push({
          section: key,
          kind: "bullet_count_max",
          message: `${label} allows at most ${cap} bullet${cap === 1 ? "" : "s"} for this template (currently ${filled.length}).`,
          observed: filled.length,
        });
      }
    }

    const tooLong = filled.filter((b) => b.trim().length > charCap).length;
    if (tooLong > 0) {
      violations.push({
        section: key,
        kind: "bullet_too_long",
        message: `${label} has ${tooLong} bullet${tooLong === 1 ? "" : "s"} over ${charCap} characters — shorten ${tooLong === 1 ? "it" : "them"}.`,
        observed: tooLong,
      });
    }
  }

  return violations;
}

function capCaption(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (collapsed.length === 0) return undefined;
  if (collapsed.length <= INLINE_VISUAL_CAPTION_CAP) return collapsed;
  const cut = collapsed.slice(0, INLINE_VISUAL_CAPTION_CAP);
  return cut.replace(/\s+\S*$/, "").trim() || cut.trim();
}

function normalizeInlineVisuals(
  visuals: InlineVisualBlock[] | null | undefined,
  narrativeSectionCount: number
): InlineVisualBlock[] {
  // Preserve inline visuals regardless of the LLM's contentType. The
  // selected template gates rendering downstream in runRenderAgent, so the
  // user can paste images, change their mind about the template, and still
  // see them in Article Report.
  if (!Array.isArray(visuals) || visuals.length === 0) return [];

  const lastSection = Math.max(0, narrativeSectionCount - 1);
  const out: InlineVisualBlock[] = [];

  for (const v of visuals.slice(0, INLINE_VISUAL_MAX_COUNT)) {
    const caption = capCaption(v.caption);
    const altText = capCaption(v.altText) ?? caption;
    let status = v.status;
    let dataUrl = v.dataUrl;

    if (dataUrl && !HERO_IMAGE_DATA_URL_RE.test(dataUrl)) {
      dataUrl = undefined;
      status = "failed";
    }

    const placement = INLINE_VISUAL_RENDERER_PLACEMENTS.has(v.placement)
      ? v.placement
      : "after_section";

    const rawIndex =
      typeof v.sectionIndex === "number" && Number.isFinite(v.sectionIndex)
        ? Math.max(0, Math.floor(v.sectionIndex))
        : lastSection;
    const sectionIndex = Math.min(rawIndex, lastSection);

    out.push({
      ...v,
      id: v.id && v.id.length > 0 ? v.id : randomUUID(),
      caption,
      altText,
      dataUrl,
      placement,
      sectionIndex,
      status,
    });
  }

  return out;
}

export function normalizeUseCase(
  content: UseCase,
  opts?: { templateId?: TemplateId }
): UseCase {
  const missing = new Set<string>(content.missingFields ?? []);

  for (const field of [...REQUIRED_NON_EMPTY, ...OPTIONAL_TRACKED]) {
    if (isEmpty(content[field])) {
      missing.add(field);
    }
  }

  const cappedSections = (content.narrativeSections ?? [])
    .slice(0, NARRATIVE_MAX_SECTIONS)
    .map((s) => ({ heading: s.heading, body: capNarrativeBody(s.body) }));

  // Bullet policy is template-scoped. The Customer Case Study template gets
  // exactly four bullets per section; every other template keeps the legacy
  // uneven caps so Article Report / Executive Memo render unchanged. The
  // effective template is the caller-supplied id when known, otherwise the
  // deterministic map from the content type the LLM assigned.
  const effectiveTemplate =
    opts?.templateId ?? templateIdForContentType(content.contentType);
  const caseStudySummary = effectiveTemplate === "usecase";

  const summary = caseStudySummary
    ? normalizeCaseStudySummary({ ...content, narrativeSections: cappedSections })
    : {
        goals: trimBullets(content.goals, "goals"),
        challenges: trimBullets(content.challenges, "challenges"),
        solutions: trimBullets(content.solutions, "solutions"),
        results: trimBullets(content.results, "results"),
      };

  return {
    ...content,
    solutionName: capMeta(content.solutionName, META_CHAR_CAPS.solutionName),
    industry: capMeta(content.industry, META_CHAR_CAPS.industry),
    useCaseFocus: capMeta(content.useCaseFocus, META_CHAR_CAPS.useCaseFocus),
    goals: summary.goals,
    challenges: summary.challenges,
    solutions: summary.solutions,
    results: summary.results,
    executiveSummary: capExecutiveSummary(content.executiveSummary),
    narrativeSections: cappedSections,
    mermaidDiagram: content.mermaidDiagram
      ? {
          ...content.mermaidDiagram,
          description: capVisualDescription(content.mermaidDiagram.description),
        }
      : content.mermaidDiagram,
    inlineVisuals: normalizeInlineVisuals(
      content.inlineVisuals,
      cappedSections.length
    ),
    missingFields: Array.from(missing).sort(),
    expansionNotes: content.expansionNotes ?? [],
  };
}
