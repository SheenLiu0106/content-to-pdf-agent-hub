# Template Architecture

How Content-to-PDF turns one extracted `UseCase` into one of three branded PDF layouts. This document covers the three templates, the registry that defines them, the renderer dispatch that selects one at render time, and the data model they all share.

For how a template gets *recommended and chosen*, see [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) (the agent stages) and [INTERACTION_RULES.md](INTERACTION_RULES.md) (recommendation vs. override vs. effective template). For product scope, see [PRD.md](PRD.md).

---

## Overview

The product ships **three templates**. A template is **HOW** content is presented — distinct from a **Classification / Content Type**, which is **WHAT** the content is (the `detectedContentType`, one of 13 values; see [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md)).

There are three different strings attached to each template, and they are intentionally not equal. The internal `templateId` is a stable code-level slug, the UI label is what the user sees in the gallery, and the `documentLabel` is the eyebrow text printed on the PDF cover.

| `templateId` (internal) | UI label | `documentLabel` (PDF header) | `filenamePrefix` |
|---|---|---|---|
| `usecase` | Customer Case Study | `CUSTOMER CASE STUDY` | `success-story-` |
| `article_report` | Article Report | `ARTICLE REPORT` | `article-report-` |
| `executive_memo` | Executive Memo | `EXECUTIVE MEMO` | `executive-memo-` |

> **Known wart.** The `usecase` slug does not match its `Customer Case Study` label. The slug is kept as-is to avoid regressing the original working case-study flow. Treat `usecase` and "Customer Case Study" as the same thing. This is one instance of the broader terminology overload tracked in [PRD.md](PRD.md#2-terminology-overload).

All three definitions live in one file — `backend/src/shared/templates.ts` — imported by both backend (renderer, agent stages, route validation) and frontend (gallery, page state), so there is a single source of truth.

---

## Concepts

**`templateId`** — the canonical identifier for a template. One of `'usecase' | 'article_report' | 'executive_memo'` (`TEMPLATE_IDS` in `backend/src/shared/templates.ts`). It appears on the strategy, on the recommendation, and as a field on the render config.

**Effective Template** — the single source of truth for preview, export, summary, and PDF. Defined as `userSelectedTemplate ?? agentRecommendedTemplate`, materialized as `config.templateId` on the render request (`PdfRenderConfig.templateId`, `backend/src/shared/useCaseSchema.ts`). The distinction between the **Agent Recommendation** (advisory) and a **User Override** (manual, persists across re-extraction) is owned by the frontend and documented in [INTERACTION_RULES.md](INTERACTION_RULES.md). For template *rendering*, only `config.templateId` matters — everything downstream of the render request reads that one field.

**Template registry** — the `TEMPLATE_DEFINITIONS` array plus the `CONTENT_TYPE_TO_TEMPLATE` map in `backend/src/shared/templates.ts`. The registry answers two questions: "what are the templates and their metadata?" and "given a content type, which template should we recommend?"

**Content-type → template mapping** — `CONTENT_TYPE_TO_TEMPLATE` maps each of the 13 content types onto exactly one `templateId`, grouped by family (case-study / article / memo). This makes the recommendation deterministic for the common case without falling back to raw-text heuristics.

**Renderer dispatch** — at render time, `renderTemplateHtml` (`backend/src/pdf/templateRegistry.ts`) switches on `config.templateId` and calls the matching per-template renderer:

```ts
switch (config.templateId) {
  case "article_report":  return renderArticleReportTemplate(content, config, supporting);
  case "executive_memo":  return renderExecutiveMemoTemplate(content, config, supporting);
  case "usecase":
  default:                return renderUseCaseTemplate(content, config, supporting);
}
```

Note the `default` falls through to the case-study renderer, so an unknown or missing `templateId` degrades safely to `usecase`.

---

## The Three Templates

All three templates draw from the same `UseCase` object (see [Data Model](#data-model)) and the same render-time **Brand Configuration**. They differ in which fields they surface and how they lay out pages.

Two kinds of visuals exist:

- **Supporting Visual** — ONE optional cover/dedicated-page visual (image *or* mermaid). Available to **all three** templates, gated by `supportingVisualEnabled` (and, for mermaid, `mermaidVerified`).
- **Inline Visual** — MULTIPLE in-body images placed within narrative sections. **Article Report ONLY.** Switching the Effective Template away from `article_report` drops inline visuals at render (`agent.ts`); see the data-loss note in [PRD.md](PRD.md#3-inline-visual-data-loss-on-template-switch) and the gating rules in [INTERACTION_RULES.md](INTERACTION_RULES.md#rule-6--preview-export-pdf-and-summary-stay-synchronized).

### Customer Case Study (`usecase`)

- **Purpose.** Tell a challenge → solution → result success story for a specific, named customer or implementation.
- **Audience.** Prospects, sales, marketing — readers evaluating proof of outcomes.
- **Structure (fields used).** `title`, `subtitle`, metadata (`solutionName`, `industry`, `useCaseFocus`), the four GCSR card sets (`goals`, `challenges`, `solutions`, `results`), `narrativeSections`, `pullQuotes`, optional Supporting Visual, `callToAction`.
- **PDF Layout.**
  1. **Cover** — hero image, title/subtitle, metadata block, and the Goals / Challenges / Solutions / Results ("GCSR") cards.
  2. **Narrative pages** — the narrative sections, with pull quotes interleaved.
  3. **Supporting visual page** *(optional)* — dedicated page for the one Supporting Visual.
- **Visuals.** Supporting Visual yes. Inline Visuals **no**.
- **Renderer.** `renderUseCaseTemplate` (`backend/src/pdf/usecaseTemplate.ts`).

### Article Report (`article_report`)

- **Purpose.** Present conceptual, analytical, or editorial content — articles, newsletters, thought leadership — as a polished long-form report.
- **Audience.** General readers; content/marketing teams publishing analytical or editorial pieces.
- **Structure (fields used).** `title`, `subtitle`, `executiveSummary` (rendered as the cover intro), key takeaways, free-form `narrativeSections`, `inlineVisuals`, optional Supporting Visual. **No GCSR cards.**
- **PDF Layout.**
  1. **Cover** — hero image, title, subtitle, intro (the executive summary), and key takeaways.
  2. **Narrative body** — free-form sections with **Inline Visuals** placed inside them (this is the only template that renders inline images).
  3. **Supporting visual page** *(optional)*.
- **Visuals.** Supporting Visual yes. Inline Visuals **yes** (the only template that supports them). The renderer only emits inline blocks whose `kind === 'image'` and `status === 'ready'` (`articleReportTemplate.ts`); LLM `image_slot` recommendations are never rendered as images.
- **Renderer.** `renderArticleReportTemplate` (`backend/src/pdf/articleReportTemplate.ts`).

### Executive Memo (`executive_memo`)

- **Purpose.** Communicate an internal update, recommendation, or decision brief in a structured memo format.
- **Audience.** Internal stakeholders and decision-makers.
- **Structure (fields used).** Brand header/logo, `title`, key points, `narrativeSections` (mapped into memo sections), `callToAction` (as Recommendation / Next Steps), optional Supporting Visual.
- **PDF Layout.**
  1. **Cover** — brand header/logo, title, and key points.
  2. **Background** — the first narrative section.
  3. **Analysis** — the remaining narrative sections.
  4. **Recommendation** and **Next Steps**.
  5. **Supporting visual page** *(optional)*.
- **Visuals.** Supporting Visual yes. Inline Visuals **no**.
- **Renderer.** `renderExecutiveMemoTemplate` (`backend/src/pdf/executiveMemoTemplate.ts`).

---

## Template Registry

The registry is two structures in `backend/src/shared/templates.ts`.

### `TEMPLATE_DEFINITIONS`

An array of `TemplateDefinition` objects, one per template, with these fields:

| Field | Meaning |
|---|---|
| `id` | The `templateId` (`'usecase' \| 'article_report' \| 'executive_memo'`). |
| `label` | UI label shown in the gallery (e.g. "Customer Case Study"). |
| `description` | One-line "best for…" blurb shown in the selector. |
| `documentLabel` | Uppercase eyebrow printed on the PDF cover (e.g. `ARTICLE REPORT`). |
| `filenamePrefix` | Prepended to the slugged title for the download filename (e.g. `article-report-`). |
| `supportedContentTypes` | The content types that map to this template. |

`supportedContentTypes` per template:

- **`usecase`** — `success_story`, `case_study`, `use_case`, `project_summary`, `marketing_brief`
- **`article_report`** — `article`, `general_article`, `thought_leadership`, `newsletter`
- **`executive_memo`** — `executive_memo`, `memo`, `decision_brief`, `meeting_summary`

### `CONTENT_TYPE_TO_TEMPLATE`

A `Record<UseCaseContentType, TemplateId>` mapping all **13** content types onto the **3** templates, grouped by family:

| Family | Content types | → Template |
|---|---|---|
| Case-study | `use_case`, `success_story`, `case_study`, `project_summary`, `marketing_brief` | `usecase` |
| Article | `article`, `general_article`, `thought_leadership`, `newsletter` | `article_report` |
| Memo | `executive_memo`, `memo`, `decision_brief`, `meeting_summary` | `executive_memo` |

Because the record is exhaustive over `UseCaseContentType`, the recommendation is deterministic for every known content type.

### `recommendTemplate(contentType, rawContent?)` — confidence tiers

Returns a `TemplateRecommendation` (`{ templateId, confidence, rationale }`). Three tiers:

| Confidence | When | Result |
|---|---|---|
| **0.85** | Direct hit in `CONTENT_TYPE_TO_TEMPLATE` (the normal path). | The mapped template, with a rationale naming the classified type. |
| **0.65** | Only for an unknown content type, AND the raw text matches **both** an implementation cue (customer/client/deployed/implemented/pilot…) **and** an outcome cue (reduced/increased/improved/achieved…). | `usecase`. |
| **0.55** | Fallback when neither tier applies. | `article_report`. |

Requiring *both* cues (not either) is deliberate: bare "challenge/solution/results" wording appears in ordinary analytical articles and previously mis-classified thought leadership as a case study.

This recommendation is **advisory**. The LLM classification is authoritative for the Agent Recommendation, and a User Override always wins — see [INTERACTION_RULES.md](INTERACTION_RULES.md).

---

## Rendering

Rendering is a fixed pipeline from `config.templateId` to a PDF binary:

1. **Dispatch** — `renderTemplateHtml` (`backend/src/pdf/templateRegistry.ts`) switches on `config.templateId` and calls the matching per-template renderer.
2. **Per-template renderer** — `renderUseCaseTemplate` / `renderArticleReportTemplate` / `renderExecutiveMemoTemplate` build the HTML, pulling Brand Configuration (colors, logo, hero, document label) from `config`.
3. **Shared helpers** — `backend/src/pdf/templateUtils.ts` provides the common pieces: `escapeHtml`, `bullets`, `paragraphs`, `buildCopyrightBlock`, `buildContentPageHeader`, `loadTemplateBundle`, and `applyTemplate`.
4. **HTML/CSS bundles** — each template's markup and styling live under `backend/src/templates/<id>/` as `template.html` + `styles.css` + `meta.json` (one folder per template: `usecase/`, `article_report/`, `executive_memo/`). `loadTemplateBundle` reads them; `applyTemplate` fills the `{{placeholder}}` slots.
5. **PDF generation** — `renderPdf` in `backend/src/pdf/renderer.ts` runs the assembled HTML through **Playwright** to produce the PDF binary returned by `POST /api/render-pdf`.

Supporting Visuals are resolved before rendering and passed in as the `supporting` argument; Inline Visuals are resolved separately (external URLs fetched and embedded as base64) and are only present on the `article_report` path. See the render-path stages in [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md#render-path-postapirender-pdf).

---

## Data Model

Every template renders from one `UseCase` object (`backend/src/shared/useCaseSchema.ts`). The fields:

| Field | Type / notes |
|---|---|
| `title` | string |
| `subtitle` | string \| null |
| `contentType` | one of the 13 `USE_CASE_CONTENT_TYPES` |
| `solutionName`, `industry`, `useCaseFocus` | string \| null (case-study metadata) |
| `goals`, `challenges`, `solutions`, `results` | string arrays (the GCSR card sets) |
| `executiveSummary` | string |
| `narrativeSections` | array of `{ heading, body }` |
| `pullQuotes` | array of `{ quote, attribution }` |
| `mermaidDiagram` | object \| null |
| `callToAction` | string \| null |
| `inlineVisuals` | array of `InlineVisualBlock` (article_report only; defaults to `[]`) |
| `missingFields`, `expansionNotes` | string arrays (agent bookkeeping) |

**Caps are enforced in normalization, not in the schema.** `normalizeUseCase` (`backend/src/shared/normalizeUseCase.ts`) applies the hard caps via word-safe truncation:

| Field | Cap |
|---|---|
| `goals` | ≤ 2 |
| `challenges` | ≤ 2 |
| `solutions` | ≤ 3 |
| `results` | ≤ 3 |
| `narrativeSections` | ≤ 3 |
| `pullQuotes` | ≤ 3 |
| `inlineVisuals` | ≤ 6 |

`InlineVisualBlock` (article-only) carries `id`, `kind` (`'image' | 'image_slot'`), `sourceType`, optional `src`/`dataUrl`/`caption`/`altText`, `sectionIndex`, `placement`, and `status`. Only `kind: 'image'` + `status: 'ready'` blocks are rendered.

---

## Adding a New Template

To introduce a fourth template, touch each layer in order:

1. **Registry definition** — add a `TemplateDefinition` to `TEMPLATE_DEFINITIONS` in `backend/src/shared/templates.ts` (new `id`, `label`, `description`, `documentLabel`, `filenamePrefix`, `supportedContentTypes`) and add the new `id` to `TEMPLATE_IDS`. Mirror the enum in `PdfRenderConfig.templateId` (`backend/src/shared/useCaseSchema.ts`).
2. **Content types & mapping** — if the template introduces new content types, add them to `USE_CASE_CONTENT_TYPES`, then add entries to `CONTENT_TYPE_TO_TEMPLATE` so every content type still maps to exactly one template. Adjust `recommendTemplate` rationale/tiers if needed.
3. **HTML/CSS bundle** — create `backend/src/templates/<new-id>/` with `template.html`, `styles.css`, and `meta.json`.
4. **Renderer** — add `render<NewTemplate>Template(content, config, supporting)` (model it on the existing per-template renderers; reuse `templateUtils.ts` helpers).
5. **Dispatch** — add a `case` for the new `templateId` to the `switch` in `renderTemplateHtml` (`backend/src/pdf/templateRegistry.ts`).
6. **Frontend preview + dispatcher** — add an editable preview component and a corresponding `case` in the preview dispatcher (`EditableUseCasePreview.tsx`) so the Edit step renders it. The new template then appears automatically in the gallery, summary, and decision badges, which read from the shared registry.

When adding a template, decide its visual policy explicitly: every template gets the Supporting Visual; Inline Visuals are currently an Article Report exclusive, and any change to that must be reflected in both the render-time filtering and the frontend gating described in [INTERACTION_RULES.md](INTERACTION_RULES.md).

---

*Related: [PRD.md](PRD.md) · [INTERACTION_RULES.md](INTERACTION_RULES.md) · [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md)*
