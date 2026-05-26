import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { validateMermaid } from "../pdf/renderer.js";

const RequestSchema = z.object({
  code: z.string().min(1, "code is required"),
});

export async function registerValidateMermaidRoute(app: FastifyInstance) {
  app.post("/api/validate-mermaid", async (req, reply) => {
    const parsed = RequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        svg: "",
        error: "invalid_request",
        message: "Body must include a non-empty mermaid `code` string.",
      });
    }
    try {
      const result = await validateMermaid(parsed.data.code);
      return reply.send(result);
    } catch (err) {
      req.log.warn({ err }, "Mermaid validation failed");
      return reply.send({ ok: false, svg: "" });
    }
  });
}
