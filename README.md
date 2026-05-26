# SHEEN — Content to PDF

Paste raw content → AI extracts a structured **customer case study** → edit anything → upload a hero image → download a branded PDF with summary sections, narrative, and an auto-generated Mermaid diagram.

The user does four things: **paste** their source content, **review and edit** the AI's extraction, set **brand** assets (logo, hero image, colors), and **generate** the PDF. The AI extracts Goals / Challenges / Solutions / Results, polishes the narrative, and generates a small Mermaid flowchart. Playwright renders the result through a fixed `usecase` HTML/CSS template. Missing or weak fields are flagged in the preview but never block PDF generation.

## Stack

- **Backend:** Node 20 + TypeScript + Fastify + Playwright + Mermaid (pre-rendered to SVG server-side)
- **Frontend:** Vite + React + TypeScript + Tailwind
- **AI:** Pluggable provider adapter — Gemini, Claude, or OpenAI via env var (bring your own key)
- **Schema:** Zod, shared between frontend and backend as the single source of truth
- **State:** Stateless. No database, no auth, no submission history.
- **Package manager:** pnpm workspaces

## Supported content types

`use_case`, `success_story`, `case_study`, `project_summary`, `marketing_brief`, `executive_memo`, `general_article`.

## Quick start

```bash
git clone <this repo>
cd content-to-pdf

# Install workspace deps
pnpm install

# Install Playwright's chromium browser (one-time)
pnpm install:browsers

# Configure your LLM provider (see `.env.example`)
cp .env.example backend/.env
# Edit backend/.env and set LLM_PROVIDER + the matching API key

# Start backend + frontend
pnpm dev
```

Then open <http://localhost:5173>.

Useful workspace scripts:

| Script | What it does |
|---|---|
| `pnpm dev` | Start backend (Fastify) + frontend (Vite) concurrently |
| `pnpm build` | Type-check + emit backend, build frontend bundle |
| `pnpm typecheck` | Run TypeScript across both workspaces, no emit |
| `pnpm install:browsers` | Install Chromium for Playwright |

## Environment variables

Set in `backend/.env`. Only the credentials for the selected `LLM_PROVIDER` are required at boot.

| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | One of `gemini`, `claude`, `openai` |
| `EXPANSION_MODE` | `standard` | `standard` allows light expansion (industry context, transitions); `strict` is extraction-only |
| `GOOGLE_API_KEY` | — | Required when `LLM_PROVIDER=gemini` |
| `GOOGLE_MODEL` | `gemini-2.0-flash` | Any generateContent-capable model |
| `ANTHROPIC_API_KEY` | — | Required when `LLM_PROVIDER=claude` |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Any messages-API capable model |
| `OPENAI_API_KEY` | — | Required when `LLM_PROVIDER=openai` |
| `OPENAI_MODEL` | `gpt-4o` | Must support JSON-schema response format |
| `PORT` | `8787` | Fastify port |
| `CORS_ORIGIN` | `http://localhost:5173` | Vite dev origin |

The backend fails fast at boot if `LLM_PROVIDER` is set without the matching key.

Branding (brand name, website, document label, colors, logo, hero image) is configured **from the frontend settings panel**, not env. No API keys live in this repo.

## How it works

```
┌──────────┐     POST /api/extract       ┌─────────────┐
│  React   │ ───────────────────────────▶│  Fastify    │
│  Vite    │                             │             │
│  (5173)  │ ◀──── UseCase JSON ─────────│  LLM        │── Gemini / Claude / OpenAI
└──────────┘                             │  Provider   │
     │                                   │  Adapter    │
     │                                   └─────────────┘
     │
     │       POST /api/render-pdf      ┌────────────────┐
     │  ─── { content, config } ──────▶│  Fastify       │
     │                                 │   ├ Mermaid →  │── Playwright tab → SVG
     │                                 │   └ Template → │── Playwright tab → PDF
     │  ◀──── application/pdf binary ──┤                │
     ▼                                 └────────────────┘
  download
```

Two distinct API calls (extract → render) so the user can tweak branding, swap the hero image, and regenerate without re-running extraction.

## API

### `POST /api/extract`

Request:

```json
{ "rawContent": "...paste contents..." }
```

Response: a normalized `UseCase` object (see [backend/src/shared/useCaseSchema.ts](backend/src/shared/useCaseSchema.ts)) — title, subtitle, contentType, client meta, goals/challenges/solutions/results, executive summary, narrative sections, pull quotes, Mermaid diagram, call to action, missingFields, expansionNotes.

Errors:

| Status | Meaning |
|---|---|
| 400 | Empty / too short input |
| 413 | Input over 50,000 chars |
| 422 | The AI returned an unparseable response |
| 502 | Upstream AI provider error |

### `POST /api/render-pdf`

Request:

```json
{
  "content": { /* a UseCase object */ },
  "config":  { /* a PdfRenderConfig — all fields optional with defaults */ }
}
```

`PdfRenderConfig` fields:

| Field | Type | Default |
|---|---|---|
| `templateId` | `"usecase"` | `"usecase"` |
| `brandName` | string | `"Your Company"` |
| `brandWebsite` | string | `"https://example.com"` |
| `documentLabel` | string | `"CUSTOMER CASE STUDY"` |
| `brandCopyright` | string | `"© 2026 Sheen Liu. All rights reserved."` |
| `primaryColor` | `#RRGGBB` | `"#0F172A"` |
| `accentColor` | `#RRGGBB` | `"#06B6D4"` |
| `logoDataUrl` | `data:image/(png\|jpeg\|svg+xml);base64,…` or null | `null` |
| `heroImageDataUrl` | `data:image/(png\|jpeg\|webp);base64,…` or null | `null` |

Body limit is 8 MB to comfortably fit a downscaled hero image plus logo.

Response: `application/pdf` binary with `Content-Disposition: attachment; filename="use-case-{title-slug}.pdf"`.

### `GET /api/health`

```json
{ "status": "ok", "provider": "gemini" }
```

## The `usecase` template

Files live under [backend/src/templates/usecase/](backend/src/templates/usecase):

- `template.html` — page 1 (brand header / hero / title / meta / Goals · Challenges · Solutions · Results) and pages 2–3 (executive summary, narrative sections, pull quotes, Mermaid diagram, CTA, footer).
- `styles.css` — print-tuned CSS using `var(--primary)` and `var(--accent)` (injected from `config`).
- `placeholder-hero.svg` — used when the user does not upload a hero image.
- `meta.json` — template descriptor.

No build step is needed for template edits — the renderer reads templates from disk on startup (cached per process).

## Mermaid diagram pipeline

1. The AI generates a small Mermaid `flowchart LR` or `flowchart TD` (5–8 short-labeled nodes) as part of the extraction response.
2. Before the main PDF render, [`backend/src/pdf/mermaid.ts`](backend/src/pdf/mermaid.ts) sanitizes the code (strips `click` directives, HTML, special characters; enforces the directive on line 1) and renders it to SVG inside a small Playwright sandbox page using the local Mermaid bundle from `node_modules`.
3. The resulting SVG string is inlined into the main `template.html` before the final PDF render.
4. If Mermaid rendering fails for any reason, the PDF still generates — the diagram section falls back to a styled box with title + description, never raw `flowchart …` code.

## Out of scope

- Reviewer email submission
- Authentication / multi-user
- Multiple templates / template picker UI
- Submission history / re-download
- File upload (PDF, DOCX) as source content — paste-only
- Real AI image generation — the hero image is user-uploaded

These are intentional. Add them when the core flow is proven.

## License

MIT
