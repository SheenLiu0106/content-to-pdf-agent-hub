// Shared test fixtures. UseCaseSchema requires explicit nulls for its nullable
// fields rather than allowing omission, so a valid UseCase must be spelled out.

import {
  PdfRenderConfigSchema,
  UseCaseSchema,
  type PdfRenderConfig,
  type UseCase,
} from "../shared/useCaseSchema.js";
import { getTemplateDefinition } from "../shared/templates.js";
import type { RunAgentSnapshot } from "./types.js";

export const TEST_CONFIG: PdfRenderConfig = PdfRenderConfigSchema.parse({
  templateId: "usecase",
});

export const TEST_CONTENT: UseCase = UseCaseSchema.parse({
  title: "Acme cuts onboarding time",
  subtitle: "How a mid-market team shortened ramp-up",
  contentType: "case_study",
  solutionName: "Onboarding Suite",
  industry: "Logistics",
  useCaseFocus: "Employee onboarding",
  goals: ["Shorten ramp-up", "Reduce manual steps", "Improve tracking", "Standardize training"],
  challenges: ["Manual paperwork", "No single owner", "Slow approvals", "Fragmented tooling"],
  solutions: ["Automated intake", "Single workflow owner", "Templated approvals", "Unified portal"],
  results: ["Faster ramp-up", "Fewer errors", "Clearer ownership", "Higher satisfaction"],
  executiveSummary:
    "Acme replaced a manual onboarding process with an automated workflow, shortening ramp-up and reducing administrative errors across the logistics organization.",
  narrativeSections: [{ heading: "Background", body: "Acme onboarded staff by hand." }],
  pullQuotes: [],
  mermaidDiagram: null,
  callToAction: null,
  inlineVisuals: [],
  missingFields: [],
  expansionNotes: [],
});

export const TEST_AGENT: RunAgentSnapshot = {
  intake: {
    contentLength: "medium",
    detectedContentType: "case_study",
    confidence: 0.8,
    needsExpansion: false,
    needsCompression: false,
    missingFields: [],
    recommendedTemplate: "usecase",
    templateRecommendation: {
      templateId: "usecase",
      confidence: 0.85,
      rationale: "test fixture",
    },
    risks: [],
  },
  strategy: {
    templateId: "usecase",
    documentLabel: "CUSTOMER CASE STUDY",
    targetLength: "compact",
    preferredPages: 2,
    maxPages: 2,
    coverDensity: "normal",
    narrativeMode: "balanced",
    supportingVisualPolicy: "omit",
    reviewRequired: false,
  },
  layoutPlan: {
    coverDensity: "normal",
    visualPlacement: "omit",
    estimatedPages: 2,
    notes: [],
  },
  warnings: [],
  recommendedTemplate: getTemplateDefinition("usecase"),
};
