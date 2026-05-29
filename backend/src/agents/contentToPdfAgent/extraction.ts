import type { UseCase } from "../../shared/useCaseSchema.js";
import type { DocumentStrategy } from "../../shared/agentTypes.js";
import { normalizeUseCase } from "../../shared/normalizeUseCase.js";
import { getProvider } from "../../llm/factory.js";
import { config } from "../../config.js";
import type { ExpansionMode } from "../../llm/prompt.js";

// Extraction stage: wraps the existing pluggable LLM provider + normalizer.
// The strategy.narrativeMode currently maps to the provider's ExpansionMode
// env knob — this gives Phase 2 a way to override the env default per-request
// without rewriting provider adapters. Providers cache their system prompt
// from process boot, so per-request expansion mode is not yet wired through
// each adapter; the override is applied via config indirection in Phase 2+.
export function strategyToExpansionMode(strategy: DocumentStrategy): ExpansionMode {
  // "concise" trusts the source; "balanced"/"expanded" allow industry context.
  return strategy.narrativeMode === "concise" ? "strict" : "standard";
}

export async function runExtraction(rawContent: string): Promise<UseCase> {
  const provider = getProvider();
  const extracted = await provider.extract(rawContent);
  return normalizeUseCase(extracted);
}

// Surfaced for symmetry with the strategy → mode mapping above; not all
// providers will read this in Phase 1, but exporting keeps the contract
// explicit. Returns the env default if no strategy is passed.
export function resolveExpansionMode(strategy?: DocumentStrategy): ExpansionMode {
  if (strategy) return strategyToExpansionMode(strategy);
  return config.EXPANSION_MODE;
}
