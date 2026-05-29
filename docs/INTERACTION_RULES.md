# Interaction Rules

The UX contract for Content-to-PDF. These rules govern how the agent's decisions and the user's choices interact — who owns which state, what may change automatically, and what must never be overwritten. **This is the most important document for future development:** when in doubt about UI behavior, this file is the source of truth.

Companion docs: [PRD.md](PRD.md) · [TEMPLATE_ARCHITECTURE.md](TEMPLATE_ARCHITECTURE.md) · [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md)

---

## Terminology

> These terms are used precisely throughout the docs and should be used precisely in code identifiers, comments, and UI copy.
>
> - **Classification / Content Type** — *what the content is*. The `detectedContentType`, one of 13 values across 3 families (article / memo / case-study).
> - **Agent Recommendation** — the agent's advisory mapping from a Classification to a Template (`templateId` + confidence + rationale). Advisory only.
> - **User Override** — a manual Template choice (`userSelectedTemplate`) made by the user. Persists across re-extraction.
> - **Effective Template** — `userSelectedTemplate ?? agentRecommendedTemplate`, materialized as `config.templateId`. The single source of truth for preview, export, summary, and PDF.
> - **Template** — *how the content is presented*. One of `usecase` (Customer Case Study), `article_report` (Article Report), `executive_memo` (Executive Memo).
> - **Brand Configuration** — render-time `PdfRenderConfig` fields: `brandName`, `brandWebsite`, `documentLabel`, `brandCopyright`, `primaryColor`, `accentColor`, `logoDataUrl`, `heroImageDataUrl`.

State ownership lives in `frontend/src/pages/ContentToPdfPage.tsx`: `config` (holds `templateId`, the Effective Template), `recommendedTemplate` (the Agent Recommendation), and `userSelectedTemplate` (the User Override).

---

## Rule 1 — Agent recommendations are advisory; the user always has final control

The agent computes a recommended Template, but it is never binding. The user can pick any Template at any time from the sidebar gallery (`TemplateGallery.tsx`), and that choice takes effect immediately.

- The Agent Recommendation is stored separately from the user's choice (`recommendedTemplate` vs. `userSelectedTemplate` in `ContentToPdfPage.tsx`).
- A manual pick flows through `handleTemplateChange`, which sets `userSelectedTemplate` and updates `config.templateId` — no confirmation, no agent veto.

**Implication for development:** never make a UI affordance that blocks or reverts a manual Template choice on the agent's behalf.

---

## Rule 2 — Classification and Template Selection are separate concepts

The Classification describes *what the content is*; the Template describes *how it is presented*. They are related by the Agent Recommendation, but they are not the same field and need not agree.

> **Valid example:** Classification = `general_article`, Effective Template = `usecase` (Customer Case Study). The user is free to publish an article as a case study.

- Classification lives on the extracted content (`detectedContentType`); the Template lives on `config.templateId`.
- When they diverge because of a manual pick, the UI flags it as a **User Override** (`isTemplateOverride` in `ContentToPdfPage.tsx`), but the divergence itself is legitimate, not an error.

**Implication for development:** never collapse Classification and Template into one control, and never auto-"correct" a Template to match the Classification.

---

## Rule 3 — Decision hierarchy

State resolves top-to-bottom; each lower layer can override the one above:

```
Agent Classification        (detectedContentType — what the content is)
        ↓
Agent Recommendation        (recommendTemplate() → advisory templateId + confidence)
        ↓
User Override               (userSelectedTemplate — manual, persists)
        ↓
Effective Template          (config.templateId — drives every surface)
```

- Classification → Recommendation is computed by `recommendTemplate()` (`backend/src/shared/templates.ts`); at extract time the frontend also falls back to `strategy?.templateId` when no explicit recommendation object is present.
- Recommendation → Effective Template is gated by the presence of a User Override (see Rule 4).

---

## Rule 4 — Never overwrite a manual user Template selection

The Agent Recommendation may update on every extraction; a **User Override persists**. Re-extracting content must not clobber a Template the user chose.

This is enforced by the override guard in `ContentToPdfPage.tsx` (≈ lines 172–178): after an extraction, the agent's recommendation is applied to `config.templateId` **only if** no manual override exists:

```ts
if (!userSelectedTemplate) {
  // apply the agent's recommended template to config
}
```

- Once `userSelectedTemplate` is set, subsequent extractions update `recommendedTemplate` (and the "Recommended" badge) but leave `config.templateId` alone.
- The only way to clear a User Override is an explicit user action.

**Implication for development:** any new flow that re-runs extraction (e.g. re-paste, re-edit) must preserve `userSelectedTemplate` and route through the same guard.

---

## Rule 5 — All rendering surfaces use the Effective Template

```
effectiveTemplate = userSelectedTemplate ?? agentRecommendedTemplate
                  = config.templateId
```

`config.templateId` is the one field every rendering surface reads:

- **Preview** — `EditableUseCasePreview.tsx` switches on `config.templateId` to render the case-study, article-report, or executive-memo preview.
- **Export / Summary** — `ExportSummaryPanel.tsx` shows `getTemplateDefinition(config.templateId).label`.
- **PDF** — the render request sends `config` (including `templateId`) to `POST /api/render-pdf`, where `renderTemplateHtml` dispatches on it (see [TEMPLATE_ARCHITECTURE.md](TEMPLATE_ARCHITECTURE.md#concepts)).

**Implication for development:** never read a Template from `recommendedTemplate`, `userSelectedTemplate`, or `strategy.templateId` for *rendering*. Those feed the *decision*; `config.templateId` is the *result*.

---

## Rule 6 — Preview, Export, PDF generation, and Summary stay synchronized

Because all four surfaces derive from the single `config.templateId` (Rule 5), they cannot show conflicting Templates. Changing the Template instantly rebinds the preview form, the summary label, and the PDF that will be generated. **No conflicting states.**

> ⚠️ **Known divergence — inline-visual data loss.** Inline Visuals are `article_report`-only. Switching the Effective Template *away* from `article_report` silently drops `content.inlineVisuals` (cleared at render in `agent.ts`, gated in the frontend on `templateId === 'article_report'`) with no warning. This is the one place current behavior violates "no conflicting states." Tracked as a **High**-priority issue in [PRD.md](PRD.md#3-inline-visual-data-loss-on-template-switch); the intended fix is to preserve the visuals in state and warn rather than delete.

**Implication for development:** when adding a surface that reflects the Template, derive it from `config.templateId`. When adding Template-specific content (like inline visuals), preserve it across switches and surface a warning rather than discarding silently.

---

## Rule 7 — Agent reasoning stays visible

The user should always be able to see what the AI detected, what it recommended, and what was ultimately selected — the full chain from Rule 3.

- `AgentDecisionBadges.tsx` surfaces the chain: **Classification → Agent Recommendation → Effective Template → override status → rationale**.
- `AgentWarningsPanel.tsx` surfaces extraction warnings, the repair attempt count and actions (from the `X-Agent-Repair-Attempts` / `X-Agent-Repair-Actions` response headers), and, for `article_report`, unresolved inline image slots.

**Implication for development:** new agent decisions (new stages, new heuristics) should expose their reasoning through these panels rather than acting invisibly. The **mermaid verify gate** (`mermaidVerified`) is an example of an agent/UX decision that is currently *implicit* — see the **Low**-priority issue in [PRD.md](PRD.md#6-mermaid-manual-gate) — and should be made visible per this rule.

---

*Related: [PRD.md](PRD.md) · [TEMPLATE_ARCHITECTURE.md](TEMPLATE_ARCHITECTURE.md) · [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md)*
