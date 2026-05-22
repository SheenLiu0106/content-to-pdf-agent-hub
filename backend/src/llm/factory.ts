import { config } from "../config.js";
import { ClaudeProvider } from "./claude.js";
import { OpenAIProvider } from "./openai.js";
import { GeminiProvider } from "./gemini.js";
import type { LLMProvider } from "./provider.js";

let cached: LLMProvider | undefined;

export function getProvider(): LLMProvider {
  if (cached) return cached;
  switch (config.LLM_PROVIDER) {
    case "claude":
      cached = new ClaudeProvider();
      break;
    case "openai":
      cached = new OpenAIProvider();
      break;
    case "gemini":
      cached = new GeminiProvider();
      break;
  }
  return cached!;
}
