import type { PropertyPhotoQuality } from "./browserVision";

export type LocalPhotoCrop = "original" | "square" | "portrait_4_5" | "story_9_16";

export interface LocalPhotoAdjustments {
  brightness: number;
  contrast: number;
  sharpness: number;
  crop: LocalPhotoCrop;
}

export interface LocalPhotoExport {
  blob: Blob;
  width: number;
  height: number;
  mimeType: "image/jpeg";
}

export const DEFAULT_LOCAL_PHOTO_ADJUSTMENTS: LocalPhotoAdjustments = {
  brightness: 0,
  contrast: 0,
  sharpness: 0,
  crop: "original",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function targetRatio(crop: LocalPhotoCrop): number | null {
  switch (crop) {
    case "square": return 1;
    case "portrait_4_5": return 4 / 5;
    case "story_9_16": return 9 / 16;
    default: return null;
  }
}

function cropRect(width: number, height: number, crop: LocalPhotoCrop): { x: number; y: number; width: number; height: number } {
  const ratio = targetRatio(crop);
  if (!ratio) return { x: 0, y: 0, width, height };
  const currentRatio = width / height;
  if (currentRatio > ratio) {
    const nextWidth = Math.max(1, Math.round(height * ratio));
    return { x: Math.round((width - nextWidth) / 2), y: 0, width: nextWidth, height };
  }
  const nextHeight = Math.max(1, Math.round(width / ratio));
  return { x: 0, y: Math.round((height - nextHeight) / 2), width, height: nextHeight };
}

function applyToneAndSharpness(context: CanvasRenderingContext2D, adjustments: LocalPhotoAdjustments): void {
  if (adjustments.brightness === 0 && adjustments.contrast === 0 && adjustments.sharpness === 0) return;
  const { width, height } = context.canvas;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const brightness = 1 + clamp(adjustments.brightness, -30, 30) / 100;
  const contrast = 1 + clamp(adjustments.contrast, -30, 30) / 100;

  for (let offset = 0; offset < data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const normalized = (data[offset + channel] ?? 0) / 255;
      const contrasted = ((normalized - 0.5) * contrast) + 0.5;
      data[offset + channel] = clamp(Math.round(contrasted * brightness * 255), 0, 255);
    }
  }

  const sharpness = clamp(adjustments.sharpness, 0, 1.2);
  if (sharpness > 0 && width >= 3 && height >= 3) {
    const source = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const offset = (y * width + x) * 4;
        const left = offset - 4;
        const right = offset + 4;
        const up = offset - width * 4;
        const down = offset + width * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const centerValue = source[offset + channel] ?? 0;
          const laplacian = (centerValue * 4)
            - (source[left + channel] ?? centerValue)
            - (source[right + channel] ?? centerValue)
            - (source[up + channel] ?? centerValue)
            - (source[down + channel] ?? centerValue);
          data[offset + channel] = clamp(Math.round(centerValue + laplacian * sharpness), 0, 255);
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
}

export async function loadLocalPhotoBitmap(imageUrl: string): Promise<ImageBitmap> {
  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("PHOTO_FETCH_FAILED");
  const blob = await response.blob();
  if (blob.size <= 0) throw new Error("PHOTO_FETCH_EMPTY");
  return createImageBitmap(blob);
}

export function renderLocalPhoto(
  bitmap: ImageBitmap,
  canvas: HTMLCanvasElement,
  adjustments: LocalPhotoAdjustments,
  maxLongSide: number,
): { width: number; height: number } {
  const source = cropRect(bitmap.width, bitmap.height, adjustments.crop);
  const scale = Math.min(1, Math.max(1, maxLongSide) / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("CANVAS_UNAVAILABLE");
  context.clearRect(0, 0, width, height);
  context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, width, height);
  applyToneAndSharpness(context, adjustments);
  return { width, height };
}

export async function exportLocalPhoto(bitmap: ImageBitmap, adjustments: LocalPhotoAdjustments): Promise<LocalPhotoExport> {
  const canvas = document.createElement("canvas");
  const dimensions = renderLocalPhoto(bitmap, canvas, adjustments, 2200);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PHOTO_ENCODE_FAILED")), "image/jpeg", 0.9);
  });
  return { blob, ...dimensions, mimeType: "image/jpeg" };
}

export function suggestedLocalPhotoAdjustments(quality: PropertyPhotoQuality | null): LocalPhotoAdjustments {
  if (!quality) return { ...DEFAULT_LOCAL_PHOTO_ADJUSTMENTS };
  const brightness = clamp(Math.round((0.52 - quality.brightness) * 70), -18, 18);
  const contrast = clamp(Math.round((0.16 - quality.contrast) * 150), -12, 22);
  const sharpness = clamp(Number(((0.055 - quality.sharpness) * 8).toFixed(1)), 0, 0.8);
  return { brightness, contrast, sharpness, crop: "original" };
}
