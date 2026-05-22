import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { ContentSchema, type Content } from "../shared/schema.js";
import { CONTENT_JSON_SCHEMA, EXTRACTION_SYSTEM_PROMPT } from "./prompt.js";
import { LLMProviderError, type LLMProvider } from "./provider.js";

const TOOL_NAME = "submit_extraction";

export class ClaudeProvider implements LLMProvider {
  readonly name = "claude" as const;
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY! });
  }

  async extract(rawContent: string): Promise<Content> {
    let response;
    try {
      response = await this.client.messages.create({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: [
          {
            type: "text",
            text: EXTRACTION_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ] as any,
        tools: [
          {
            name: TOOL_NAME,
            description: "Submit the extracted structured content.",
            input_schema: CONTENT_JSON_SCHEMA as any,
          },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [
          {
            role: "user",
            content: `Extract the structured content from the text below.\n\n<raw_content>\n${rawContent}\n</raw_content>`,
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

    const parsed = ContentSchema.safeParse(toolUse.input);
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
