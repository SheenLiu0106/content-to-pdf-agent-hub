import type { FastifyInstance } from "fastify";
import { ContentSchema } from "../shared/schema.js";
import { renderPdf } from "../pdf/renderer.js";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "content-report"
  );
}

export async function registerRenderPdfRoute(app: FastifyInstance) {
  app.post("/api/render-pdf", async (req, reply) => {
    const parsed = ContentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_content",
        message: "Request body did not match the Content schema",
        issues: parsed.error.issues,
      });
    }

    try {
      const pdf = await renderPdf(parsed.data);
      const filename = `content-report-${slugify(parsed.data.title)}.pdf`;
      reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .header("Content-Length", String(pdf.length))
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
