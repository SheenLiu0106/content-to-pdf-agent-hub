import { z } from "zod";
import { UseCaseSchema } from "./useCaseSchema.js";
import { TEMPLATE_IDS } from "./templates.js";

export const ExtractRequestSchema = z.object({
  rawContent: z
    .string()
    .min(20, "Paste at least 20 characters of content")
    .max(50_000, "Content too long — split into smaller chunks"),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

// Re-normalize already-extracted content for a specific template. Used by the
// frontend to keep the editable content in lockstep with the template the user
// has selected — so the Review/Edit screen always shows exactly what the PDF
// will render (no LLM call, pure deterministic normalization).
export const NormalizeRequestSchema = z.object({
  content: UseCaseSchema,
  templateId: z.enum(TEMPLATE_IDS),
});
export type NormalizeRequest = z.infer<typeof NormalizeRequestSchema>;
