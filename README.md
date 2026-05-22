# Content to PDF

Paste raw content → AI extracts a structured schema → download a branded PDF report.

The user only ever does one thing: **paste**. The AI identifies the content type, extracts a stable JSON schema, and the system renders a fixed branded HTML/CSS template through Playwright. Missing or weak fields are flagged in the preview but never block PDF generation.

## Stack

- **Backend:** Node 20 + TypeScript + Fastify + Playwright
- **Frontend:** Vite + React + TypeScript + Tailwind
- **AI:** Pluggable provider adapter — Claude, OpenAI, or Gemini via env var (bring your own key)
- **Schema:** Zod, shared between frontend and backend as the single source of truth
- **State:** Stateless. No database, no auth, no submission history.

## Supported content types

`general_article`, `newsletter`, `case_study`, `project_summary`, `executive_memo`, `marketing_brief`, `proposal_draft`, `meeting_summary`.

## Quick start

```bash
git clone <this repo>
cd content-to-pdf

# Install workspace deps
npm install

# Install Playwright's chromium browser (one-time)
npm run install:browsers

# Configure your LLM provider (see `.env.example`)
cp .env.example backend/.env
# Edit backend/.env and set LLM_PROVIDER + the matching API key

# Start backend + frontend
npm run dev
```

Then open <http://localhost:5173>.

## Environment variables

Set in `backend/.env`. Only the credentials for the selected `LLM_PROVIDER` are required at boot.

| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `claude` | One of `claude`, `openai`, `gemini` |
| `ANTHROPIC_API_KEY` | — | Required when `LLM_PROVIDER=claude` |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Any messages-API capable model |
| `OPENAI_API_KEY` | — | Required when `LLM_PROVIDER=openai` |
| `OPENAI_MODEL` | `gpt-4o` | Must support JSON-schema response format |
| `GOOGLE_API_KEY` | — | Required when `LLM_PROVIDER=gemini` |
| `GOOGLE_MODEL` | `gemini-2.0-flash` | Any generateContent-capable model |
| `PORT` | `8787` | Fastify port |
| `CORS_ORIGIN` | `http://localhost:5173` | Vite dev origin |

The backend fails fast at boot if `LLM_PROVIDER` is set without the matching key.

## How it works

```
┌──────────┐     POST /api/extract       ┌─────────────┐
│  React   │ ───────────────────────────▶│  Fastify    │
│  Vite    │                             │             │
│  (5173)  │ ◀────  Content JSON ────────│  LLM        │── Claude / OpenAI / Gemini
└──────────┘                             │  Provider   │
     │                                   │  Adapter    │
     │                                   └─────────────┘
     │
     │       POST /api/render-pdf
     │  ──────────────────────────▶  Fastify ──▶ Playwright(chromium) ──▶ PDF
     │
     │  ◀──── application/pdf binary ────
     ▼
  download
```

Two distinct API calls (extract → render) so a future "edit before render" step can be inserted without backend changes.

## API

### `POST /api/extract`

Request:

```json
{ "rawContent": "...paste contents..." }
```

Response: the `Content` Zod schema (see [backend/src/shared/schema.ts](backend/src/shared/schema.ts)).

Errors:

| Status | Meaning |
|---|---|
| 400 | Empty / too short input |
| 413 | Input over 50,000 chars |
| 422 | The AI returned an unparseable response |
| 502 | Upstream AI provider error |

### `POST /api/render-pdf`

Request: a valid `Content` object (typically the result of `/api/extract`).
Response: `application/pdf` binary with `Content-Disposition: attachment; filename="content-report-{title-slug}.pdf"`.

### `GET /api/health`

```json
{ "status": "ok", "provider": "claude" }
```

## Customizing the brand

The PDF visuals live in [backend/src/templates/branded-report/](backend/src/templates/branded-report):

- `logo.svg` — replace with your own logo (SVG recommended; gets embedded as a data URI)
- `styles.css` — print-tuned CSS, edit colors / fonts / `@page` margins
- `template.html` — the structural template; placeholders are `{{key}}` and a small set of pre-built blocks (`{{keyPointsBlock}}`, etc.)

No build step is needed for template edits — the renderer reads templates from disk on startup (cached per process).

## Adding a new template

1. Create a new directory under `backend/src/templates/`, e.g. `quarterly-report/`.
2. Add `template.html`, `styles.css`, `logo.svg`, and a `meta.json` ID/name.
3. Pass `templateId` to `renderPdf(content, templateId)` in [backend/src/routes/renderPdf.ts](backend/src/routes/renderPdf.ts) (currently hardcoded to `"branded-report"`).
4. (Future) Expose a `templateId` field in the request body and a picker UI on the frontend.

## Project layout

```
content-to-pdf/
├── backend/
│   ├── src/
│   │   ├── server.ts                 # Fastify bootstrap
│   │   ├── config.ts                 # Env validation
│   │   ├── routes/                   # /api/health, /api/extract, /api/render-pdf
│   │   ├── llm/                      # provider.ts + claude.ts/openai.ts/gemini.ts + factory.ts + prompt.ts
│   │   ├── pdf/                      # renderer.ts (Playwright) + template.ts
│   │   ├── templates/branded-report/ # template.html + styles.css + logo.svg + meta.json
│   │   └── shared/                   # schema.ts (Zod) + normalize.ts
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/ContentToPdfPage.tsx   # extract → preview → render state machine
│   │   ├── components/                  # PasteArea, ExtractionPreview, ContentTypeTag, etc.
│   │   ├── lib/api.ts                   # typed fetch wrappers
│   │   └── styles/tailwind.css
│   └── package.json
├── examples/                         # sample paste content
├── .env.example
└── package.json                      # npm workspaces root
```

## Out of scope (MVP)

- Reviewer email submission
- Authentication / multi-user
- Multiple templates / template picker UI
- Submission history / re-download
- File upload (PDF, DOCX) as input — paste-only for MVP
- Inline editing of extracted fields

These are intentional. Add them when the core flow is proven.

## License

MIT
