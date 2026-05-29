# Content Pipeline

How raw pasted text becomes a branded PDF. This document traces the extraction-to-render pipeline, the API contracts, the agent decision types, and how Classification, Agent Recommendation, Brand Configuration, and visuals flow through the system.

Companion docs: [PRD.md](PRD.md) · [TEMPLATE_ARCHITECTURE.md](TEMPLATE_ARCHITECTURE.md) · [INTERACTION_RULES.md](INTERACTION_RULES.md)

---

## Overview

```
   Input Content            raw pasted text (20–50,000 chars)
        │
        ▼
   Classification           what the content IS (detectedContentType, 13 types / 3 families)
        │
        ▼
   Metadata Extraction      structured UseCase: GCSR, narrative, summary, metadata, visuals
        │
        ▼
   Template Recommendation  advisory templateId + confidence + rationale
        │
        ▼
   Brand Layer              render-time PdfRenderConfig (logo, colors, labels, hero)
        │
        ▼
   PDF Generation           per-template HTML → Playwright → PDF binary
```

The pipeline spans two API calls: **`POST /api/extract`** (everything down to the recommendation) and **`POST /api/render-pdf`** (Brand Layer + generation). In between, the user reviews, edits, and chooses a Template in the UI — see [INTERACTION_RULES.md](INTERACTION_RULES.md).

The terms **Classification / Content Type**, **Agent Recommendation**, **User Override**, **Effective Template**, **Template**, **Supporting Visual**, **Inline Visual**, and **Brand Configuration** are defined in the [INTERACTION_RULES glossary](INTERACTION_RULES.md#terminology).

---

## Stage-by-stage

The pipeline is orchestrated by `backend/src/agents/contentToPdfAgent/agent.ts`. The eight stages run across two phases: the **extract path** (stages 1–5, plus content editing) and the **render path** (stages re-run + 6–8).

| # | Stage | File | Input → Output |
|---|---|---|---|
| 1 | **Intake** | `intake.ts` (`runIntake`) | raw text → `IntakeAssessment` (length bucket, cheap pre-LLM Classification heuristic, risk signals). Heuristic is a fallback used only when the LLM is unavailable. |
| 2 | **Extraction** | `extraction.ts` (`runExtraction`) | cleaned text → `UseCase`. The **authoritative** LLM call: extracts structure and sets `detectedContentType`. Prompt: `backend/src/llm/prompt.ts`. |
| 3 | **Strategy** | `strategy.ts` (`runStrategy`) | intake + content → `DocumentStrategy` (target length, cover density, narrative mode, supporting-visual policy, `templateId`). |
| 4 | **Content Editor** | `contentEditor.ts` (`runContentEditor`) | `UseCase` → edited `UseCase`. Repairs orphaned transition words, applies word-budget compression. **Never adds facts.** |
| 5 | **Layout Planner** | `layoutPlanner.ts` (`runLayoutPlanner`) | edited content + config + strategy → `LayoutPlan` (cover density, visual placement, estimated pages). |
| 6 | **Render** | `renderer.ts` (`renderPdf`, via Playwright) | content + config → PDF binary. Dispatches via `renderTemplateHtml` (see [TEMPLATE_ARCHITECTURE.md](TEMPLATE_ARCHITECTURE.md#rendering)). |
| 7 | **Quality Review** | `qualityReview.ts` (`runQualityReview`) | rendered output → `PdfQualityReport`. Deterministic checks: dangling sentences, sparse pages, summary overflow, missing branding. |
| 8 | **Repair loop** | `repair.ts` (`planRepair`) | quality report → repair actions, re-plan, re-render. `MAX_REPAIR_ATTEMPTS = 2`, with history tracking to prevent oscillation. |

### Extract path (`POST /api/extract`)

1. **Inline-visual preprocessing** — `extractInlineVisuals` strips `<img>`, markdown `![alt](url)`, and `[Image: …]` / `[Figure: …]` placeholders out of the text *before* the LLM sees it, preserving URLs + placement hints.
2. **Intake** (stage 1).
3. **Extraction** (stage 2) — the LLM's `detectedContentType` is authoritative.
4. **Sync recommendation** — the LLM's Content Type is mapped to a Template via `recommendTemplate()`, overriding the intake heuristic's guess.
5. **Visual merge / normalize** — preprocessor-detected URLs merge with LLM `image_slot` recommendations (real URLs win), assigned to the nearest narrative section, capped at 6.
6. **Content Editor** (stage 4).
7. **Strategy** (stage 3) and **Layout Planner** (stage 5) run to populate the response.

### Render path (`POST /api/render-pdf`)

1. **Filter inline visuals** — cleared unless the Effective Template is `article_report`.
2. **Resolve external image URLs** — `resolveInlineVisualUrls` (`fetchInlineVisualUrls.ts`) fetches `src` URLs and embeds them as base64 (5s / 5MB limits); failures are marked `failed` and omitted.
3. **Re-derive Strategy** and **re-plan Layout** against the edited content and actual config.
4. **Quality Review + Repair loop** (stages 7–8, ≤ 2 attempts).
5. **Render** (stage 6) → PDF binary.

> The render-time re-derivation of Strategy can diverge from the extract-time Agent Recommendation; they are reconciled only via a `??` fallback. Tracked as a **Medium**-priority issue in [PRD.md](PRD.md#4-strategy-divergence).

---

## API Contracts

### `POST /api/extract`

Route: `backend/src/routes/extract.ts`.

**Request** (`ExtractRequestSchema`):

```jsonc
{ "rawContent": "string (20–50,000 chars)" }
```

**Response** (`ExtractAgentResponse`, `backend/src/shared/agentTypes.ts`):

| Field | Meaning |
|---|---|
| `content` | The extracted, edited `UseCase` (ready for inline editing). |
| `intake` | `IntakeAssessment` — Classification + length + risks. |
| `strategy` | `DocumentStrategy` — derived document plan. |
| `layoutPlan` | `LayoutPlan` — cover density, visual placement, estimated pages. |
| `warnings` | `string[]` — risk signals surfaced in `AgentWarningsPanel.tsx`. |
| `recommendedTemplate` | The Agent Recommendation (`TemplateDefinition`). |
| `availableTemplates` | All three template definitions for the gallery. |

**Errors:** `400` invalid input · `413` payload too large · `422` unparseable LLM JSON · `502` LLM provider error · `500` internal.

### `POST /api/render-pdf`

Route: `backend/src/routes/renderPdf.ts`.

**Request** (`RenderPdfRequestSchema`):

```jsonc
{ "content": { /* UseCase */ }, "config": { /* PdfRenderConfig */ } }
```

**Response:** PDF binary, `Content-Type: application/pdf`, `Content-Disposition` filename `{filenamePrefix}{slug(title)}.pdf`. Repair telemetry rides on headers:

- `X-Agent-Repair-Attempts` — number of repair iterations (0–2).
- `X-Agent-Repair-Actions` — comma-separated action types (`none` if no repairs).

The frontend API layer (`frontend/src/lib/api.ts`) wraps both calls.

---

## Agent decision types

Defined in `backend/src/shared/agentTypes.ts`.

**`IntakeAssessment`** — `contentLength` (`short` | `medium` | `long`), `detectedContentType`, `confidence`, `missingFields`, `recommendedTemplate`, `templateRecommendation` (`{ templateId, confidence, rationale }`), `risks`.

**`DocumentStrategy`** — `templateId`, `targetLength`, `coverDensity`, `narrativeMode`, `supportingVisualPolicy`, `reviewRequired`.

**`LayoutPlan`** — `coverDensity` (`compact` | `normal` | `spacious`), `visualPlacement` (`omit` | `inline` | `dedicated`), `estimatedPages`, `notes`.

**`PdfQualityReport`** — issue codes from the deterministic checks; the repair stage maps issue codes to a `RepairAction[]`.

---

## Classification detail

Classification answers *what the content is* (`detectedContentType`), one of **13 content types** across **3 families**:

- **Article family** (default): `article`, `general_article`, `thought_leadership`, `newsletter`.
- **Memo family**: `executive_memo`, `memo`, `decision_brief`, `meeting_summary`.
- **Case-study family** (requires a named customer, a specific challenge, an implemented solution, **and** a measurable outcome): `use_case`, `success_story`, `case_study`, `project_summary`, `marketing_brief`.

Classification is **two-phase**:

1. **Intake heuristic** (`detectContentTypeHeuristic` in `intake.ts`) — cheap, regex/cue-based, runs pre-LLM. Used only as a fallback if the LLM is unavailable.
2. **LLM verdict** (stage 2) — **authoritative**. Drives the Agent Recommendation. The prompt is explicit that bare mentions of "solution / results / use case" are *not* sufficient for the case-study family (conceptual articles use those words too); the fallback Classification is `general_article`.

---

## Template Recommendation

`recommendTemplate(contentType, rawContent?)` (`backend/src/shared/templates.ts`) maps a Classification to an advisory Template with a confidence tier:

| Confidence | When |
|---|---|
| **0.85** | Direct hit in `CONTENT_TYPE_TO_TEMPLATE` (normal path). |
| **0.65** | Unknown content type, but raw text has **both** an implementation cue and an outcome cue → `usecase`. |
| **0.55** | Fallback → `article_report`. |

The recommendation is advisory; the **User Override** wins, and the **Effective Template** (`config.templateId`) is what renders. See the decision hierarchy in [INTERACTION_RULES.md](INTERACTION_RULES.md#rule-3--decision-hierarchy) and the registry detail in [TEMPLATE_ARCHITECTURE.md](TEMPLATE_ARCHITECTURE.md#recommendtemplatecontenttype-rawcontent--confidence-tiers).

---

## Brand Layer

**Brand Configuration is render-time only.** The `PdfRenderConfig` (`backend/src/shared/useCaseSchema.ts`) carries:

- Identity: `brandName`, `brandWebsite`, `documentLabel`, `brandCopyright`.
- Style: `primaryColor` (default `#0F172A`), `accentColor` (default `#06B6D4`).
- Assets: `logoDataUrl`, `heroImageDataUrl` (base64 data URLs).
- Template + layout: `templateId` (the Effective Template), `pdfLengthMode` (`compact-2-page` | `standard`).
- Visuals: `supportingVisualEnabled`, `supportingVisualType`, `supportingImageDataUrl`, `supportingImageCaption`, `mermaidVerified`.

At extract time the agent uses placeholder brand values; the user-supplied config is applied only at render. There is currently no persistence of brand profiles — tracked as a **Medium**-priority issue in [PRD.md](PRD.md#5-no-brand-persistence-missing-product-decision).

---

## Inline & Supporting Visuals

**Supporting Visual** — ONE optional cover/dedicated-page visual (image *or* mermaid), available to **all** templates. A mermaid diagram only embeds when the user sets `mermaidVerified` in the UI (the verify gate; see the **Low**-priority issue in [PRD.md](PRD.md#6-mermaid-manual-gate)).

**Inline Visual** — MULTIPLE in-body images, **`article_report` only**. Lifecycle:

1. **Preprocess** — `extractInlineVisuals` (`backend/src/shared/extractInlineVisuals.ts`) detects images in the raw text before the LLM call.
2. **Merge** — preprocessor-detected real URLs win over LLM `image_slot` recommendations.
3. **Assign** — each visual is attached to its nearest narrative section.
4. **Resolve at render** — `resolveInlineVisualUrls` (`backend/src/pdf/fetchInlineVisualUrls.ts`) fetches external URLs and embeds them as base64 (5s / 5MB); failures are marked `failed` and omitted. Only `kind: 'image'` + `status: 'ready'` blocks render.

> Switching the Effective Template away from `article_report` silently drops `content.inlineVisuals` — a **High**-priority issue ([PRD.md](PRD.md#3-inline-visual-data-loss-on-template-switch)) and the one documented violation of [Rule 6](INTERACTION_RULES.md#rule-6--preview-export-pdf-and-summary-stay-synchronized).

---

## Quality Review & Repair loop

After rendering, **Quality Review** (`qualityReview.ts`) runs deterministic checks — dangling sentences, sparse pages, summary overflow, missing branding — and emits a `PdfQualityReport` with issue codes. The **Repair loop** (`repair.ts`) maps each code to a `RepairAction`, applies the fixes, re-plans layout, and re-renders, up to `MAX_REPAIR_ATTEMPTS = 2`. History tracking prevents the loop from oscillating between two states. The outcome is reported back via the `X-Agent-Repair-Attempts` / `X-Agent-Repair-Actions` headers and shown in `AgentWarningsPanel.tsx` ([Rule 7](INTERACTION_RULES.md#rule-7--agent-reasoning-stays-visible)).

---

*Related: [PRD.md](PRD.md) · [TEMPLATE_ARCHITECTURE.md](TEMPLATE_ARCHITECTURE.md) · [INTERACTION_RULES.md](INTERACTION_RULES.md)*
