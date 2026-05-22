import type { FastifyInstance } from "fastify";
import { ExtractRequestSchema } from "../shared/schema.js";
import { normalizeContent } from "../shared/normalize.js";
import { getProvider } from "../llm/factory.js";
import { LLMProviderError } from "../llm/provider.js";

export async function registerExtractRoute(app: FastifyInstance) {
  app.post("/api/extract", async (req, reply) => {
    const parsed = ExtractRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const tooLong = parsed.error.issues.some((i) => i.message.includes("too long"));
      return reply.code(tooLong ? 413 : 400).send({
        error: "invalid_request",
        message: parsed.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    const provider = getProvider();
    try {
      const extracted = await provider.extract(parsed.data.rawContent);
      const normalized = normalizeContent(extracted);
      return reply.send(normalized);
    } catch (err) {
      if (err instanceof LLMProviderError) {
        req.log.error({ err, provider: err.provider, kind: err.kind }, "extraction failed");
        if (err.kind === "invalid_output") {
          return reply.code(422).send({
            error: "extraction_failed",
            message: `The AI returned an unparseable response. Try pasting again or use a clearer source.`,
            provider: err.provider,
          });
        }
        return reply.code(502).send({
          error: "provider_error",
          message: `Upstream AI provider failed: ${err.message}`,
          provider: err.provider,
        });
      }
      req.log.error({ err }, "unexpected extraction error");
      return reply.code(500).send({ error: "internal_error", message: "Unexpected server error" });
    }
  });
}
