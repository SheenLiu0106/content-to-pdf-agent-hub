import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { UseCaseSchema, type UseCase } from "../shared/useCaseSchema.js";
import { USE_CASE_JSON_SCHEMA, buildExtractionSystemPrompt } from "./prompt.js";
import { LLMProviderError, type LLMProvider } from "./provider.js";

const TOOL_NAME = "submit_extraction";

export class ClaudeProvider implements LLMProvider {
  readonly name = "claude" as const;
  private client: Anthropic;
  private systemPrompt: string;

  constructor() {
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY! });
    this.systemPrompt = buildExtractionSystemPrompt(config.EXPANSION_MODE);
  }

  async extract(rawContent: string): Promise<UseCase> {
    let response;
    try {
      response = await this.client.messages.create({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: [
          {
            type: "text",
            text: this.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ] as any,
        tools: [
          {
            name: TOOL_NAME,
            description: "Submit the extracted structured use case.",
            input_schema: USE_CASE_JSON_SCHEMA as any,
          },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [
          {
            role: "user",
            content: `Extract the structured use case from the text below.\n\n<raw_content>\n${rawContent}\n</raw_content>`,
          },
        ],
      });
    } catch (err) {
      throw new LLMProviderError("claude", "api_error", `Anthropic API call failed: ${(err as Error).message}`, { cause: err });
    }

    const toolUse = response.content.find((b: any) => b.type === "tool_use" && b.name === TOOL_NAME);
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new LLMProviderError("claude", "invalid_output", "Claude did not return a tool_use block");
    }

    const parsed = UseCaseSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new LLMProviderError(
        "claude",
        "invalid_output",
        `Claude output failed schema validation: ${parsed.error.message}`
      );
    }
    return parsed.data;
  }
}
