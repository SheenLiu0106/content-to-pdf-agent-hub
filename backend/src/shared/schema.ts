import { z } from "zod";

export const ExtractRequestSchema = z.object({
  rawContent: z
    .string()
    .min(20, "Paste at least 20 characters of content")
    .max(50_000, "Content too long — split into smaller chunks"),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;
