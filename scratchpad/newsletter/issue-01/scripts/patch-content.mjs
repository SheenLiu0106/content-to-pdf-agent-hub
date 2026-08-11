/*
 * Reviewer edits applied through the same PATCH update_content action the Review
 * workspace calls. Used for the bulk field edits that would otherwise be 20
 * separate UI interactions; the decision actions (waive, approve) are all driven
 * through the real UI instead.
 *
 * The agent's structure, section choice and points are kept. Wording is trimmed
 * to the case-study bullet policy because the editor's fixed-height bullet
 * fields clip anything much over ~60 characters (defect D2 in README.md).
 */
const API = "http://127.0.0.1:8788/api/runs";
const RUN = process.env.RUN_ID ?? "063bf9e7-db92-4488-b76c-5312fd02b7c6";

const res = await fetch(`${API}/${RUN}`);
const detail = await res.json();
const content = detail.run.content;

const next = {
  ...content,
  title: "Consolidating Multi-System Scheduling",
  subtitle: "Subcontractor and maintenance workflows across 240 sites",
  useCaseFocus: "Scheduling consolidation",
  executiveSummary:
    "Brightwater Facilities Group ran four legacy scheduling systems inherited through regional acquisitions, splitting planned and reactive maintenance and coordinating subcontractors by email and phone. The FieldSync platform consolidated both work types into one scheduling view across 240 commercial sites, with a site-manager portal and a custom finance integration.",
  goals: [
    "One view of all scheduled work",
    "No duplicate dispatch",
    "Subcontractors on one system",
    "Job data finance can reconcile",
  ],
  challenges: [
    "Four scheduling systems",
    "Planned and reactive kept apart",
    "Subcontractors run by email",
    "Duplicate and missing asset data",
  ],
  solutions: [
    "One FieldSync scheduling view",
    "Site-manager visibility portal",
    "Subcontractors on the portal",
    "Jobs flow into finance",
  ],
  results: [
    "Planned and reactive in one view",
    "Duplicate dispatch eradicated",
    "40% of subcontractors live",
    "Invoicing no longer rekeyed",
  ],
  narrativeSections: content.narrativeSections.map((s) => ({
    heading: s.heading,
    body: s.body.length > 420 ? `${s.body.slice(0, 400).replace(/\s+\S*$/, "")}.` : s.body,
  })),
};

const patch = await fetch(`${API}/${RUN}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "update_content", content: next }),
});
console.log(patch.status, await patch.text());
