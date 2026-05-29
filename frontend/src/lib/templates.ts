// Thin re-export of the shared template module so frontend code can keep
// importing from `../lib/templates`. Definitions live in
// backend/src/shared/templates.ts (also consumed by the agent and PDF
// pipeline) so there is exactly one source of truth.

export {
  TEMPLATE_DEFINITIONS,
  TEMPLATE_IDS,
  getTemplateDefinition,
  getFilenamePrefix,
} from "@shared/templates";
export type { TemplateId, TemplateDefinition } from "@shared/templates";
