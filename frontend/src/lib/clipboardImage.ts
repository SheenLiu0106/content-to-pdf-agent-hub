export type ClipboardImageResult =
  | { ok: true; file: File }
  | {
      ok: false;
      reason: "unsupported" | "denied" | "empty" | "error";
      message: string;
    };

const UNSUPPORTED_MESSAGE =
  "Clipboard image paste is not available in this browser. Try clicking the upload box and pressing Cmd+V / Ctrl+V, or upload a local file.";

const DENIED_MESSAGE =
  "Clipboard read was denied. Try clicking the upload box and pressing Cmd+V / Ctrl+V, or upload a local file.";

const EMPTY_MESSAGE =
  "No image found in clipboard. Copy an image first, then click Paste image.";

export async function readImageFromClipboard(): Promise<ClipboardImageResult> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.read) {
    return { ok: false, reason: "unsupported", message: UNSUPPORTED_MESSAGE };
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith("image/"));
      if (!imgType) continue;
      const blob = await item.getType(imgType);
      const ext = imgType.split("/")[1] || "png";
      const file = new File([blob], `pasted.${ext}`, { type: imgType });
      return { ok: true, file };
    }
    return { ok: false, reason: "empty", message: EMPTY_MESSAGE };
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      return { ok: false, reason: "denied", message: DENIED_MESSAGE };
    }
    return {
      ok: false,
      reason: "error",
      message: `Could not read clipboard: ${(err as Error).message}`,
    };
  }
}
