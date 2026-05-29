import type { InlineVisualBlock } from "@shared/useCaseSchema";

// Browser-side id minter — crypto.randomUUID is available in every browser
// the Vite preview ships to.
export function mintInlineVisualId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `iv-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

// When a narrative section is removed, drop visuals attached to that
// section and shift later section indices down by 1. Visuals whose index
// becomes out of range get clamped to the last valid section so user
// uploads aren't silently lost.
export function reindexInlineVisualsForSectionRemoval(
  visuals: InlineVisualBlock[],
  removedIndex: number,
  remainingSectionCount: number
): InlineVisualBlock[] {
  if (visuals.length === 0) return visuals;
  if (remainingSectionCount <= 0) return [];
  const lastValid = remainingSectionCount - 1;
  return visuals.flatMap((v) => {
    const idx = v.sectionIndex ?? 0;
    if (idx === removedIndex) return [];
    if (idx > removedIndex) {
      const next = idx - 1;
      return [{ ...v, sectionIndex: Math.min(next, lastValid) }];
    }
    return [{ ...v, sectionIndex: Math.min(idx, lastValid) }];
  });
}

export function createUploadedInlineVisual(
  dataUrl: string,
  sectionIndex: number,
  opts: { caption?: string; placement?: InlineVisualBlock["placement"] } = {}
): InlineVisualBlock {
  return {
    id: mintInlineVisualId(),
    kind: "image",
    sourceType: "uploaded",
    dataUrl,
    caption: opts.caption,
    altText: opts.caption,
    sectionIndex,
    placement: opts.placement ?? "after_section",
    status: "ready",
  };
}

export function createPastedInlineVisual(
  dataUrl: string,
  sectionIndex: number,
  opts: { caption?: string; placement?: InlineVisualBlock["placement"] } = {}
): InlineVisualBlock {
  return {
    id: mintInlineVisualId(),
    kind: "image",
    sourceType: "pasted",
    dataUrl,
    caption: opts.caption,
    altText: opts.caption,
    sectionIndex,
    placement: opts.placement ?? "after_section",
    status: "ready",
  };
}

export function hasUnresolvedSlots(
  visuals: InlineVisualBlock[] | undefined
): boolean {
  if (!visuals || visuals.length === 0) return false;
  return visuals.some(
    (v) =>
      v.kind === "image_slot" &&
      (v.status === "needs_upload" || v.status === "recommended")
  );
}
