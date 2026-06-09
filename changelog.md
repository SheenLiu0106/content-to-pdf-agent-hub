# Interaction Intelligence Audit — Change Log

## 2026-06-08

### BUG-001 — Render-time silent content rewrite (editor↔PDF divergence)

Status: Closed (Approved)

#### Objective

Stop the render pipeline from silently mutating user-confirmed content. The Customer Case
Study render re-normalized to exactly four bullets per section (and the legacy templates
re-asserted caps), which dropped surplus user bullets, injected fabricated/derived filler, and
truncated text — so the downloaded PDF could differ from what the user reviewed.

#### Files Modified

- backend/src/shared/normalizeUseCase.ts
- backend/src/agents/contentToPdfAgent/agent.ts
- backend/src/routes/renderPdf.ts

#### Changes Applied

- Added `validateRenderContent(content, {templateId})` and a typed `RenderValidationError` to
  `normalizeUseCase.ts`. Reuses the existing contract constants (`CASE_STUDY_BULLET_COUNT`,
  `CASE_STUDY_BULLET_CHAR_CAP`, `BULLET_LIMITS`, `BULLET_CHAR_CAP`). No existing logic changed.
- `runRenderAgent` now validates the draft first and throws on any violation; the render-time
  `normalizeCaseStudySummary` / `trimSummaryToLegacyCaps` rewrite was removed; the repair loop
  was restricted to layout-only (runs on a working copy) and the **validated `content` is
  rendered verbatim**.
- `renderPdf.ts` maps `RenderValidationError` to HTTP 422 with a clear, template-aware message
  plus a `violations[]` array. The existing `ErrorBanner` surfaces the message before render.

#### Behavior Before

- Editing bullet counts away from the template contract (or a sparse extraction) caused the
  render to silently rewrite content: drop user bullets, inject filler (incl. a truncated
  mid-sentence fragment), truncate over-length bullets. No PDF preview existed to catch it.

#### Behavior After

- A draft that does not conform is **blocked before render** with a clear, per-section message
  ("Customer Case Study can't be exported yet — Solutions needs exactly 4 bullets (currently 6).").
- A conforming draft renders **verbatim** — no dropped bullets, no injected filler, no
  truncation. (Runtime: conforming render = HTTP 200 with `x-agent-repair-attempts: 0`.)

#### Regression Checks

- [x] Primary flow verified — conforming usecase render → 200, valid 2-page PDF, repair attempts 0.
- [x] Error path verified — non-conforming usecase → 422; legacy over-cap → 422; empty bullet → 422.
- [x] Existing interaction pattern preserved — quality-review/repair contract intact (layout-only); editor-sync `/api/normalize` unchanged; typecheck passes.
- [ ] Human review pending.

#### Review Status

Approved — 2026-06-08. Reviewer: User (manual browser review completed). Confirmed:
non-conforming case-study bullet counts block generation before download; the error identifies
the affected section and required count; user-edited content stays intact after a blocked
attempt; a conforming draft (exactly four non-empty bullets/section) generates successfully; and
the downloaded PDF preserves the user-confirmed wording without silently dropping content,
injecting filler, or truncating text. Issue marked `Approved` then `Closed` in `bug.md`.
Follow-up logged separately as BUG-002 (editor-level template guidance).

---
