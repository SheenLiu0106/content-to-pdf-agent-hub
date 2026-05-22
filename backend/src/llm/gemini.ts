import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { ContentSchema, type Content } from "../shared/schema.js";
import { EXTRACTION_SYSTEM_PROMPT } from "./prompt.js";
import { LLMProviderError, type LLMProvider } from "./provider.js";

/**
 * Gemini doesn't accept JSON Schema's `["string", "null"]` union form, so we
 * mirror the schema using its own Schema type and mark nullable scalars
 * with { type: STRING, nullable: true }.
 */
const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    contentType: {
      type: "STRING",
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
    authorOrSource: { type: "STRING", nullable: true },
    audience: { type: "STRING", nullable: true },
    executiveSummary: { type: "STRING" },
    keyPoints: { type: "ARRAY", items: { type: "STRING" } },
    background: { type: "STRING", nullable: true },
    mainContentSections: {
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
    recommendations: { type: "ARRAY", items: { type: "STRING" } },
    nextSteps: { type: "ARRAY", items: { type: "STRING" } },
    supportingEvidence: { type: "ARRAY", items: { type: "STRING" } },
    callToAction: { type: "STRING", nullable: true },
    missingFields: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: [
    "title",
    "contentType",
    "executiveSummary",
    "keyPoints",
    "mainContentSections",
    "recommendations",
    "nextSteps",
    "supportingEvidence",
    "missingFields",
  ],
};

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini" as const;
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: config.GOOGLE_API_KEY! });
  }

  async extract(rawContent: string): Promise<Content> {
    let response;
    try {
      response = await this.client.models.generateContent({
        model: config.GOOGLE_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Extract the structured content from the text below.\n\n<raw_content>\n${rawContent}\n</raw_content>`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
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

    // Gemini may omit nullable fields entirely instead of returning null.
    // Normalize before validation.
    if (typeof json === "object" && json !== null) {
      const obj = json as Record<string, unknown>;
      for (const k of ["authorOrSource", "audience", "background", "callToAction"]) {
        if (!(k in obj)) obj[k] = null;
      }
    }

    const parsed = ContentSchema.safeParse(json);
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
