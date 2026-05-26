import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { UseCaseSchema, type UseCase } from "../shared/useCaseSchema.js";
import { buildExtractionSystemPrompt } from "./prompt.js";
import { LLMProviderError, type LLMProvider } from "./provider.js";

/**
 * Gemini doesn't accept JSON Schema's `["string", "null"]` union form, so we
 * mirror the use case schema using its own Schema type and mark nullable
 * scalars with { type: STRING, nullable: true }.
 */
const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    subtitle: { type: "STRING", nullable: true },
    contentType: {
      type: "STRING",
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
    solutionName: { type: "STRING", nullable: true },
    industry: { type: "STRING", nullable: true },
    useCaseFocus: { type: "STRING", nullable: true },
    goals: { type: "ARRAY", items: { type: "STRING" } },
    challenges: { type: "ARRAY", items: { type: "STRING" } },
    solutions: { type: "ARRAY", items: { type: "STRING" } },
    results: { type: "ARRAY", items: { type: "STRING" } },
    executiveSummary: { type: "STRING" },
    narrativeSections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          heading: { type: "STRING" },
          body: { type: "STRING" },
        },
        required: ["heading", "body"],
      },
    },
    pullQuotes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          quote: { type: "STRING" },
          attribution: { type: "STRING", nullable: true },
        },
        required: ["quote"],
      },
    },
    mermaidDiagram: {
      type: "OBJECT",
      nullable: true,
      properties: {
        title: { type: "STRING" },
        code: { type: "STRING" },
        description: { type: "STRING", nullable: true },
      },
      required: ["title", "code"],
    },
    callToAction: { type: "STRING", nullable: true },
    missingFields: { type: "ARRAY", items: { type: "STRING" } },
    expansionNotes: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: [
    "title",
    "contentType",
    "executiveSummary",
    "goals",
    "challenges",
    "solutions",
    "results",
    "narrativeSections",
    "pullQuotes",
    "missingFields",
    "expansionNotes",
  ],
};

const NULLABLE_SCALAR_KEYS = [
  "subtitle",
  "solutionName",
  "industry",
  "useCaseFocus",
  "callToAction",
  "mermaidDiagram",
] as const;

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini" as const;
  private client: GoogleGenAI;
  private systemPrompt: string;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: config.GOOGLE_API_KEY! });
    this.systemPrompt = buildExtractionSystemPrompt(config.EXPANSION_MODE);
  }

  async extract(rawContent: string): Promise<UseCase> {
    let response;
    try {
      response = await this.client.models.generateContent({
        model: config.GOOGLE_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Extract the structured use case from the text below.\n\n<raw_content>\n${rawContent}\n</raw_content>`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: this.systemPrompt,
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA as any,
        },
      });
    } catch (err) {
      throw new LLMProviderError("gemini", "api_error", `Gemini API call failed: ${(err as Error).message}`, { cause: err });
    }

    const text = response.text;
    if (!text) {
      throw new LLMProviderError("gemini", "invalid_output", "Gemini returned an empty response");
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new LLMProviderError("gemini", "invalid_output", "Gemini returned non-JSON content", { cause: err });
    }

    if (typeof json === "object" && json !== null) {
      const obj = json as Record<string, unknown>;
      for (const k of NULLABLE_SCALAR_KEYS) {
        if (!(k in obj)) obj[k] = null;
      }
      if (Array.isArray(obj.pullQuotes)) {
        obj.pullQuotes = (obj.pullQuotes as any[]).map((q) => ({
          quote: q?.quote ?? "",
          attribution: q?.attribution ?? null,
        }));
      }
      if (obj.mermaidDiagram && typeof obj.mermaidDiagram === "object") {
        const m = obj.mermaidDiagram as Record<string, unknown>;
        if (!("description" in m)) m.description = null;
      }
    }

    const parsed = UseCaseSchema.safeParse(json);
    if (!parsed.success) {
      throw new LLMProviderError(
        "gemini",
        "invalid_output",
        `Gemini output failed schema validation: ${parsed.error.message}`
      );
    }
    return parsed.data;
  }
}
