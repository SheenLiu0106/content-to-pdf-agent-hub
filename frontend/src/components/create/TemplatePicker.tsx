import { TEMPLATE_DEFINITIONS, type TemplateId } from "../../lib/templates";

interface Props {
  selectedId: TemplateId;
  recommendedId?: TemplateId | null;
  onSelect: (id: TemplateId) => void;
}

/**
 * A compact row of template cards. Same selection semantics as the tall gallery
 * (aria-pressed, one-line description, visible check) in a third of the height.
 */
export default function TemplatePicker({ selectedId, recommendedId, onSelect }: Props) {
  return (
    <div>
      <p className="field-label">Document template</p>
      <div className="template-pick">
        {TEMPLATE_DEFINITIONS.map((t) => {
          const selected = t.id === selectedId;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(t.id)}
              title={t.description}
            >
              {selected && (
                <span className="tick" aria-hidden="true">
                  ✓
                </span>
              )}
              <strong>{t.label}</strong>
              <span>{t.description}</span>
              {recommendedId === t.id && !selected && (
                <span className="mt-1.5 inline-block rounded-full bg-review-tint px-1.5 py-0.5 text-[7.5px] font-bold uppercase tracking-[0.1em] text-review-ink">
                  Agent pick
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
