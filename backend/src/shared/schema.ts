import { z } from "zod";

export const CONTENT_TYPES = [
  "general_article",
  "newsletter",
  "case_study",
  "project_summary",
  "executive_memo",
  "marketing_brief",
  "proposal_draft",
  "meeting_summary",
] as const;

export const ContentTypeEnum = z.enum(CONTENT_TYPES);
export type ContentType = z.infer<typeof ContentTypeEnum>;

export const MainSectionSchema = z.object({
  heading: z.string(),
  body: z.string(),
});
export type MainSection = z.infer<typeof MainSectionSchema>;

export const ContentSchema = z.object({
  title: z.string(),
  contentType: ContentTypeEnum,
  authorOrSource: z.string().nullable(),
  audience: z.string().nullable(),
  executiveSummary: z.string(),
  keyPoints: z.array(z.string()),
  background: z.string().nullable(),
  mainContentSections: z.array(MainSectionSchema),
  recommendations: z.array(z.string()),
  nextSteps: z.array(z.string()),
  supportingEvidence: z.array(z.string()),
  callToAction: z.string().nullable(),
  missingFields: z.array(z.string()),
});
export type Content = z.infer<typeof ContentSchema>;

export const ExtractRequestSchema = z.object({
  rawContent: z.string().min(20, "Paste at least 20 characters of content").max(50_000, "Content too long — split into smaller chunks"),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  general_article: "General Article",
  newsletter: "Newsletter",
  case_study: "Case Study",
  project_summary: "Project Summary",
  executive_memo: "Executive Memo",
  marketing_brief: "Marketing Brief",
  proposal_draft: "Proposal Draft",
  meeting_summary: "Meeting Summary",
};
