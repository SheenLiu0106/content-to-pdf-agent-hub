import type { FastifyInstance } from "fastify";
import { NormalizeRequestSchema } from "../shared/schema.js";
import { normalizeUseCase } from "../shared/normalizeUseCase.js";

// POST /api/normalize — re-apply the template-scoped normalization policy to
// already-extracted content. No LLM, no PDF. The frontend calls this whenever
// the selected template changes so the Review/Edit content always reflects the
// exact bullet policy the PDF renderer will use (Customer Case Study → exactly
// 4 bullets per section; Article Report / Executive Memo → legacy caps). This
// is what keeps the editor, preview, render payload, and PDF on one content
// object — the single source of truth.
export async function registerNormalizeRoute(app: FastifyInstance) {
  app.post("/api/normalize", async (req, reply) => {
    const parsed = NormalizeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_request",
        message: parsed.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    const content = normalizeUseCase(parsed.data.content, {
      templateId: parsed.data.templateId,
    });
    return reply.send({ content });
  });
}
