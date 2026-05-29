import type { UseCase, PdfRenderConfig } from "../../shared/useCaseSchema.js";
import type {
  DocumentStrategy,
  LayoutPlan,
} from "../../shared/agentTypes.js";
import {
  computeCoverDensity,
  decideVisualPlacement,
  type SupportingVisualPlacement,
} from "../../pdf/usecaseTemplate.js";
import type { SupportingVisualResolved } from "../../pdf/renderer.js";

// Predict whether a supporting visual will render before we call into
// Playwright. Uploaded images always resolve; Mermaid resolves only when
// the user verified the diagram via /api/validate-mermaid in the UI.
// We synthesize a SupportingVisualResolved-shaped object so we can reuse
// the existing decideVisualPlacement heuristic without modifying it.
function predictSupportingVisual(
  content: UseCase,
  config: PdfRenderConfig
): SupportingVisualResolved {
  if (!config.supportingVisualEnabled || !config.supportingVisualType) {
    return { imageDataUrl: null, mermaidSvg: "", caption: null };
  }
  if (config.supportingVisualType === "image") {
    return {
      imageDataUrl: config.supportingImageDataUrl,
      mermaidSvg: "",
      caption: config.supportingImageCaption,
    };
  }
  // Mermaid path. We only predict it will render if (a) verified, (b) code
  // present. Using a placeholder SVG string of length > 0 satisfies the
  // heuristic's "has visual" check without affecting its weight math
  // (weight comes from the boolean, not the string contents).
  if (config.mermaidVerified && content.mermaidDiagram?.code) {
    return { imageDataUrl: null, mermaidSvg: "<svg/>", caption: null };
  }
  return { imageDataUrl: null, mermaidSvg: "", caption: null };
}

function mapPlacement(p: SupportingVisualPlacement): LayoutPlan["visualPlacement"] {
  if (p === "inline-page-2") return "inline";
  if (p === "dedicated-page-3") return "dedicated";
  return "omit";
}

// Layout Planner. Calls the existing density + placement heuristics (the
// "deterministic floor"), then applies strategy-driven overrides. The plan
// emitted here is what the agent recommends; user-edited config still wins
// downstream (strategy.coverDensity is only a hint).
export function runLayoutPlanner(
  content: UseCase,
  config: PdfRenderConfig,
  strategy: DocumentStrategy
): LayoutPlan {
  const heuristicDensity = computeCoverDensity(content);
  const supporting = predictSupportingVisual(content, config);
  const heuristicPlacement = decideVisualPlacement(
    content,
    supporting,
    config.pdfLengthMode,
    heuristicDensity
  );

  const notes: string[] = [];

  // Density resolution. Strategy hint wins only if it doesn't *increase*
  // overflow risk — i.e. we trust the heuristic's "compact" verdict
  // (driven by character counts and bullet density) over the strategy's
  // intent. But if heuristic says "normal" and strategy says "spacious" or
  // "compact", honor the strategy.
  let coverDensity: LayoutPlan["coverDensity"] = heuristicDensity;
  if (heuristicDensity !== "compact" && strategy.coverDensity !== heuristicDensity) {
    coverDensity = strategy.coverDensity;
    notes.push(
      `coverDensity: strategy override ${heuristicDensity} → ${strategy.coverDensity}`
    );
  } else if (heuristicDensity === "compact" && strategy.coverDensity !== "compact") {
    notes.push(
      `coverDensity: heuristic locked to compact (overflow risk); ignoring strategy hint ${strategy.coverDensity}`
    );
  }

  // Visual placement. Strategy policy can downgrade an inline/dedicated
  // decision to "omit", but never upgrade an "omit" to something visible —
  // the heuristic's omit verdict means the visual would create a weak page.
  let visualPlacement = mapPlacement(heuristicPlacement);
  if (strategy.supportingVisualPolicy === "omit" && visualPlacement !== "omit") {
    notes.push(`visualPlacement: strategy policy omit overrides ${visualPlacement}`);
    visualPlacement = "omit";
  } else if (
    strategy.supportingVisualPolicy === "try-inline" &&
    visualPlacement === "dedicated"
  ) {
    // Strategy wanted inline but heuristic chose dedicated. Heuristic wins
    // — dedicated means the visual is strong enough; demoting to inline
    // could break page 2 layout. Just note it.
    notes.push(
      `visualPlacement: strategy preferred inline but heuristic chose dedicated`
    );
  }

  // Estimated pages: 3 only if visual is dedicated. Otherwise 2.
  const estimatedPages: 2 | 3 = visualPlacement === "dedicated" ? 3 : 2;

  if (estimatedPages > strategy.maxPages) {
    notes.push(
      `estimatedPages ${estimatedPages} exceeds strategy.maxPages ${strategy.maxPages}; consider omitting visual`
    );
  }

  return {
    coverDensity,
    visualPlacement,
    estimatedPages,
    notes,
  };
}
