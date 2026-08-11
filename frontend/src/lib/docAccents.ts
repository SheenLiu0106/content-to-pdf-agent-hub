import type { CSSProperties } from "react";
import type { PdfRenderConfig } from "@shared/useCaseSchema";

/**
 * The run's document brand accents, as CSS variables for the paper sheet.
 *
 * Mirrors backend/src/templates/usecase/styles.css: Goals uses --accent and Solutions
 * uses --primary, so the on-screen preview shows the same section colours the PDF will.
 * Challenges and Results are fixed in that template, so they stay on their :root
 * fallbacks. These are document brand values, never application theme colours.
 */
export function docAccentStyle(config: PdfRenderConfig): CSSProperties {
  return {
    "--doc-goals": config.accentColor,
    "--doc-solutions": config.primaryColor,
  } as CSSProperties;
}
