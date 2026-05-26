import OpenAI from "openai";
import { config } from "../config.js";
import { UseCaseSchema, type UseCase } from "../shared/useCaseSchema.js";
import { USE_CASE_JSON_SCHEMA, buildExtractionSystemPrompt } from "./prompt.js";
import { LLMProviderError, type LLMProvider } from "./provider.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai" as const;
  private client: OpenAI;
  private systemPrompt: string;

  constructor() {
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY! });
    this.systemPrompt = buildExtractionSystemPrompt(config.EXPANSION_MODE);
  }

  async extract(rawContent: string): Promise<UseCase> {
    let response;
    try {
      response = await this.client.chat.completions.create({
        model: config.OPENAI_MODEL,
        messages: [
          { role: "system", content: this.systemPrompt },
          {
            role: "user",
            content: `Extract the structured use case from the text below.\n\n<raw_content>\n${rawContent}\n</raw_content>`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "use_case_extraction",
            strict: false,
            schema: USE_CASE_JSON_SCHEMA as any,
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

    const parsed = UseCaseSchema.safeParse(json);
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
