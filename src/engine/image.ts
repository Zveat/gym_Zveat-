/**
 * Photos of the user's own machines (spec: "Lat Pulldown — Gym Machine #2" with
 * its own photo).
 *
 * Phone cameras produce 3–8 MB files; the whole database lives in IndexedDB on
 * the device, so a photo is downscaled and re-encoded before it is stored. The
 * result is a data URL, which keeps the exercise a single self-contained record
 * — no separate blob store to keep in sync, and export/backup still works.
 */

export const MAX_PHOTO_EDGE = 1280;
export const PHOTO_QUALITY = 0.82;
/** Refuse anything that would bloat the database beyond reason. */
export const MAX_STORED_BYTES = 1_200_000;

export interface PreparedPhoto {
  dataUrl: string;
  width: number;
  height: number;
  /** Approximate stored size of the data URL, in bytes. */
  bytes: number;
}

export class PhotoError extends Error {}

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  // 4 base64 chars carry 3 bytes; padding shaves off one or two.
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Longest edge capped at `maxEdge`, aspect ratio kept, never upscaled. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_PHOTO_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Reads an image file and returns a downscaled JPEG data URL.
 *
 * Kept out of the component so it can be reasoned about (and the sizing maths
 * tested) without a DOM.
 */
export async function preparePhoto(
  file: File,
  maxEdge = MAX_PHOTO_EDGE,
): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) {
    throw new PhotoError('Это не изображение.');
  }

  const bitmap = await decode(file);
  const size = fitWithin(bitmap.width, bitmap.height, maxEdge);

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new PhotoError('Браузер не дал обработать изображение.');
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  if ('close' in bitmap) bitmap.close();

  // PNG screenshots of a machine's settings plate compress far worse than JPEG,
  // and a photo never needs transparency.
  const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
  const bytes = dataUrlBytes(dataUrl);

  if (bytes > MAX_STORED_BYTES) {
    throw new PhotoError('Фото слишком большое даже после сжатия. Попробуйте другое.');
  }

  return { dataUrl, width: size.width, height: size.height, bytes };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Safari can fail on some HEIC/odd profiles; fall back to <img>.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new PhotoError('Не удалось прочитать изображение.'));
      img.src = url;
    });
  } finally {
    // The bitmap is already drawn by the time the caller needs it.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_048_576).toFixed(1)} МБ`;
  return `${Math.round(bytes / 1024)} КБ`;
}
