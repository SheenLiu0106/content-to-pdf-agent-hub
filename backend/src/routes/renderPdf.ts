import type { FastifyInstance } from "fastify";
import { RenderPdfRequestSchema } from "../shared/useCaseSchema.js";
import { getFilenamePrefix } from "../shared/templates.js";
import { runRenderAgent } from "../agents/contentToPdfAgent/agent.js";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "document"
  );
}

export async function registerRenderPdfRoute(app: FastifyInstance) {
  app.post("/api/render-pdf", async (req, reply) => {
    const parsed = RenderPdfRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "Request body did not match the use case schema",
        issues: parsed.error.issues,
      });
    }

    try {
      const prefix = getFilenamePrefix(parsed.data.config.templateId);
      const filename = `${prefix}${slugify(parsed.data.content.title)}.pdf`;
      const { pdf, attempts, appliedActions } = await runRenderAgent(
        parsed.data.content,
        parsed.data.config,
        { filename }
      );
      reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .header("Content-Length", String(pdf.length))
        .header("X-Agent-Repair-Attempts", String(attempts))
        .header(
          "X-Agent-Repair-Actions",
          appliedActions.map((a) => a.type).join(",") || "none"
        )
        .send(pdf);
    } catch (err) {
      req.log.error({ err }, "PDF render failed");
      return reply.code(500).send({
        error: "render_failed",
        message: `PDF rendering failed: ${(err as Error).message}`,
      });
    }
  });
}
