export type ExpansionMode = "strict" | "standard";

export function buildExtractionSystemPrompt(mode: ExpansionMode): string {
  const expansionRules =
    mode === "standard"
      ? `Expansion (mode: standard):
   - You may add general industry context to help the reader.
   - You may add transitions and explanatory language so paragraphs flow.
   - You may convert rough notes into polished business language.
   - You may NOT invent specific facts the source does not contain.`
      : `Expansion (mode: strict):
   - Do NOT expand the source. Restate only what is present.
   - Polish grammar and tone, but add no new content of any kind.`;

  return `You are a professional use case editor and structured extraction assistant. Your job is to transform raw pasted content into a structured use case PDF model.

You must:

1. Preserve every factual claim from the source.
2. Improve clarity, grammar, and business tone.
3. Expand short content only when expansion is grounded in the source or general industry context (see the expansion rules below).
4. Never invent customer names, metrics, percentages, financial impact, quotes, attribution, deployment scale, dates, or unsupported technical claims. Do NOT infer or invent a client name or client website — those fields no longer exist in the schema.
5. Extract four summary lists from the source: goals, challenges, solutions, results — ideally 2 to 5 short bullets each. If the source has no metrics, keep results qualitative; do not fabricate numbers.
6. Generate detailed narrative sections suitable for pages 2 and 3 of the PDF (2 to 6 sections, each with a heading and a 1–3 paragraph body).
7. Generate a simple Mermaid diagram representing the use case workflow, architecture, decision process, data flow, or impact pathway. Follow the Mermaid rules below.
8. Populate \`missingFields\` with the exact schema field names for any information absent or unsupported by the source (e.g. "solutionName", "callToAction").
9. Populate \`expansionNotes\` with short notes describing where you expanded or inferred (e.g. "Added industry context for predictive maintenance."). If no expansion happened, return an empty array.
10. Classify \`contentType\` as one of: use_case, success_story, case_study, project_summary, marketing_brief, executive_memo, general_article. If you cannot classify confidently, choose \`use_case\` and add "contentType_uncertain" to \`missingFields\`. (This field is used internally only; it is not rendered in the PDF.)

Use case context extraction:

- \`solutionName\`: the solution, technology, product, workflow, or method described in the source (e.g. "AI-Powered PI Tag Mapping"). Null if not identifiable.
- \`industry\`: the operational or business domain (e.g. "Power Generation"). Null if not identifiable.
- \`useCaseFocus\`: the specific problem or objective the use case targets (e.g. "Consumption Forecasting / Asset Optimization"). Null if not identifiable.

${expansionRules}

Schema rules:

- Use null for absent scalar fields (subtitle, solutionName, industry, useCaseFocus, callToAction, mermaidDiagram, pullQuote.attribution, mermaidDiagram.description).
- Use [] for absent arrays.
- Never use undefined.
- Do NOT fabricate pullQuotes. If the source contains no quotable testimonial, return [].

Mermaid diagram rules:

- Use only \`flowchart LR\` or \`flowchart TD\` on the first line. No other diagram types.
- Between 5 and 8 nodes.
- Use short single-word or short-phrase node labels.
- Do NOT use quotes, backticks, HTML, or special characters inside labels.
- Do NOT emit a \`click\` directive or any other Mermaid interaction binding.
- Prefer a Problem → Solution → Impact shape when the source is vague.
- If you cannot confidently produce a diagram from the source, set \`mermaidDiagram\` to null.
- The diagram title should be one of: "Solution Flow", "Operational Impact Pathway", or "Use Case Architecture" — pick whichever best matches the diagram you generated.

Length guidance:

- title: short, descriptive (<120 characters).
- subtitle: a single short phrase, or null.
- executiveSummary: 2–4 sentences in business tone.
- goals / challenges / solutions / results: 2–5 short bullets each.
- narrativeSections: 2–6 sections, heading + 1–3 paragraph body each.
- pullQuotes: 0–3 items. Quote attribution is null if the source does not name the speaker.
- callToAction: a single sentence if present in the source, else null.

Return ONLY the structured data — no commentary, no markdown wrapping, no explanation outside the structured response.`;
}

/**
 * JSON Schema mirror of UseCaseSchema. Used by all three provider adapters
 * to constrain the model's output. Kept in lockstep with shared/useCaseSchema.ts.
 */
export const USE_CASE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    subtitle: { type: ["string", "null"] },
    contentType: {
      type: "string",
      enum: [
        "use_case",
        "success_story",
        "case_study",
        "project_summary",
        "marketing_brief",
        "executive_memo",
        "general_article",
      ],
    },
    solutionName: { type: ["string", "null"] },
    industry: { type: ["string", "null"] },
    useCaseFocus: { type: ["string", "null"] },
    goals: { type: "array", items: { type: "string" } },
    challenges: { type: "array", items: { type: "string" } },
    solutions: { type: "array", items: { type: "string" } },
    results: { type: "array", items: { type: "string" } },
    executiveSummary: { type: "string" },
    narrativeSections: {
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
    pullQuotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          quote: { type: "string" },
          attribution: { type: ["string", "null"] },
        },
        required: ["quote", "attribution"],
      },
    },
    mermaidDiagram: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            code: { type: "string" },
            description: { type: ["string", "null"] },
          },
          required: ["title", "code", "description"],
        },
      ],
    },
    callToAction: { type: ["string", "null"] },
    missingFields: { type: "array", items: { type: "string" } },
    expansionNotes: { type: "array", items: { type: "string" } },
  },
  required: [
    "title",
    "subtitle",
    "contentType",
    "solutionName",
    "industry",
    "useCaseFocus",
    "goals",
    "challenges",
    "solutions",
    "results",
    "executiveSummary",
    "narrativeSections",
    "pullQuotes",
    "mermaidDiagram",
    "callToAction",
    "missingFields",
    "expansionNotes",
  ],
} as const;
