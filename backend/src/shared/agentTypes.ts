// Shared agent-stage types. Live in shared/ so both the backend orchestrator
// and the frontend (via the @shared alias) can import them. The Content-to-PDF
// Agent is a multi-stage pipeline: Intake → Strategy → Extraction → Content
// Editor → Layout Planner → Render → Quality Review → Repair. These types are
// the structured outputs each stage emits and that the frontend surfaces.

import type { UseCaseContentType } from "./useCaseSchema.js";
import type {
  TemplateDefinition,
  TemplateId,
  TemplateRecommendation,
} from "./templates.js";

export type ContentLength = "short" | "medium" | "long";
export type TargetLength = "compact" | "standard" | "expanded";
export type NarrativeMode = "concise" | "balanced" | "expanded";
export type CoverDensity = "compact" | "normal" | "spacious";
export type SupportingVisualPolicy = "omit" | "try-inline" | "dedicated-if-strong";
export type VisualPlacement = "omit" | "inline" | "dedicated";

export interface IntakeAssessment {
  contentLength: ContentLength;
  detectedContentType: UseCaseContentType;
  confidence: number;
  needsExpansion: boolean;
  needsCompression: boolean;
  missingFields: string[];
  recommendedTemplate: TemplateId;
  templateRecommendation: TemplateRecommendation;
  risks: string[];
}

export interface DocumentStrategy {
  templateId: TemplateId;
  documentLabel: string;
  targetLength: TargetLength;
  preferredPages: 2 | 3;
  maxPages: 2 | 3;
  coverDensity: CoverDensity;
  narrativeMode: NarrativeMode;
  supportingVisualPolicy: SupportingVisualPolicy;
  reviewRequired: boolean;
}

export interface LayoutPlan {
  coverDensity: CoverDensity;
  visualPlacement: VisualPlacement;
  estimatedPages: 2 | 3;
  notes: string[];
}

export type QualityIssueCode =
  | "summary_spill"
  | "short_cover_blank_space"
  | "dangling_sentence"
  | "sparse_page"
  | "missing_footer"
  | "failed_visual"
  | "filename_error"
  | "copyright_error"
  // Customer Case Study page-1 validation (usecase template only).
  | "summary_count_mismatch"
  | "summary_overflow_risk";

export type QualityIssueLocation =
  | "page1"
  | "page2"
  | "page3"
  | "narrative"
  | "summary";

export interface QualityIssue {
  code: QualityIssueCode;
  severity: "warning" | "error";
  message: string;
  location?: QualityIssueLocation;
}

export interface PdfQualityReport {
  passed: boolean;
  issues: QualityIssue[];
  recommendedRepair?: RepairAction[];
}

export type RepairAction =
  | { type: "switch_cover_density"; density: CoverDensity }
  | { type: "compress_narrative"; targetWords: number }
  | { type: "omit_supporting_visual" }
  | { type: "repair_sentence_fragments" }
  | { type: "rerender_pdf" }
  // Customer Case Study summary repairs (usecase template only).
  | { type: "renormalize_case_study_summary" }
  | { type: "compress_case_study_summary"; maxChars: number };

// Wire response shape for POST /api/extract. UseCase remains the editable
// payload; the rest are read-only agent decisions the frontend can surface.
export interface ExtractAgentResponse {
  content: import("./useCaseSchema.js").UseCase;
  intake: IntakeAssessment;
  strategy: DocumentStrategy;
  layoutPlan: LayoutPlan;
  warnings: string[];
  recommendedTemplate: TemplateDefinition;
  availableTemplates: TemplateDefinition[];
}
