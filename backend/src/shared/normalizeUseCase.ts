import { randomUUID } from "node:crypto";
import type { InlineVisualBlock, UseCase } from "./useCaseSchema.js";
import { HERO_IMAGE_DATA_URL_RE } from "./useCaseSchema.js";
import { truncateBulletSafe, truncateToSentence } from "./sentenceSafe.js";

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
const BULLET_LIMITS: Record<"goals" | "challenges" | "solutions" | "results", number> = {
  goals: 2,
  challenges: 2,
  solutions: 3,
  results: 3,
};
const BULLET_CHAR_CAP = 95;
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

export function normalizeUseCase(content: UseCase): UseCase {
  const missing = new Set<string>(content.missingFields ?? []);

  for (const field of [...REQUIRED_NON_EMPTY, ...OPTIONAL_TRACKED]) {
    if (isEmpty(content[field])) {
      missing.add(field);
    }
  }

  const cappedSections = (content.narrativeSections ?? [])
    .slice(0, NARRATIVE_MAX_SECTIONS)
    .map((s) => ({ heading: s.heading, body: capNarrativeBody(s.body) }));

  return {
    ...content,
    solutionName: capMeta(content.solutionName, META_CHAR_CAPS.solutionName),
    industry: capMeta(content.industry, META_CHAR_CAPS.industry),
    useCaseFocus: capMeta(content.useCaseFocus, META_CHAR_CAPS.useCaseFocus),
    goals: trimBullets(content.goals, "goals"),
    challenges: trimBullets(content.challenges, "challenges"),
    solutions: trimBullets(content.solutions, "solutions"),
    results: trimBullets(content.results, "results"),
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
