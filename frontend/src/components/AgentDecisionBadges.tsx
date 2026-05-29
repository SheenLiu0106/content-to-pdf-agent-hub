import type {
  DocumentStrategy,
  IntakeAssessment,
  LayoutPlan,
} from "@shared/agentTypes";
import { USE_CASE_CONTENT_TYPE_LABELS } from "@shared/useCaseSchema";
import { getTemplateDefinition, type TemplateId } from "@shared/templates";

interface Props {
  intake: IntakeAssessment;
  strategy: DocumentStrategy;
  layoutPlan: LayoutPlan;
  warnings?: string[];
  /** Template actually used for the preview/PDF (userSelected ?? agentRecommended). */
  effectiveTemplateId: TemplateId;
  /** Template the agent originally recommended (read-only metadata). */
  agentRecommendedTemplateId: TemplateId | null;
  /** True when the user manually picked a template different from the recommendation. */
  isOverride: boolean;
}

const TARGET_LENGTH_LABELS: Record<DocumentStrategy["targetLength"], string> = {
  compact: "Compact",
  standard: "Standard",
  expanded: "Expanded",
};

const COVER_DENSITY_LABELS: Record<LayoutPlan["coverDensity"], string> = {
  compact: "Compact",
  normal: "Normal",
  spacious: "Spacious",
};

const VISUAL_PLACEMENT_LABELS: Record<LayoutPlan["visualPlacement"], string> = {
  omit: "Omit",
  inline: "Inline (page 2)",
  dedicated: "Dedicated (page 3)",
};

function Field({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      {highlight ? (
        <span className="mt-0.5 inline-flex w-fit max-w-full items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
          {value}
        </span>
      ) : (
        <span className="mt-0.5 truncate text-sm font-semibold text-slate-900">
          {value}
        </span>
      )}
    </div>
  );
}

export default function AgentDecisionBadges({
  intake,
  strategy,
  layoutPlan,
  warnings = [],
  effectiveTemplateId,
  agentRecommendedTemplateId,
  isOverride,
}: Props) {
  const agentRecommendationLabel = agentRecommendedTemplateId
    ? getTemplateDefinition(agentRecommendedTemplateId).label
    : getTemplateDefinition(strategy.templateId).label;
  return (
    <section className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm ring-1 ring-indigo-100/40">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-indigo-900">
            Agent Decision Summary
          </h3>
          <p className="text-[11px] text-indigo-700/80">
            Read-only — the agent picked these defaults from your source content.
          </p>
        </div>
        {strategy.reviewRequired && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
            Review recommended
          </span>
        )}
      </header>

      {/* Decision chain: classification → recommendation → final template → status */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-3 sm:grid-cols-4">
        <Field
          label="Agent classification"
          value={USE_CASE_CONTENT_TYPE_LABELS[intake.detectedContentType]}
        />
        <Field label="Agent recommendation" value={agentRecommendationLabel} />
        <Field
          label="Final template"
          value={getTemplateDefinition(effectiveTemplateId).label}
        />
        <Field
          label="Status"
          value={isOverride ? "User Override" : "Agent Recommended"}
          highlight={isOverride}
        />
      </div>

      {/* Agent layout plan metadata */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-3 sm:grid-cols-4">
        <Field
          label="Target length"
          value={TARGET_LENGTH_LABELS[strategy.targetLength]}
        />
        <Field
          label="Cover density"
          value={COVER_DENSITY_LABELS[layoutPlan.coverDensity]}
        />
        <Field
          label="Pages"
          value={`${strategy.preferredPages} preferred · max ${strategy.maxPages}`}
        />
        <Field
          label="Supporting visual"
          value={VISUAL_PLACEMENT_LABELS[layoutPlan.visualPlacement]}
        />
      </div>

      {isOverride ? (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs italic text-slate-600">
          Showing your selected template — the agent recommended{" "}
          {agentRecommendationLabel}.
        </p>
      ) : (
        intake.templateRecommendation?.rationale && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs italic text-slate-600">
            {intake.templateRecommendation.rationale}
          </p>
        )
      )}

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-amber-800">
          {warnings.map((w, i) => (
            <li key={i} className="flex gap-2">
              <span className="select-none text-amber-500">⚠</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
