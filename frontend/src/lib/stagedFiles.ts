// Reading and validating dropped source files. Shared by the Create intake's batch
// mode and the Runs workbench dialog so the rules live in exactly one place.

/** Mirrors CreateRunsRequestSchema in backend/src/runs/types.ts. */
export const MIN_CHARS = 20;
export const MAX_CHARS = 50_000;
export const MAX_ITEMS = 500;
export const ACCEPTED_EXTENSIONS = /\.(txt|md|markdown)$/i;
export const ACCEPT_ATTR = ".txt,.md,.markdown,text/plain,text/markdown";
export const FORMAT_HINT = "Plain text and Markdown (.txt, .md) up to 50,000 characters each.";

export interface StagedFile {
  key: string;
  name: string;
  rawContent: string | null;
  error: string | null;
}

/** Checked client-side only so a bad file is reported against that file. */
export function validateSource(name: string, text: string): string | null {
  if (!ACCEPTED_EXTENSIONS.test(name)) return "Only .txt and .md files are supported.";
  if (text.trim().length === 0) return "This file is empty.";
  if (text.length < MIN_CHARS) return `Too short — needs at least ${MIN_CHARS} characters.`;
  if (text.length > MAX_CHARS)
    return `Too long — ${text.length.toLocaleString()} characters, limit is ${MAX_CHARS.toLocaleString()}.`;
  return null;
}

/** Reads every picked file, recording a per-file error rather than failing the batch. */
export async function readStagedFiles(picked: FileList): Promise<StagedFile[]> {
  const staged: StagedFile[] = [];
  for (const [i, file] of Array.from(picked).entries()) {
    const key = `${file.name}:${file.lastModified}:${i}`;
    const name = file.name.slice(0, 200);
    try {
      const text = await file.text();
      const problem = validateSource(name, text);
      staged.push({ key, name, rawContent: problem ? null : text, error: problem });
    } catch {
      staged.push({ key, name, rawContent: null, error: "The file could not be read." });
    }
  }
  return staged;
}

export const validStaged = (files: StagedFile[]) =>
  files.filter((f) => f.rawContent !== null && !f.error);
