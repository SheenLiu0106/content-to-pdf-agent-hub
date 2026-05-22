import type { FastifyInstance } from "fastify";
import { config } from "../config.js";

export async function registerHealthRoute(app: FastifyInstance) {
  app.get("/api/health", async () => ({
    status: "ok",
    provider: config.LLM_PROVIDER,
  }));
}
