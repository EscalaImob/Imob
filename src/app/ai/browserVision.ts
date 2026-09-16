export type PropertyPhotoCategory =
  | "facade"
  | "living_room"
  | "kitchen"
  | "bedroom"
  | "bathroom"
  | "balcony"
  | "leisure"
  | "outdoor"
  | "other";

export type PropertyVisionBackend = "webgpu" | "wasm";

export interface PropertyPhotoClassification {
  category: PropertyPhotoCategory;
  label: string;
  confidence: number;
  scores: Array<{ category: PropertyPhotoCategory; label: string; confidence: number }>;
  backend: PropertyVisionBackend;
}

export interface PropertyDepthMap {
  width: number;
  height: number;
  data: Uint8Array;
  backend: PropertyVisionBackend;
}

export interface PropertyPhotoQuality {
  score: number;
  label: "Ótima" | "Boa" | "Regular" | "Fraca";
  brightness: number;
  contrast: number;
  sharpness: number;
  darkClipping: number;
  lightClipping: number;
  fingerprint: string;
}

interface WorkerProgress {
  status: string | null;
  progress: number | null;
  file: string | null;
}

interface PendingRequest<T> {
  resolve(value: T): void;
  reject(reason?: unknown): void;
  onProgress?: (progress: WorkerProgress) => void;
  timeoutId: ReturnType<typeof globalThis.setTimeout>;
}

interface ImagePayload {
  data: ArrayBuffer;
  contentType: string;
}

async function loadImagePayload(imageUrl: string): Promise<ImagePayload> {
  let response: Response;
  try {
    response = await fetch(imageUrl, { cache: "no-store" });
  } catch {
    throw new Error("IMAGE_FETCH_NETWORK_ERROR");
  }
  if (!response.ok) throw new Error(`IMAGE_FETCH_FAILED_${response.status}`);
  const data = await response.arrayBuffer();
  if (data.byteLength === 0) throw new Error("IMAGE_FETCH_EMPTY");
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  return { data, contentType };
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function qualityLabel(score: number): PropertyPhotoQuality["label"] {
  if (score >= 78) return "Ótima";
  if (score >= 62) return "Boa";
  if (score >= 45) return "Regular";
  return "Fraca";
}

async function bitmapFromPayload(image: ImagePayload): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") throw new Error("IMAGE_BITMAP_UNAVAILABLE");
  return createImageBitmap(new Blob([image.data], { type: image.contentType }));
}

function averageHash(context: CanvasRenderingContext2D): string {
  const sample = document.createElement("canvas");
  sample.width = 8;
  sample.height = 8;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return "";
  sampleContext.drawImage(context.canvas, 0, 0, 8, 8);
  const data = sampleContext.getImageData(0, 0, 8, 8).data;
  const luminance: number[] = [];
  for (let index = 0; index < data.length; index += 4) {
    luminance.push(((data[index] ?? 0) * 0.2126 + (data[index + 1] ?? 0) * 0.7152 + (data[index + 2] ?? 0) * 0.0722) / 255);
  }
  const mean = luminance.reduce((sum, value) => sum + value, 0) / Math.max(1, luminance.length);
  return luminance.map((value) => value >= mean ? "1" : "0").join("");
}

export async function analyzePropertyPhotoQuality(imageUrl: string): Promise<PropertyPhotoQuality> {
  const image = await loadImagePayload(imageUrl);
  const bitmap = await bitmapFromPayload(image);
  try {
    const maxSide = 192;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(24, Math.round(bitmap.width * scale));
    const height = Math.max(24, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const luminance = new Float32Array(width * height);
    let sum = 0;
    let sumSquares = 0;
    let dark = 0;
    let light = 0;
    for (let pixel = 0, offset = 0; pixel < luminance.length; pixel += 1, offset += 4) {
      const value = (((pixels[offset] ?? 0) * 0.2126) + ((pixels[offset + 1] ?? 0) * 0.7152) + ((pixels[offset + 2] ?? 0) * 0.0722)) / 255;
      luminance[pixel] = value;
      sum += value;
      sumSquares += value * value;
      if (value <= 0.035) dark += 1;
      if (value >= 0.965) light += 1;
    }
    const count = Math.max(1, luminance.length);
    const brightness = sum / count;
    const variance = Math.max(0, (sumSquares / count) - brightness * brightness);
    const contrast = Math.sqrt(variance);
    let gradientSum = 0;
    let gradientCount = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const dx = Math.abs((luminance[index + 1] ?? 0) - (luminance[index - 1] ?? 0));
        const dy = Math.abs((luminance[index + width] ?? 0) - (luminance[index - width] ?? 0));
        gradientSum += (dx + dy) / 2;
        gradientCount += 1;
      }
    }
    const sharpness = gradientSum / Math.max(1, gradientCount);
    const darkClipping = dark / count;
    const lightClipping = light / count;
    const exposureScore = clamp(1 - Math.abs(brightness - 0.52) / 0.5);
    const contrastScore = clamp((contrast - 0.06) / 0.2);
    const sharpnessScore = clamp((sharpness - 0.018) / 0.095);
    const clippingScore = clamp(1 - ((darkClipping + lightClipping) * 2.6));
    const score = Math.round(clamp(
      exposureScore * 0.3 + contrastScore * 0.22 + sharpnessScore * 0.34 + clippingScore * 0.14,
    ) * 100);
    return {
      score,
      label: qualityLabel(score),
      brightness,
      contrast,
      sharpness,
      darkClipping,
      lightClipping,
      fingerprint: averageHash(context),
    };
  } finally {
    bitmap.close();
  }
}

export function propertyPhotoFingerprintSimilarity(left: string, right: string): number {
  if (!left || !right || left.length !== right.length) return 0;
  let equal = 0;
  for (let index = 0; index < left.length; index += 1) if (left[index] === right[index]) equal += 1;
  return equal / Math.max(1, left.length);
}

const labelMap: Record<string, { category: PropertyPhotoCategory; label: string }> = {
  "the front exterior facade of a house or residential building": { category: "facade", label: "Fachada" },
  "the interior of a living room": { category: "living_room", label: "Sala" },
  "the interior of a kitchen": { category: "kitchen", label: "Cozinha" },
  "the interior of a bedroom": { category: "bedroom", label: "Quarto" },
  "the interior of a bathroom": { category: "bathroom", label: "Banheiro" },
  "a balcony or terrace of a residential property": { category: "balcony", label: "Varanda / terraço" },
  "a residential leisure area with a pool, gym, or barbecue": { category: "leisure", label: "Área de lazer" },
  "an outdoor yard, garden, or patio of a residential property": { category: "outdoor", label: "Área externa" },
};

let worker: Worker | null = null;
let sequence = 0;
const pending = new Map<string, PendingRequest<unknown>>();
const WORKER_REQUEST_TIMEOUT_MS = 90_000;

function rejectAllPending(reason: Error): void {
  for (const request of pending.values()) {
    globalThis.clearTimeout(request.timeoutId);
    request.reject(reason);
  }
  pending.clear();
}

function terminateVisionWorker(reason?: Error): void {
  if (reason) rejectAllPending(reason);
  else {
    for (const request of pending.values()) globalThis.clearTimeout(request.timeoutId);
    pending.clear();
  }
  worker?.terminate();
  worker = null;
}

function visionWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./browserVision.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent) => {
      const message = event.data as {
        id?: unknown;
        type?: unknown;
        result?: unknown;
        data?: unknown;
        width?: unknown;
        height?: unknown;
        message?: unknown;
        status?: unknown;
        progress?: unknown;
        file?: unknown;
        backend?: unknown;
      };
      if (typeof message.id !== "string") return;
      const request = pending.get(message.id);
      if (!request) return;

      if (message.type === "progress") {
        request.onProgress?.({
          status: typeof message.status === "string" ? message.status : null,
          progress: typeof message.progress === "number" ? message.progress : null,
          file: typeof message.file === "string" ? message.file : null,
        });
        return;
      }
      pending.delete(message.id);
      globalThis.clearTimeout(request.timeoutId);
      if (message.type === "error") {
        request.reject(new Error(typeof message.message === "string" ? message.message : "VISION_ERROR"));
        return;
      }
      request.resolve(message);
    });
    worker.addEventListener("error", () => {
      terminateVisionWorker(new Error("VISION_WORKER_ERROR"));
    });
  }
  return worker;
}

function request<T>(
  payload: Record<string, unknown>,
  onProgress?: (progress: WorkerProgress) => void,
): Promise<T> {
  const id = `vision-${Date.now()}-${++sequence}`;
  return new Promise<T>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      if (!pending.has(id)) return;
      terminateVisionWorker(new Error("VISION_WORKER_TIMEOUT"));
    }, WORKER_REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, onProgress, timeoutId });
    const message = { ...payload, id };
    const imageData = payload.imageData;
    try {
      if (imageData instanceof ArrayBuffer) {
        visionWorker().postMessage(message, [imageData]);
      } else {
        visionWorker().postMessage(message);
      }
    } catch (error) {
      globalThis.clearTimeout(timeoutId);
      pending.delete(id);
      reject(error);
    }
  });
}

export function resetBrowserVisionWorker(): void {
  terminateVisionWorker(new Error("VISION_WORKER_RESET"));
}

export async function classifyPropertyPhoto(
  imageUrl: string,
  onProgress?: (progress: WorkerProgress) => void,
): Promise<PropertyPhotoClassification> {
  const image = await loadImagePayload(imageUrl);
  const message = await request<{ result?: unknown; backend?: unknown }>(
    { type: "classify", imageData: image.data, contentType: image.contentType },
    onProgress,
  );
  if (!Array.isArray(message.result) || message.result.length === 0) throw new Error("CLASSIFICATION_EMPTY");
  if (message.backend !== "webgpu" && message.backend !== "wasm") throw new Error("VISION_BACKEND_INVALID");
  const rawScores = message.result.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { label?: unknown; score?: unknown };
    if (typeof candidate.label !== "string" || typeof candidate.score !== "number") return [];
    const mapped = labelMap[candidate.label];
    return mapped ? [{ ...mapped, confidence: Math.max(0, candidate.score) }] : [];
  });
  const total = rawScores.reduce((sum, item) => sum + item.confidence, 0);
  const scores = rawScores
    .map((item) => ({ ...item, confidence: total > 0 ? item.confidence / total : 0 }))
    .sort((left, right) => right.confidence - left.confidence);
  const best = scores[0];
  if (!best) throw new Error("CLASSIFICATION_EMPTY");
  return { ...best, scores, backend: message.backend };
}

export async function estimatePropertyPhotoDepth(
  imageUrl: string,
  onProgress?: (progress: WorkerProgress) => void,
): Promise<PropertyDepthMap> {
  const image = await loadImagePayload(imageUrl);
  const message = await request<{ data?: unknown; width?: unknown; height?: unknown; backend?: unknown }>(
    { type: "depth", imageData: image.data, contentType: image.contentType },
    onProgress,
  );
  if (!(message.data instanceof ArrayBuffer) || typeof message.width !== "number" || typeof message.height !== "number") {
    throw new Error("DEPTH_OUTPUT_INVALID");
  }
  if (message.backend !== "webgpu" && message.backend !== "wasm") throw new Error("VISION_BACKEND_INVALID");
  return { width: message.width, height: message.height, data: new Uint8Array(message.data), backend: message.backend };
}

export function browserVisionSupport(): { supported: boolean; webGpu: boolean } {
  return {
    supported: typeof Worker !== "undefined" && typeof WebAssembly !== "undefined",
    webGpu: typeof navigator !== "undefined" && "gpu" in navigator,
  };
}
