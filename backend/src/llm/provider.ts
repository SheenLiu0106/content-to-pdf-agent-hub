import type { Content } from "../shared/schema.js";

export interface LLMProvider {
  readonly name: "claude" | "openai" | "gemini";
  extract(rawContent: string): Promise<Content>;
}

export class LLMProviderError extends Error {
  readonly provider: string;
  readonly kind: "api_error" | "invalid_output";
  constructor(provider: string, kind: "api_error" | "invalid_output", message: string, opts?: { cause?: unknown }) {
    super(message, opts);
    this.name = "LLMProviderError";
    this.provider = provider;
    this.kind = kind;
  }
}
