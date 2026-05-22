import OpenAI from "openai";
import { config } from "../config.js";
import { ContentSchema, type Content } from "../shared/schema.js";
import { CONTENT_JSON_SCHEMA, EXTRACTION_SYSTEM_PROMPT } from "./prompt.js";
import { LLMProviderError, type LLMProvider } from "./provider.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai" as const;
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY! });
  }

  async extract(rawContent: string): Promise<Content> {
    let response;
    try {
      response = await this.client.chat.completions.create({
        model: config.OPENAI_MODEL,
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Extract the structured content from the text below.\n\n<raw_content>\n${rawContent}\n</raw_content>`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "content_extraction",
            strict: true,
            schema: CONTENT_JSON_SCHEMA as any,
          },
        },
      });
    } catch (err) {
      throw new LLMProviderError("openai", "api_error", `OpenAI API call failed: ${(err as Error).message}`, { cause: err });
    }

    const text = response.choices?.[0]?.message?.content;
    if (!text) {
      throw new LLMProviderError("openai", "invalid_output", "OpenAI returned an empty response");
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new LLMProviderError("openai", "invalid_output", "OpenAI returned non-JSON content", { cause: err });
    }

    const parsed = ContentSchema.safeParse(json);
    if (!parsed.success) {
      throw new LLMProviderError(
        "openai",
        "invalid_output",
        `OpenAI output failed schema validation: ${parsed.error.message}`
      );
    }
    return parsed.data;
  }
}
