# Content-to-PDF — Product Requirements Document

> Companion docs: [TEMPLATE_ARCHITECTURE.md](TEMPLATE_ARCHITECTURE.md) · [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md) · [INTERACTION_RULES.md](INTERACTION_RULES.md)

## Product Vision

Content-to-PDF is an AI-assisted content publishing tool that turns raw content — pasted articles, drafts, notes, or web copy — into polished, branded PDF deliverables with minimal manual layout work.

The user pastes text; an agent pipeline classifies it, extracts structure, recommends a presentation format, and renders a print-ready PDF. Branding (logo, colors, company metadata) is layered in at render time so the same content can be reskinned without re-extraction.

**Target outputs today (three Templates):**
- **Customer Case Study** — outcome-driven customer stories with Goals / Challenges / Solutions / Results.
- **Article Report** — long-form articles and thought-leadership pieces with inline visuals.
- **Executive Memo** — decision briefs and meeting summaries structured as Background / Analysis / Recommendation / Next Steps.

**Future outputs:** White Papers, Newsletters, Industry Briefs.

## Core Workflow

The product presents a five-step flow in the UI (`StepBar.tsx`). The logical workflow below has seven conceptual steps; **Template Selection** and **Brand Configuration** both occur *inside* the Edit and Brand phases rather than as standalone StepBar entries.

```
        ┌─────────────────────┐
        │       Paste         │  StepBar: Paste
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │      Extract        │  StepBar: Extract
        │ (8-stage agent run) │
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │       Review        │  StepBar: Edit
        │ (editable preview)  │
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │  Template Selection │  StepBar: Edit
        │  (sidebar gallery)  │  — happens within the Edit phase
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │ Brand Configuration │  StepBar: Brand
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │    Generate PDF     │  StepBar: Generate
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │      Download       │  (PDF binary, templated filename)
        └─────────────────────┘
```

**Step-to-StepBar mapping**

| Logical step | StepBar step | Notes |
| --- | --- | --- |
| Paste | Paste | Raw content, 20–50,000 chars. |
| Extract | Extract | Runs the agent pipeline via `POST /api/extract`. |
| Review | Edit | Inline-editable preview per Template. |
| Template Selection | Edit | Chosen in the right-sidebar `TemplateGallery.tsx`; a manual pick becomes the **User Override**. |
| Brand Configuration | Brand | Logo, colors, document label, hero/supporting visuals. |
| Generate PDF | Generate | `POST /api/render-pdf`. |
| Download | (post-Generate) | Browser download of the returned PDF binary. |

See [INTERACTION_RULES.md](INTERACTION_RULES.md) for the state machine governing how these steps interact (override guard, single source of truth).

## User Goals

- **Marketing** — convert existing website and blog content into branded, downloadable PDFs for campaigns and gated assets.
- **Business Development** — produce customer-facing collateral (Customer Case Studies) that present outcomes credibly without a designer in the loop.
- **Thought Leadership** — turn articles and long-form drafts into professional Article Reports with inline visuals.
- **Internal Teams** — package executive summaries, decision briefs, and meeting notes into clean Executive Memos.

## Current Features

### Paste → Extract pipeline
- `POST /api/extract` (`backend/src/routes/extract.ts`) accepts `{ rawContent: string }` (20–50,000 chars) and returns the full agent result: extracted `content` (UseCase), `intake`, `strategy`, `layoutPlan`, `warnings`, `recommendedTemplate`, and `availableTemplates` (`ExtractAgentResponse`, `backend/src/shared/agentTypes.ts`).
- Error contract: `400` invalid input, `413` too large, `422` unparseable LLM JSON, `502` LLM provider error, `500` internal.

### 8-stage agent pipeline
Orchestrated by `backend/src/agents/contentToPdfAgent/agent.ts`. Stages, in order:
1. **Intake** (`intake.ts`) — content-length sizing and a cheap pre-LLM Classification heuristic (`detectContentTypeHeuristic`), used only if the LLM is unavailable.
2. **Extraction** (`extraction.ts`) — the authoritative LLM call that extracts structure and classifies the content.
3. **Strategy** (`strategy.ts`) — derives target length, cover density, narrative mode, supporting-visual policy.
4. **Content Editor** (`contentEditor.ts`) — repairs orphaned transitions, applies word-budget compression; **never adds facts**.
5. **Layout Planner** (`layoutPlanner.ts`) — picks cover density, visual placement, estimated pages.
6. **Render** (`renderer.ts` via Playwright) — produces the PDF.
7. **Quality Review** (`qualityReview.ts`) — deterministic checks: dangling sentences, sparse pages, summary overflow, missing branding.
8. **Repair loop** (`repair.ts`) — maps issue codes to repair actions; `MAX_REPAIR_ATTEMPTS = 2`, with history tracking to prevent oscillation.

Full stage-by-stage detail lives in [CONTENT_PIPELINE.md](CONTENT_PIPELINE.md).

### Classification into 3 families (13 content types)
The agent classifies content (`detectedContentType`) into one of 13 values across three families:
- **Article family** (default): `article`, `general_article`, `thought_leadership`, `newsletter`.
- **Memo family**: `executive_memo`, `memo`, `decision_brief`, `meeting_summary`.
- **Case-study family** (requires a named customer, a specific challenge, an implemented solution, and a measurable outcome): `use_case`, `success_story`, `case_study`, `project_summary`, `marketing_brief`.

A two-phase approach is used: the intake heuristic is a cheap pre-LLM fallback; the LLM verdict is authoritative for the Agent Recommendation.

### Agent Recommendation with confidence
`recommendTemplate()` (`backend/src/shared/templates.ts`) maps a Classification to a Template (`templateId` + confidence + rationale) — advisory only:
- direct `CONTENT_TYPE_TO_TEMPLATE` map → confidence `0.85`;
- case-study heuristic (implementation cue **and** outcome cue) → `0.65`;
- fallback to `article_report` → `0.55`.

The recommendation is surfaced in `AgentDecisionBadges.tsx` (Classification → Agent Recommendation → Effective Template → override status → rationale).

### 3 Templates
Defined in `TEMPLATE_DEFINITIONS` (`backend/src/shared/templates.ts`); rendered via `renderTemplateHtml` (`backend/src/pdf/templateRegistry.ts`).

| templateId | UI label | PDF documentLabel | filename prefix |
| --- | --- | --- | --- |
| `usecase` | Customer Case Study | `CUSTOMER CASE STUDY` | `success-story-` |
| `article_report` | Article Report | `ARTICLE REPORT` | `article-report-` |
| `executive_memo` | Executive Memo | `EXECUTIVE MEMO` | `executive-memo-` |

Layouts and CSS bundles are documented in [TEMPLATE_ARCHITECTURE.md](TEMPLATE_ARCHITECTURE.md).

### Editable previews per Template
The preview dispatcher `EditableUseCasePreview.tsx` switches on the Effective Template (`config.templateId`) to render `EditableArticleReportPreview`, `EditableExecutiveMemoPreview`, or `EditableCaseStudyPreview`. `EditableNarrativeSections.tsx` is shared by the case-study and memo previews. All previews are inline-editable.

### Supporting Visual (image or mermaid, with verify gate)
ONE optional cover / dedicated-page visual, available to **all** Templates (`SupportingVisualSection.tsx`). When a mermaid diagram is chosen, the user must set `mermaidVerified` in the UI before it embeds in the PDF — a manual verification gate.

### Inline Visuals (Article Report only)
MULTIPLE in-body images placed within article narrative sections, **article_report only** (cap 6 stored, up to 3 LLM `image_slot` recommendations). Detected pre-LLM by `extractInlineVisuals` (`backend/src/shared/extractInlineVisuals.ts`) from `<img>`, markdown `![alt](url)`, and `[Image: …]` / `[Figure: …]` placeholders; real URLs win over LLM slot recommendations during merge. External `src` values are fetched and embedded as base64 at render time by `resolveInlineVisualUrls` (`backend/src/pdf/fetchInlineVisualUrls.ts`), with 5s / 5MB limits; failures are marked `failed` and omitted. Edited via `InlineVisualEditor.tsx`.

### Brand Configuration (render-time)
`PdfRenderConfig` (`backend/src/shared/useCaseSchema.ts`) carries `templateId`, `brandName`, `brandWebsite`, `documentLabel`, `brandCopyright`, `primaryColor`, `accentColor`, `logoDataUrl`, `heroImageDataUrl`, supporting-visual fields, `mermaidVerified`, and `pdfLengthMode`. These are **render-time only** — placeholders are used at extract time.

### Quality review + auto-repair loop (max 2)
Deterministic quality checks feed a bounded repair loop (`MAX_REPAIR_ATTEMPTS = 2`) that re-plans and re-renders. Repair attempts and actions are returned via the `X-Agent-Repair-Attempts` and `X-Agent-Repair-Actions` response headers and shown in `AgentWarningsPanel.tsx`.

### PDF download with templated filename
`POST /api/render-pdf` (`backend/src/routes/renderPdf.ts`) returns a PDF binary with `Content-Disposition` filename `{filenamePrefix}{slug(title)}.pdf`.

### Pluggable LLM providers
The extraction prompt (`backend/src/llm/prompt.ts`) supports pluggable providers: Claude, OpenAI, and Gemini.

## Future Roadmap

- **New output formats**: White Papers, Newsletters, Industry Briefs (each a new Template with its own bundle + supported content types).
- **Brand presets / persistence**: saved brand profiles so Brand Configuration is not re-entered per render (see Architecture Review issue 5).
- **Richer inline-visual support across Templates**: extend Inline Visuals beyond `article_report`, or define explicit content-preservation rules on Template switch (see issue 3).
- **Multi-page length modes**: expand `pdfLengthMode` beyond `compact-2-page` / `standard` for longer, paginated documents.
- **Brand-at-extract representation**: surface branding earlier in the pipeline so previews reflect final styling sooner.
- **Mermaid authoring UX**: a first-class diagram editor/preview replacing the implicit verify gate (see issue 6).

## Architecture Review

For each known issue: **Observation**, **Why it matters**, **Recommendation** (non-binding), **Priority**.

### 1. Legacy `usecase` slug
- **Observation:** The Template id `usecase` is inconsistent with its `Customer Case Study` UI label and `CUSTOMER CASE STUDY` document label; its filename prefix is `success-story-`.
- **Why it matters:** Readers and developers must mentally translate `usecase` ↔ "Customer Case Study" ↔ "success story," inviting wiring mistakes.
- **Recommendation:** Either rename the id to `case_study` (with a migration alias) or document the mapping prominently and freeze the slug as a known legacy value.
- **Priority:** Low.

### 2. Terminology overload
- **Observation:** `classification` / `contentType` / `detectedContentType` and `template` / `templateId` / `category` / `type` are used loosely across UI and code.
- **Why it matters:** Ambiguity between *what the content is* (Classification) and *how it's presented* (Template) leads to misread state and conflated fields.
- **Recommendation:** Adopt the shared terminology contract (Classification, Agent Recommendation, User Override, Effective Template, Template) consistently in code identifiers, comments, and UI copy.
- **Priority:** Medium.

### 3. Inline-visual data loss on Template switch
- **Observation:** Inline Visuals are `article_report`-only. Switching away from `article_report` silently drops `content.inlineVisuals` — the agent clears them at render (`agent.ts`) and the frontend gates on `templateId === 'article_report'`.
- **Why it matters:** Silent content loss conflicts with the "no conflicting states" rule and surprises users who switch Templates expecting to switch back.
- **Recommendation:** Preserve `inlineVisuals` in state when off `article_report` and warn the user that they are hidden (not deleted), restoring them on switch-back.
- **Priority:** High.

### 4. Strategy divergence
- **Observation:** Render-time re-derivation of Strategy can differ from the extract-time Agent Recommendation; `recommendedTemplate` vs `strategy.templateId` are reconciled only via `??` fallback.
- **Why it matters:** Two independently computed sources of "intended Template" can disagree, making the Effective Template harder to reason about and audit.
- **Recommendation:** Compute Strategy once and thread it through, or make the Effective Template the explicit input to render-time Strategy rather than recomputing classification-driven defaults.
- **Priority:** Medium.

### 5. No brand persistence (missing product decision)
- **Observation:** Brand Configuration lives only on the render request; there is no extract-time representation and no saved brand presets.
- **Why it matters:** Users re-enter branding for every document, and previews cannot reflect final branding until Generate.
- **Recommendation:** Introduce saved brand presets and an early/default brand representation; treat this as a product decision to be made (scope, storage, per-user vs per-org).
- **Priority:** Medium.

### 6. Mermaid manual gate
- **Observation:** `mermaidVerified` must be set in the UI before a diagram embeds, but this UX rule is currently implicit and undocumented.
- **Why it matters:** Users may expect a diagram to appear automatically and be confused when it is omitted from the PDF.
- **Recommendation:** Document the gate explicitly in [INTERACTION_RULES.md](INTERACTION_RULES.md) and add clear in-UI affordance ("Verify diagram to include in PDF").
- **Priority:** Low.

### Healthy invariants (confirmed)
- **Single source of truth:** `config.templateId` (the Effective Template) drives preview, export, summary, and PDF with no verified divergence (`frontend/src/pages/ContentToPdfPage.tsx`).
- **Override guard:** On extract, the agent applies its recommendation to `config` **only if** no `userSelectedTemplate` is set — the agent never overwrites a manual User Override, which persists across re-extraction.
