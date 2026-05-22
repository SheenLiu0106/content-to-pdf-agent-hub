import type { Content } from "./schema.js";

const REQUIRED_NON_EMPTY: (keyof Content)[] = [
  "title",
  "executiveSummary",
  "keyPoints",
  "mainContentSections",
];

const OPTIONAL_TRACKED: (keyof Content)[] = [
  "authorOrSource",
  "audience",
  "background",
  "recommendations",
  "nextSteps",
  "supportingEvidence",
  "callToAction",
];

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function normalizeContent(content: Content): Content {
  const missing = new Set<string>(content.missingFields ?? []);

  for (const field of [...REQUIRED_NON_EMPTY, ...OPTIONAL_TRACKED]) {
    if (isEmpty(content[field])) {
      missing.add(field);
    }
  }

  return {
    ...content,
    missingFields: Array.from(missing).sort(),
  };
}
