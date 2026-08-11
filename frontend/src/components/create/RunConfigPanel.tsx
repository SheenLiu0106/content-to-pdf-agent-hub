import { useId } from "react";
import type { PdfRenderConfig } from "@shared/useCaseSchema";

import BrandSettingsPanel from "../BrandSettingsPanel";
import HeroImageUpload from "../HeroImageUpload";
import LogoUpload from "../LogoUpload";
import TemplatePicker from "./TemplatePicker";
import { getTemplateDefinition, type TemplateId } from "../../lib/templates";
import {
  APPROVAL_MODE_LABELS,
  REVIEW_POLICY_LABELS,
  type ApprovalMode,
  type ReviewPolicy,
} from "../../lib/runTypes";
import type { SourceMode } from "./SourceCard";

interface Props {
  mode: SourceMode;
  config: PdfRenderConfig;
  onConfigChange: (next: PdfRenderConfig) => void;
  onTemplateChange: (id: TemplateId) => void;
  recommendedTemplateId?: TemplateId | null;
  runName: string;
  onRunNameChange: (next: string) => void;
  reviewPolicy: ReviewPolicy;
  onReviewPolicyChange: (next: ReviewPolicy) => void;
  approvalMode: ApprovalMode;
  onApprovalModeChange: (next: ApprovalMode) => void;
  disabled: boolean;
}

const Chevron = (
  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
    <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function RunConfigPanel({
  mode,
  config,
  onConfigChange,
  onTemplateChange,
  recommendedTemplateId,
  runName,
  onRunNameChange,
  reviewPolicy,
  onReviewPolicyChange,
  approvalMode,
  onApprovalModeChange,
  disabled,
}: Props) {
  const ids = useId();

  // What the collapsed Brand header reports, so the reviewer never has to open it
  // just to find out what is configured.
  const brandSummary = [
    config.logoDataUrl ? "Logo added" : "No logo",
    config.heroImageDataUrl ? "Hero image added" : "Hero image missing",
  ].join(" · ");

  return (
    <div>
      {/* ------------------------------- output ------------------------------ */}
      <details className="config-group" open>
        <summary>
          {Chevron}
          <h3>Output</h3>
          <span className="config-sum">{getTemplateDefinition(config.templateId).label}</span>
        </summary>
        <div className="config-body">
          <TemplatePicker
            selectedId={config.templateId}
            recommendedId={recommendedTemplateId}
            onSelect={onTemplateChange}
          />

          <div>
            <label className="field-label" htmlFor={`${ids}-name`}>
              {mode === "batch" ? "Batch name" : "Run name"}
              <span className="ml-1 font-normal text-ink-faint">(optional)</span>
            </label>
            <input
              id={`${ids}-name`}
              type="text"
              className="field-input"
              value={runName}
              maxLength={200}
              disabled={disabled}
              placeholder={mode === "batch" ? "Q3 customer stories" : "Untitled document"}
              onChange={(e) => onRunNameChange(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor={`${ids}-label`}>
              Output goal
            </label>
            <input
              id={`${ids}-label`}
              type="text"
              className="field-input"
              value={config.documentLabel}
              disabled={disabled}
              placeholder="CUSTOMER CASE STUDY"
              onChange={(e) => onConfigChange({ ...config, documentLabel: e.target.value })}
            />
            <p className="mt-1 text-[8.5px] leading-relaxed text-ink-mute">
              Printed as the document label on the cover.
            </p>
          </div>
        </div>
      </details>

      {/* ------------------------------- brand ------------------------------- */}
      <details className="config-group">
        <summary>
          {Chevron}
          <h3>Brand and assets</h3>
          <span className="config-sum">
            {config.brandName || "No brand name"}
            <br />
            <span className="swatch" style={{ background: config.primaryColor }} aria-hidden="true" />{" "}
            {config.primaryColor} ·{" "}
            <span className="swatch" style={{ background: config.accentColor }} aria-hidden="true" />{" "}
            {config.accentColor}
            <br />
            {brandSummary}
          </span>
        </summary>
        <div className="config-body">
          <BrandSettingsPanel config={config} onChange={onConfigChange} embedded />
          <div className="flex flex-col gap-2.5 border-t border-hair-soft pt-3">
            <LogoUpload
              value={config.logoDataUrl}
              onChange={(v) => onConfigChange({ ...config, logoDataUrl: v })}
            />
            <HeroImageUpload
              value={config.heroImageDataUrl}
              onChange={(v) => onConfigChange({ ...config, heroImageDataUrl: v })}
            />
          </div>
        </div>
      </details>

      {/* --------------------------- agent behaviour ------------------------- */}
      <details className="config-group">
        <summary>
          {Chevron}
          <h3>Agent behaviour</h3>
          <span className="config-sum">
            {REVIEW_POLICY_LABELS[reviewPolicy]}
            <br />
            {APPROVAL_MODE_LABELS[approvalMode]}
          </span>
        </summary>
        <div className="config-body">
          <div>
            <label className="field-label" htmlFor={`${ids}-review`}>
              Review policy
            </label>
            <select
              id={`${ids}-review`}
              className="field-input"
              value={reviewPolicy}
              disabled={disabled || mode === "single"}
              onChange={(e) => onReviewPolicyChange(e.target.value as ReviewPolicy)}
            >
              {Object.entries(REVIEW_POLICY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor={`${ids}-approval`}>
              Approval mode
            </label>
            <select
              id={`${ids}-approval`}
              className="field-input"
              value={approvalMode}
              disabled={disabled || mode === "single"}
              onChange={(e) => onApprovalModeChange(e.target.value as ApprovalMode)}
            >
              <option value="required">{APPROVAL_MODE_LABELS.required}</option>
              {/* Accepted and persisted by the API, but the server refuses to act on
                  it until rendered-output QA exists — so it is visibly unavailable. */}
              <option value="auto_if_clean" disabled>
                {APPROVAL_MODE_LABELS.auto_if_clean} — unavailable
              </option>
            </select>
          </div>

          {/* The scope itself is stated once, by AgentScope above this panel. */}
          <p className="text-[8.5px] leading-relaxed text-ink-mute">
            {mode === "single"
              ? "A single document skips the durable gates — you review the draft directly on the next screen, so these two settings apply to batch runs only."
              : "A blocking finding always sends a run to the review gate, whatever the policy. The Agent scope above reflects whatever you choose here."}
          </p>
        </div>
      </details>
    </div>
  );
}
