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
5. Extract four summary lists from the source: goals, challenges, solutions, results — short, concise business-language bullets (counts/length caps below). For case-study / success-story / use-case / project-summary / marketing-brief content (the Customer Case Study family), produce EXACTLY 4 bullets in each of the four lists. For all other content types, return only as many bullets as the source genuinely supports. If the source has no metrics, keep results qualitative; do not fabricate numbers.
6. Generate narrative sections for page 2 of the PDF (up to 3 sections, each with a heading and a tight 1–2 paragraph body — see length caps below).
7. Generate a simple Mermaid diagram representing the use case workflow, architecture, decision process, data flow, or impact pathway. Follow the Mermaid rules below.
8. Populate \`missingFields\` with the exact schema field names for any information absent or unsupported by the source (e.g. "solutionName", "callToAction").
9. Populate \`expansionNotes\` with short notes describing where you expanded or inferred (e.g. "Added industry context for predictive maintenance."). If no expansion happened, return an empty array.
10. Classify \`contentType\` by **document intent**, not by keyword matching. Evaluate in this order:

    a) **Article family** (default for conceptual, explanatory, analytical, educational, or thought-leadership content — discusses a concept/trend/framework, compares approaches, argues a point, or educates the reader): \`article\`, \`general_article\`, \`thought_leadership\`, \`newsletter\`.

    b) **Memo family** (decision-oriented or internal-business: recommendations, next steps, risks, background, leadership updates, action items): \`executive_memo\`, \`memo\`, \`decision_brief\`, \`meeting_summary\`.

    c) **Case-study family** — choose ONLY when the source describes a concrete project/customer/operator implementation with all of: a named or clearly-identified customer/client/operator/facility, a specific challenge, an implemented solution, and a measurable or named outcome: \`use_case\`, \`success_story\`, \`case_study\`, \`project_summary\`, \`marketing_brief\`.

    An explicit "Success Story", "Customer Success Story", or "Case Study" title/heading is by itself sufficient to classify into the case-study family, even without a named customer or a quantified metric.

    Words like "solution", "benefits", "results", "operations", "AI", "workflow", "framework", "system", "use case", or "use cases" do NOT by themselves make content a case study. Conceptual writing routinely uses these terms.

    Concrete example — this title and content style:
      "Why Context Graphs Matter More Than Rules for Autonomous AI Agents"
    is **thought_leadership** (article family), because it explains a conceptual framework about AI agents. It is NOT a case study, even if it mentions solutions, benefits, autonomous operations, or improvements in passing.

    If uncertain between case-study and article, **prefer \`general_article\`** and add "contentType_uncertain" to \`missingFields\`. (This field is used internally only; it is not rendered in the PDF.)

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

Inline Visual rules (Article family only — article, general_article, thought_leadership, newsletter):

- The \`inlineVisuals\` array is for article-body figures and diagrams. Image references that appeared in the source (Markdown \`![alt](url)\` syntax, HTML \`<img>\` tags, and \`[Image: ...]\` / \`[Figure: ...]\` / \`[Insert image: ...]\` placeholders) are extracted BEFORE you see the text — do NOT try to recover or recreate them.
- You may emit ONLY entries with \`kind: "image_slot"\`, \`sourceType: "missing"\`, and \`status: "recommended"\`. Never emit \`kind: "image"\`. Never set \`src\` or \`dataUrl\`.
- Emit a recommended slot only when the article text strongly implies a figure or diagram that the author clearly expected the reader to see. Trigger phrases include "the architecture consists of", "the workflow moves from X to Y to Z", "three layers", "the diagram below shows", "the process can be divided into", "the framework has N major components". Generic mentions of "process" or "system" alone do NOT justify a recommended slot.
- Each recommended slot must have a concrete, descriptive \`caption\` (≤80 characters) and a \`sectionIndex\` (0-based integer) matching the order of \`narrativeSections\` you return. The \`altText\` should mirror the caption.
- Default \`placement\` to "after_section". Set \`id\` to any short unique string ("slot-1", "slot-2", …).
- Cap the array at 3 recommendations. If the article does not clearly call for a figure, return [].
- For Memo family and Case-study family content types, ALWAYS return \`inlineVisuals: []\`. Inline visuals are an Article Report feature only.

Mermaid diagram rules:

- Use only \`flowchart LR\` or \`flowchart TD\` on the first line. No other diagram types.
- Between 5 and 8 nodes.
- Use short single-word or short-phrase node labels.
- Do NOT use quotes, backticks, HTML, or special characters inside labels.
- Do NOT emit a \`click\` directive or any other Mermaid interaction binding.
- Prefer a Problem → Solution → Impact shape when the source is vague.
- If you cannot confidently produce a diagram from the source, set \`mermaidDiagram\` to null.
- The diagram title should be one of: "Solution Flow", "Operational Impact Pathway", or "Use Case Architecture" — pick whichever best matches the diagram you generated.

Length guidance (PDF layout is sensitive to overruns — keep within these caps):

- title: prefer ≤85 characters, hard max 120. Should fit on at most two lines in the PDF.
- subtitle: a single short phrase, prefer ≤110 characters, or null.
- solutionName: ≤45 characters. industry: ≤30 characters. useCaseFocus: ≤45 characters. Shorten rather than letting metadata wrap.
- goals / challenges / solutions / results: for the Customer Case Study family, EXACTLY 4 bullets per list. For all other content types, at most 4 bullets per list.
- Each summary bullet: one clear, COMPLETE idea expressed as a self-contained sentence — never a fragment cut off mid-thought. Target ~10–20 words, hard max 120 characters; end on a complete clause with a terminal period. Do not repeat a point across bullets in the same list. Use plain business language.
- Each bullet must stand on its own out of context. Do NOT open a bullet with a transition, conjunction, or demonstrative that refers back to prose (e.g. "Unfortunately", "However", "Because", "During", "This", "These", "It", "Also", "Such"). Lead with the subject or action instead.
- For the Customer Case Study family, produce a FULL set of 4 distinct, substantive bullets per section drawn from the source — do not under-deliver and leave the list to be padded. If the source is thin on a section, infer reasonable, claim-free points consistent with the source rather than emitting fewer than 4.
- Bullets must use concise business language. Avoid long compound sentences, dependent clauses, parentheticals, or lists-inside-bullets.
- For Results, qualitative outcomes are acceptable when the source provides no quantitative metrics — never fabricate numbers, percentages, or named figures.
- executiveSummary: 2–4 sentences, target 80–110 words, never more than 110.
- narrativeSections: prefer 2–3 sections. Each section's body 70–110 words, never more than 110. Combined body across all sections target 260–360 words. End every section on a complete sentence with a terminal period.
- mermaidDiagram.description: 1–2 short sentences, target ≤40 words, or null if no description is needed.
- pullQuotes: 0–3 items. Quote attribution is null if the source does not name the speaker. Omit entirely if the source contains no quotable testimonial.
- callToAction: a single short sentence if present in the source, else null.
- Never end any text on a transition word (Ultimately, Therefore, However, Moreover, Furthermore, Additionally, Consequently). End on a complete clause with a terminal period.

Bullet style example (use this density):

- Verbose (avoid): "Enabled comprehensive operational visibility across long distances, including control rooms, administrative buildings, and berths."
- Concise (target): "Enabled sitewide operations visibility across control rooms, offices, and berths."

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
        "article",
        "general_article",
        "thought_leadership",
        "newsletter",
        "executive_memo",
        "memo",
        "decision_brief",
        "meeting_summary",
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
    inlineVisuals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["image", "image_slot"] },
          sourceType: {
            type: "string",
            enum: ["uploaded", "pasted", "url", "missing"],
          },
          src: { type: "string" },
          dataUrl: { type: "string" },
          caption: { type: "string" },
          altText: { type: "string" },
          sectionIndex: { type: "integer", minimum: 0 },
          placement: {
            type: "string",
            enum: [
              "after_section_heading",
              "after_first_paragraph",
              "between_paragraphs",
              "after_section",
              "manual",
            ],
          },
          status: {
            type: "string",
            enum: ["ready", "needs_upload", "recommended", "failed"],
          },
        },
        required: ["id", "kind", "sourceType"],
      },
    },
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
    "inlineVisuals",
    "missingFields",
    "expansionNotes",
  ],
} as const;
