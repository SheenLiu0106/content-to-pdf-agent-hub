// Shared image-handling util used by HeroImageUpload, SupportingImageUpload,
// and the article-report InlineVisualEditor. Downscales an image File to a
// base64 data URL so it can ride along on the JSON payload to /api/render-pdf.

export const IMAGE_ACCEPTED_MIME = "image/png,image/jpeg,image/webp";
// Checked on the ORIGINAL file, before downscaling. Kept generous because
// fileToDataUrl shrinks every image to <=1600px / re-encoded JPEG (a few
// hundred KB) regardless of input size, so the raw size barely affects the
// payload — this cap only exists to reject pathologically huge files. Modern
// phone photos routinely hit 10-15MB, so 8MB was rejecting normal uploads.
export const IMAGE_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const IMAGE_WARN_FILE_BYTES = 2 * 1024 * 1024;
export const IMAGE_MAX_DIMENSION = 1600;

export interface FileToDataUrlOptions {
  maxDimension?: number;
  // Quality only applies to JPEG/WebP encoding; PNG is lossless and ignores
  // the argument.
  quality?: number;
}

export async function fileToDataUrl(
  file: File,
  opts: FileToDataUrlOptions = {}
): Promise<string> {
  const maxDimension = opts.maxDimension ?? IMAGE_MAX_DIMENSION;
  const quality = opts.quality ?? 0.85;
  const isWebp = file.type === "image/webp";

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  let outW = width;
  let outH = height;
  if (longest > maxDimension) {
    const scale = maxDimension / longest;
    outW = Math.round(width * scale);
    outH = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, outW, outH);
  bitmap.close?.();

  // Encode as WebP when the input was WebP (preserves transparency / smaller
  // size for line art); otherwise fall through to JPEG which is the smallest
  // for photographic content.
  const mime = isWebp ? "image/webp" : "image/jpeg";
  return canvas.toDataURL(mime, quality);
}

export interface FileSizeCheck {
  ok: boolean;
  warning: string | null;
}

export function checkImageFileSize(file: File): FileSizeCheck {
  if (file.size > IMAGE_MAX_FILE_BYTES) {
    return {
      ok: false,
      warning: "File is larger than 25MB. Please choose a smaller image.",
    };
  }
  if (file.size > IMAGE_WARN_FILE_BYTES) {
    return {
      ok: true,
      warning: "Image is larger than 2MB — it will be downscaled for you.",
    };
  }
  return { ok: true, warning: null };
}
