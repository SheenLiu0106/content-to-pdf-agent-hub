/*
 * Screenshot harness for the AI-interaction states.
 *
 * Drives the real Vite dev build in Chromium and intercepts /api/** with fixture
 * payloads built from the backend's own fixtures, so each screenshot is the actual
 * component tree rendering real API shapes — no backend, no LLM keys, no mock UI.
 */

const ROOT = "/Users/sheen/Repos/content-to-pdf";
const OUT = `${ROOT}/docs/screenshots/ai-interaction`;
// The dev server already running for this repo binds to ::1 only.
const BASE = "http://localhost:5179";

// playwright's entry is CJS, so a dynamic import lands the namespace under `default`.
const pw: any = await import(`file://${ROOT}/backend/node_modules/playwright/index.js`);
const { chromium } = (pw.chromium ? pw : pw.default) as typeof import("playwright");

const fx = (await import(`file://${ROOT}/backend/src/runs/fixtures.ts`)) as {
  TEST_CONTENT: any;
  TEST_CONFIG: any;
  TEST_AGENT: any;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RAW = `Northwind Logistics onboarding programme — Q2 review

Northwind replaced a manual onboarding process with an automated workflow last
quarter. Before the change, every new depot hire was onboarded by hand: paper
forms, a shared mailbox for approvals, and no single owner for the process.
Ramp-up took eleven working days on average and three of the five depots
reported repeated data-entry errors in payroll setup.

The team consolidated intake into one workflow with a named owner per depot,
templated the approval chain, and moved document collection into a single
portal. Ramp-up now takes four working days. Payroll data-entry errors are
down, and depot managers report clearer ownership of each hire.

Quotes and figures beyond the above were not supplied for this review.`;

const CONTENT = {
  ...fx.TEST_CONTENT,
  title: "Northwind cuts depot onboarding from eleven days to four",
  subtitle: "How a five-depot logistics operator standardised its onboarding",
  solutionName: "Onboarding Suite",
  industry: "Logistics",
  useCaseFocus: "Depot onboarding",
  executiveSummary:
    "Northwind Logistics replaced a manual, paper-driven onboarding process with a single automated workflow. Ramp-up fell from eleven working days to four, payroll data-entry errors dropped across all five depots, and every hire now has a named owner.",
  goals: [
    "Shorten depot ramp-up",
    "Remove manual paperwork",
    "Give every hire a named owner",
    "Standardise the approval chain",
  ],
  challenges: [
    "Onboarding ran on paper forms",
    "Approvals sat in a shared mailbox",
    "No single owner per depot",
    "Repeated payroll data-entry errors",
  ],
  solutions: [
    "Consolidated intake into one workflow",
    "Named an owner for each depot",
    "Templated the approval chain",
    "Moved documents into one portal",
  ],
  results: [
    "Ramp-up down from eleven days to four",
    "Fewer payroll data-entry errors",
    "Clearer ownership of every hire",
    "Consistent approvals across depots",
  ],
  narrativeSections: [
    {
      heading: "Background",
      body: "Northwind onboarded every depot hire by hand. Paper forms moved between the depot and head office, approvals collected in a shared mailbox, and nobody owned the process end to end. Ramp-up averaged eleven working days.",
    },
    {
      heading: "What changed",
      body: "The team consolidated intake into a single workflow with a named owner per depot, templated the approval chain, and moved document collection into one portal. Ramp-up now takes four working days.",
    },
  ],
  missingFields: ["customer quote", "named executive sponsor"],
  expansionNotes: [
    "Framed the payroll error reduction as an operational efficiency gain; the source reports fewer errors but gives no figure.",
    "Added the closing line about consistent approvals across depots as a summarising claim.",
  ],
};

const CONFIG = {
  ...fx.TEST_CONFIG,
  brandName: "Northwind Logistics",
  brandWebsite: "www.northwind-logistics.com",
  documentLabel: "CUSTOMER CASE STUDY",
  primaryColor: "#1F2A44",
  accentColor: "#2F8F83",
};

const FP = "8c41d0e2a7b3f95104ee7a2d61b8c04f9a3d55e1c7f2b8901de4a6c3b5f70e29";
const ARTIFACT_SHA = "4b19f7c2a8e5d0316b9c47fa2e8d15c703b6a9f48d2c1e5079ab346f8c9d2e10";
const STALE_ARTIFACT_SHA =
  "e07b3a91d4c62f58017ae4b39c2d81f6045a7e3b9c8d1602fa54b7d3e916c8a4";

const SUMMARY = {
  id: "run-1",
  batchId: "batch-7f3ac912",
  name: "northwind-onboarding.md",
  status: "REVIEW",
  paused: false,
  reviewPolicy: "only_when_flagged",
  approvalMode: "required",
  openBlockingCount: 1,
  qaVerdict: null,
  hasArtifact: false,
  extractAttempts: 1,
  renderAttempts: 0,
  lastError: null,
  lastErrorStage: null,
  createdAt: "2026-08-04T09:12:00.000Z",
  updatedAt: "2026-08-04T09:14:20.000Z",
};

const EVENTS = [
  {
    id: "ev-1",
    runId: "run-1",
    seq: 1,
    type: "transition",
    fromStatus: null,
    toStatus: "QUEUED",
    actor: "system",
    detail: { reason: "batch_created" },
    createdAt: "2026-08-04T09:12:00.000Z",
  },
  {
    id: "ev-2",
    runId: "run-1",
    seq: 2,
    type: "claimed",
    fromStatus: "QUEUED",
    toStatus: "EXTRACTING",
    actor: "worker:4321",
    detail: { stage: "extract" },
    createdAt: "2026-08-04T09:12:04.000Z",
  },
  {
    id: "ev-3",
    runId: "run-1",
    seq: 3,
    type: "issue_opened",
    fromStatus: null,
    toStatus: null,
    actor: "worker:4321",
    detail: { code: "source_expansion", locator: "expansionNotes.0" },
    createdAt: "2026-08-04T09:14:18.000Z",
  },
  {
    id: "ev-4",
    runId: "run-1",
    seq: 4,
    type: "transition",
    fromStatus: "EXTRACTING",
    toStatus: "REVIEW",
    actor: "worker:4321",
    detail: { openBlocking: 1, reviewPolicy: "only_when_flagged" },
    createdAt: "2026-08-04T09:14:20.000Z",
  },
];

const BLOCKING_ISSUE = {
  id: "issue-41",
  runId: "run-1",
  issueKey: "source_expansion:expansionNotes.0",
  findingFingerprint: "b7f2c1904ae35d68",
  locator: "expansionNotes.0",
  code: "source_expansion",
  severity: "blocking",
  source: "extraction",
  message:
    "Framed the payroll error reduction as an operational efficiency gain; the source reports fewer errors but gives no figure.",
  status: "open",
  resolutionAction: null,
  resolutionReviewerName: null,
  resolutionNote: null,
  resolvedAt: null,
  detectedAt: "2026-08-04T09:14:18.000Z",
  lastSeenAt: "2026-08-04T09:14:18.000Z",
};

const SECOND_EXPANSION = {
  ...BLOCKING_ISSUE,
  id: "issue-42",
  issueKey: "source_expansion:expansionNotes.1",
  findingFingerprint: "3d9a05e7c418b26f",
  locator: "expansionNotes.1",
  message: "Added the closing line about consistent approvals across depots as a summarising claim.",
};

const WARNING_ISSUE = {
  ...BLOCKING_ISSUE,
  id: "issue-43",
  issueKey: "missing_field:missingFields.0",
  findingFingerprint: "f10c47a2b8d3e659",
  locator: "missingFields.0",
  code: "missing_field",
  severity: "warning",
  message: "Source did not supply: customer quote",
};

function detail(over: any = {}) {
  const { run: runOver = {}, ...rest } = over;
  return {
    run: {
      id: "run-1",
      batchId: "batch-7f3ac912",
      name: "northwind-onboarding.md",
      status: "REVIEW",
      paused: false,
      reviewPolicy: "only_when_flagged",
      approvalMode: "required",
      rawContent: RAW,
      content: CONTENT,
      config: CONFIG,
      agent: fx.TEST_AGENT,
      qa: null,
      extractAttempts: 1,
      renderAttempts: 0,
      nextAttemptAt: null,
      lastError: null,
      lastErrorStage: null,
      createdAt: "2026-08-04T09:12:00.000Z",
      updatedAt: "2026-08-04T09:14:20.000Z",
      ...runOver,
    },
    currentFingerprint: FP,
    renderedFingerprint: null,
    artifactSha256: null,
    hasArtifact: false,
    openBlockingCount: 0,
    issues: [],
    approvals: [],
    events: EVENTS,
    ...rest,
  };
}

const REVIEW_BLOCKING = detail({
  issues: [BLOCKING_ISSUE, SECOND_EXPANSION, WARNING_ISSUE],
  openBlockingCount: 2,
});

const REVIEW_APPROVED = detail({
  run: { updatedAt: "2026-08-04T09:31:05.000Z" },
  issues: [
    {
      ...BLOCKING_ISSUE,
      status: "waived",
      resolutionAction: "waived",
      resolutionReviewerName: "Dana Whitlock",
      resolutionNote:
        "Checked against the depot payroll report — the reduction is real, the figure is simply not in this source.",
      resolvedAt: "2026-08-04T09:28:40.000Z",
    },
    {
      ...SECOND_EXPANSION,
      status: "waived",
      resolutionAction: "waived",
      resolutionReviewerName: "Dana Whitlock",
      resolutionNote: "Fair summary of the three preceding paragraphs.",
      resolvedAt: "2026-08-04T09:29:10.000Z",
    },
    WARNING_ISSUE,
  ],
  openBlockingCount: 0,
  approvals: [
    {
      id: "ap-1",
      runId: "run-1",
      gate: "review",
      decision: "approve",
      reviewerName: "Dana Whitlock",
      note: "Both expansions checked against the depot payroll report.",
      contentFingerprint: FP,
      artifactSha256: null,
      decidedAt: "2026-08-04T09:31:05.000Z",
    },
  ],
  events: [
    ...EVENTS,
    {
      id: "ev-5",
      runId: "run-1",
      seq: 5,
      type: "issue_waived",
      fromStatus: null,
      toStatus: null,
      actor: "user:Dana Whitlock",
      detail: { issueId: "issue-41", findingFingerprint: "b7f2c1904ae35d68" },
      createdAt: "2026-08-04T09:28:40.000Z",
    },
    {
      id: "ev-6",
      runId: "run-1",
      seq: 6,
      type: "issue_waived",
      fromStatus: null,
      toStatus: null,
      actor: "user:Dana Whitlock",
      detail: { issueId: "issue-42", findingFingerprint: "3d9a05e7c418b26f" },
      createdAt: "2026-08-04T09:29:10.000Z",
    },
  ],
});

const APPROVAL_EVENTS = [
  ...REVIEW_APPROVED.events,
  {
    id: "ev-7",
    runId: "run-1",
    seq: 7,
    type: "decision",
    fromStatus: "REVIEW",
    toStatus: "READY_TO_RENDER",
    actor: "user:Dana Whitlock",
    detail: { gate: "review", decision: "approve" },
    createdAt: "2026-08-04T09:31:05.000Z",
  },
  {
    id: "ev-8",
    runId: "run-1",
    seq: 8,
    type: "claimed",
    fromStatus: "READY_TO_RENDER",
    toStatus: "RENDERING",
    actor: "worker:4321",
    detail: { stage: "render" },
    createdAt: "2026-08-04T09:31:09.000Z",
  },
  {
    id: "ev-9",
    runId: "run-1",
    seq: 9,
    type: "render_committed",
    fromStatus: null,
    toStatus: null,
    actor: "worker:4321",
    detail: { artifactSha256: ARTIFACT_SHA },
    createdAt: "2026-08-04T09:31:41.000Z",
  },
  {
    id: "ev-10",
    runId: "run-1",
    seq: 10,
    type: "transition",
    fromStatus: "RENDERING",
    toStatus: "APPROVAL",
    actor: "worker:4321",
    detail: { qaVerdict: "pass" },
    createdAt: "2026-08-04T09:31:41.000Z",
  },
];

const APPROVAL = detail({
  run: {
    status: "APPROVAL",
    renderAttempts: 1,
    updatedAt: "2026-08-04T09:31:41.000Z",
    qa: {
      verdict: "pass",
      checks: [
        {
          stage: "pre_render",
          code: "pre_render_clean",
          verdict: "pass",
          message: "Pre-render quality review found no issues.",
        },
      ],
    },
  },
  issues: REVIEW_APPROVED.issues,
  openBlockingCount: 0,
  approvals: REVIEW_APPROVED.approvals,
  events: APPROVAL_EVENTS,
  renderedFingerprint: FP,
  artifactSha256: ARTIFACT_SHA,
  hasArtifact: true,
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type State = {
  runs: any[];
  detail: any;
  patch: { status: number; body: any } | null;
  pdf: Buffer | null;
  hangExtract: boolean;
};

const state: State = {
  runs: [SUMMARY],
  detail: REVIEW_BLOCKING,
  patch: null,
  pdf: null,
  hangExtract: false,
};

// The full Chromium channel, not the headless shell: the shell has no PDF viewer, so
// the approval workspace's iframe would screenshot blank.
const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({
  viewport: { width: 1680, height: 1040 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
const page = await context.newPage();

// A real PDF for the approval preview, produced by Chromium itself.
{
  const doc = await context.newPage();
  await doc.setContent(`
    <style>
      body { font-family: Georgia, serif; color: #4a4a44; margin: 0; padding: 64px 72px; }
      .label { font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: #7a7568; }
      h1 { font-size: 30px; line-height: 1.15; margin: 22px 0 10px; color: #1F2A44; }
      h2 { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #2F8F83; margin: 26px 0 8px; }
      p { font-size: 12px; line-height: 1.7; margin: 0 0 12px; }
      ul { font-size: 12px; line-height: 1.7; padding-left: 18px; margin: 0; }
      .rule { height: 2px; background: #2F8F83; width: 54px; margin: 18px 0 0; }
      .foot { margin-top: 46px; border-top: 1px solid #e5e2d8; padding-top: 10px; font-size: 9px; color: #7a7568; }
    </style>
    <p class="label">Northwind Logistics · Customer Case Study</p>
    <h1>${CONTENT.title}</h1>
    <div class="rule"></div>
    <h2>Executive summary</h2>
    <p>${CONTENT.executiveSummary}</p>
    <h2>Results</h2>
    <ul>${CONTENT.results.map((r: string) => `<li>${r}</li>`).join("")}</ul>
    <h2>Background</h2>
    <p>${CONTENT.narrativeSections[0].body}</p>
    <h2>What changed</h2>
    <p>${CONTENT.narrativeSections[1].body}</p>
    <p class="foot">© 2026 Northwind Logistics. All rights reserved. · www.northwind-logistics.com</p>
  `);
  state.pdf = await doc.pdf({ format: "Letter", printBackground: true });
  await doc.close();
}

await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  const method = route.request().method();
  const json = (body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  if (url.pathname === "/api/extract" && state.hangExtract) return; // left pending on purpose
  if (url.pathname.endsWith("/pdf")) {
    return route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: state.pdf!,
    });
  }
  if (url.pathname === "/api/runs" && method === "GET") return json({ runs: state.runs });
  if (url.pathname.startsWith("/api/runs/") && method === "GET") return json(state.detail);
  if (url.pathname.startsWith("/api/runs/") && method === "PATCH") {
    const p = state.patch ?? { status: 200, body: { status: state.detail.run.status } };
    return json(p.body, p.status);
  }
  return json({});
});

async function shot(name: string) {
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`✓ ${name}.png`);
}

async function openRun() {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runs" }).click();
  // Every decision is recorded against this name, so the gates need it filled.
  await page.locator("#rail-reviewer").fill("Dana Whitlock");
  await page.getByRole("button", { name: /^Open run /i }).first().click();
  await page.waitForTimeout(400);
}

// -- 1. Create with Agent scope ---------------------------------------------
state.runs = [];
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Create" }).click();
await page.getByRole("button", { name: /batch upload/i }).click();
await page.getByLabel(/source files/i).setInputFiles({
  name: "northwind-onboarding.md",
  mimeType: "text/markdown",
  buffer: Buffer.from(RAW),
});
await page.locator(".intake-scroll").evaluate((el) => (el.scrollTop = 0));
await shot("1-create-agent-scope");

// -- 2. Extraction in progress ---------------------------------------------
state.hangExtract = true;
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Create" }).click();
await page.getByLabel(/source content/i).fill(RAW);
await page.getByRole("button", { name: /analyze and create draft/i }).click();
await shot("2-extraction-in-progress");
state.hangExtract = false;

// -- 3. Review with a blocking human decision ------------------------------
state.runs = [SUMMARY];
state.detail = REVIEW_BLOCKING;
await openRun();
await shot("3-review-blocking-human-decision");

// -- 4. Review after human approval ----------------------------------------
state.runs = [{ ...SUMMARY, openBlockingCount: 0, updatedAt: "2026-08-04T09:31:05.000Z" }];
state.detail = REVIEW_APPROVED;
await openRun();
await shot("4-review-after-human-approval");

// -- 5. Approval before final sign-off -------------------------------------
state.runs = [
  {
    ...SUMMARY,
    status: "APPROVAL",
    openBlockingCount: 0,
    qaVerdict: "pass",
    hasArtifact: true,
    renderAttempts: 1,
    updatedAt: "2026-08-04T09:31:41.000Z",
  },
];
state.detail = APPROVAL;
await openRun();
// Give the embedded PDF viewer time to paint the first page.
await page.waitForTimeout(3500);
await shot("5-approval-before-sign-off");

// -- 6. Stale-state recovery ----------------------------------------------
state.patch = {
  status: 409,
  body: {
    error: "fingerprint_mismatch",
    message: "The artifact changed since you loaded it. Reload before approving.",
    detail: { currentArtifactSha256: STALE_ARTIFACT_SHA },
  },
};
await page.getByRole("button", { name: "Approve final PDF" }).click();
await page.getByRole("button", { name: "Confirm final approval" }).click();
await page.getByText(/different PDF is now the active artifact/i).first().waitFor();
await shot("6-stale-state-recovery");

await browser.close();
console.log(`\nScreenshots written to ${OUT}`);
