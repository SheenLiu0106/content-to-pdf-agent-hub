import type { PdfRenderConfig, UseCase } from "../shared/useCaseSchema.js";
import type { SupportingVisualResolved } from "./renderer.js";
import { renderUseCaseTemplate } from "./usecaseTemplate.js";
import { renderArticleReportTemplate } from "./articleReportTemplate.js";
import { renderExecutiveMemoTemplate } from "./executiveMemoTemplate.js";

// Dispatch into the per-template renderer based on config.templateId. The
// `usecase` case keeps calling the existing case-study renderer untouched;
// the two new IDs route into their dedicated layout files.
export function renderTemplateHtml(
  content: UseCase,
  config: PdfRenderConfig,
  supporting: SupportingVisualResolved
): string {
  switch (config.templateId) {
    case "article_report":
      return renderArticleReportTemplate(content, config, supporting);
    case "executive_memo":
      return renderExecutiveMemoTemplate(content, config, supporting);
    case "usecase":
    default:
      return renderUseCaseTemplate(content, config, supporting);
  }
}
