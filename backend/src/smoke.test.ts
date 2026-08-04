import assert from "node:assert/strict";
import test from "node:test";

import { TEMPLATE_IDS, recommendTemplate } from "./shared/templates.js";

// Proves the harness actually executes TypeScript from src/ — a passing run
// with zero assertions would tell us nothing about whether tests are wired up.
test("test harness runs and can import project source", () => {
  assert.ok(TEMPLATE_IDS.length > 0, "template registry should be non-empty");

  const rec = recommendTemplate("case_study");
  assert.equal(rec.templateId, "usecase");
  assert.ok(rec.confidence > 0 && rec.confidence <= 1);
});
