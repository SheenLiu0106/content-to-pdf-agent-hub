import "dotenv/config";
import { z } from "zod";

const ProviderEnum = z.enum(["claude", "openai", "gemini"]);
export type Provider = z.infer<typeof ProviderEnum>;

const BaseEnvSchema = z.object({
  LLM_PROVIDER: ProviderEnum.default("gemini"),
  EXPANSION_MODE: z.enum(["strict", "standard"]).default("standard"),
  // Must match frontend/vite.config.ts: the dev proxy targets 8788 and vite
  // itself is pinned to 5179 with strictPort.
  PORT: z.coerce.number().int().positive().default(8788),
  CORS_ORIGIN: z.string().default("http://localhost:5179"),

  // Durable run store (SQLite + rendered artifacts). Resolved from cwd, which
  // is backend/ under `pnpm dev:backend`.
  DATA_DIR: z.string().default("./data"),
  WORKER_ENABLED: z.enum(["true", "false"]).default("true"),
  // Gates auto-approval. Stays false until Phase 3 implements and validates
  // real rendered-output checks; Phase 1 only has pre-render heuristics.
  RENDER_QA_ENABLED: z.enum(["true", "false"]).default("false"),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),

  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_MODEL: z.string().default("gemini-2.0-flash"),
});

const parsed = BaseEnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("[config] Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

function assertProviderCreds(provider: Provider) {
  if (provider === "claude" && !env.ANTHROPIC_API_KEY) {
    throw new Error("LLM_PROVIDER=claude requires ANTHROPIC_API_KEY");
  }
  if (provider === "openai" && !env.OPENAI_API_KEY) {
    throw new Error("LLM_PROVIDER=openai requires OPENAI_API_KEY");
  }
  if (provider === "gemini" && !env.GOOGLE_API_KEY) {
    throw new Error("LLM_PROVIDER=gemini requires GOOGLE_API_KEY");
  }
}

assertProviderCreds(env.LLM_PROVIDER);

export const config = env;
