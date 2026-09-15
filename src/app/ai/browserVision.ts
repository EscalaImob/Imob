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

export interface PropertyPhotoClassification {
  category: PropertyPhotoCategory;
  label: string;
  confidence: number;
  scores: Array<{ category: PropertyPhotoCategory; label: string; confidence: number }>;
}

export interface PropertyDepthMap {
  width: number;
  height: number;
  data: Uint8Array;
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
}

const labelMap: Record<string, { category: PropertyPhotoCategory; label: string }> = {
  "the exterior facade of a residential property": { category: "facade", label: "Fachada" },
  "the interior of a living room": { category: "living_room", label: "Sala" },
  "the interior of a kitchen": { category: "kitchen", label: "Cozinha" },
  "the interior of a bedroom": { category: "bedroom", label: "Quarto" },
  "the interior of a bathroom": { category: "bathroom", label: "Banheiro" },
  "a balcony or terrace of a residential property": { category: "balcony", label: "Varanda / terraço" },
  "a residential leisure area with a pool, gym, or barbecue": { category: "leisure", label: "Área de lazer" },
  "an outdoor yard, garden, or patio of a residential property": { category: "outdoor", label: "Área externa" },
  "another type of real estate photo": { category: "other", label: "Outros" },
};

let worker: Worker | null = null;
let sequence = 0;
const pending = new Map<string, PendingRequest<unknown>>();

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
      if (message.type === "error") {
        request.reject(new Error(typeof message.message === "string" ? message.message : "VISION_ERROR"));
        return;
      }
      request.resolve(message);
    });
    worker.addEventListener("error", () => {
      for (const request of pending.values()) request.reject(new Error("VISION_WORKER_ERROR"));
      pending.clear();
      worker?.terminate();
      worker = null;
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
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, onProgress });
    visionWorker().postMessage({ ...payload, id });
  });
}

export async function classifyPropertyPhoto(
  imageUrl: string,
  onProgress?: (progress: WorkerProgress) => void,
): Promise<PropertyPhotoClassification> {
  const message = await request<{ result?: unknown }>(
    { type: "classify", imageUrl },
    onProgress,
  );
  if (!Array.isArray(message.result) || message.result.length === 0) throw new Error("CLASSIFICATION_EMPTY");
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
  return { ...best, scores };
}

export async function estimatePropertyPhotoDepth(
  imageUrl: string,
  onProgress?: (progress: WorkerProgress) => void,
): Promise<PropertyDepthMap> {
  const message = await request<{ data?: unknown; width?: unknown; height?: unknown }>(
    { type: "depth", imageUrl },
    onProgress,
  );
  if (!(message.data instanceof ArrayBuffer) || typeof message.width !== "number" || typeof message.height !== "number") {
    throw new Error("DEPTH_OUTPUT_INVALID");
  }
  return { width: message.width, height: message.height, data: new Uint8Array(message.data) };
}

export function browserVisionSupport(): { supported: boolean; webGpu: boolean } {
  return {
    supported: typeof Worker !== "undefined" && typeof WebAssembly !== "undefined",
    webGpu: typeof navigator !== "undefined" && "gpu" in navigator,
  };
}
