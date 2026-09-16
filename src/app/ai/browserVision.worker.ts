type VisionRequest =
  | { id: string; type: "classify"; imageData: ArrayBuffer; contentType: string }
  | { id: string; type: "depth"; imageData: ArrayBuffer; contentType: string };

type ProgressPayload = {
  status?: string;
  progress?: number;
  file?: string;
};

type VisionBackend = "webgpu" | "wasm";
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
const TRANSFORMERS_ESM_CANDIDATES = [
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm",
  "https://esm.sh/@huggingface/transformers@3.8.1?bundle",
] as const;
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
const classifierPromises = new Map<VisionBackend, Promise<PipelineCallable>>();
const depthPromises = new Map<VisionBackend, Promise<PipelineCallable>>();
let classifierWebGpuDisabled = false;
let depthWebGpuDisabled = false;

function transformers(): Promise<TransformersModule> {
  if (!transformersPromise) {
    transformersPromise = (async () => {
      let lastError: unknown;
      for (const source of TRANSFORMERS_ESM_CANDIDATES) {
        try {
          return await import(/* @vite-ignore */ source) as TransformersModule;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error("TRANSFORMERS_IMPORT_FAILED");
    })();
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

function hasWorkerWebGpu(): boolean {
  const workerNavigator = globalThis.navigator as Navigator & { gpu?: unknown };
  return Boolean(workerNavigator?.gpu);
}

async function createPipeline(
  kind: "classifier" | "depth",
  id: string,
  backend: VisionBackend,
): Promise<PipelineCallable> {
  const cache = kind === "classifier" ? classifierPromises : depthPromises;
  let existing = cache.get(backend);
  if (!existing) {
    const task = kind === "classifier" ? "zero-shot-image-classification" : "depth-estimation";
    const model = kind === "classifier" ? CLASSIFICATION_MODEL : DEPTH_MODEL;
    existing = transformers().then(({ pipeline }) => pipeline(
      task,
      model,
      { dtype: "q8", device: backend, progress_callback: progressFor(id) },
    ));
    cache.set(backend, existing);
    existing.catch(() => {
      if (cache.get(backend) === existing) cache.delete(backend);
    });
  }
  return existing;
}

async function runWithFallback<T>(
  kind: "classifier" | "depth",
  id: string,
  execute: (pipe: PipelineCallable) => Promise<T>,
): Promise<{ result: T; backend: VisionBackend }> {
  const webGpuDisabled = kind === "classifier" ? classifierWebGpuDisabled : depthWebGpuDisabled;
  const backends: VisionBackend[] = hasWorkerWebGpu() && !webGpuDisabled ? ["webgpu", "wasm"] : ["wasm"];
  let lastError: unknown;

  for (const backend of backends) {
    try {
      const pipe = await createPipeline(kind, id, backend);
      return { result: await execute(pipe), backend };
    } catch (error) {
      lastError = error;
      if (backend === "webgpu") {
        if (kind === "classifier") classifierWebGpuDisabled = true;
        else depthWebGpuDisabled = true;
        const cache = kind === "classifier" ? classifierPromises : depthPromises;
        cache.delete("webgpu");
        scope.postMessage({ id, type: "progress", status: "webgpu_fallback", progress: null, file: null });
        continue;
      }
      break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("VISION_PIPELINE_FAILED");
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
  if (!(pixelData instanceof Uint8Array) && !(pixelData instanceof Uint8ClampedArray)) {
    throw new Error("DEPTH_OUTPUT_INVALID");
  }
  if (typeof raw.width !== "number" || typeof raw.height !== "number") {
    throw new Error("DEPTH_OUTPUT_INVALID");
  }
  return { data: Uint8Array.from(pixelData), width: raw.width, height: raw.height };
}

async function withLocalImage<T>(
  request: VisionRequest,
  operation: (imageUrl: string) => Promise<T>,
): Promise<T> {
  if (!(request.imageData instanceof ArrayBuffer) || request.imageData.byteLength === 0) {
    throw new Error("IMAGE_DATA_INVALID");
  }
  const blob = new Blob([request.imageData], { type: request.contentType || "image/jpeg" });
  const imageUrl = URL.createObjectURL(blob);
  try {
    return await operation(imageUrl);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

scope.onmessage = (event) => {
  const request = event.data;
  void (async () => {
    try {
      if (request.type === "classify") {
        const execution = await runWithFallback("classifier", request.id, async (pipe) => normalizedClassification(await withLocalImage(
          request,
          (imageUrl) => pipe(imageUrl, labels, { hypothesis_template: "{}" }),
        )));
        scope.postMessage({ id: request.id, type: "classification", result: execution.result, backend: execution.backend });
        return;
      }

      const execution = await runWithFallback("depth", request.id, async (pipe) => depthPayload(await withLocalImage(
        request,
        (imageUrl) => pipe(imageUrl),
      )));
      const buffer = execution.result.data.buffer.slice(
        execution.result.data.byteOffset,
        execution.result.data.byteOffset + execution.result.data.byteLength,
      );
      scope.postMessage(
        { id: request.id, type: "depth", width: execution.result.width, height: execution.result.height, data: buffer, backend: execution.backend },
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
