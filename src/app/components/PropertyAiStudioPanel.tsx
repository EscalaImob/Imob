import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AppApiError } from "../../services/appApi";
import { generatePropertyMarketingText, type AiStudioTextKind, type AiStudioTextResult } from "../../services/aiStudioApi";
import { listPropertyImages, type PropertyImageItem } from "../../services/propertiesApi";
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
  propertyId: string | null;
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

export function PropertyAiStudioPanel({ organizationId, propertyId, canUpdate, hasUnsavedChanges }: Props) {
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
  const support = useMemo(() => browserVisionSupport(), []);

  const loadImages = useCallback(async () => {
    if (!propertyId) {
      setImages([]);
      setLoadingImages(false);
      return;
    }
    setLoadingImages(true);
    try {
      const result = await listPropertyImages(organizationId, propertyId);
      setImages(result);
      if (result.length) setDepthImageId((current) => current ?? (result.find((item) => item.primary) ?? result[0])?.id ?? null);
    } catch {
      setVisionError("Não foi possível carregar as imagens do imóvel.");
    } finally {
      setLoadingImages(false);
    }
  }, [organizationId, propertyId]);

  useEffect(() => { void loadImages(); }, [loadImages]);

  async function analyzePhotos() {
    if (!support.supported || visionBusy || images.length === 0 || !propertyId) return;
    setVisionBusy(true);
    setVisionError(null);
    setVisionProgress(null);
    try {
      // Renova as URLs temporárias antes da análise. Isso evita exigir que o usuário
      // remova e envie novamente uma foto quando uma URL assinada estiver vencida.
      const freshImages = await listPropertyImages(organizationId, propertyId);
      setImages(freshImages);
      const next: AnalysisByImage = {};
      for (const image of freshImages) {
        // A primeira carga pode falhar enquanto CDN/cache/modelo ainda estão aquecendo.
        // Faz até três tentativas com pequeno backoff antes de mostrar erro ao usuário.
        next[image.id] = await classifyPhotoWithRetry(image.viewUrl, setVisionProgress);
        setAnalysis({ ...next });
      }
    } catch {
      setVisionError("Não foi possível concluir a análise local. Tente novamente; não é necessário remover ou reenviar a imagem.");
    } finally {
      setVisionBusy(false);
      setVisionProgress(null);
    }
  }

  async function calculateDepth() {
    const selected = images.find((item) => item.id === depthImageId);
    if (!selected || visionBusy) return;
    setVisionBusy(true);
    setVisionError(null);
    setDepth(null);
    setVisionProgress(null);
    try {
      setDepth(await estimatePropertyPhotoDepth(selected.viewUrl, setVisionProgress));
    } catch {
      setVisionError("Não foi possível calcular a profundidade desta foto no navegador.");
    } finally {
      setVisionBusy(false);
      setVisionProgress(null);
    }
  }

  async function generateText(kind: AiStudioTextKind) {
    if (!propertyId || textBusy || !canUpdate) return;
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

  return <div className="app-ai-studio">
    <section className="app-ai-hero">
      <div><span className="app-section-eyebrow">MVP · processamento local + Workers AI</span><h2>Estúdio IMOB</h2><p>Analise as fotos no próprio navegador e gere textos de divulgação sem enviar as imagens para uma API de IA.</p></div>
      <span className="app-ai-cost-badge">API visual: R$ 0</span>
    </section>

    {hasUnsavedChanges && <div className="app-info-banner"><div><strong>Existem alterações não salvas.</strong><p>Os textos usam a última versão salva do imóvel. Salve antes de gerar para considerar os dados mais recentes.</p></div></div>}

    <section className="app-form-section app-ai-section">
      <div className="app-section-title-row"><div><h2>1. Organização das fotos com IA local</h2><p className="app-form-help">SigLIP roda no dispositivo. Na primeira execução o navegador baixa e armazena o modelo em cache.</p></div><button type="button" className="app-primary-button" onClick={() => void analyzePhotos()} disabled={visionBusy || loadingImages || images.length === 0 || !support.supported}>{visionBusy ? "Processando..." : analysis && Object.keys(analysis).length === images.length && images.length ? "Análise concluída" : "Analisar fotos"}</button></div>
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
      {images.length > 0 && <div className="app-ai-depth-controls"><label><span>Foto para testar</span><select value={depthImageId ?? ""} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setDepthImageId(event.target.value || null); setDepth(null); }}>{images.map((image, index) => <option key={image.id} value={image.id}>{index + 1}. {analysis[image.id]?.label ?? image.originalName}</option>)}</select></label><button type="button" className="app-secondary-button" onClick={() => void calculateDepth()} disabled={visionBusy || !selectedDepthImage}>{depth ? "Recalcular profundidade" : "Calcular profundidade"}</button></div>}
      {depth && selectedDepthImage ? <DepthParallaxPreview imageUrl={selectedDepthImage.viewUrl} depth={depth}/> : <div className="app-soft-empty">Escolha uma foto e calcule a profundidade para testar o movimento 2.5D.</div>}
    </section>

    <section className="app-form-section app-ai-section">
      <div><h2>3. Textos de divulgação</h2><p className="app-form-help">O backend tenta o Workers AI gratuito da Cloudflare. Se houver limite ou indisponibilidade, retorna automaticamente um template IMOB.</p></div>
      <div className="app-ai-text-actions">{textActions.map((action) => <button key={action.kind} type="button" onClick={() => void generateText(action.kind)} disabled={!canUpdate || Boolean(textBusy)}><strong>{textBusy === action.kind ? "Gerando..." : action.label}</strong><span>{action.description}</span></button>)}</div>
      {!canUpdate && <div className="app-inline-error">Você precisa de permissão para editar o imóvel antes de gerar conteúdo.</div>}
      {textError && <div className="app-inline-error">{textError}</div>}
      {textResult && <div className="app-ai-text-result"><header><strong>Conteúdo gerado</strong><span>{textResult.source === "cloudflare" ? "Workers AI" : "Fallback IMOB"}</span></header><textarea readOnly rows={8} value={textResult.text}/><div><button type="button" className="app-secondary-button" onClick={() => void navigator.clipboard?.writeText(textResult.text)}>Copiar texto</button>{textResult.source === "template" && <small>O conteúdo foi produzido sem chamada de IA externa.</small>}</div></div>}
    </section>

    <section className="app-ai-roadmap-note"><strong>Reel Lite</strong><p>Esta primeira entrega prepara classificação, profundidade e conteúdo textual. A exportação MP4 com composição própria entra na próxima etapa do MVP, sem Kling, Veo ou Pedra.</p></section>
  </div>;
}
