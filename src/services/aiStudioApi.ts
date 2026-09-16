import { ensureValidAuthSession } from "../auth/session";
import { AppApiError } from "./appApi";

const REQUEST_TIMEOUT_MS = 25_000;

export type AiStudioTextKind = "property_description" | "instagram_caption" | "whatsapp_message" | "cta";
export type AiStudioReelTemplate = "editorial" | "impact";

export interface AiStudioTextResult {
  kind: AiStudioTextKind;
  text: string;
  source: "cloudflare" | "template";
  model: string | null;
}

export interface AiStudioReelDefaults {
  defaultTemplate: AiStudioReelTemplate;
  soundtrack: boolean;
  useOrganizationBrand: boolean;
  headline: string | null;
  ctaText: string;
  supportText: string | null;
  showPrice: boolean;
  showLocation: boolean;
  showSpecs: boolean;
}

export interface AiStudioQuota {
  planCode: string;
  monthlyLimit: number | null;
  used: number;
  remaining: number | null;
  period: string;
}

export interface AiStudioRuntime {
  enabled: boolean;
  defaults: AiStudioReelDefaults;
  quota: AiStudioQuota;
}


export interface AiStudioReelAssetMetadata {
  generationId: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  template: AiStudioReelTemplate;
  audioIncluded: boolean;
  imageIds: string[];
}

export interface AiStudioReelAssetUpload {
  assetId: string;
  uploadUrl: string;
  expiresInSeconds: number;
  requiredHeaders: { "content-type": string };
}

export interface AiStudioReelAsset extends AiStudioReelAssetMetadata {
  id: string;
  propertyId: string;
  viewUrl: string;
  downloadUrl: string;
  urlExpiresInSeconds: number;
  createdAt: string;
}

export interface AiStudioReelUsageInput {
  generationId: string;
  template: AiStudioReelTemplate;
  audioIncluded: boolean;
  imageCount: number;
}

export type AiStudioReelTelemetryStatus = "succeeded" | "failed";
export type AiStudioVisionBackend = "webgpu" | "wasm" | "mixed" | "none";
export type AiStudioBrowserFamily = "chromium" | "safari" | "firefox" | "other";
export type AiStudioDeviceClass = "desktop" | "mobile" | "tablet" | "unknown";

export interface AiStudioReelTelemetryInput {
  generationId: string;
  status: AiStudioReelTelemetryStatus;
  imageCount: number;
  durationSeconds: number | null;
  renderMs: number;
  preparationMs: number;
  analysisMs: number | null;
  outputBytes: number | null;
  webGpuAvailable: boolean;
  visionBackend: AiStudioVisionBackend;
  renderer: "canvas_media_recorder";
  audioIncluded: boolean;
  regeneration: boolean;
  depthCacheHits: number;
  depthCalculated: number;
  browserFamily: AiStudioBrowserFamily;
  deviceClass: AiStudioDeviceClass;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  errorCode: string | null;
}

export type AiStudioReelFeedbackSentiment = "liked" | "disliked";
export type AiStudioReelFeedbackReason = "movement" | "photo_selection" | "visual_quality" | "text_branding" | "performance" | "other";

export interface AiStudioReelFeedbackInput {
  generationId: string;
  sentiment: AiStudioReelFeedbackSentiment;
  reasons: AiStudioReelFeedbackReason[];
}

function apiBase(): string {
  const value = import.meta.env.VITE_API_URL?.trim();
  if (!value) throw new AppApiError("A plataforma ainda não está conectada à API.", "API_NOT_CONFIGURED");
  return value.replace(/\/+$/u, "");
}

async function aiStudioRequest<T>(organizationId: string, path: string, init: RequestInit = {}): Promise<T> {
  const session = await ensureValidAuthSession();
  if (!session) throw new AppApiError("Sua sessão expirou. Entre novamente.", "UNAUTHORIZED", 401);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "x-organization-id": organizationId,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    let payload: unknown = null;
    try { payload = await response.json(); } catch { payload = null; }
    const body = payload as { success?: boolean; data?: T; error?: { code?: string; message?: string } } | null;
    if (!response.ok) {
      throw new AppApiError(body?.error?.message || "Não foi possível concluir a operação do Estúdio IA.", body?.error?.code || "API_ERROR", response.status);
    }
    if (body?.success !== true || body.data === undefined) {
      throw new AppApiError("Recebemos uma resposta inesperada do Estúdio IA.", "INVALID_API_RESPONSE", response.status);
    }
    return body.data;
  } catch (error) {
    if (error instanceof AppApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppApiError("O Estúdio IA demorou mais que o esperado para responder.", "REQUEST_TIMEOUT");
    }
    throw new AppApiError("Não foi possível conectar ao Estúdio IA.", "NETWORK_ERROR");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function getAiStudioRuntime(organizationId: string): Promise<AiStudioRuntime> {
  return aiStudioRequest(organizationId, "/ai-studio/runtime");
}

export async function recordAiStudioReelUsage(
  organizationId: string,
  propertyId: string,
  input: AiStudioReelUsageInput,
): Promise<AiStudioRuntime> {
  return aiStudioRequest(organizationId, `/portfolio/properties/${encodeURIComponent(propertyId)}/ai/reel-usage`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function recordAiStudioReelTelemetry(
  organizationId: string,
  propertyId: string,
  input: AiStudioReelTelemetryInput,
): Promise<{ recorded: boolean }> {
  return aiStudioRequest(organizationId, `/portfolio/properties/${encodeURIComponent(propertyId)}/ai/reel-telemetry`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function recordAiStudioReelFeedback(
  organizationId: string,
  propertyId: string,
  input: AiStudioReelFeedbackInput,
): Promise<{ recorded: boolean }> {
  return aiStudioRequest(organizationId, `/portfolio/properties/${encodeURIComponent(propertyId)}/ai/reel-feedback`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generatePropertyMarketingText(
  organizationId: string,
  propertyId: string,
  kind: AiStudioTextKind,
): Promise<AiStudioTextResult> {
  return aiStudioRequest(organizationId, `/portfolio/properties/${encodeURIComponent(propertyId)}/ai/text`, {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
}


export async function listAiStudioReelAssets(organizationId: string, propertyId: string): Promise<AiStudioReelAsset[]> {
  return aiStudioRequest(organizationId, `/portfolio/properties/${encodeURIComponent(propertyId)}/ai/reel-assets`);
}

export async function createAiStudioReelAssetUpload(
  organizationId: string,
  propertyId: string,
  metadata: AiStudioReelAssetMetadata,
): Promise<AiStudioReelAssetUpload> {
  return aiStudioRequest(organizationId, `/portfolio/properties/${encodeURIComponent(propertyId)}/ai/reel-assets/upload`, {
    method: "POST",
    body: JSON.stringify(metadata),
  });
}

export async function uploadAiStudioReelFile(upload: AiStudioReelAssetUpload, blob: Blob): Promise<void> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "content-type": upload.requiredHeaders["content-type"] },
      body: blob,
      signal: controller.signal,
    });
    if (!response.ok) throw new AppApiError("Não foi possível enviar o Reel para o armazenamento privado.", "REEL_ASSET_UPLOAD_FAILED", response.status);
  } catch (error) {
    if (error instanceof AppApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new AppApiError("O envio do Reel demorou mais que o esperado.", "REEL_ASSET_UPLOAD_TIMEOUT");
    throw new AppApiError("Não foi possível enviar o Reel. Verifique sua conexão e tente novamente.", "REEL_ASSET_UPLOAD_NETWORK_ERROR");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function confirmAiStudioReelAsset(
  organizationId: string,
  propertyId: string,
  assetId: string,
  metadata: AiStudioReelAssetMetadata,
): Promise<AiStudioReelAsset> {
  return aiStudioRequest(organizationId, `/portfolio/properties/${encodeURIComponent(propertyId)}/ai/reel-assets/${encodeURIComponent(assetId)}/confirm`, {
    method: "POST",
    body: JSON.stringify(metadata),
  });
}


export async function deleteAiStudioReelAsset(
  organizationId: string,
  propertyId: string,
  assetId: string,
): Promise<{ deleted: true; assetId: string }> {
  return aiStudioRequest(organizationId, `/portfolio/properties/${encodeURIComponent(propertyId)}/ai/reel-assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  });
}
