# Interaction Design Decisions

## DECISION-001 — How to honor the case-study bullet contract without silent mutation

Date: 2026-06-08
Related Bug: BUG-001
Status: Approved (2026-06-08, human review completed)

### Governing Rule (adopted)

```text
Validate before render.
Do not silently mutate user-confirmed content during render.
```

This rule is now the standing principle for the render pipeline: the final PDF must reflect the
latest user-confirmed content. Any template-contract enforcement happens as a blocking, visible
validation before render — never as a silent content rewrite. Derived/suggested content (e.g.
filler) must be surfaced for explicit user review before it can reach the PDF.

### Problem

The Customer Case Study template requires exactly four bullets per section, but the editor
allows any count and the render pipeline previously enforced the contract by silently rewriting
the user's content at render time (dropping bullets, injecting filler, truncating). We needed
to satisfy the contract while guaranteeing the PDF reflects the user-confirmed draft.

### Options Considered

#### Option A — Validate before render and block with a clear message (selected)

Pros:
- Never mutates user-confirmed content; the PDF is exactly what the user reviewed.
- Surfaces the constraint with a specific, fixable message before any PDF is produced.
- Smallest blast radius: 3 backend files, reuses existing contract constants, no schema/UI changes.

Cons:
- Stricter gate — a non-conforming draft is blocked at Generate time rather than auto-fixed.
- The user currently learns of the violation only at Generate (no in-editor enforcement yet).

#### Option B — Auto-normalize but show the changes as reviewable suggestions before render

Pros:
- Keeps a "one click" path for sparse/over-full drafts.

Cons:
- Requires a diff/suggestion UI and editor changes — larger blast radius, out of scope for this
  single-issue pass; still risks confusion about what is user content vs. AI suggestion.

#### Option C — Enforce the exact-4 contract live in the editor (hard cap add/remove)

Pros:
- Prevents the invalid state from ever existing.

Cons:
- Frontend-heavy change across editor components; broader scope than this fix; does not by itself
  fix the backend silent-mutation guarantee.

### Selected Approach

Option A — validate before render; block with a clear, template-aware 422 message; render the
validated content verbatim; keep the repair loop for layout only.

### Reason

It directly enforces the product rule ("Validate before render. Do not silently mutate
user-confirmed content during render.") with the smallest, most reviewable change, and leaves a
clean seam for a future enhancement (in-editor enforcement and/or labeled AI suggestions —
Option B/C) without rework.

### Review Status

Approved — 2026-06-08, human review completed (BUG-001 closed). The Option B/C seam (in-editor
template guidance) is tracked separately as BUG-002.
