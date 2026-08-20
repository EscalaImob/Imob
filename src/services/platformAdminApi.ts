import { ensureValidAuthSession } from "../auth/session";
import { AppApiError } from "./appApi";

const REQUEST_TIMEOUT_MS = 15_000;

export type PlatformAccessKeyStatus = "active" | "redeemed" | "revoked" | "expired";

export interface PlatformOverview {
  organizations: number;
  activeOrganizations: number;
  users: number;
  activeUsers: number;
  activeAccessKeys: number;
}

export interface PlatformAccessKey {
  id: string;
  cpfMasked: string;
  secretLast4: string;
  status: PlatformAccessKeyStatus;
  expiresAt: string | null;
  redeemedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface PlatformAccessKeyCreated extends PlatformAccessKey {
  accessKey: string;
}

export interface PlatformAccessKeyFilters {
  cpf?: string;
  status?: PlatformAccessKeyStatus | "all";
  createdFrom?: string;
  createdTo?: string;
}

function apiBase(): string {
  const value = import.meta.env.VITE_API_URL?.trim();
  if (!value) throw new AppApiError("A plataforma ainda não está conectada à API.", "API_NOT_CONFIGURED");
  return value.replace(/\/+$/u, "");
}

async function platformRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await ensureValidAuthSession();
  if (!session) throw new AppApiError("Sua sessão expirou. Entre novamente.", "UNAUTHORIZED", 401);

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    let payload: unknown = null;
    try { payload = await response.json(); } catch { payload = null; }
    const body = payload as { success?: boolean; data?: T; error?: { code?: string; message?: string } } | null;

    if (!response.ok) {
      throw new AppApiError(
        body?.error?.message || "Não foi possível concluir a operação da plataforma.",
        body?.error?.code || "API_ERROR",
        response.status,
      );
    }

    if (body?.success !== true || body.data === undefined) {
      throw new AppApiError("Recebemos uma resposta inesperada da plataforma.", "INVALID_API_RESPONSE", response.status);
    }

    return body.data;
  } catch (error) {
    if (error instanceof AppApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppApiError("A plataforma demorou mais que o esperado para responder.", "REQUEST_TIMEOUT");
    }
    throw new AppApiError("Não foi possível conectar à plataforma.", "NETWORK_ERROR");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  return platformRequest("/platform/overview");
}

export async function listPlatformAccessKeys(filters: PlatformAccessKeyFilters = {}): Promise<PlatformAccessKey[]> {
  const params = new URLSearchParams();
  if (filters.cpf?.trim()) params.set("cpf", filters.cpf.trim());
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) params.set("createdTo", filters.createdTo);
  params.set("limit", "100");
  return platformRequest(`/platform/access-keys?${params.toString()}`);
}

export async function createPlatformAccessKey(input: { cpf: string; expiresInDays: number | null }): Promise<PlatformAccessKeyCreated> {
  return platformRequest("/platform/access-keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokePlatformAccessKey(id: string): Promise<PlatformAccessKey> {
  return platformRequest(`/platform/access-keys/${encodeURIComponent(id)}/revoke`, { method: "POST" });
}
