// The process-wide store and worker. Separated from store.ts/worker.ts so those
// stay free of ./config, which throws at import time when the selected provider's
// API key is missing — that would make them untestable.

import path from "node:path";

import { config } from "../config.js";
import { RunStore } from "./store.js";
import { RunWorker } from "./worker.js";

let store: RunStore | null = null;
let worker: RunWorker | null = null;

export function getRunStore(): RunStore {
  if (!store) {
    const dataDir = path.resolve(config.DATA_DIR);
    store = new RunStore({
      dbPath: path.join(dataDir, "runs.db"),
      artifactRoot: path.join(dataDir, "pdfs"),
    });
  }
  return store;
}

export function isRenderQaEnabled(): boolean {
  return config.RENDER_QA_ENABLED === "true";
}

/**
 * Boot sequence: recover transient runs (crash recovery), then start the worker.
 *
 * Deliberately does NOT sweep temp files. A second local backend process may
 * share this DATA_DIR with a worker actively rendering, so "nothing is in flight
 * at boot" does not hold — a boot-wide sweep could delete a live worker's
 * in-flight artifact. Temp files are removed only by the worker that created
 * them (see RunStore.cleanupOwnTempFiles).
 */
export function startRunWorker(logger: {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}): RunWorker | null {
  const s = getRunStore();

  // Recovery is UNCONDITIONAL — it must not be coupled to WORKER_ENABLED.
  // Booting with the worker off previously left runs interrupted by a crash stuck
  // in a transient state forever, with no way back to a claimable one.
  //
  // ignoreLease at boot: a transient run here was abandoned by a previous
  // process, so waiting out its lease would stall a crashed batch for 10 minutes.
  const recovered = s.recoverStale({ ignoreLease: true });
  if (recovered > 0) {
    logger.warn({ recovered }, "recovered transient runs interrupted by a previous shutdown");
  }

  if (config.WORKER_ENABLED !== "true") {
    logger.info({}, "run worker disabled (WORKER_ENABLED=false); recovery still ran");
    return null;
  }

  worker = new RunWorker({
    store: s,
    workerId: `${process.pid}`,
    logger,
  });
  worker.start();
  logger.info({ workerId: process.pid }, "run worker started");
  return worker;
}

export async function stopRunWorker(): Promise<void> {
  if (worker) {
    await worker.stop();
    worker = null;
  }
  if (store) {
    store.close();
    store = null;
  }
}
