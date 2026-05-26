import type { UseCase } from "./useCaseSchema.js";

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

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function normalizeUseCase(content: UseCase): UseCase {
  const missing = new Set<string>(content.missingFields ?? []);

  for (const field of [...REQUIRED_NON_EMPTY, ...OPTIONAL_TRACKED]) {
    if (isEmpty(content[field])) {
      missing.add(field);
    }
  }

  return {
    ...content,
    missingFields: Array.from(missing).sort(),
    expansionNotes: content.expansionNotes ?? [],
  };
}
