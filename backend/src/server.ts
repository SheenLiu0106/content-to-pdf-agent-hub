import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerExtractRoute } from "./routes/extract.js";
import { registerNormalizeRoute } from "./routes/normalize.js";
import { registerRenderPdfRoute } from "./routes/renderPdf.js";
import { registerValidateMermaidRoute } from "./routes/validateMermaid.js";
import { registerRunRoutes } from "./routes/runs.js";
import { shutdownRenderer } from "./pdf/renderer.js";
import { startRunWorker, stopRunWorker } from "./runs/instance.js";

async function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: 8 * 1024 * 1024, // 8 MB — accommodates base64 hero image + logo uploads
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    methods: ["GET", "POST"],
  });

  await registerHealthRoute(app);
  await registerExtractRoute(app);
  await registerNormalizeRoute(app);
  await registerRenderPdfRoute(app);
  await registerValidateMermaidRoute(app);
  // Additive: the five interactive routes above are unchanged.
  await registerRunRoutes(app);

  return app;
}

async function main() {
  const app = await buildServer();

  const close = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    try {
      // Stop the worker first so shutdown never abandons a leased run mid-write.
      await stopRunWorker();
      await shutdownRenderer();
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "shutdown failed");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void close("SIGINT"));
  process.on("SIGTERM", () => void close("SIGTERM"));

  try {
    await app.listen({ port: config.PORT, host: "127.0.0.1" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // After listen: temp-file reap, then crash recovery, then the worker starts.
  startRunWorker(app.log);
}

main();
