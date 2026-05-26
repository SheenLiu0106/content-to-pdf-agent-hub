import "dotenv/config";
import { z } from "zod";

const ProviderEnum = z.enum(["claude", "openai", "gemini"]);
export type Provider = z.infer<typeof ProviderEnum>;

const BaseEnvSchema = z.object({
  LLM_PROVIDER: ProviderEnum.default("gemini"),
  EXPANSION_MODE: z.enum(["strict", "standard"]).default("standard"),
  PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

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
