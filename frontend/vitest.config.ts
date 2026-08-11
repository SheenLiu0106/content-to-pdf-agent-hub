import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Deliberately a separate file from vite.config.ts. Vitest reads this one instead,
// so the dev server config (pinned port, /api proxy) stays untouched — and that
// file has unrelated uncommitted changes that must not be disturbed.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../backend/src/shared"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
