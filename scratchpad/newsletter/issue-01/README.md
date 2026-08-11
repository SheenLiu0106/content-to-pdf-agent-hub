# LinkedIn Newsletter — Issue 01 visual assets

**Article:** “Can You Actually Use What AI Builds in One Shot?”
**Captured:** 2026-08-05 / 2026-08-06 (local), macOS, Chromium (Playwright `channel: "chromium"`).
**Viewport for every raw screenshot:** 1600 × 1000 CSS px, `deviceScaleFactor: 2` → 3200 × 2000 PNG.
No browser chrome, no cursor, no devtools, no personal data. Reviewer identity is the fictional
“Dana Whitlock”.

Both versions ran against the **real** backend with real Gemini extraction and real Playwright PDF
rendering. Nothing is mocked and no API responses were intercepted.

---

## 1. Files

| # | File | What it shows | Article point it supports |
|---|------|---------------|---------------------------|
| 01 | `01-original-working-version.png` | Original product after extraction: “SHEEN ／ Content to PDF · Agent Hub”, Paste→Extract→Edit→Brand→Generate step bar, Agent Decision Summary, extracted case study, brand/template/export rail | “AI already turned messy source material into a usable document.” |
| 02 | `02-rebuild-create-intake.png` | Rebuilt Create workspace: Single document selected, messy source pasted, Output configuration open, Brand and Agent-behaviour summaries collapsed but readable, **Analyze and create draft** enabled, no document canvas | “The rebuilt product begins by defining the task, not by showing an empty PDF editor.” |
| 03 | `03-structured-draft-review.png` | Review workspace as extracted: structured Goals / Challenges / Solutions / Results on paper, immutable source in the evidence pane, one restrained origin strip, one open decision card | “Messy source became a structured, editable document.” |
| 04 | `04-missing-results-decision.png` | Review workspace with Results reduced to what the source supports; one blocking `HumanDecisionCard` — why the agent stopped, affected content (Summary · Results), evidence and timestamps, three real actions with their consequences | “In the first version, missing Results was a warning. In the rebuild, it became a human decision with an owner and a lifecycle.” |
| 04b | `04-alt-waive-form-open.png` | Same card with the waive form open: “Before you waive this issue” consequence preview + required reason | Alternate for 04 if the consequence preview matters more than seeing the Results card |
| 05 | `05-final-artifact-approval.png` | Approval workspace: rendered branded PDF (logo, hero, title hierarchy, four sections, footer) as the central object, “The exact artifact your approval signs”, QA pass, final gate still waiting on a human | “You no longer rebuild the layout in Figma / Word / InDesign.” |
| 06 | `06-version-bound-approval.png` | Review gate with “Before you approve review → Approval is recorded against the content and configuration stored right now — not an unsaved draft on screen”, canvas marked **Saved**, Document checks | “Human oversight only works when the decision is attached to the exact thing the human reviewed.” |
| A | `cover-original-vs-rebuild.png` | 01 and 04 side by side, labels **Original build** / **Deliberate rebuild** only | Cover image |
| B | `comparison-warning-vs-decision.png` | Crop of the original’s Agent Decision Summary + amber warning + AI Expansion Notes, next to the rebuild’s decision card. Labels **Warning** / **Human decision** | Warning → decision |

Supporting files (not for publication):
`fixtures/source-brightwater.md` (the shared sanitized source), `fixtures/brightwater-logo.svg`,
`fixtures/brightwater-hero.png` (generated, abstract, non-photographic),
`fixtures/rendered.pdf` + `fixtures/page1.png` (the actual signed-pending artifact),
`scripts/*.mjs` (the capture harness).

---

## 2. Verification

| Item | Original (01) | Rebuild (02–06) |
|---|---|---|
| Code | detached git worktree at commit **`4ce7aa6`** (`feat: durable run store…`), the last committed state of `feat/runs-review-ui` | branch **`feat/runs-review-ui`**, commit `4ce7aa6` **plus the uncommitted working tree** (the rebuild is not committed) |
| Worktree path | `/private/tmp/claude-501/-Users-sheen-Repos-content-to-pdf/c32729c6-8df7-45da-9456-2c42fec3b2fa/scratchpad/original-4ce7aa6` | working directory `/Users/sheen/Repos/content-to-pdf` |
| Frontend | `http://localhost:5173/` (that commit’s vite config) | `http://localhost:5179/` |
| Backend | worktree backend on `:8788`, own `backend/data/runs.db` | repo backend on `:8788`, `backend/data/runs.db` |
| Route | single page, no router | `Runs` view → run detail (no router; view state only) |
| Data | live `POST /api/extract` (Gemini, `EXPANSION_MODE=standard`) | durable run **`063bf9e7-db92-4488-b76c-5312fd02b7c6`**, batch `f2df4600-1019-482c-b333-9348653c8329` |
| State shown | `phase = "preview"` after a successful extraction | 02 intake · 03/04/06 `REVIEW` · 05 `APPROVAL` |
| Source of truth | real API data | real API data (extraction, issue derivation, render, QA, approvals all real) |

Run facts at capture time (`GET /api/runs/063bf9e7…`):

```
status            APPROVAL          template usecase / Brightwater Facilities Group
policies          only_when_flagged, approval required
attempts          extract 1, render 2
current  fp       68e41b0fab9c5999710a91225ad0d2559a51748cf811a4a170e1d96700f14e01
rendered fp       68e41b0fab9c5999710a91225ad0d2559a51748cf811a4a170e1d96700f14e01
artifact sha256   d7e7758e96a3ce5ffc68855331de46e7df1974a30f8e1a8b1adfb274ffe07004
qa                pass (pre-render only)
issues            source_expansion expansionNotes.0  blocking  waived
                  source_expansion expansionNotes.1  blocking  waived
                  render_validation summary.results.bullet_count_exact  blocking  resolved (auto-cleared)
                  missing_field missingFields.0      warning   open
                  intake_risk   intakeRisks.0        warning   open
approvals         review approve      Dana Whitlock  fp 47de32c8…
                  approval request_changes Dana Whitlock
                  review approve      Dana Whitlock  fp 68e41b0f…
```

### What was done through the UI vs the API

Every **human decision** in the screenshots was taken through the real UI controls: the two waivers,
the review-gate approval, and the request-changes decision. Bulk **content editing** (title, subtitle,
executive summary, 16 summary bullets) was applied with `PATCH /api/runs/:id {action:"update_content"}`
— the same server action the Review workspace calls on “Save content” — because doing 20 field edits
through the DOM adds nothing. The Results edits in steps `weak` and `gate` *were* done in the UI, since
they are the edits the story turns on. Logo/hero assets were applied with `update_config` (see D7).

---

## 3. Reproduction

```bash
# ---------- rebuilt version (02–06) ----------
cd /Users/sheen/Repos/content-to-pdf
pnpm dev:backend                       # :8788, needs GOOGLE_API_KEY in backend/.env
pnpm dev:frontend                      # :5179

cd scratchpad/newsletter/issue-01/scripts
node create-run.mjs                    # real run from fixtures/source-brightwater.md
                                       # export RUN_ID=<printed id> for the scripts below
node patch-content.mjs                 # reviewer trims (see D3)
node shots-rebuild.mjs intake 300      # -> 02
node shots-rebuild.mjs draft 300       # -> 03
node shots-rebuild.mjs waive           # waive both source_expansion findings (UI)
node shots-rebuild.mjs weak            # Results -> "No measured results yet" (UI)
node shots-rebuild.mjs decide closed 487   # -> 04
node shots-rebuild.mjs decide open 487     # -> 04b
node shots-rebuild.mjs gate            # restore 4 supported Results, -> 06
node shots-rebuild.mjs approve         # approve review gate (UI) -> render
node shots-rebuild.mjs request-changes # (only needed to re-render with brand assets)
node make-hero.mjs                     # build hero + apply logo/hero via update_config
node shots-rebuild.mjs approve
node shots-rebuild.mjs artifact collapse   # -> 05

# ---------- original version (01) ----------
cd /Users/sheen/Repos/content-to-pdf
git worktree add --detach /tmp/original-4ce7aa6 4ce7aa6
ln -s $PWD/node_modules          /tmp/original-4ce7aa6/node_modules
ln -s $PWD/frontend/node_modules /tmp/original-4ce7aa6/frontend/node_modules
ln -s $PWD/backend/node_modules  /tmp/original-4ce7aa6/backend/node_modules
ln -s $PWD/backend/.env          /tmp/original-4ce7aa6/backend/.env
# stop the current stack first — the original binds the same backend port
(cd /tmp/original-4ce7aa6/backend  && ./node_modules/.bin/tsx src/server.ts)   # :8788
(cd /tmp/original-4ce7aa6/frontend && ./node_modules/.bin/vite)                # :5173
cd /Users/sheen/Repos/content-to-pdf/scratchpad/newsletter/issue-01/scripts
node shots-original.mjs                # -> 01 (fresh LLM call; wording will differ)

# ---------- comparisons ----------
node compose.mjs cover
node compose.mjs warning
```

Nothing in `frontend/`, `backend/` or the worktree was modified. The worktree is disposable:
`git worktree remove --force /tmp/original-4ce7aa6`.

---

## 4. Defects and limitations found (none hidden by cropping)

**Naming / composition asked for in the brief that does not exist in the product**

- **L1 — “AI Document Studio” branding does not exist.** The rail says **SHEEN / CONTENT TO PDF**
  (`frontend/src/components/shell/SideNav.tsx:59`); the string “AI Document Studio” appears nowhere in
  the repo. Screenshots show the real branding.
- **L2 — There is no collapsed sidebar.** The rail is a fixed 238 px grid column
  (`.app-shell` in `frontend/src/styles/workspace.css:93`) with no collapse control, so “prefer the
  collapsed sidebar” could not be honoured. It is 238/1600 ≈ 15 % of the frame and does not dominate.

**Real visual defects, still present in the code**

- **D3 — Summary bullets are clipped in the Review editor.** `EditableBulletList` sizes each field with
  `rows = ceil(len / 80)` (`frontend/src/components/EditableBulletList.tsx:62`) while the field renders
  ~30 characters per line inside the 305 px summary card, so any bullet over ~30 characters is visually
  cut. The agent’s own bullets (87–105 chars, legal up to the 120-char cap) were all cut. **The captured
  draft was trimmed to ≤ 30 characters by reviewer edits**, which is why images 03/04/06 show no cut
  text — the defect itself is unchanged.
- **D4 — Long single-line values overflow their inputs.** The agent’s title
  “Consolidating Multi-System Scheduling and Subcontractor Workflows” rendered as
  “Consolidating Multi-System Scheduling and Subcontrac”, and `useCaseFocus` as
  “Multi-System Scheduling C”. Both were shortened by reviewer edit before capture.
- **D5 — The same finding is shown three times in Review.** The two `source_expansion` findings appear
  as the yellow **AI EXPANSION NOTES** panel inside the paper sheet
  (`EditableCaseStudyPreview.tsx:119`), as origin items in the left evidence pane, and as decision cards
  on the right. Visible in 03.
- **D6 — Without a hero image the PDF cover prints a cropped placeholder.** Render attempt 1 (no
  hero configured) covered the hero band with `templates/usecase/placeholder-hero.svg`, cover-cropped,
  printing the clipped words “SE CASE” and “o image placeholder” on the cover of a customer-facing
  document. Fixed for the capture by configuring a real hero image (attempt 2). This is a real defect,
  not a screenshot problem.
- **D7 — Logo and hero cannot be changed at the review gate.** `ReviewWorkspace` exposes
  `BrandSettingsPanel` but not `LogoUpload` / `HeroImageUpload`, so a durable run created without assets
  can only get them through `PATCH … update_config`. That is how they were applied here.
- **D8 — Empty space on the Create screen.** At 1600 × 1000 the right configuration column is taller
  than the source card, leaving ~500 px of empty canvas under the source card in 02. Real layout
  behaviour at this viewport; not cropped out.
- **D9 — The PDF preview carries Chromium’s viewer chrome.** `ApprovalWorkspace` renders the artifact in
  an `<iframe>`, so the dark viewer toolbar is part of the app surface in 05. The thumbnail rail was
  collapsed using the viewer’s own hamburger control (a real user action); nothing was injected.
- **D10 — Suspected: an SVG logo without intrinsic dimensions renders blank in the PDF.** Attempt 1 used
  a `viewBox`-only SVG and the cover’s logo chip came out empty; attempt 2 used the same artwork with
  explicit `width`/`height` and rendered correctly. Not isolated further — the hero changed in the same
  render.
- **D11 — Cover page 1 ends with ~2 in of white space** below Results in the compact 2-page mode. Visible
  in `fixtures/page1.png` and in 05.

**Honesty notes about how the states were produced**

- **N1 — “Missing Results” cannot come out of extraction on this template.** For `usecase`,
  `normalizeUseCase` → `toExactlyFour` (`backend/src/shared/normalizeUseCase.ts:312`) always pads every
  summary section to exactly four bullets, from derived candidates and then from
  `CASE_STUDY_FALLBACK_BULLETS`, **without recording an expansion note**. So a source with no measured
  results reaches the review gate looking complete. The blocking Results decision in 04 was therefore
  produced the way a real reviewer would produce it: by deleting the three result claims the source does
  not support, which makes the render-validation detector open
  `summary.results.bullet_count_exact`. (The padding path was not exercised in this run — the model
  supplied four Results bullets of its own, one of which, “Eradicated duplicate engineer dispatches”,
  the source does not support. That claim was corrected by the reviewer before approval.)
- **N2 — Comparison B does not claim the original warned about Results.** The original build has no
  gate and no per-finding state, so there is no Results warning to reproduce for this source. The left
  panel shows the original’s *actual* treatment of things the agent was unsure about: the read-only
  Agent Decision Summary with its “REVIEW RECOMMENDED” pill, the amber line “No explicit goals detected
  — the Goals card may rely on inference”, and the AI Expansion Notes panel. Nothing was invented.
- **N3 — Content differs slightly between 01 and 03–06.** Each version made its own live LLM call from
  the same source file, and 03–06 additionally carry the reviewer’s edits. The source material is
  identical in every screenshot.
- **N4 — 05 shows render attempt 2** (`Render attempts 2` in the artifact rail) because the reviewer
  requested changes to add the brand assets, which is a real recorded decision, not a reset.

---

## 5. Recommended four images

1. `01-original-working-version.png` — the first version genuinely worked.
2. `03-structured-draft-review.png` — messy source became a structured, editable document.
3. `04-missing-results-decision.png` — the warning became a human decision with an owner.
4. `05-final-artifact-approval.png` — a branded artifact, still waiting for a human.

Use `cover-original-vs-rebuild.png` as the newsletter cover, and
`comparison-warning-vs-decision.png` inline beside the “warning → decision” paragraph.
Swap in `02-rebuild-create-intake.png` for 03 if the article leans harder on “the rebuild starts by
defining the task”.
