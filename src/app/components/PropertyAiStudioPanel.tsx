import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AppApiError } from "../../services/appApi";
import {
  confirmAiStudioReelAsset,
  createAiStudioReelAssetUpload,
  generatePropertyMarketingText,
  getAiStudioRuntime,
  listAiStudioReelAssets,
  recordAiStudioReelUsage,
  uploadAiStudioReelFile,
  type AiStudioReelAsset,
  type AiStudioReelAssetMetadata,
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
  browserVisionSupport,
  classifyPropertyPhoto,
  estimatePropertyPhotoDepth,
  resetBrowserVisionWorker,
  type PropertyDepthMap,
  type PropertyPhotoClassification,
} from "../ai/browserVision";

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

const textActions: Array<{ kind: AiStudioTextKind; label: string; description: string }> = [
  { kind: "property_description", label: "Descrição do imóvel", description: "Texto comercial para site e anúncio." },
  { kind: "instagram_caption", label: "Legenda para Instagram", description: "Legenda curta com CTA e hashtags." },
  { kind: "whatsapp_message", label: "Mensagem para WhatsApp", description: "Mensagem pronta para compartilhar com um interessado." },
  { kind: "cta", label: "CTA", description: "Chamada curta para contato ou visita." },
];


function progressLabel(progress: { status: string | null; progress: number | null; file: string | null } | null): string | null {
  if (!progress) return null;
  if (progress.progress !== null) return `Baixando modelo local · ${Math.round(progress.progress)}%`;
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
  const [visionError, setVisionError] = useState<string | null>(null);
  const [depthImageId, setDepthImageId] = useState<string | null>(null);
  const [depth, setDepth] = useState<PropertyDepthMap | null>(null);
  const [textBusy, setTextBusy] = useState<AiStudioTextKind | null>(null);
  const [textResult, setTextResult] = useState<AiStudioTextResult | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
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
  const [reelAssetError, setReelAssetError] = useState<string | null>(null);
  const runtimeDefaultsAppliedRef = useRef<string | null>(null);
  const reelDepthCacheRef = useRef<Map<string, PropertyDepthMap>>(new Map());
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
    setVisionError(null);
    setReelAssetError(null);
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
    setVisionBusy(true);
    setVisionError(null);
    setVisionProgress(null);
    try {
      // Renova as URLs temporárias antes da análise. Isso evita exigir que o usuário
      // remova e envie novamente uma foto quando uma URL assinada estiver vencida.
      const freshImages = await listPropertyImages(organizationId, propertyId);
      setImages(freshImages);
      const next: AnalysisByImage = {};
      const failedImages: string[] = [];
      for (const image of freshImages) {
        try {
          // A imagem é baixada no contexto da página e enviada ao worker como bytes.
          // Assim, o modelo não depende de refazer fetch da URL assinada dentro do worker.
          next[image.id] = await classifyPhotoWithRetry(image.viewUrl, setVisionProgress);
        } catch (error) {
          failedImages.push(image.originalName);
          console.warn("[Estúdio IMOB] Falha na classificação local", {
            imageId: image.id,
            imageName: image.originalName,
            error: error instanceof Error ? error.message : "CLASSIFICATION_FAILED",
          });
        }
        setAnalysis({ ...next });
      }
      if (failedImages.length > 0) {
        setVisionError(
          failedImages.length === freshImages.length
            ? "Não foi possível analisar as fotos localmente. Tente novamente; não é necessário remover ou reenviar as imagens."
            : `A análise concluiu parcialmente. ${failedImages.length} foto(s) não puderam ser classificadas; tente novamente para completar.`,
        );
      }
    } catch (error) {
      console.warn("[Estúdio IMOB] Falha ao preparar a análise local", error);
      setVisionError("Não foi possível preparar a análise local. Tente novamente; não é necessário remover ou reenviar a imagem.");
    } finally {
      setVisionBusy(false);
      setVisionProgress(null);
    }
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
    setReelBusy(true);
    setReelError(null);
    setReelUsageWarning(null);
    setReelProgress({ phase: "loading", progress: 0, message: "Preparando fotos e profundidade..." });
    if (reelResult?.url) URL.revokeObjectURL(reelResult.url);
    setReelResult(null);

    try {
      const freshImages = await listPropertyImages(organizationId, propertyId);
      setImages(freshImages);
      const selected = freshImages.slice(0, 6);
      const sources: ReelLiteSource[] = [];

      for (let index = 0; index < selected.length; index += 1) {
        const image = selected[index]!;
        setReelProgress({
          phase: "loading",
          progress: index / Math.max(1, selected.length),
          message: `Calculando profundidade · foto ${index + 1} de ${selected.length}...`,
        });
        let imageDepth: PropertyDepthMap | null = reelDepthCacheRef.current.get(image.id) ?? null;
        if (!imageDepth) {
          try {
            imageDepth = await estimateDepthWithRetry(image.viewUrl);
            reelDepthCacheRef.current.set(image.id, imageDepth);
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

      const generationId = globalThis.crypto.randomUUID();
      const result = await createReelLiteMp4(
        sources,
        {
          title: propertyTitle,
          template: reelTemplate,
          soundtrack: reelSoundtrack && reelSupport.audioSupported,
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
      const url = URL.createObjectURL(result.blob);
      setReelResult({ ...result, url, generationId, imageIds: selected.map((image) => image.id), usageRecorded: false });
      setReelProgress(null);
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
      const code = error instanceof Error ? error.message : "REEL_FAILED";
      setReelError(
        code === "REEL_MP4_UNSUPPORTED"
          ? "Este navegador não oferece exportação MP4 local. Use Chrome, Edge ou Safari atualizado."
          : "Não foi possível gerar o Reel Lite. As fotos continuam intactas; tente novamente.",
      );
      setReelProgress(null);
    } finally {
      setReelBusy(false);
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

  if (!propertyId) {
    return <div className="app-property-images-save-first"><strong>Salve o imóvel para abrir o Estúdio IA.</strong><p>O MVP usa as fotos e os dados já cadastrados no imóvel.</p></div>;
  }

  const selectedDepthImage = images.find((item) => item.id === depthImageId) ?? null;
  const progressText = progressLabel(visionProgress);
  const savedCurrentReel = reelResult ? reelAssets.find((item) => item.generationId === reelResult.generationId) ?? null : null;

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
      <div className="app-section-title-row"><div><h2>1. Organização das fotos com IA local</h2><p className="app-form-help">SigLIP roda no dispositivo. Na primeira execução o navegador baixa e armazena o modelo em cache.</p></div><button type="button" className="app-primary-button" onClick={() => void analyzePhotos()} disabled={visionBusy || loadingImages || images.length === 0 || !support.supported || Boolean(aiRuntimeError)}>{visionBusy ? "Processando..." : analysis && Object.keys(analysis).length === images.length && images.length ? "Análise concluída" : "Analisar fotos"}</button></div>
      {!support.supported && <div className="app-inline-error">Este navegador não oferece os recursos mínimos para executar a IA local.</div>}
      {progressText && <div className="app-property-uploading"><span className="app-spinner"/>{progressText}</div>}
      {visionError && <div className="app-inline-error">{visionError}</div>}
      {loadingImages ? <div className="app-table-empty"><span className="app-spinner"/>Carregando imagens...</div> : images.length === 0 ? <div className="app-soft-empty">Adicione fotos na aba Imagens antes de usar a análise local.</div> : <div className="app-ai-photo-grid">{images.map((image) => {
        const result = analysis[image.id];
        return <article key={image.id}><img src={image.viewUrl} alt={image.originalName}/><div><strong>{result?.label ?? "Ainda não analisada"}</strong>{result ? <span>Classificação automática</span> : <span>{image.primary ? "Foto principal" : `Posição ${image.sortOrder + 1}`}</span>}</div></article>;
      })}</div>}
      <p className="app-ai-privacy-note">As fotos são processadas localmente pelo Transformers.js. Nenhum token da Hugging Face é usado no MVP.</p>
    </section>

    <section className="app-form-section app-ai-section">
      <div className="app-section-title-row"><div><h2>2. Profundidade e movimento 2.5D</h2><p className="app-form-help">Depth Anything V2 calcula um mapa de profundidade local para preparar o efeito de câmera do Reel Lite.</p></div><span className="app-ai-runtime-badge">{support.webGpu ? "WebGPU disponível" : "WASM compatível"}</span></div>
      {images.length > 0 && <div className="app-ai-depth-controls"><label><span>Foto para testar</span><select value={depthImageId ?? ""} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setDepthImageId(event.target.value || null); setDepth(null); }}>{images.map((image, index) => <option key={image.id} value={image.id}>{index + 1}. {analysis[image.id]?.label ?? image.originalName}</option>)}</select></label><button type="button" className="app-secondary-button" onClick={() => void calculateDepth()} disabled={visionBusy || !selectedDepthImage || Boolean(aiRuntimeError)}>{depth ? "Recalcular profundidade" : "Calcular profundidade"}</button></div>}
      {depth && selectedDepthImage ? <DepthParallaxPreview imageUrl={selectedDepthImage.viewUrl} depth={depth}/> : <div className="app-soft-empty">Escolha uma foto e calcule a profundidade para testar o movimento 2.5D.</div>}
    </section>

    <section className="app-form-section app-ai-section">
      <div><h2>3. Textos de divulgação</h2><p className="app-form-help">O backend tenta o Workers AI gratuito da Cloudflare. Se houver limite ou indisponibilidade, retorna automaticamente um template IMOB.</p></div>
      <div className="app-ai-text-actions">{textActions.map((action) => <button key={action.kind} type="button" onClick={() => void generateText(action.kind)} disabled={!canUpdate || Boolean(textBusy) || aiRuntimeLoading || Boolean(aiRuntimeError)}><strong>{textBusy === action.kind ? "Gerando..." : action.label}</strong><span>{action.description}</span></button>)}</div>
      {!canUpdate && <div className="app-inline-error">Você precisa de permissão para editar o imóvel antes de gerar conteúdo.</div>}
      {textError && <div className="app-inline-error">{textError}</div>}
      {textResult && <div className="app-ai-text-result"><header><strong>Conteúdo gerado</strong><span>{textResult.source === "cloudflare" ? "Workers AI" : "Fallback IMOB"}</span></header><textarea readOnly rows={8} value={textResult.text}/><div><button type="button" className="app-secondary-button" onClick={() => void navigator.clipboard?.writeText(textResult.text)}>Copiar texto</button>{textResult.source === "template" && <small>O conteúdo foi produzido sem chamada de IA externa.</small>}</div></div>}
    </section>

    <section className="app-form-section app-ai-section app-ai-reel-section">
      <div className="app-section-title-row">
        <div>
          <h2>4. Reel Lite em MP4</h2>
          <p className="app-form-help">Gera um vídeo vertical 9:16 no próprio navegador, usando até 6 fotos, movimento 2.5D quando a profundidade estiver disponível e composição da Escala IMOB.</p>
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
          <strong>{Math.min(images.length, 6)} foto(s) + CTA final</strong>
          <span>Ordem da galeria · aproximadamente {reelLiteEstimatedDuration(Math.min(images.length, 6)).toFixed(1)} s · sem custo de API visual</span>
        </div>
        <button type="button" className="app-primary-button" onClick={() => void generateReelLite()} disabled={reelBusy || images.length === 0 || !reelSupport.supported || aiRuntimeLoading || Boolean(aiRuntimeError) || aiRuntime?.quota.remaining === 0}>
          {reelBusy ? "Gerando MP4..." : reelResult ? "Gerar novamente" : "Gerar Reel Lite MP4"}
        </button>
      </div>
      {reelResult && <div className="app-ai-reel-result">
        <video controls playsInline src={reelResult.url} aria-label="Prévia do Reel Lite gerado"/>
        <div>
          <div><strong>Reel Lite pronto</strong><span>{reelResult.imageCount} foto(s) · {reelResult.durationSeconds.toFixed(1)} s · 9:16 · {reelResult.audioIncluded ? "com trilha" : "sem trilha"}</span></div>
          <div className="app-ai-reel-result-actions">
            <a className="app-secondary-button" href={reelResult.url} download={reelResult.filename}>Baixar MP4</a>
            <button type="button" className="app-primary-button" onClick={() => void saveGeneratedReel()} disabled={reelAssetSaving || Boolean(savedCurrentReel) || !reelResult.usageRecorded}>{savedCurrentReel ? "Salvo no Estúdio" : reelAssetSaving ? "Salvando..." : !reelResult.usageRecorded ? "Registro pendente" : "Salvar no Estúdio"}</button>
          </div>
        </div>
      </div>}
      {reelAssetError && <div className="app-inline-error">{reelAssetError}</div>}
      <div className="app-ai-reel-library">
        <div className="app-section-title-row"><div><strong>Reels salvos</strong><p className="app-form-help">Os vídeos confirmados ficam no armazenamento privado da organização. Use “Criar publicação” para levar um Reel diretamente ao planejamento de divulgação.</p></div>{reelAssets.length > 0 && <span className="app-ai-runtime-badge">{reelAssets.length} salvo(s)</span>}</div>
        {reelAssetsLoading ? <div className="app-table-empty"><span className="app-spinner"/>Carregando Reels salvos...</div> : reelAssets.length === 0 ? <div className="app-soft-empty">Nenhum Reel foi salvo neste imóvel ainda.</div> : <div className="app-ai-reel-library-grid">{reelAssets.slice(0, 6).map((asset) => <article key={asset.id}><video controls playsInline preload="metadata" src={asset.viewUrl}/><div><strong>{asset.originalName}</strong><span>{asset.durationSeconds.toFixed(1)} s · {asset.width} × {asset.height} · {asset.audioIncluded ? "com trilha" : "sem trilha"}</span><div className="app-ai-reel-library-actions"><a className="app-secondary-button" href={asset.downloadUrl}>Baixar</a><a className="app-primary-button" href={`/app/publicacoes/?propertyId=${encodeURIComponent(propertyId!)}&mediaAssetId=${encodeURIComponent(asset.id)}`}>Criar publicação</a></div></div></article>)}</div>}
      </div>
      <p className="app-ai-privacy-note">A exportação continua 100% local: imagens, profundidade, template, animações, CTA e trilha opcional são compostos no navegador, sem Kling, Veo ou Pedra.</p>
    </section>
  </div>;
}
