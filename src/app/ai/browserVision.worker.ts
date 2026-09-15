type VisionRequest =
  | { id: string; type: "classify"; imageUrl: string }
  | { id: string; type: "depth"; imageUrl: string };

type ProgressPayload = {
  status?: string;
  progress?: number;
  file?: string;
};

type ZeroShotResult = Array<{ label: string; score: number }>;
type PipelineCallable = (...args: unknown[]) => Promise<unknown>;
type TransformersModule = {
  pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<PipelineCallable>;
};

type WorkerScope = {
  onmessage: ((event: MessageEvent<VisionRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const scope = globalThis as unknown as WorkerScope;
const TRANSFORMERS_ESM = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";
const CLASSIFICATION_MODEL = "Xenova/siglip-base-patch16-224";
const DEPTH_MODEL = "onnx-community/depth-anything-v2-small";
const labels = [
  "the front exterior facade of a house or residential building",
  "the interior of a living room",
  "the interior of a kitchen",
  "the interior of a bedroom",
  "the interior of a bathroom",
  "a balcony or terrace of a residential property",
  "a residential leisure area with a pool, gym, or barbecue",
  "an outdoor yard, garden, or patio of a residential property",
];

let transformersPromise: Promise<TransformersModule> | null = null;
let classifierPromise: Promise<PipelineCallable> | null = null;
let depthPromise: Promise<PipelineCallable> | null = null;

function transformers(): Promise<TransformersModule> {
  if (!transformersPromise) {
    transformersPromise = import(/* @vite-ignore */ TRANSFORMERS_ESM) as Promise<TransformersModule>;
  }
  return transformersPromise;
}

function progressFor(id: string) {
  return (progress: ProgressPayload) => {
    const percentage = typeof progress.progress === "number"
      ? Math.max(0, Math.min(100, progress.progress))
      : null;
    scope.postMessage({
      id,
      type: "progress",
      status: progress.status ?? null,
      progress: percentage,
      file: progress.file ?? null,
    });
  };
}

async function classifier(id: string): Promise<PipelineCallable> {
  if (!classifierPromise) {
    classifierPromise = transformers().then(({ pipeline }) => pipeline(
      "zero-shot-image-classification",
      CLASSIFICATION_MODEL,
      { dtype: "q8", progress_callback: progressFor(id) },
    ));
  }
  return classifierPromise;
}

async function depthEstimator(id: string): Promise<PipelineCallable> {
  if (!depthPromise) {
    depthPromise = transformers().then(({ pipeline }) => pipeline(
      "depth-estimation",
      DEPTH_MODEL,
      { dtype: "q8", progress_callback: progressFor(id) },
    ));
  }
  return depthPromise;
}

function normalizedClassification(value: unknown): ZeroShotResult {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { label?: unknown; score?: unknown };
    if (typeof candidate.label !== "string" || typeof candidate.score !== "number") return [];
    return [{ label: candidate.label, score: candidate.score }];
  });
}

function depthPayload(value: unknown): { data: Uint8Array; width: number; height: number } {
  if (!value || typeof value !== "object") throw new Error("DEPTH_OUTPUT_INVALID");
  const depth = (value as { depth?: unknown }).depth;
  if (!depth || typeof depth !== "object") throw new Error("DEPTH_OUTPUT_INVALID");
  const raw = depth as { data?: unknown; width?: unknown; height?: unknown };
  const pixelData = raw.data;
  if (
    !(pixelData instanceof Uint8Array)
    && !(pixelData instanceof Uint8ClampedArray)
  ) {
    throw new Error("DEPTH_OUTPUT_INVALID");
  }
  if (typeof raw.width !== "number" || typeof raw.height !== "number") {
    throw new Error("DEPTH_OUTPUT_INVALID");
  }
  return { data: Uint8Array.from(pixelData), width: raw.width, height: raw.height };
}

scope.onmessage = (event) => {
  const request = event.data;
  void (async () => {
    try {
      if (request.type === "classify") {
        const pipe = await classifier(request.id);
        const result = normalizedClassification(await pipe(
          request.imageUrl,
          labels,
          { hypothesis_template: "{}" },
        ));
        scope.postMessage({ id: request.id, type: "classification", result });
        return;
      }

      const pipe = await depthEstimator(request.id);
      const result = depthPayload(await pipe(request.imageUrl));
      const buffer = result.data.buffer.slice(
        result.data.byteOffset,
        result.data.byteOffset + result.data.byteLength,
      );
      scope.postMessage(
        { id: request.id, type: "depth", width: result.width, height: result.height, data: buffer },
        [buffer],
      );
    } catch (error) {
      scope.postMessage({
        id: request.id,
        type: "error",
        message: error instanceof Error ? error.message : "VISION_ERROR",
      });
    }
  })();
};
