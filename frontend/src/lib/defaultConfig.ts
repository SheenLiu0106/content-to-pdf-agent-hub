import type { PdfRenderConfig } from "@shared/useCaseSchema";

// Starting render configuration. Lives here rather than inside
// ContentToPdfPage so the production-batch dialog seeds a batch from exactly the
// same defaults as the interactive flow.
export const DEFAULT_CONFIG: PdfRenderConfig = {
  templateId: "usecase",
  brandName: "Your Company",
  brandWebsite: "www.example.com",
  documentLabel: "CUSTOMER CASE STUDY",
  brandCopyright: "© 2026 Your Company. All rights reserved.",
  primaryColor: "#0F172A",
  accentColor: "#06B6D4",
  logoDataUrl: null,
  heroImageDataUrl: null,
  supportingVisualEnabled: false,
  supportingVisualType: null,
  supportingImageDataUrl: null,
  supportingImageCaption: null,
  mermaidVerified: false,
  pdfLengthMode: "compact-2-page",
};
