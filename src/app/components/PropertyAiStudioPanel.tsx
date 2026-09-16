import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AppApiError } from "../../services/appApi";
import {
  confirmAiStudioReelAsset,
  createAiStudioReelAssetUpload,
  deleteAiStudioReelAsset,
  generatePropertyMarketingText,
  getAiStudioRuntime,
  listAiStudioReelAssets,
  recordAiStudioReelFeedback,
  recordAiStudioReelTelemetry,
  recordAiStudioReelUsage,
  uploadAiStudioReelFile,
  type AiStudioReelAsset,
  type AiStudioReelAssetMetadata,
  type AiStudioReelFeedbackReason,
  type AiStudioReelFeedbackSentiment,
  type AiStudioReelTelemetryInput,
  type AiStudioVisionBackend,
  type AiStudioRuntime,
  type AiStudioTextKind,
  type AiStudioTextResult,
} from "../../services/aiStudioApi";
import { listPropertyImages, type PropertyImageItem } from "../../services/propertiesApi";
import {
  createReelLiteMp4,
  reelLiteEstimatedDuration,
  reelLiteSupport,
  type ReelLiteFacts,
  type ReelLiteProgress,
  type ReelLiteResult,
  type ReelLiteSource,
  type ReelLiteTemplate,
} from "../ai/reelLite";
import {
  analyzePropertyPhotoQuality,
  browserVisionSupport,
  classifyPropertyPhoto,
  estimatePropertyPhotoDepth,
  propertyPhotoFingerprintSimilarity,
  resetBrowserVisionWorker,
  type PropertyDepthMap,
  type PropertyPhotoClassification,
  type PropertyPhotoQuality,
  type PropertyVisionBackend,
} from "../ai/browserVision";
import { PropertyPhotoAdjuster } from "./PropertyPhotoAdjuster";

interface Props {
  organizationId: string;
  organizationName: string;
  organizationLogoUrl: string | null;
  currentUserName: string;
  propertyId: string | null;
  propertyTitle: string;
  reelFacts: ReelLiteFacts;
  canUpdate: boolean;
  hasUnsavedChanges: boolean;
}

type AnalysisByImage = Record<string, PropertyPhotoClassification>;
type QualityByImage = Record<string, PropertyPhotoQuality>;

const MAX_REEL_IMAGES = 8;

const reelFeedbackReasonOptions: Array<{ value: AiStudioReelFeedbackReason; label: string }> = [
  { value: "movement", label: "Movimento / animação" },
  { value: "photo_selection", label: "Seleção ou ordem das fotos" },
  { value: "visual_quality", label: "Qualidade visual" },
  { value: "text_branding", label: "Textos ou marca" },
  { value: "performance", label: "Demorou demais" },
  { value: "other", label: "Outro motivo" },
];

function reelTelemetryClientProfile(): Pick<AiStudioReelTelemetryInput, "browserFamily" | "deviceClass" | "hardwareConcurrency" | "deviceMemoryGb"> {
  if (typeof navigator === "undefined") {
    return { browserFamily: "other", deviceClass: "unknown", hardwareConcurrency: null, deviceMemoryGb: null };
  }
  const userAgent = navigator.userAgent.toLocaleLowerCase("en-US");
  const browserFamily: AiStudioReelTelemetryInput["browserFamily"] = userAgent.includes("firefox/")
    ? "firefox"
    : userAgent.includes("safari/") && !userAgent.includes("chrome/") && !userAgent.includes("chromium/") && !userAgent.includes("crios/")
      ? "safari"
      : userAgent.includes("chrome/") || userAgent.includes("chromium/") || userAgent.includes("crios/") || userAgent.includes("edg/")
        ? "chromium"
        : "other";
  const coarseNavigator = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  const touchPoints = Number(navigator.maxTouchPoints ?? 0);
  const smallViewport = typeof globalThis.innerWidth === "number" && globalThis.innerWidth <= 820;
  const mobileHint = coarseNavigator.userAgentData?.mobile === true || /iphone|android.+mobile/u.test(userAgent);
  const tabletHint = /ipad|tablet|android/u.test(userAgent) && !mobileHint;
  const deviceClass: AiStudioReelTelemetryInput["deviceClass"] = mobileHint
    ? "mobile"
    : tabletHint || (touchPoints > 1 && smallViewport)
      ? "tablet"
      : "desktop";
  const hardwareConcurrency = Number.isInteger(navigator.hardwareConcurrency) && navigator.hardwareConcurrency > 0
    ? Math.min(256, navigator.hardwareConcurrency)
    : null;
  const deviceMemory = coarseNavigator.deviceMemory;
  const deviceMemoryGb = typeof deviceMemory === "number" && Number.isFinite(deviceMemory) && deviceMemory > 0
    ? Math.min(256, deviceMemory)
    : null;
  return { browserFamily, deviceClass, hardwareConcurrency, deviceMemoryGb };
}

function mergeVisionBackend(current: AiStudioVisionBackend | null, next: PropertyVisionBackend): AiStudioVisionBackend {
  if (!current || current === "none") return next;
  if (current === next || current === "mixed") return current;
  return "mixed";
}

function summarizeVisionBackends(backends: Set<PropertyVisionBackend>): AiStudioVisionBackend {
  if (backends.size === 0) return "none";
  if (backends.size > 1) return "mixed";
  return backends.has("webgpu") ? "webgpu" : "wasm";
}

function reelDepthCalculationLimit(
  profile: Pick<AiStudioReelTelemetryInput, "deviceClass" | "hardwareConcurrency" | "deviceMemoryGb">,
  webGpuAvailable: boolean,
  imageCount: number,
): number {
  const count = Math.max(0, Math.min(MAX_REEL_IMAGES, imageCount));
  if (count === 0) return 0;
  const veryConstrained = (profile.deviceMemoryGb !== null && profile.deviceMemoryGb <= 2)
    || (profile.hardwareConcurrency !== null && profile.hardwareConcurrency <= 2);
  if (veryConstrained) return Math.min(2, count);
  const constrained = !webGpuAvailable
    || profile.deviceClass === "mobile"
    || profile.deviceClass === "tablet"
    || (profile.deviceMemoryGb !== null && profile.deviceMemoryGb <= 4)
    || (profile.hardwareConcurrency !== null && profile.hardwareConcurrency <= 4);
  return constrained ? Math.min(4, count) : count;
}

function reelTelemetryErrorCode(error: unknown): string {
  const raw = error instanceof Error ? error.message.trim().toUpperCase() : "REEL_FAILED";
  return /^[A-Z0-9_]{1,80}$/u.test(raw) ? raw : "REEL_FAILED";
}

function recommendReelImageIds(
  images: PropertyImageItem[],
  analysis: AnalysisByImage,
  quality: QualityByImage,
): string[] {
  const ranked = images
    .map((image, index) => ({
      image,
      index,
      category: analysis[image.id]?.category ?? "other",
      quality: quality[image.id] ?? null,
      score: (quality[image.id]?.score ?? 50) + (image.primary ? 12 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const picked: typeof ranked = [];
  const seenCategories = new Set<string>();
  const isNearDuplicate = (candidate: (typeof ranked)[number]) =>
    Boolean(candidate.quality?.fingerprint) && picked.some((selected) =>
      Boolean(selected.quality?.fingerprint)
      && propertyPhotoFingerprintSimilarity(candidate.quality!.fingerprint, selected.quality!.fingerprint) >= 0.94,
    );
  const add = (candidate: (typeof ranked)[number], allowDuplicate = false) => {
    if (picked.some((item) => item.image.id === candidate.image.id)) return;
    if (!allowDuplicate && isNearDuplicate(candidate)) return;
    picked.push(candidate);
    seenCategories.add(candidate.category);
  };

  const primary = ranked.find((candidate) => candidate.image.primary);
  if (primary) add(primary, true);
  for (const candidate of ranked) {
    if (picked.length >= MAX_REEL_IMAGES) break;
    if (!seenCategories.has(candidate.category)) add(candidate);
  }
  for (const candidate of ranked) {
    if (picked.length >= MAX_REEL_IMAGES) break;
    add(candidate);
  }
  for (const candidate of ranked) {
    if (picked.length >= MAX_REEL_IMAGES) break;
    add(candidate, true);
  }

  const selected = new Set(picked.map((candidate) => candidate.image.id));
  return images.filter((image) => selected.has(image.id)).map((image) => image.id);
}

const textActions: Array<{ kind: AiStudioTextKind; label: string; description: string }> = [
  { kind: "property_description", label: "Descrição do imóvel", description: "Texto comercial para site e anúncio." },
  { kind: "instagram_caption", label: "Legenda para Instagram", description: "Legenda curta com CTA e hashtags." },
  { kind: "whatsapp_message", label: "Mensagem para WhatsApp", description: "Mensagem pronta para compartilhar com um interessado." },
  { kind: "cta", label: "CTA", description: "Chamada curta para contato ou visita." },
];

type MarketingKitResults = Partial<Record<AiStudioTextKind, AiStudioTextResult>>;

function marketingKitDocument(propertyTitle: string, results: MarketingKitResults): string {
  const title = propertyTitle.trim() || "Imóvel";
  const sections = textActions.flatMap((action) => {
    const result = results[action.kind];
    return result ? [`## ${action.label}\n${result.text.trim()}`] : [];
  });
  return [`KIT DE DIVULGAÇÃO · ${title}`, "", ...sections].join("\n\n").trim();
}

function safeTextFilename(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLocaleLowerCase("pt-BR");
  return normalized || "imovel";
}


function progressLabel(progress: { status: string | null; progress: number | null; file: string | null } | null): string | null {
  if (!progress) return null;
  if (progress.progress !== null) return `Baixando modelo local · ${Math.round(progress.progress)}%`;
  if (progress.status === "webgpu_fallback") return "WebGPU não ficou estável para este modelo; continuando em WASM.";
  if (progress.status === "ready") return "Modelo local pronto.";
  return progress.status ? "Preparando modelo local..." : null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function classifyPhotoWithRetry(
  imageUrl: string,
  onProgress: (progress: { status: string | null; progress: number | null; file: string | null }) => void,
): Promise<PropertyPhotoClassification> {
  let lastError: unknown;
  const retryDelays = [800, 1800];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await classifyPropertyPhoto(imageUrl, onProgress);
    } catch (error) {
      lastError = error;
      if (attempt >= retryDelays.length) break;
      resetBrowserVisionWorker();
      await wait(retryDelays[attempt] ?? 800);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("CLASSIFICATION_FAILED");
}

async function estimateDepthWithRetry(
  imageUrl: string,
  onProgress?: (progress: { status: string | null; progress: number | null; file: string | null }) => void,
): Promise<PropertyDepthMap> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await estimatePropertyPhotoDepth(imageUrl, onProgress);
    } catch (error) {
      lastError = error;
      if (attempt === 1) break;
      resetBrowserVisionWorker();
      await wait(600);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("DEPTH_FAILED");
}

function DepthParallaxPreview({ imageUrl, depth }: { imageUrl: string; depth: PropertyDepthMap }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<ImageData | null>(null);
  const [position, setPosition] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let bitmap: ImageBitmap | null = null;
    void (async () => {
      try {
        setReady(false);
        setError(null);
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error("IMAGE_FETCH_FAILED");
        bitmap = await createImageBitmap(await response.blob());
        const maxWidth = 420;
        const maxHeight = 280;
        const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const offscreen = document.createElement("canvas");
        offscreen.width = width;
        offscreen.height = height;
        const context = offscreen.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("CANVAS_UNAVAILABLE");
        context.drawImage(bitmap, 0, 0, width, height);
        const source = context.getImageData(0, 0, width, height);
        if (!active) return;
        sourceRef.current = source;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = width;
          canvas.height = height;
        }
        setReady(true);
      } catch {
        if (active) setError("Não foi possível montar a prévia 2.5D neste navegador.");
      } finally {
        bitmap?.close();
      }
    })();
    return () => {
      active = false;
      sourceRef.current = null;
    };
  }, [imageUrl]);

  const render = useCallback((movement: number) => {
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    if (!canvas || !source) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const output = context.createImageData(source.width, source.height);
    const maxShift = Math.max(5, Math.round(source.width * 0.035));
    const width = source.width;
    const height = source.height;
    for (let y = 0; y < height; y += 1) {
      const depthY = Math.min(depth.height - 1, Math.floor((y / height) * depth.height));
      for (let x = 0; x < width; x += 1) {
        const depthX = Math.min(depth.width - 1, Math.floor((x / width) * depth.width));
        const depthValue = depth.data[depthY * depth.width + depthX] ?? 128;
        const normalized = depthValue / 255;
        const shift = Math.round((normalized - 0.5) * maxShift * movement);
        const sourceX = Math.max(0, Math.min(width - 1, x - shift));
        const sourceOffset = (y * width + sourceX) * 4;
        const targetOffset = (y * width + x) * 4;
        output.data[targetOffset] = source.data[sourceOffset] ?? 0;
        output.data[targetOffset + 1] = source.data[sourceOffset + 1] ?? 0;
        output.data[targetOffset + 2] = source.data[sourceOffset + 2] ?? 0;
        output.data[targetOffset + 3] = 255;
      }
    }
    context.putImageData(output, 0, 0);
  }, [depth]);

  useEffect(() => {
    if (ready) render(position);
  }, [position, ready, render]);

  return <div className="app-ai-depth-preview">
    <div className="app-ai-depth-canvas-wrap">
      <canvas ref={canvasRef} aria-label="Prévia de movimento 2.5D baseada em profundidade" />
      {!ready && !error && <div className="app-ai-depth-loading"><span className="app-spinner"/>Preparando prévia...</div>}
    </div>
    {error ? <div className="app-inline-error">{error}</div> : <label>
      <span>Movimento da câmera</span>
      <input type="range" min="-1" max="1" step="0.05" value={position} onChange={(event: ChangeEvent<HTMLInputElement>) => setPosition(Number(event.target.value))}/>
      <small>Arraste para simular deslocamento lateral usando o mapa de profundidade calculado no seu navegador.</small>
    </label>}
  </div>;
}

export function PropertyAiStudioPanel({
  organizationId,
  organizationName,
  organizationLogoUrl,
  currentUserName,
  propertyId,
  propertyTitle,
  reelFacts,
  canUpdate,
  hasUnsavedChanges,
}: Props) {
  const [images, setImages] = useState<PropertyImageItem[]>([]);
  const [loadingImages, setLoadingImages] = useState(Boolean(propertyId));
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionProgress, setVisionProgress] = useState<{ status: string | null; progress: number | null; file: string | null } | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisByImage>({});
  const [quality, setQuality] = useState<QualityByImage>({});
  const [selectedForReelIds, setSelectedForReelIds] = useState<string[]>([]);
  const [reelSelectionReady, setReelSelectionReady] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [visionBackend, setVisionBackend] = useState<AiStudioVisionBackend | null>(null);
  const [lastAnalysisMs, setLastAnalysisMs] = useState<number | null>(null);
  const [depthImageId, setDepthImageId] = useState<string | null>(null);
  const [depth, setDepth] = useState<PropertyDepthMap | null>(null);
  const [textBusy, setTextBusy] = useState<AiStudioTextKind | null>(null);
  const [textResult, setTextResult] = useState<AiStudioTextResult | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [marketingKitBusy, setMarketingKitBusy] = useState(false);
  const [marketingKitResults, setMarketingKitResults] = useState<MarketingKitResults>({});
  const [marketingKitError, setMarketingKitError] = useState<string | null>(null);
  const [reelBusy, setReelBusy] = useState(false);
  const [reelProgress, setReelProgress] = useState<ReelLiteProgress | null>(null);
  const [reelError, setReelError] = useState<string | null>(null);
  const [reelResult, setReelResult] = useState<(ReelLiteResult & { url: string; generationId: string; imageIds: string[]; usageRecorded: boolean }) | null>(null);
  const [reelTemplate, setReelTemplate] = useState<ReelLiteTemplate>("editorial");
  const [reelSoundtrack, setReelSoundtrack] = useState(true);
  const [reelUseOrganizationBrand, setReelUseOrganizationBrand] = useState(true);
  const [reelHeadline, setReelHeadline] = useState("");
  const [reelCtaText, setReelCtaText] = useState("Agende uma visita");
  const [reelSupportText, setReelSupportText] = useState("");
  const [reelShowPrice, setReelShowPrice] = useState(true);
  const [reelShowLocation, setReelShowLocation] = useState(true);
  const [reelShowSpecs, setReelShowSpecs] = useState(true);
  const [aiRuntime, setAiRuntime] = useState<AiStudioRuntime | null>(null);
  const [aiRuntimeLoading, setAiRuntimeLoading] = useState(Boolean(propertyId && canUpdate));
  const [aiRuntimeError, setAiRuntimeError] = useState<string | null>(null);
  const [reelUsageWarning, setReelUsageWarning] = useState<string | null>(null);
  const [reelAssets, setReelAssets] = useState<AiStudioReelAsset[]>([]);
  const [reelAssetsLoading, setReelAssetsLoading] = useState(Boolean(propertyId && canUpdate));
  const [reelAssetSaving, setReelAssetSaving] = useState(false);
  const [reelAssetDeletingId, setReelAssetDeletingId] = useState<string | null>(null);
  const [reelAssetError, setReelAssetError] = useState<string | null>(null);
  const [reelFeedbackSentiment, setReelFeedbackSentiment] = useState<AiStudioReelFeedbackSentiment | null>(null);
  const [reelFeedbackReasons, setReelFeedbackReasons] = useState<AiStudioReelFeedbackReason[]>([]);
  const [reelFeedbackBusy, setReelFeedbackBusy] = useState(false);
  const [reelFeedbackSubmitted, setReelFeedbackSubmitted] = useState(false);
  const [reelFeedbackError, setReelFeedbackError] = useState<string | null>(null);
  const runtimeDefaultsAppliedRef = useRef<string | null>(null);
  const reelDepthCacheRef = useRef<Map<string, PropertyDepthMap>>(new Map());
  const reelGenerationAttemptsRef = useRef(0);
  const support = useMemo(() => browserVisionSupport(), []);
  const reelSupport = useMemo(() => reelLiteSupport(), []);

  const loadImages = useCallback(async () => {
    if (!propertyId) {
      setImages([]);
      setLoadingImages(false);
      return;
    }
    setLoadingImages(true);
    try {
      const result = await listPropertyImages(organizationId, propertyId);
      const activeIds = new Set(result.map((item) => item.id));
      for (const imageId of reelDepthCacheRef.current.keys()) {
        if (!activeIds.has(imageId)) reelDepthCacheRef.current.delete(imageId);
      }
      setImages(result);
      if (result.length) setDepthImageId((current) => current && activeIds.has(current) ? current : (result.find((item) => item.primary) ?? result[0])?.id ?? null);
    } catch {
      setVisionError("Não foi possível carregar as imagens do imóvel.");
    } finally {
      setLoadingImages(false);
    }
  }, [organizationId, propertyId]);

  useEffect(() => { void loadImages(); }, [loadImages]);

  const loadReelAssets = useCallback(async () => {
    if (!propertyId || !canUpdate) {
      setReelAssets([]);
      setReelAssetsLoading(false);
      return;
    }
    setReelAssetsLoading(true);
    try {
      setReelAssets(await listAiStudioReelAssets(organizationId, propertyId));
      setReelAssetError(null);
    } catch (error) {
      setReelAssetError(error instanceof AppApiError ? error.message : "Não foi possível carregar os Reels salvos.");
    } finally {
      setReelAssetsLoading(false);
    }
  }, [canUpdate, organizationId, propertyId]);

  useEffect(() => { void loadReelAssets(); }, [loadReelAssets]);

  useEffect(() => {
    reelDepthCacheRef.current.clear();
    setDepth(null);
    setAnalysis({});
    setQuality({});
    setSelectedForReelIds([]);
    setReelSelectionReady(false);
    setVisionError(null);
    setVisionBackend(null);
    setLastAnalysisMs(null);
    setTextResult(null);
    setTextError(null);
    setMarketingKitResults({});
    setMarketingKitError(null);
    setReelAssetError(null);
    setReelFeedbackSentiment(null);
    setReelFeedbackReasons([]);
    setReelFeedbackSubmitted(false);
    setReelFeedbackError(null);
    reelGenerationAttemptsRef.current = 0;
  }, [organizationId, propertyId]);

  useEffect(() => {
    runtimeDefaultsAppliedRef.current = null;
    setAiRuntime(null);
    setAiRuntimeError(null);
    if (!propertyId || !canUpdate) {
      setAiRuntimeLoading(false);
      return;
    }
    let active = true;
    setAiRuntimeLoading(true);
    void getAiStudioRuntime(organizationId)
      .then((runtime) => {
        if (!active) return;
        setAiRuntime(runtime);
        setAiRuntimeError(null);
        if (runtimeDefaultsAppliedRef.current !== organizationId) {
          const defaults = runtime.defaults;
          setReelTemplate(defaults.defaultTemplate);
          setReelSoundtrack(defaults.soundtrack);
          setReelUseOrganizationBrand(defaults.useOrganizationBrand);
          setReelHeadline(defaults.headline ?? "");
          setReelCtaText(defaults.ctaText);
          setReelSupportText(defaults.supportText ?? "");
          setReelShowPrice(defaults.showPrice);
          setReelShowLocation(defaults.showLocation);
          setReelShowSpecs(defaults.showSpecs);
          runtimeDefaultsAppliedRef.current = organizationId;
        }
      })
      .catch((loadError) => {
        if (!active) return;
        if (loadError instanceof AppApiError && loadError.code === "AI_STUDIO_DISABLED") {
          setAiRuntimeError("O Estúdio IA não está habilitado no plano desta organização.");
        } else {
          setAiRuntimeError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar o plano do Estúdio IA.");
        }
      })
      .finally(() => { if (active) setAiRuntimeLoading(false); });
    return () => { active = false; };
  }, [canUpdate, organizationId, propertyId]);

  useEffect(() => () => {
    if (reelResult?.url) URL.revokeObjectURL(reelResult.url);
  }, [reelResult?.url]);

  async function analyzePhotos() {
    if (!support.supported || visionBusy || images.length === 0 || !propertyId || aiRuntimeError) return;
    const analysisStartedAt = performance.now();
    setVisionBusy(true);
    setVisionError(null);
    setVisionProgress(null);
    try {
      // Renova as URLs temporárias antes da análise. Isso evita exigir que o usuário
      // remova e envie novamente uma foto quando uma URL assinada estiver vencida.
      const freshImages = await listPropertyImages(organizationId, propertyId);
      setImages(freshImages);
      const next: AnalysisByImage = {};
      const nextQuality: QualityByImage = {};
      const failedClassification: string[] = [];
      const failedQuality: string[] = [];
      for (const image of freshImages) {
        try {
          // A imagem é baixada no contexto da página e enviada ao worker como bytes.
          // Assim, o modelo não depende de refazer fetch da URL assinada dentro do worker.
          const classification = await classifyPhotoWithRetry(image.viewUrl, setVisionProgress);
          next[image.id] = classification;
          setVisionBackend((current) => mergeVisionBackend(current, classification.backend));
        } catch (error) {
          failedClassification.push(image.originalName);
          console.warn("[Estúdio IMOB] Falha na classificação local", {
            imageId: image.id,
            imageName: image.originalName,
            error: error instanceof Error ? error.message : "CLASSIFICATION_FAILED",
          });
        }
        try {
          nextQuality[image.id] = await analyzePropertyPhotoQuality(image.viewUrl);
        } catch (error) {
          failedQuality.push(image.originalName);
          console.warn("[Estúdio IMOB] Falha na análise local de qualidade", {
            imageId: image.id,
            imageName: image.originalName,
            error: error instanceof Error ? error.message : "QUALITY_FAILED",
          });
        }
        setAnalysis({ ...next });
        setQuality({ ...nextQuality });
      }
      setSelectedForReelIds(recommendReelImageIds(freshImages, next, nextQuality));
      setReelSelectionReady(true);
      if (failedClassification.length > 0 || failedQuality.length > 0) {
        const failed = new Set([...failedClassification, ...failedQuality]).size;
        setVisionError(
          failed >= freshImages.length
            ? "A análise local ficou incompleta. Tente novamente; não é necessário remover ou reenviar as imagens."
            : `A análise concluiu parcialmente. ${failed} foto(s) ficaram sem classificação ou nota de qualidade; tente novamente para completar.`,
        );
      }
    } catch (error) {
      console.warn("[Estúdio IMOB] Falha ao preparar a análise local", error);
      setVisionError("Não foi possível preparar a análise local. Tente novamente; não é necessário remover ou reenviar a imagem.");
    } finally {
      setLastAnalysisMs(Math.max(0, Math.round(performance.now() - analysisStartedAt)));
      setVisionBusy(false);
      setVisionProgress(null);
    }
  }

  function selectBestPhotos() {
    if (images.length === 0) return;
    setSelectedForReelIds(recommendReelImageIds(images, analysis, quality));
    setReelSelectionReady(true);
    setVisionError(null);
  }

  function handleAdjustedImages(updated: PropertyImageItem[]) {
    setImages(updated);
    setReelSelectionReady(false);
    setSelectedForReelIds([]);
    setDepth(null);
    setVisionError(null);
  }

  function toggleReelPhoto(imageId: string, checked: boolean) {
    const defaultSelection = images.slice(0, MAX_REEL_IMAGES).map((image) => image.id);
    setSelectedForReelIds((current) => {
      const base = reelSelectionReady ? current : defaultSelection;
      if (!checked) return base.filter((id) => id !== imageId);
      if (base.includes(imageId)) return base;
      if (base.length >= MAX_REEL_IMAGES) {
        setVisionError(`O Reel Lite usa no máximo ${MAX_REEL_IMAGES} fotos.`);
        return base;
      }
      setVisionError(null);
      return [...base, imageId];
    });
    setReelSelectionReady(true);
  }

  async function calculateDepth() {
    const selected = images.find((item) => item.id === depthImageId);
    if (!selected || visionBusy || aiRuntimeError) return;
    setVisionBusy(true);
    setVisionError(null);
    setDepth(null);
    setVisionProgress(null);
    try {
      const nextDepth = await estimateDepthWithRetry(selected.viewUrl, setVisionProgress);
      reelDepthCacheRef.current.set(selected.id, nextDepth);
      setVisionBackend((current) => mergeVisionBackend(current, nextDepth.backend));
      setDepth(nextDepth);
    } catch {
      setVisionError("Não foi possível calcular a profundidade desta foto no navegador.");
    } finally {
      setVisionBusy(false);
      setVisionProgress(null);
    }
  }

  async function generateReelLite() {
    if (!propertyId || reelBusy || images.length === 0 || !reelSupport.supported || aiRuntimeLoading || aiRuntimeError) return;
    if (aiRuntime && aiRuntime.quota.remaining !== null && aiRuntime.quota.remaining <= 0) {
      setReelError("O limite mensal de Reels desta organização foi atingido.");
      return;
    }

    const generationId = globalThis.crypto.randomUUID();
    const generationStartedAt = performance.now();
    const regeneration = reelGenerationAttemptsRef.current > 0;
    reelGenerationAttemptsRef.current += 1;
    const clientProfile = reelTelemetryClientProfile();
    const requestedAudio = reelSoundtrack && reelSupport.audioSupported;
    let telemetryImageCount = Math.min(MAX_REEL_IMAGES, reelSelectionReady ? selectedForReelIds.length : images.length);
    let preparationMs = 0;
    let renderMs = 0;
    let depthCacheHits = 0;
    let depthCalculated = 0;
    let telemetryVisionBackend: AiStudioVisionBackend = "none";

    setReelBusy(true);
    setReelError(null);
    setReelUsageWarning(null);
    setReelProgress({ phase: "loading", progress: 0, message: "Preparando fotos e profundidade..." });
    if (reelResult?.url) URL.revokeObjectURL(reelResult.url);
    setReelResult(null);
    setReelFeedbackSentiment(null);
    setReelFeedbackReasons([]);
    setReelFeedbackSubmitted(false);
    setReelFeedbackError(null);

    try {
      const freshImages = await listPropertyImages(organizationId, propertyId);
      setImages(freshImages);
      const selectedSet = new Set(selectedForReelIds);
      const selected = (reelSelectionReady
        ? freshImages.filter((image) => selectedSet.has(image.id))
        : freshImages
      ).slice(0, MAX_REEL_IMAGES);
      telemetryImageCount = selected.length;
      if (selected.length === 0) throw new Error("NO_REEL_IMAGES_SELECTED");
      const depthCalculationLimit = reelDepthCalculationLimit(clientProfile, support.webGpu, selected.length);
      const generationVisionBackends = new Set<PropertyVisionBackend>();
      for (const image of selected) {
        const classifiedBackend = analysis[image.id]?.backend;
        if (classifiedBackend) generationVisionBackends.add(classifiedBackend);
      }
      telemetryVisionBackend = summarizeVisionBackends(generationVisionBackends);
      const sources: ReelLiteSource[] = [];
      const preparationStartedAt = performance.now();

      for (let index = 0; index < selected.length; index += 1) {
        const image = selected[index]!;
        let imageDepth: PropertyDepthMap | null = reelDepthCacheRef.current.get(image.id) ?? null;
        const shouldCalculateDepth = index < depthCalculationLimit;
        setReelProgress({
          phase: "loading",
          progress: index / Math.max(1, selected.length),
          message: imageDepth
            ? `Reutilizando profundidade · foto ${index + 1} de ${selected.length}...`
            : shouldCalculateDepth
              ? `Calculando profundidade · foto ${index + 1} de ${selected.length}...`
              : `Modo compatibilidade · preparando foto ${index + 1} de ${selected.length}...`,
        });
        if (imageDepth) {
          depthCacheHits += 1;
          generationVisionBackends.add(imageDepth.backend);
          telemetryVisionBackend = summarizeVisionBackends(generationVisionBackends);
        } else if (shouldCalculateDepth) {
          try {
            imageDepth = await estimateDepthWithRetry(image.viewUrl);
            reelDepthCacheRef.current.set(image.id, imageDepth);
            generationVisionBackends.add(imageDepth.backend);
            telemetryVisionBackend = summarizeVisionBackends(generationVisionBackends);
            setVisionBackend((current) => mergeVisionBackend(current, imageDepth!.backend));
            depthCalculated += 1;
          } catch (error) {
            console.warn("[Estúdio IMOB] Profundidade indisponível no Reel Lite; usando movimento simples.", {
              imageId: image.id,
              imageName: image.originalName,
              error: error instanceof Error ? error.message : "DEPTH_FAILED",
            });
          }
        }
        sources.push({
          id: image.id,
          imageUrl: image.viewUrl,
          label: analysis[image.id]?.label ?? (image.primary ? "Foto principal" : `Foto ${index + 1}`),
          depth: imageDepth,
        });
      }
      preparationMs = Math.max(0, Math.round(performance.now() - preparationStartedAt));

      const result = await createReelLiteMp4(
        sources,
        {
          title: propertyTitle,
          template: reelTemplate,
          soundtrack: requestedAudio,
          facts: reelFacts,
          branding: {
            brandName: organizationName,
            logoUrl: organizationLogoUrl,
            agentName: currentUserName,
            useOrganizationBrand: reelUseOrganizationBrand,
          },
          headline: reelHeadline || null,
          ctaText: reelCtaText || null,
          supportText: reelSupportText || null,
          showPrice: reelShowPrice,
          showLocation: reelShowLocation,
          showSpecs: reelShowSpecs,
        },
        setReelProgress,
      );
      renderMs = result.renderMs;
      const url = URL.createObjectURL(result.blob);
      setReelResult({ ...result, url, generationId, imageIds: selected.map((image) => image.id), usageRecorded: false });
      setReelProgress(null);

      void recordAiStudioReelTelemetry(organizationId, propertyId, {
        generationId,
        status: "succeeded",
        imageCount: result.imageCount,
        durationSeconds: result.durationSeconds,
        renderMs: result.renderMs,
        preparationMs,
        analysisMs: lastAnalysisMs,
        outputBytes: result.blob.size,
        webGpuAvailable: support.webGpu,
        visionBackend: telemetryVisionBackend,
        renderer: "canvas_media_recorder",
        audioIncluded: result.audioIncluded,
        regeneration,
        depthCacheHits,
        depthCalculated,
        ...clientProfile,
        errorCode: null,
      }).catch((telemetryError) => {
        console.warn("[Estúdio IMOB] Telemetria técnica do Reel não pôde ser registrada", telemetryError);
      });

      try {
        const updatedRuntime = await recordAiStudioReelUsage(organizationId, propertyId, {
          generationId,
          template: reelTemplate,
          audioIncluded: result.audioIncluded,
          imageCount: result.imageCount,
        });
        setAiRuntime(updatedRuntime);
        setReelResult((current) => current?.generationId === generationId ? { ...current, usageRecorded: true } : current);
        setReelUsageWarning(null);
      } catch (usageError) {
        console.warn("[Estúdio IMOB] Reel gerado, mas o consumo comercial não pôde ser registrado", usageError);
        setReelUsageWarning(
          usageError instanceof AppApiError && usageError.code === "AI_STUDIO_REEL_LIMIT_REACHED"
            ? "O vídeo foi concluído, mas o limite mensal foi atingido durante a geração. Novos Reels ficarão bloqueados até a renovação ou ajuste do plano."
            : "O vídeo foi concluído, mas não foi possível atualizar o contador mensal agora.",
        );
      }
    } catch (error) {
      console.warn("[Estúdio IMOB] Falha ao exportar Reel Lite", error);
      const code = reelTelemetryErrorCode(error);
      const totalElapsedMs = Math.max(0, Math.round(performance.now() - generationStartedAt));
      if (renderMs === 0 && preparationMs > 0) renderMs = Math.max(0, totalElapsedMs - preparationMs);
      if (telemetryImageCount > 0) {
        void recordAiStudioReelTelemetry(organizationId, propertyId, {
          generationId,
          status: "failed",
          imageCount: telemetryImageCount,
          durationSeconds: null,
          renderMs,
          preparationMs,
          analysisMs: lastAnalysisMs,
          outputBytes: null,
          webGpuAvailable: support.webGpu,
          visionBackend: telemetryVisionBackend,
          renderer: "canvas_media_recorder",
          audioIncluded: requestedAudio,
          regeneration,
          depthCacheHits,
          depthCalculated,
          ...clientProfile,
          errorCode: code,
        }).catch((telemetryError) => {
          console.warn("[Estúdio IMOB] Telemetria de falha do Reel não pôde ser registrada", telemetryError);
        });
      }
      setReelError(
        code === "REEL_MP4_UNSUPPORTED"
          ? "Este navegador não oferece exportação MP4 local. Use Chrome, Edge ou Safari atualizado."
          : code === "NO_REEL_IMAGES_SELECTED"
            ? "Selecione ao menos uma foto para gerar o Reel Lite."
            : code === "REEL_RENDER_TIMEOUT" || code === "REEL_RECORDER_STOP_TIMEOUT"
              ? "A geração local demorou além do limite e foi encerrada com segurança. Tente novamente; não é necessário recarregar a página."
              : "Não foi possível gerar o Reel Lite. As fotos continuam intactas; tente novamente.",
      );
      setReelProgress(null);
    } finally {
      setReelBusy(false);
    }
  }

  function toggleReelFeedbackReason(reason: AiStudioReelFeedbackReason) {
    setReelFeedbackReasons((current) => {
      if (current.includes(reason)) return current.filter((item) => item !== reason);
      if (current.length >= 3) {
        setReelFeedbackError("Selecione no máximo 3 motivos.");
        return current;
      }
      setReelFeedbackError(null);
      return [...current, reason];
    });
    setReelFeedbackSubmitted(false);
  }

  async function submitReelFeedback(sentiment: AiStudioReelFeedbackSentiment) {
    if (!propertyId || !reelResult || reelFeedbackBusy || !reelResult.usageRecorded) return;
    const reasons = sentiment === "disliked" ? reelFeedbackReasons : [];
    if (sentiment === "disliked" && reasons.length === 0) {
      setReelFeedbackSentiment("disliked");
      setReelFeedbackError("Selecione ao menos um motivo para nos ajudar a melhorar o Reel Lite.");
      return;
    }

    setReelFeedbackBusy(true);
    setReelFeedbackError(null);
    try {
      await recordAiStudioReelFeedback(organizationId, propertyId, {
        generationId: reelResult.generationId,
        sentiment,
        reasons,
      });
      setReelFeedbackSentiment(sentiment);
      if (sentiment === "liked") {
        setReelFeedbackReasons([]);
      }
      setReelFeedbackSubmitted(true);
    } catch (error) {
      setReelFeedbackSubmitted(false);
      setReelFeedbackError(error instanceof AppApiError ? error.message : "Não foi possível registrar sua avaliação agora.");
    } finally {
      setReelFeedbackBusy(false);
    }
  }

  async function saveGeneratedReel() {
    if (!propertyId || !reelResult || reelAssetSaving) return;
    if (!reelResult.usageRecorded) {
      setReelAssetError("A geração ainda não foi registrada. Gere o Reel novamente antes de salvá-lo no Estúdio.");
      return;
    }
    setReelAssetSaving(true);
    setReelAssetError(null);
    try {
      const metadata: AiStudioReelAssetMetadata = {
        generationId: reelResult.generationId,
        originalName: reelResult.filename,
        contentType: reelResult.mimeType,
        sizeBytes: reelResult.blob.size,
        durationSeconds: reelResult.durationSeconds,
        width: reelResult.width,
        height: reelResult.height,
        template: reelResult.template,
        audioIncluded: reelResult.audioIncluded,
        imageIds: reelResult.imageIds,
      };
      const upload = await createAiStudioReelAssetUpload(organizationId, propertyId, metadata);
      await uploadAiStudioReelFile(upload, reelResult.blob);
      const saved = await confirmAiStudioReelAsset(organizationId, propertyId, upload.assetId, metadata);
      setReelAssets((current) => [saved, ...current.filter((item) => item.id !== saved.id && item.generationId !== saved.generationId)].slice(0, 12));
    } catch (error) {
      setReelAssetError(error instanceof AppApiError ? error.message : "Não foi possível salvar o Reel no armazenamento privado.");
    } finally {
      setReelAssetSaving(false);
    }
  }

  async function deleteSavedReel(asset: AiStudioReelAsset) {
    if (!propertyId || reelAssetDeletingId || !globalThis.confirm(`Excluir o Reel “${asset.originalName}” do Estúdio? O arquivo salvo será removido do armazenamento privado.`)) return;
    setReelAssetDeletingId(asset.id);
    setReelAssetError(null);
    try {
      await deleteAiStudioReelAsset(organizationId, propertyId, asset.id);
      setReelAssets((current) => current.filter((item) => item.id !== asset.id));
    } catch (error) {
      setReelAssetError(error instanceof AppApiError ? error.message : "Não foi possível excluir o Reel salvo.");
    } finally {
      setReelAssetDeletingId(null);
    }
  }

  async function generateText(kind: AiStudioTextKind) {
    if (!propertyId || textBusy || !canUpdate || aiRuntimeLoading || aiRuntimeError) return;
    setTextBusy(kind);
    setTextError(null);
    try {
      setTextResult(await generatePropertyMarketingText(organizationId, propertyId, kind));
    } catch (error) {
      setTextError(error instanceof AppApiError ? error.message : "Não foi possível gerar o conteúdo agora.");
    } finally {
      setTextBusy(null);
    }
  }

  async function generateMarketingKit() {
    if (!propertyId || marketingKitBusy || textBusy || !canUpdate || aiRuntimeLoading || aiRuntimeError) return;
    setMarketingKitBusy(true);
    setMarketingKitError(null);
    setMarketingKitResults({});
    const next: MarketingKitResults = {};
    const failures: string[] = [];
    for (const action of textActions) {
      try {
        next[action.kind] = await generatePropertyMarketingText(organizationId, propertyId, action.kind);
        setMarketingKitResults({ ...next });
      } catch (error) {
        failures.push(error instanceof AppApiError ? error.message : action.label);
      }
    }
    if (Object.keys(next).length === 0) {
      setMarketingKitError(failures[0] || "Não foi possível montar o kit de divulgação agora.");
    } else if (failures.length > 0) {
      setMarketingKitError(`O kit ficou parcial: ${failures.length} conteúdo(s) não puderam ser gerados. Você pode tentar novamente sem afetar os itens já criados.`);
    }
    setMarketingKitBusy(false);
  }

  async function copyMarketingKit() {
    const content = marketingKitDocument(propertyTitle, marketingKitResults);
    if (!content || !navigator.clipboard) return;
    await navigator.clipboard.writeText(content);
  }

  function downloadMarketingKit() {
    const content = marketingKitDocument(propertyTitle, marketingKitResults);
    if (!content) return;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kit-divulgacao-${safeTextFilename(propertyTitle)}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  if (!propertyId) {
    return <div className="app-property-images-save-first"><strong>Salve o imóvel para abrir o Estúdio IA.</strong><p>O MVP usa as fotos e os dados já cadastrados no imóvel.</p></div>;
  }

  const selectedDepthImage = images.find((item) => item.id === depthImageId) ?? null;
  const progressText = progressLabel(visionProgress);
  const savedCurrentReel = reelResult ? reelAssets.find((item) => item.generationId === reelResult.generationId) ?? null : null;
  const selectedForReel = reelSelectionReady
    ? images.filter((image) => selectedForReelIds.includes(image.id))
    : images.slice(0, MAX_REEL_IMAGES);
  const marketingKitEntries = textActions.flatMap((action) => {
    const result = marketingKitResults[action.kind];
    return result ? [{ action, result }] : [];
  });
  const newestSavedReel = reelAssets[0] ?? null;

  return <div className="app-ai-studio">
    <section className="app-ai-hero">
      <div><span className="app-section-eyebrow">MVP · processamento local + Workers AI</span><h2>Estúdio IMOB</h2><p>Analise as fotos no próprio navegador e gere textos de divulgação sem enviar as imagens para uma API de IA.</p></div>
      <span className="app-ai-cost-badge">API visual: R$ 0</span>
    </section>

    {hasUnsavedChanges && <div className="app-info-banner"><div><strong>Existem alterações não salvas.</strong><p>Os textos usam a última versão salva do imóvel. Salve antes de gerar para considerar os dados mais recentes.</p></div></div>}

    {aiRuntimeLoading && <div className="app-ai-plan-strip"><span className="app-spinner"/><span>Carregando plano e padrões do Estúdio IA...</span></div>}
    {aiRuntimeError && <div className="app-inline-error">{aiRuntimeError}</div>}
    {aiRuntime && <div className="app-ai-plan-strip">
      <div><strong>Plano {aiRuntime.quota.planCode.toUpperCase()}</strong><span>{aiRuntime.quota.monthlyLimit === null ? "Reels mensais ilimitados" : `${aiRuntime.quota.used}/${aiRuntime.quota.monthlyLimit} Reels usados neste mês`}</span></div>
      <span>{aiRuntime.quota.remaining === null ? "Sem limite" : `${aiRuntime.quota.remaining} restante(s)`}</span>
    </div>}

    <section className="app-form-section app-ai-section">
      <div className="app-section-title-row app-ai-photo-heading">
        <div><h2>1. Organização, qualidade e seleção local</h2><p className="app-form-help">SigLIP classifica os ambientes e heurísticas locais avaliam nitidez, exposição e contraste. A seleção recomenda até {MAX_REEL_IMAGES} fotos sem enviar imagens para uma API externa.</p></div>
        <div className="app-ai-photo-heading-actions">
          {Object.keys(quality).length > 0 && <button type="button" className="app-secondary-button" onClick={selectBestPhotos} disabled={visionBusy || loadingImages}>Selecionar melhores</button>}
          <button type="button" className="app-primary-button" onClick={() => void analyzePhotos()} disabled={visionBusy || loadingImages || images.length === 0 || !support.supported || Boolean(aiRuntimeError)}>{visionBusy ? "Processando..." : Object.keys(analysis).length === images.length && Object.keys(quality).length === images.length && images.length ? "Análise concluída" : "Analisar e selecionar"}</button>
        </div>
      </div>
      {!support.supported && <div className="app-inline-error">Este navegador não oferece os recursos mínimos para executar a IA local.</div>}
      {progressText && <div className="app-property-uploading"><span className="app-spinner"/>{progressText}</div>}
      {visionError && <div className="app-inline-error">{visionError}</div>}
      {images.length > 0 && <div className="app-ai-selection-summary"><strong>{selectedForReel.length} foto(s) no Reel</strong><span>{reelSelectionReady ? `Seleção atual · máximo ${MAX_REEL_IMAGES}` : `Aguardando análise · por enquanto serão usadas as primeiras ${Math.min(images.length, MAX_REEL_IMAGES)}`}</span></div>}
      {loadingImages ? <div className="app-table-empty"><span className="app-spinner"/>Carregando imagens...</div> : images.length === 0 ? <div className="app-soft-empty">Adicione fotos na aba Imagens antes de usar a análise local.</div> : <div className="app-ai-photo-grid">{images.map((image) => {
        const result = analysis[image.id];
        const photoQuality = quality[image.id];
        const checked = reelSelectionReady ? selectedForReelIds.includes(image.id) : images.indexOf(image) < MAX_REEL_IMAGES;
        return <article key={image.id} className={checked ? "is-selected" : undefined}>
          <div className="app-ai-photo-image-wrap"><img src={image.viewUrl} alt={image.originalName}/>{photoQuality && <span className={`app-ai-quality-badge is-${photoQuality.label === "Ótima" ? "great" : photoQuality.label === "Boa" ? "good" : photoQuality.label === "Regular" ? "regular" : "weak"}`}>{photoQuality.score}/100 · {photoQuality.label}</span>}</div>
          <div>
            <strong>{result?.label ?? "Ainda não analisada"}</strong>
            {result ? <span>Classificação automática</span> : <span>{image.primary ? "Foto principal" : `Posição ${image.sortOrder + 1}`}</span>}
            {photoQuality && <small>Nitidez, luz e contraste avaliados localmente.</small>}
            <label className="app-ai-photo-select"><input type="checkbox" checked={checked} onChange={(event: ChangeEvent<HTMLInputElement>) => toggleReelPhoto(image.id, event.target.checked)} disabled={reelBusy}/><span>Usar no Reel</span></label>
          </div>
        </article>;
      })}</div>}
      <p className="app-ai-privacy-note">Classificação, qualidade, seleção e depth são processados localmente no navegador. Nenhum token da Hugging Face é usado no MVP.</p>
    </section>

    <section className="app-form-section app-ai-section">
      <div><h2>2. Melhoria básica local da foto</h2><p className="app-form-help">Ajuste brilho, contraste, nitidez e recorte diretamente no navegador. Ao salvar, o Estúdio cria uma nova imagem na galeria e preserva a foto original.</p></div>
      <PropertyPhotoAdjuster
        organizationId={organizationId}
        propertyId={propertyId}
        images={images}
        quality={quality}
        canUpdate={canUpdate}
        onImagesChanged={handleAdjustedImages}
      />
    </section>

    <section className="app-form-section app-ai-section">
      <div className="app-section-title-row"><div><h2>3. Profundidade e movimento 2.5D</h2><p className="app-form-help">Depth Anything V2 calcula um mapa de profundidade local para preparar o efeito de câmera do Reel Lite.</p></div><span className="app-ai-runtime-badge">{visionBackend === "webgpu" ? "WebGPU em uso" : visionBackend === "wasm" ? "WASM em uso" : visionBackend === "mixed" ? "WebGPU + fallback WASM" : support.webGpu ? "WebGPU será priorizado" : "WASM compatível"}</span></div>
      {images.length > 0 && <div className="app-ai-depth-controls"><label><span>Foto para testar</span><select value={depthImageId ?? ""} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setDepthImageId(event.target.value || null); setDepth(null); }}>{images.map((image, index) => <option key={image.id} value={image.id}>{index + 1}. {analysis[image.id]?.label ?? image.originalName}</option>)}</select></label><button type="button" className="app-secondary-button" onClick={() => void calculateDepth()} disabled={visionBusy || !selectedDepthImage || Boolean(aiRuntimeError)}>{depth ? "Recalcular profundidade" : "Calcular profundidade"}</button></div>}
      {depth && selectedDepthImage ? <DepthParallaxPreview imageUrl={selectedDepthImage.viewUrl} depth={depth}/> : <div className="app-soft-empty">Escolha uma foto e calcule a profundidade para testar o movimento 2.5D.</div>}
    </section>

    <section className="app-form-section app-ai-section">
      <div><h2>4. Textos e kit de divulgação</h2><p className="app-form-help">O backend tenta o Workers AI gratuito da Cloudflare. Se houver limite ou indisponibilidade, retorna automaticamente um template IMOB.</p></div>
      <div className="app-ai-marketing-kit-callout">
        <div>
          <span className="app-section-eyebrow">Kit completo</span>
          <strong>Monte o pacote comercial do imóvel em uma ação</strong>
          <p>Gera descrição, legenda para Instagram, mensagem de WhatsApp e CTA usando os dados salvos do imóvel. O resultado pode ser copiado ou baixado em TXT.</p>
        </div>
        <button type="button" className="app-primary-button" onClick={() => void generateMarketingKit()} disabled={!canUpdate || marketingKitBusy || Boolean(textBusy) || aiRuntimeLoading || Boolean(aiRuntimeError)}>
          {marketingKitBusy ? `Montando kit · ${marketingKitEntries.length}/${textActions.length}` : marketingKitEntries.length === textActions.length ? "Gerar kit novamente" : "Criar kit de divulgação"}
        </button>
      </div>
      {marketingKitError && <div className="app-inline-error">{marketingKitError}</div>}
      {marketingKitEntries.length > 0 && <div className="app-ai-marketing-kit-result">
        <header>
          <div><strong>Kit de divulgação</strong><span>{marketingKitEntries.length}/{textActions.length} conteúdos prontos · {marketingKitEntries.some(({ result }) => result.source === "cloudflare") ? "Workers AI + fallback automático" : "Templates IMOB"}</span></div>
          <div className="app-ai-marketing-kit-toolbar">
            <button type="button" className="app-secondary-button" onClick={() => void copyMarketingKit()}>Copiar kit</button>
            <button type="button" className="app-secondary-button" onClick={downloadMarketingKit}>Baixar TXT</button>
            {newestSavedReel ? <a className="app-primary-button" href={`/app/publicacoes/?propertyId=${encodeURIComponent(propertyId)}&mediaAssetId=${encodeURIComponent(newestSavedReel.id)}`}>Criar publicação com Reel</a> : <a className="app-secondary-button" href={`/app/publicacoes/?propertyId=${encodeURIComponent(propertyId)}`}>Abrir publicações</a>}
          </div>
        </header>
        <div className="app-ai-marketing-kit-grid">
          {marketingKitEntries.map(({ action, result }) => <article key={action.kind}>
            <div><strong>{action.label}</strong><span>{result.source === "cloudflare" ? "Workers AI" : "Fallback IMOB"}</span></div>
            <textarea readOnly rows={action.kind === "property_description" ? 7 : 5} value={result.text}/>
            <button type="button" className="app-secondary-button" onClick={() => void navigator.clipboard?.writeText(result.text)}>Copiar</button>
          </article>)}
        </div>
        <footer>
          <span>{selectedForReel.length} foto(s) atualmente selecionada(s) para o Reel.</span>
          <span>{reelAssets.length > 0 ? `${reelAssets.length} Reel(s) salvo(s) disponíveis para publicação.` : "Salve um Reel para adicioná-lo diretamente a uma publicação."}</span>
        </footer>
      </div>}
      <div className="app-ai-text-actions">{textActions.map((action) => <button key={action.kind} type="button" onClick={() => void generateText(action.kind)} disabled={!canUpdate || Boolean(textBusy) || marketingKitBusy || aiRuntimeLoading || Boolean(aiRuntimeError)}><strong>{textBusy === action.kind ? "Gerando..." : action.label}</strong><span>{action.description}</span></button>)}</div>
      {!canUpdate && <div className="app-inline-error">Você precisa de permissão para editar o imóvel antes de gerar conteúdo.</div>}
      {textError && <div className="app-inline-error">{textError}</div>}
      {textResult && <div className="app-ai-text-result"><header><strong>Conteúdo gerado</strong><span>{textResult.source === "cloudflare" ? "Workers AI" : "Fallback IMOB"}</span></header><textarea readOnly rows={8} value={textResult.text}/><div><button type="button" className="app-secondary-button" onClick={() => void navigator.clipboard?.writeText(textResult.text)}>Copiar texto</button>{textResult.source === "template" && <small>O conteúdo foi produzido sem chamada de IA externa.</small>}</div></div>}
    </section>

    <section className="app-form-section app-ai-section app-ai-reel-section">
      <div className="app-section-title-row">
        <div>
          <h2>5. Reel Lite em MP4</h2>
          <p className="app-form-help">Gera um vídeo vertical 9:16 no próprio navegador, usando até {MAX_REEL_IMAGES} fotos selecionadas, movimento 2.5D quando a profundidade estiver disponível e composição da Escala IMOB.</p>
        </div>
        <span className="app-ai-runtime-badge">720 × 1280 · MP4</span>
      </div>
      {!reelSupport.supported && <div className="app-inline-error">{reelSupport.reason}</div>}
      {reelError && <div className="app-inline-error">{reelError}</div>}
      {reelProgress && <div className="app-property-uploading"><span className="app-spinner"/>{reelProgress.message}</div>}
      <div className="app-ai-reel-options">
        <label>
          <span>Template visual</span>
          <select value={reelTemplate} onChange={(event: ChangeEvent<HTMLSelectElement>) => setReelTemplate(event.target.value as ReelLiteTemplate)} disabled={reelBusy}>
            <option value="editorial">Editorial IMOB</option>
            <option value="impact">Impacto</option>
          </select>
          <small>Aplica títulos animados, ritmo de cena, dados do imóvel e CTA final.</small>
        </label>
        <label className={`app-ai-reel-soundtrack${!reelSupport.audioSupported ? " is-disabled" : ""}`}>
          <span>Trilha original local</span>
          <span className="app-ai-toggle-row">
            <input type="checkbox" checked={reelSoundtrack && reelSupport.audioSupported} onChange={(event: ChangeEvent<HTMLInputElement>) => setReelSoundtrack(event.target.checked)} disabled={reelBusy || !reelSupport.audioSupported}/>
            <strong>{reelSupport.audioSupported ? "Incluir áudio" : "Áudio MP4 indisponível"}</strong>
          </span>
          <small>{reelSupport.audioSupported ? "Trilha sintética original, gerada no navegador sem arquivo externo ou licença." : "O Reel continua sendo exportado normalmente sem áudio neste navegador."}</small>
        </label>
      </div>
      <div className="app-ai-reel-customization">
        <div className="app-ai-reel-customization__header">
          <div>
            <strong>Personalização comercial</strong>
            <span>Os campos abaixo partem do padrão da imobiliária e alteram somente esta geração.</span>
          </div>
          <label className="app-ai-reel-brand-toggle">
            <input
              type="checkbox"
              checked={reelUseOrganizationBrand}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setReelUseOrganizationBrand(event.target.checked)}
              disabled={reelBusy}
            />
            <span>Usar marca da imobiliária</span>
          </label>
        </div>
        <div className="app-ai-reel-customization__grid">
          <label>
            <span>Headline final</span>
            <input
              type="text"
              value={reelHeadline}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setReelHeadline(event.target.value.slice(0, 72))}
              placeholder={reelTemplate === "impact" ? "Descubra um novo jeito de morar" : "Seu próximo imóvel começa aqui"}
              disabled={reelBusy}
            />
            <small>{reelHeadline.length}/72 · deixe vazio para usar o texto do template.</small>
          </label>
          <label>
            <span>Botão / CTA</span>
            <input
              type="text"
              value={reelCtaText}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setReelCtaText(event.target.value.slice(0, 40))}
              placeholder="Agende uma visita"
              disabled={reelBusy}
            />
            <small>{reelCtaText.length}/40</small>
          </label>
          <label className="app-ai-reel-customization__wide">
            <span>Texto de contato</span>
            <input
              type="text"
              value={reelSupportText}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setReelSupportText(event.target.value.slice(0, 74))}
              placeholder={currentUserName ? `Fale com ${currentUserName} e saiba mais.` : `Fale com ${organizationName || "nossa equipe"} e saiba mais.`}
              disabled={reelBusy}
            />
            <small>{reelSupportText.length}/74 · vazio usa automaticamente o responsável atual.</small>
          </label>
        </div>
        <div className="app-ai-reel-data-toggles" aria-label="Dados exibidos no Reel">
          <span>Exibir no vídeo:</span>
          <label><input type="checkbox" checked={reelShowPrice} onChange={(event: ChangeEvent<HTMLInputElement>) => setReelShowPrice(event.target.checked)} disabled={reelBusy}/><span>Preço</span></label>
          <label><input type="checkbox" checked={reelShowLocation} onChange={(event: ChangeEvent<HTMLInputElement>) => setReelShowLocation(event.target.checked)} disabled={reelBusy}/><span>Localização</span></label>
          <label><input type="checkbox" checked={reelShowSpecs} onChange={(event: ChangeEvent<HTMLInputElement>) => setReelShowSpecs(event.target.checked)} disabled={reelBusy}/><span>Área, quartos e vagas</span></label>
        </div>
        <div className="app-ai-reel-brand-preview">
          <span>Assinatura:</span>
          {reelUseOrganizationBrand ? <strong>{organizationName || "Sua imobiliária"}</strong> : <strong>Escala IMOB</strong>}
          {reelUseOrganizationBrand && organizationLogoUrl ? <span>logo da organização incluído</span> : null}
        </div>
      </div>
      <div className="app-ai-reel-controls">
        <div>
          <strong>{selectedForReel.length} foto(s) selecionada(s) + CTA final</strong>
          <span>Ordem da galeria · vídeo de aproximadamente {reelLiteEstimatedDuration(selectedForReel.length).toFixed(1)} s · a composição local leva cerca desse tempo · sem custo de API visual. Em dispositivos limitados, o Reel mantém todas as fotos e reduz apenas os cálculos de profundidade.</span>
        </div>
        <button type="button" className="app-primary-button" onClick={() => void generateReelLite()} disabled={reelBusy || images.length === 0 || selectedForReel.length === 0 || !reelSupport.supported || aiRuntimeLoading || Boolean(aiRuntimeError) || aiRuntime?.quota.remaining === 0}>
          {reelBusy ? "Gerando MP4..." : reelResult ? "Gerar novamente" : "Gerar Reel Lite MP4"}
        </button>
      </div>
      {reelResult && <div className="app-ai-reel-result">
        <video controls playsInline src={reelResult.url} aria-label="Prévia do Reel Lite gerado"/>
        <div>
          <div><strong>Reel Lite pronto</strong><span>{reelResult.imageCount} foto(s) · {reelResult.durationSeconds.toFixed(1)} s · 9:16 · {reelResult.audioIncluded ? "com trilha" : "sem trilha"} · render local {(reelResult.renderMs / 1000).toFixed(1)} s</span></div>
          <div className="app-ai-reel-result-actions">
            <a className="app-secondary-button" href={reelResult.url} download={reelResult.filename}>Baixar MP4</a>
            <button type="button" className="app-primary-button" onClick={() => void saveGeneratedReel()} disabled={reelAssetSaving || Boolean(savedCurrentReel) || !reelResult.usageRecorded}>{savedCurrentReel ? "Salvo no Estúdio" : reelAssetSaving ? "Salvando..." : !reelResult.usageRecorded ? "Registro pendente" : "Salvar no Estúdio"}</button>
          </div>
        </div>
      </div>}
      {reelResult && <div className="app-ai-reel-feedback">
        <div>
          <strong>Esse Reel ficou bom para publicar?</strong>
          <span>Sua avaliação entra na telemetria do beta e ajuda a decidir os próximos ajustes do Estúdio IMOB.</span>
        </div>
        <div className="app-ai-reel-feedback-actions">
          <button type="button" className={`app-secondary-button${reelFeedbackSentiment === "liked" ? " is-selected" : ""}`} onClick={() => void submitReelFeedback("liked")} disabled={reelFeedbackBusy || !reelResult.usageRecorded}>Gostei</button>
          <button type="button" className={`app-secondary-button${reelFeedbackSentiment === "disliked" ? " is-selected" : ""}`} onClick={() => { setReelFeedbackSentiment("disliked"); setReelFeedbackSubmitted(false); setReelFeedbackError(null); }} disabled={reelFeedbackBusy || !reelResult.usageRecorded}>Não gostei</button>
        </div>
        {!reelResult.usageRecorded && <small>A avaliação será liberada quando o registro da geração for concluído.</small>}
        {reelFeedbackSentiment === "disliked" && <div className="app-ai-reel-feedback-detail">
          <span>O que mais pesou? Selecione até 3 motivos.</span>
          <div className="app-ai-reel-feedback-reasons">{reelFeedbackReasonOptions.map((option) => <label key={option.value}><input type="checkbox" checked={reelFeedbackReasons.includes(option.value)} disabled={reelFeedbackBusy} onChange={() => toggleReelFeedbackReason(option.value)}/><span>{option.label}</span></label>)}</div>
          <button type="button" className="app-primary-button" onClick={() => void submitReelFeedback("disliked")} disabled={reelFeedbackBusy || reelFeedbackReasons.length === 0 || !reelResult.usageRecorded}>{reelFeedbackBusy ? "Enviando..." : reelFeedbackSubmitted ? "Avaliação registrada" : "Enviar avaliação"}</button>
        </div>}
        {reelFeedbackSubmitted && reelFeedbackSentiment === "liked" && <div className="app-ai-reel-feedback-success">Avaliação registrada. Obrigado.</div>}
        {reelFeedbackError && <div className="app-inline-error">{reelFeedbackError}</div>}
      </div>}
      {reelAssetError && <div className="app-inline-error">{reelAssetError}</div>}
      <div className="app-ai-reel-library">
        <div className="app-section-title-row"><div><strong>Reels salvos</strong><p className="app-form-help">Os vídeos confirmados ficam no armazenamento privado da organização. Use “Criar publicação” para levar um Reel diretamente ao planejamento de divulgação.</p></div>{reelAssets.length > 0 && <span className="app-ai-runtime-badge">{reelAssets.length} salvo(s)</span>}</div>
        {reelAssetsLoading ? <div className="app-table-empty"><span className="app-spinner"/>Carregando Reels salvos...</div> : reelAssets.length === 0 ? <div className="app-soft-empty">Nenhum Reel foi salvo neste imóvel ainda.</div> : <div className="app-ai-reel-library-grid">{reelAssets.slice(0, 6).map((asset) => <article key={asset.id}><video controls playsInline preload="metadata" src={asset.viewUrl}/><div><strong>{asset.originalName}</strong><span>{asset.durationSeconds.toFixed(1)} s · {asset.width} × {asset.height} · {asset.audioIncluded ? "com trilha" : "sem trilha"}</span><div className="app-ai-reel-library-actions"><a className="app-secondary-button" href={asset.downloadUrl}>Baixar</a><a className="app-primary-button" href={`/app/publicacoes/?propertyId=${encodeURIComponent(propertyId!)}&mediaAssetId=${encodeURIComponent(asset.id)}`}>Criar publicação</a><button type="button" className="app-secondary-button is-danger" disabled={reelAssetDeletingId === asset.id} onClick={() => void deleteSavedReel(asset)}>{reelAssetDeletingId === asset.id ? "Excluindo..." : "Excluir"}</button></div></div></article>)}</div>}
      </div>
      <p className="app-ai-privacy-note">A exportação continua 100% local: imagens, profundidade, template, animações, CTA e trilha opcional são compostos no navegador, sem Kling, Veo ou Pedra.</p>
    </section>
  </div>;
}
