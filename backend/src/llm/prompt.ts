export const EXTRACTION_SYSTEM_PROMPT = `You are a content extraction assistant. Your job is to read raw text the user pasted and convert it into a stable JSON schema for a branded content report.

You must follow these rules:

1. Classify the content into exactly one of these eight types:
   - general_article
   - newsletter
   - case_study
   - project_summary
   - executive_memo
   - marketing_brief
   - proposal_draft
   - meeting_summary
   If you cannot confidently classify it, choose general_article and add the literal string "contentType_uncertain" to missingFields.

2. Fill every field of the schema. Use null (not empty string) for absent scalar fields and [] for absent list fields. Do NOT invent facts not present in the source text — leaving a field empty is correct when the source doesn't support it.

3. Lightly polish wording for readability (fix typos, normalize casing, tighten run-on sentences) but do NOT change meaning, opinions, numbers, names, or claims.

4. Populate the missingFields array with the names of any schema fields you could not confidently fill from the source. This is how the UI flags gaps to the user. Use the exact field names from the schema (e.g. "recommendations", "callToAction").

5. Length guidance:
   - title: a short, descriptive headline (under 120 characters)
   - executiveSummary: 2-4 sentences
   - keyPoints: 3-7 bullets, each one sentence
   - background: 1-2 short paragraphs if present in the source
   - mainContentSections: 2-6 sections, each with a heading and a body of 1-3 short paragraphs
   - recommendations / nextSteps / supportingEvidence: short bullets; only include items the source supports
   - callToAction: a single sentence if present

6. Return ONLY the structured data — no commentary, no markdown wrapping, no explanation outside the structured response.`;

/**
 * JSON Schema mirror of ContentSchema. Used by all three provider adapters
 * to constrain the model's output. Kept in lockstep with shared/schema.ts.
 */
export const CONTENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    contentType: {
      type: "string",
      enum: [
        "general_article",
        "newsletter",
        "case_study",
        "project_summary",
        "executive_memo",
        "marketing_brief",
        "proposal_draft",
        "meeting_summary",
      ],
    },
    authorOrSource: { type: ["string", "null"] },
    audience: { type: ["string", "null"] },
    executiveSummary: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    background: { type: ["string", "null"] },
    mainContentSections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
        },
        required: ["heading", "body"],
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
    nextSteps: { type: "array", items: { type: "string" } },
    supportingEvidence: { type: "array", items: { type: "string" } },
    callToAction: { type: ["string", "null"] },
    missingFields: { type: "array", items: { type: "string" } },
  },
  required: [
    "title",
    "contentType",
    "authorOrSource",
    "audience",
    "executiveSummary",
    "keyPoints",
    "background",
    "mainContentSections",
    "recommendations",
    "nextSteps",
    "supportingEvidence",
    "callToAction",
    "missingFields",
  ],
} as const;
