// Sentence-aware text utilities. Used by normalizeUseCase to cap long
// narrative bodies, executive summaries, and visual descriptions without
// cutting mid-sentence or leaving dangling transition words.

// Conservative sentence splitter: a terminator (. ! ?), optional closing
// quote/paren, then whitespace and a capital letter or end-of-string. Does
// not perfectly handle abbreviations (Dr., U.S., 3.14) but those are rare
// in narrative bodies; the worst case is one slightly-too-long sentence,
// never a broken cut.
const SENTENCE_BOUNDARY = /([.!?]["')\]]?)(\s+(?=[A-Z(])|\s*$)/g;

// Words that often sit at the start of a sentence and read as broken when
// they appear alone at the end of a truncated body. If the last "sentence"
// we keep is just one of these followed by a partial clause with no
// terminator, drop it.
const TRANSITION_ORPHANS = new Set([
  "ultimately",
  "therefore",
  "however",
  "moreover",
  "furthermore",
  "additionally",
  "consequently",
  "meanwhile",
  "specifically",
  "notably",
  "importantly",
  "indeed",
  "finally",
  "thus",
  "hence",
]);

const TERMINATORS = /[.!?]["')\]]?$/;

export function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export function splitSentences(text: string): string[] {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return [];
  const out: string[] = [];
  let last = 0;
  for (const match of collapsed.matchAll(SENTENCE_BOUNDARY)) {
    const end = match.index! + match[1]!.length;
    out.push(collapsed.slice(last, end).trim());
    last = end + (match[2]?.length ?? 0);
  }
  if (last < collapsed.length) {
    out.push(collapsed.slice(last).trim());
  }
  return out.filter((s) => s.length > 0);
}

function endsOnTerminator(text: string): boolean {
  return TERMINATORS.test(text.trim());
}

function startsWithOrphan(text: string): boolean {
  const first = text.trim().split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[,.;:]$/, "").toLowerCase();
  return TRANSITION_ORPHANS.has(cleaned);
}

// Truncate `text` so it contains at most `maxWords` words, preferring to
// end on a sentence boundary. If the first sentence alone exceeds maxWords,
// fall back to a word-strip cut at the word boundary nearest the budget.
// Final output never ends mid-word and never ends on a dangling transition
// orphan with no completing clause.
export function truncateToSentence(
  text: string,
  options: { maxWords: number }
): string {
  const { maxWords } = options;
  const collapsed = text.trim().replace(/\s+/g, " ");
  if (!collapsed) return "";
  if (wordCount(collapsed) <= maxWords) return collapsed;

  const sentences = splitSentences(collapsed);
  if (sentences.length === 0) return collapsed;

  const kept: string[] = [];
  let used = 0;
  for (const s of sentences) {
    const w = wordCount(s);
    if (used + w > maxWords) break;
    kept.push(s);
    used += w;
  }

  // Strip a trailing sentence that begins with a transition orphan and
  // doesn't terminate cleanly (rare since splitSentences already requires
  // a terminator, but guard anyway).
  while (kept.length > 0) {
    const last = kept[kept.length - 1]!;
    if (!endsOnTerminator(last) && startsWithOrphan(last)) {
      kept.pop();
      continue;
    }
    break;
  }

  if (kept.length > 0) return kept.join(" ");

  // No full sentence fits within the budget — fall back to a word-strip cut.
  const words = collapsed.split(/\s+/).slice(0, maxWords);
  let trimmed = words.join(" ").replace(/[,;:\-—]+$/, "").trim();
  // If we ended on a transition orphan with no terminator, drop the last word.
  while (trimmed && !endsOnTerminator(trimmed)) {
    const lastWord = trimmed.split(/\s+/).pop() ?? "";
    if (TRANSITION_ORPHANS.has(lastWord.replace(/[,.;:]$/, "").toLowerCase())) {
      trimmed = trimmed.replace(/\s+\S+$/, "").replace(/[,;:\-—]+$/, "").trim();
      continue;
    }
    break;
  }
  return trimmed || words.join(" ");
}

// Bullet-level truncation: char-cap based (bullets are short, sentence
// splitting is overkill). Cuts at last word boundary, strips trailing
// punctuation, and drops a final orphaned transition word.
export function truncateBulletSafe(text: string, maxChars: number): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  if (collapsed.length <= maxChars) return collapsed;
  const cut = collapsed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  let trimmed = lastSpace > 60 ? cut.slice(0, lastSpace) : cut;
  trimmed = trimmed.replace(/[,.;:\-—]$/, "").trim();
  const lastWord = trimmed.split(/\s+/).pop() ?? "";
  if (TRANSITION_ORPHANS.has(lastWord.replace(/[,.;:]$/, "").toLowerCase())) {
    trimmed = trimmed.replace(/\s+\S+$/, "").replace(/[,.;:\-—]$/, "").trim();
  }
  return trimmed || cut;
}
