import type { Content } from "@shared/schema";
import ContentTypeTag from "./ContentTypeTag";
import SectionCard from "./SectionCard";

const CORE_FIELDS = ["title", "executiveSummary", "keyPoints", "mainContentSections"];

function isMissing(content: Content, field: string): boolean {
  return content.missingFields.includes(field);
}

export default function ExtractionPreview({ content }: { content: Content }) {
  const missingCore = CORE_FIELDS.filter((f) => isMissing(content, f));

  return (
    <div className="flex flex-col gap-5">
      {/* Title block */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {content.title || <span className="italic text-slate-400">Untitled</span>}
          </h2>
          <ContentTypeTag type={content.contentType} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
          {content.authorOrSource && (
            <span>
              <span className="font-semibold text-slate-700">Source:</span> {content.authorOrSource}
            </span>
          )}
          {content.audience && (
            <span>
              <span className="font-semibold text-slate-700">Audience:</span> {content.audience}
            </span>
          )}
        </div>
      </div>

      {/* Banner for missing core fields */}
      {missingCore.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Heads up:</span> AI couldn&rsquo;t confidently extract{" "}
          {missingCore.join(", ")}. You can still generate the PDF — review before sending.
        </div>
      )}

      {/* Executive Summary */}
      <SectionCard title="Executive Summary" field="executiveSummary" missing={isMissing(content, "executiveSummary")}>
        <p>{content.executiveSummary}</p>
      </SectionCard>

      {/* Key Points */}
      <SectionCard title="Key Points" field="keyPoints" missing={isMissing(content, "keyPoints")}>
        <ul className="list-disc space-y-1 pl-5">
          {content.keyPoints.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </SectionCard>

      {/* Background */}
      {(content.background || isMissing(content, "background")) && (
        <SectionCard title="Background" field="background" missing={isMissing(content, "background")}>
          <p className="whitespace-pre-line">{content.background}</p>
        </SectionCard>
      )}

      {/* Main Sections */}
      <SectionCard title="Main Sections" field="mainContentSections" missing={isMissing(content, "mainContentSections")}>
        <div className="space-y-4">
          {content.mainContentSections.map((s, i) => (
            <div key={i}>
              <h4 className="mb-1 text-base font-semibold text-slate-900">{s.heading}</h4>
              <p className="whitespace-pre-line">{s.body}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Recommendations */}
      <SectionCard title="Recommendations" field="recommendations" missing={isMissing(content, "recommendations")}>
        <ul className="list-disc space-y-1 pl-5">
          {content.recommendations.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </SectionCard>

      {/* Next Steps */}
      <SectionCard title="Next Steps" field="nextSteps" missing={isMissing(content, "nextSteps")}>
        <ul className="list-disc space-y-1 pl-5">
          {content.nextSteps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </SectionCard>

      {/* Supporting Evidence */}
      {(content.supportingEvidence.length > 0 || isMissing(content, "supportingEvidence")) && (
        <SectionCard
          title="Supporting Evidence"
          field="supportingEvidence"
          missing={isMissing(content, "supportingEvidence")}
        >
          <ul className="list-disc space-y-1 pl-5 italic text-slate-600">
            {content.supportingEvidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Call to Action */}
      {(content.callToAction || isMissing(content, "callToAction")) && (
        <SectionCard title="Call to Action" field="callToAction" missing={isMissing(content, "callToAction")}>
          <p className="rounded-md bg-amber-50 px-3 py-2 font-medium text-amber-900">{content.callToAction}</p>
        </SectionCard>
      )}
    </div>
  );
}
