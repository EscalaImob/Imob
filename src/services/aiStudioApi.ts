import { ensureValidAuthSession } from "../auth/session";
import { AppApiError } from "./appApi";

const REQUEST_TIMEOUT_MS = 25_000;

export type AiStudioTextKind = "property_description" | "instagram_caption" | "whatsapp_message" | "cta";
export interface AiStudioTextResult {
  kind: AiStudioTextKind;
  text: string;
  source: "cloudflare" | "template";
  model: string | null;
}

function apiBase(): string {
  const value = import.meta.env.VITE_API_URL?.trim();
  if (!value) throw new AppApiError("A plataforma ainda não está conectada à API.", "API_NOT_CONFIGURED");
  return value.replace(/\/+$/u, "");
}

export async function generatePropertyMarketingText(
  organizationId: string,
  propertyId: string,
  kind: AiStudioTextKind,
): Promise<AiStudioTextResult> {
  const session = await ensureValidAuthSession();
  if (!session) throw new AppApiError("Sua sessão expirou. Entre novamente.", "UNAUTHORIZED", 401);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase()}/portfolio/properties/${encodeURIComponent(propertyId)}/ai/text`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "x-organization-id": organizationId,
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind }),
      signal: controller.signal,
    });
    let payload: unknown = null;
    try { payload = await response.json(); } catch { payload = null; }
    const body = payload as { success?: boolean; data?: AiStudioTextResult; error?: { code?: string; message?: string } } | null;
    if (!response.ok) {
      throw new AppApiError(body?.error?.message || "Não foi possível gerar o conteúdo.", body?.error?.code || "API_ERROR", response.status);
    }
    if (body?.success !== true || !body.data || typeof body.data.text !== "string") {
      throw new AppApiError("Recebemos uma resposta inesperada do Estúdio IA.", "INVALID_API_RESPONSE", response.status);
    }
    return body.data;
  } catch (error) {
    if (error instanceof AppApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppApiError("A geração demorou mais que o esperado.", "REQUEST_TIMEOUT");
    }
    throw new AppApiError("Não foi possível conectar ao Estúdio IA.", "NETWORK_ERROR");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
