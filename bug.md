# Interaction Intelligence Audit — Bug Tracker

> Target: content-to-pdf (`/Users/sheen/Repos/content-to-pdf`)
> Records live in the TARGET repo, never in the audit skill repo.
> Audit framework: interaction-intelligence-audit v0.4.0
> Source: https://github.com/SheenLiu0106/interaction-intelligence-audit
> Audit Profile: MVP · Modes run: E (static) → D (runtime-assisted) → B (persistent remediation)

## Summary

Last Updated: 2026-06-08 23:10

| Status | Count |
|---|---:|
| Open | 1 |
| In Progress | 0 |
| Fixed — Awaiting Human Review | 0 |
| Needs Revision | 0 |
| Approved | 0 |
| Closed | 1 |
| Deferred | 0 |

---

## BUG-001 — Render-time silent content rewrite (editor↔PDF divergence)

Status: Closed (Approved)
Severity: Critical
Category: Data Integrity / AI Experience / Error Handling
Location: `backend/src/agents/contentToPdfAgent/agent.ts` (`runRenderAgent`), `backend/src/shared/normalizeUseCase.ts`, `backend/src/routes/renderPdf.ts`
Detected: 2026-06-08 (Mode E → Mode D baseline audit)
Last Updated: 2026-06-08 23:10
Reviewer: User (manual browser review completed)
Related Files:
- backend/src/agents/contentToPdfAgent/agent.ts
- backend/src/shared/normalizeUseCase.ts
- backend/src/routes/renderPdf.ts

Initial Evidence Level: Static (code) + Runtime-executed (deterministic repro)
Current Verification Level: Runtime-executed (post-fix deterministic repro)
Verification Status: Verified (server runtime) + Manual Verification Required (visual PDF text match)
Confidence: High

### Issue

The editor (`EditableBulletList`) lets the user add/remove case-study bullets with no count
limit, and edits are committed verbatim to state with no re-normalization. But the render
pipeline (`runRenderAgent`) re-ran `normalizeCaseStudySummary` (Customer Case Study) or
`trimSummaryToLegacyCaps` (Article Report / Executive Memo) against the final template,
which **forced the contract by silently rewriting user-confirmed content**:

- **dropped** surplus user bullets (e.g. Solutions 6 → 4),
- **injected fabricated filler** into sparse sections (e.g. "Clarify the primary objective
  described in the source."),
- injected **grammatically broken mined fragments** (a sentence cut off mid-clause, ending in "and"),
- **truncated** over-length bullets.

None of this was shown in the editor/preview (there is no PDF preview), so the downloaded PDF
could differ from the content the user reviewed and approved.

### User Impact

A user edits their customer case study, sees N bullets in the preview, and downloads a
branded, customer-facing PDF that silently drops their wording and adds sentences they never
wrote. Direct data loss plus a trust/credibility breach in the actual deliverable.

### Evidence

- Page / component: Generate PDF → `/api/render-pdf` → `runRenderAgent`
- Triggering action: edit bullet counts away from the contract (or a sparse extraction), then Generate
- Current result (pre-fix): PDF silently re-normalized; user bullets dropped, filler injected
- Expected result: render reflects the user-confirmed draft exactly, or blocks with a clear message

### Reproduction Steps (pre-fix, runtime-verified during the baseline audit)

1. `POST /api/normalize` (templateId=usecase) with goals=1, challenges=2, solutions=6, results=2.
2. Observe every section forced to 4: filler + a truncated mined fragment injected; 2 solutions dropped.
3. `POST /api/render-pdf` with the same shape returned a 200 PDF carrying the rewritten content.

### Expected Behavior

Validate before render. Do not silently mutate user-confirmed content during render. If the
draft violates a required template contract, surface a clear blocking validation message before
any PDF is produced. The final PDF must reflect the latest user-confirmed content.

### Recommended Fix (implemented)

Smallest safe change, backend-only:
1. Add `validateRenderContent(content, {templateId})` + `RenderValidationError` in
   `normalizeUseCase.ts` (reuses the existing contract constants).
2. In `runRenderAgent`, validate first and throw `RenderValidationError` on any violation;
   **remove** the render-time `normalizeCaseStudySummary` / `trimSummaryToLegacyCaps` rewrite;
   render the validated `content` verbatim; restrict the repair loop to layout-only (it runs on
   a working copy and never feeds the rendered output).
3. In `renderPdf.ts`, map `RenderValidationError` → HTTP 422 with a clear, template-aware,
   user-fixable message + a `violations[]` array. The existing `ErrorBanner` surfaces it.

### Acceptance Criteria

- [x] User-entered bullets are never silently dropped during render.
- [x] New filler content is never silently injected during render.
- [x] The final PDF reflects the latest user-confirmed draft (render uses validated `content` verbatim; repair attempts = 0 on conforming input).
- [x] Invalid template constraints are surfaced before render (422 with per-section guidance).
- [x] The render pipeline does not mutate user-confirmed content (repair loop is layout-only).
- [x] The previous deterministic repro no longer drops or injects content silently (now 422).
- [x] Typecheck passes.
- [x] Relevant existing validation passes (quality-review/repair contract unchanged; loop layout-only).
- [x] Exact manual verification steps provided (below + changelog).
- [x] No unrelated files modified (3 source files + audit records only).
- [x] Human review completed.

### Files Modified

- backend/src/shared/normalizeUseCase.ts — added `validateRenderContent` + `RenderValidationError` (no existing logic changed).
- backend/src/agents/contentToPdfAgent/agent.ts — validate-before-render; removed silent re-normalize; repair loop layout-only; render verbatim content.
- backend/src/routes/renderPdf.ts — map `RenderValidationError` → 422 with user-facing message.

### Validation Performed

- `pnpm typecheck` → pass (backend + frontend).
- Runtime, backend booted on :8799 (provider=gemini), deterministic (no-LLM) probes:
  - TEST A — usecase non-conforming (goals=1, ch=2, sol=6, res=2) → **HTTP 422**, per-section violations, no PDF.
  - TEST B — usecase conforming (4/section, distinctive wording) → **HTTP 200**, valid 2-page PDF, `x-agent-repair-attempts: 0`, `x-agent-repair-actions: none` (loop did not mutate).
  - TEST C — article_report solutions=5 (cap 3) → **HTTP 422**, "allows at most 3 bullets" message.
  - TEST D — usecase with an empty 4th Goals bullet → **HTTP 422**, flags empty bullet + count.

### Validation Not Available

- In-app/visual confirmation that the downloaded PDF shows the exact user bullets and no filler:
  `pdftotext` is not installed and the Chromium PDF embeds subset CID fonts (2-byte glyph IDs,
  not ASCII), so automated text extraction could not read the rendered glyphs. Asserted at the
  source level (render uses validated `content` verbatim; silent normalize removed) and by
  repair-attempts=0; visual check marked Manual Verification.
- Live LLM extraction path (`/api/extract`) not exercised (requires `GOOGLE_API_KEY`, cost); the
  fix does not touch extraction.
- Browser/E2E (edit → generate → compare): no Playwright/Cypress test harness in repo.

### Manual Verification Steps

1. Set a valid `GOOGLE_API_KEY` in `backend/.env`; from repo root run `pnpm dev`; open http://localhost:5173.
2. Paste a customer story; Extract; ensure template = Customer Case Study.
3. In the editor, use **+ Add** / **×** to make Solutions show **6** bullets (or remove one to make a section show **3**). Click **Generate PDF**.
   - Expected: generation is **blocked** with a banner like "Customer Case Study can't be exported yet — Solutions needs exactly 4 bullets (currently 6)." No file downloads.
4. Fix every section to exactly **4** non-empty bullets with your own wording. Click **Generate PDF**.
   - Expected: a PDF downloads whose Goals/Challenges/Solutions/Results contain **your exact wording**, with **no** injected filler (e.g. no "Clarify the primary objective described in the source.").

### Regression Risks

- Drafts that previously rendered via silent auto-fix now **block** until the user makes counts
  conform. This is the intended behavior change, but it is a stricter gate — the frontend does
  not yet pre-validate or enforce the 4-bullet contract in the editor (separate, out-of-scope
  item), so the user first learns of a violation at Generate time via the 422 banner.
- The repair loop still runs for layout (density / visual placement / pages); its content-mutating
  actions (`renormalize_case_study_summary`, `compress_case_study_summary`, `repair_sentence_fragments`)
  are now inert with respect to the rendered output. They are unreachable for bullets on validated
  input; the dedicated `tightenCaseStudyBullets` overflow path no longer affects output.
- Editor-sync `/api/normalize` behavior is unchanged (still pads/caps for the editable preview).
  That output is visible/editable before render, so it is not a silent render-time mutation; an
  explicit "AI-suggested" label for filler remains a separate future enhancement.

### History

#### 2026-06-08 — Issue Detected
- Status set to `Open`.
- Detected during Mode E → Mode D baseline audit; runtime-confirmed via `/api/normalize` + `/api/render-pdf`.

#### 2026-06-08 22:48 — Fix Implemented
- Status changed to `In Progress` then `Fixed — Awaiting Human Review`.
- Modified files: backend/src/shared/normalizeUseCase.ts, backend/src/agents/contentToPdfAgent/agent.ts, backend/src/routes/renderPdf.ts
- Summary: validate-before-render; removed silent render-time re-normalization; repair loop restricted to layout; render user-confirmed content verbatim; non-conforming drafts return 422 with user-fixable guidance.
- Verification: typecheck pass; runtime TEST A/B/C/D as above.
- Regression checks: conforming render still 200 with repair attempts 0; legacy + empty-bullet branches validated; editor-sync normalize untouched.
- Human review required.

#### 2026-06-08 23:10 — Human Review
- Reviewer decision: `Approved`.
- Reviewer: User (completed manual browser review).
- Reviewer notes (confirmed):
  1. Non-conforming Customer Case Study bullet counts block PDF generation before download.
  2. The error message clearly identifies the affected section and required count.
  3. User-edited content remains intact after the blocked render attempt.
  4. A conforming draft with exactly four non-empty bullets per section generates successfully.
  5. The downloaded PDF preserves the user-confirmed bullet wording without silently dropping content, injecting filler, or truncating text.
- Status changed to `Approved`.

#### 2026-06-08 23:10 — Closed
- Status changed to `Closed` following human approval.
- No code changes after approval. Follow-up tracked separately as BUG-002 (editor-level template guidance) — not part of BUG-001.

---

## BUG-002 — Editor allows bullet counts to violate the template contract; constraint only surfaced at Generate

Status: Open
Severity: Medium
Category: Forms / Interaction Feedback / AI Experience
Location: `frontend/src/components/EditableBulletList.tsx`, `frontend/src/components/EditableUseCasePreview.tsx`, `frontend/src/pages/ContentToPdfPage.tsx`, `frontend/src/components/ExportSummaryPanel.tsx`
Detected: 2026-06-08 23:10 (follow-up from BUG-001 human review)
Last Updated: 2026-06-08 23:10
Reviewer: Pending
Related Bug: BUG-001 (follow-up; do not merge into BUG-001)
Related Files: Pending investigation

Initial Evidence Level: Static (code) + Runtime-executed (BUG-001 422 path)
Current Verification Level: Static
Verification Status: Open — not yet scheduled for a fix
Confidence: High

### Issue

The editor (`EditableBulletList`) lets users add or remove bullets beyond the Customer Case
Study template contract (exactly four non-empty bullets per section), but users only discover
the constraint after clicking **Generate PDF** and receiving the BUG-001 validation block (HTTP
422). The constraint is enforced server-side at render time only; nothing in the editor
communicates the requirement up front, caps the add/remove controls, or disables Generate while
the draft is non-conforming.

### User Impact

Friction and a late, surprising failure: the user invests effort editing, then is bounced at
the final step. The constraint is correct and safe (BUG-001), but the discovery moment is poor.
Affects every user who edits case-study bullet counts.

### Evidence

- Page / component: Review & Edit screen → bullet editors → Generate PDF
- Triggering action: add/remove bullets so a section ≠ 4 (case study), then Generate
- Current result: generation blocked at submit time with a 422 banner (BUG-001)
- Expected result: the requirement is communicated in the editor before submit (and/or Generate
  is gated / counts are guided) so the user never reaches a dead-end at the final step

### Expected Behavior

Surface the template contract in the editor proactively — e.g. per-section count indicators
(`3/4`), inline guidance when a section is off-contract, and/or gating the Generate action with
an explanation, so the constraint is understood before the user clicks Generate. Must preserve
the BUG-001 guarantee (no silent mutation) — guidance only, no auto-rewrite.

### Recommended Fix (not yet implemented — backlog)

Frontend-only: add per-section bullet-count affordances and pre-submit validation mirroring
`validateRenderContent`'s contract, surfaced inline in the editor; optionally disable Generate
with a reason when the draft is off-contract. Keep the server-side 422 as the authoritative
backstop.

### Acceptance Criteria

- [ ] The Customer Case Study contract (exactly 4 non-empty bullets/section) is communicated in the editor before Generate.
- [ ] Off-contract sections are visibly indicated inline.
- [ ] The user is not silently auto-corrected (BUG-001 guarantee preserved).
- [ ] Server-side 422 remains the authoritative backstop.
- [ ] Human review completed.

### History

#### 2026-06-08 23:10 — Issue Detected
- Status set to `Open`.
- Logged as a separate backlog follow-up during BUG-001 human review. Not scheduled; do not start without explicit instruction.
