# SHEEN｜Content to PDF Agent Hub

An AI-powered content-to-PDF agent hub for turning pasted content into branded, ready-to-share PDFs.

The current MVP includes a **Customer Case Study / Success Story** template. Users paste raw content, let AI extract and structure it, edit the generated content, configure brand assets, optionally add a supporting visual, and export a polished PDF.

The workflow is **Paste → Extract → Edit → Brand → Generate**:

1. **Paste** — the user pastes source content (paste-only; file upload is not supported).
2. **Extract** — the AI extracts structured content (title, summary, Goals / Challenges / Solutions / Results, narrative, pull quotes, optional Mermaid diagram).
3. **Edit** — the user can edit every field before export.
4. **Brand** — the user configures brand name, website, document label, colors, and uploads/pastes a logo and hero image. A supporting visual is optional.
5. **Generate** — the app renders a branded PDF via Playwright.

Image assets are supported (logo upload/paste, hero image upload/paste, optional supporting image upload/paste, Mermaid diagram test/preview). Only the **source content** is paste-only.

## Stack

- **Backend:** Node 20 + TypeScript + Fastify + Playwright + Mermaid (pre-rendered to SVG server-side)
- **Frontend:** Vite + React + TypeScript + Tailwind
- **AI:** Pluggable provider adapter — Gemini, Claude, or OpenAI via env var (bring your own key)
- **Schema:** Zod, shared between frontend and backend as the single source of truth
- **State:** Stateless. No database, no auth, no submission history.
- **Package manager:** pnpm workspaces

## Supported content types

`use_case`, `success_story`, `case_study`, `project_summary`, `marketing_brief`, `executive_memo`, `general_article`.

The AI tags the extracted content with one of these types, but all content is rendered through the same Customer Case Study template in the MVP.

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
| `PORT` | `8787` | Fastify port (local dev uses `8788` to avoid a conflict; Vite proxy targets the same) |
| `CORS_ORIGIN` | `http://localhost:5173` | Vite dev origin |

The backend fails fast at boot if `LLM_PROVIDER` is set without the matching key.

Branding (brand name, website, document label, colors, logo, hero image, supporting visual) is configured **from the frontend settings panel**, not env. No API keys live in this repo.

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

Response: a normalized `UseCase` object (see [backend/src/shared/useCaseSchema.ts](backend/src/shared/useCaseSchema.ts)) containing:

`title`, `subtitle`, `contentType`, `solutionName`, `industry`, `useCaseFocus`, `goals`, `challenges`, `solutions`, `results`, `executiveSummary`, `narrativeSections`, `pullQuotes`, `mermaidDiagram` (optional), `callToAction`, `missingFields`, `expansionNotes`.

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

`PdfRenderConfig` fields (see [backend/src/shared/useCaseSchema.ts](backend/src/shared/useCaseSchema.ts) for the authoritative schema):

| Field | Type | Default |
|---|---|---|
| `templateId` | `"usecase"` | `"usecase"` |
| `brandName` | string | `"Your Company"` |
| `brandWebsite` | string | `"www.example.com"` |
| `documentLabel` | string | `"CUSTOMER CASE STUDY"` |
| `brandCopyright` | string | `"© 2026 Your Company. All rights reserved."` |
| `primaryColor` | `#RRGGBB` | `"#0F172A"` |
| `accentColor` | `#RRGGBB` | `"#06B6D4"` |
| `logoDataUrl` | image data URL or null | `null` |
| `heroImageDataUrl` | image data URL or null | `null` |
| `supportingVisualEnabled` | boolean | `false` |
| `supportingVisualType` | `"image"` \| `"mermaid"` \| null | `null` |
| `supportingImageDataUrl` | image data URL or null | `null` |
| `supportingImageCaption` | string or null | `null` |
| `mermaidVerified` | boolean | `false` |

Body limit is 8 MB to comfortably fit a downscaled hero image, logo, and optional supporting image.

Website values are normalized to domain-only when rendered into the PDF:

```
https://www.bkoai.com/  →  www.bkoai.com
http://bkoai.com        →  bkoai.com
www.bkoai.com           →  www.bkoai.com
```

Generated PDFs display the website without `https://` (BKOAI shown only as an illustrative user-configured brand example).

Response: `application/pdf` binary with `Content-Disposition: attachment; filename="success-story-{title-slug}.pdf"`.

Example filename:

```
success-story-lng-commissioning-data-integrity-and-sis-alignment.pdf
```

### `POST /api/validate-mermaid`

Used by the frontend to test/preview a Mermaid diagram before PDF generation.

Request:

```json
{ "code": "flowchart LR\n  A --> B" }
```

Response:

```json
{ "ok": true, "svg": "<svg …>…</svg>" }
```

### `GET /api/health`

```json
{ "status": "ok", "provider": "gemini" }
```

## Templates

The current MVP ships with one active template:

- `usecase` — internal template ID, displayed in the UI as **Customer Case Study**.

Additional template cards may appear in the UI as **Coming Soon**, but only the Customer Case Study template is fully implemented. The product is not yet a multi-template system.

Files for the active template live under [backend/src/templates/usecase/](backend/src/templates/usecase):

- `template.html` — page 1 (brand header / hero / title / meta / Goals · Challenges · Solutions · Results) and later pages (executive summary, narrative sections, pull quotes, optional supporting visual, CTA, footer).
- `styles.css` — print-tuned CSS using `var(--primary)` and `var(--accent)` (injected from `config`).
- `placeholder-hero.svg` — used when the user does not upload a hero image.
- `meta.json` — template descriptor.

No build step is needed for template edits — the renderer reads templates from disk on startup (cached per process).

## Supporting visual (Mermaid or uploaded image)

The supporting visual is optional. Users can choose:

- no supporting visual
- an uploaded supporting image (with optional caption)
- a Mermaid diagram

Rules:

- If an uploaded supporting image is provided, the PDF uses the uploaded image and does not use Mermaid.
- If Mermaid is selected, the user can test and preview the diagram before PDF generation. Mermaid is included only if it renders successfully as a visual SVG.
- If Mermaid fails to render, the supporting visual section is omitted completely.

The PDF never shows:

- raw Mermaid code
- title-only diagram sections
- description-only diagram sections
- blank diagram placeholders
- plain text pathways pretending to be diagrams

The Mermaid pipeline lives in [backend/src/pdf/mermaid.ts](backend/src/pdf/mermaid.ts): it sanitizes the code (strips `click` directives, HTML, special characters; enforces a leading `flowchart` directive), renders it to SVG inside a small Playwright sandbox page using the local Mermaid bundle from `node_modules`, and inlines the resulting SVG into the main template before the final PDF render.

## PDF output rules

Generated PDFs should:

- use the `success-story-` filename prefix
- keep page 1 as the cover / summary page
- show the hero image with logo and website overlay when provided
- show Goals / Challenges / Solutions / Results on page 1
- show narrative content on later pages
- include a supporting visual only if there is a real uploaded image or a successfully rendered Mermaid SVG
- show a small technical footer with filename and page number
- show compact copyright once after all content
- never create an extra blank page only for the footer, copyright, or failed diagram content

### Copyright distinction

There are two distinct copyright values:

- **Product/web app footer** — uses `© 2026 Sheen Liu. All rights reserved.` This is product-level copyright shown in the SHEEN web app footer only.
- **Generated PDFs** — use the user-configured `brandCopyright`. The default is `© 2026 Your Company. All rights reserved.`

The product-level string is never written into generated PDFs.

## Out of scope

- Authentication / multi-user accounts
- Database-backed submission history
- Reviewer email submission
- File upload as source content — source content is paste-only (image assets such as logo, hero, and supporting image are uploadable/pasteable)
- Additional fully-rendered templates beyond the default Customer Case Study template
- Real AI image generation — hero and supporting images are user-uploaded or pasted

These are intentional. Add them when the core flow is proven.

## License

MIT
