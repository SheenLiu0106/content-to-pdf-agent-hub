import { z } from "zod";

export const USE_CASE_CONTENT_TYPES = [
  "use_case",
  "success_story",
  "case_study",
  "project_summary",
  "marketing_brief",
  "executive_memo",
  "general_article",
] as const;

export const UseCaseContentTypeEnum = z.enum(USE_CASE_CONTENT_TYPES);
export type UseCaseContentType = z.infer<typeof UseCaseContentTypeEnum>;

export const USE_CASE_CONTENT_TYPE_LABELS: Record<UseCaseContentType, string> = {
  use_case: "Use Case",
  success_story: "Success Story",
  case_study: "Case Study",
  project_summary: "Project Summary",
  marketing_brief: "Marketing Brief",
  executive_memo: "Executive Memo",
  general_article: "General Article",
};

export const NarrativeSectionSchema = z.object({
  heading: z.string(),
  body: z.string(),
});
export type NarrativeSection = z.infer<typeof NarrativeSectionSchema>;

export const PullQuoteSchema = z.object({
  quote: z.string(),
  attribution: z.string().nullable(),
});
export type PullQuote = z.infer<typeof PullQuoteSchema>;

export const MermaidDiagramSchema = z.object({
  title: z.string(),
  code: z.string(),
  description: z.string().nullable(),
});
export type MermaidDiagram = z.infer<typeof MermaidDiagramSchema>;

export const UseCaseSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),

  contentType: UseCaseContentTypeEnum,

  solutionName: z.string().nullable(),
  industry: z.string().nullable(),
  useCaseFocus: z.string().nullable(),

  goals: z.array(z.string()),
  challenges: z.array(z.string()),
  solutions: z.array(z.string()),
  results: z.array(z.string()),

  executiveSummary: z.string(),

  narrativeSections: z.array(NarrativeSectionSchema),

  pullQuotes: z.array(PullQuoteSchema),

  mermaidDiagram: MermaidDiagramSchema.nullable(),

  callToAction: z.string().nullable(),

  missingFields: z.array(z.string()),
  expansionNotes: z.array(z.string()),
});
export type UseCase = z.infer<typeof UseCaseSchema>;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const HERO_IMAGE_DATA_URL_RE =
  /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const LOGO_DATA_URL_RE =
  /^data:image\/(png|jpe?g|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

export const SUPPORTING_VISUAL_TYPES = ["image", "mermaid"] as const;
export const SupportingVisualTypeEnum = z.enum(SUPPORTING_VISUAL_TYPES);
export type SupportingVisualType = z.infer<typeof SupportingVisualTypeEnum>;

export const PdfRenderConfigSchema = z.object({
  templateId: z.literal("usecase").default("usecase"),

  brandName: z.string().default("Your Company"),
  brandWebsite: z.string().default("www.example.com"),
  documentLabel: z.string().default("CUSTOMER CASE STUDY"),
  brandCopyright: z.string().default("© 2026 Your Company. All rights reserved."),

  primaryColor: z
    .string()
    .regex(HEX_COLOR_RE, "primaryColor must be #RRGGBB hex")
    .default("#0F172A"),
  accentColor: z
    .string()
    .regex(HEX_COLOR_RE, "accentColor must be #RRGGBB hex")
    .default("#06B6D4"),

  logoDataUrl: z
    .string()
    .regex(LOGO_DATA_URL_RE, "logoDataUrl must be a base64 data URL of png/jpeg/svg")
    .nullable()
    .default(null),
  heroImageDataUrl: z
    .string()
    .regex(
      HERO_IMAGE_DATA_URL_RE,
      "heroImageDataUrl must be a base64 data URL of png/jpeg/webp"
    )
    .nullable()
    .default(null),

  supportingVisualEnabled: z.boolean().default(false),
  supportingVisualType: SupportingVisualTypeEnum.nullable().default(null),
  supportingImageDataUrl: z
    .string()
    .regex(
      HERO_IMAGE_DATA_URL_RE,
      "supportingImageDataUrl must be a base64 data URL of png/jpeg/webp"
    )
    .nullable()
    .default(null),
  supportingImageCaption: z.string().nullable().default(null),
  mermaidVerified: z.boolean().default(false),
});
export type PdfRenderConfig = z.infer<typeof PdfRenderConfigSchema>;

export const RenderPdfRequestSchema = z.object({
  content: UseCaseSchema,
  config: PdfRenderConfigSchema.default({}),
});
export type RenderPdfRequest = z.infer<typeof RenderPdfRequestSchema>;
