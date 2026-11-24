import { ensureValidAuthSession } from "../auth/session";
import { AppApiError } from "./appApi";

const REQUEST_TIMEOUT_MS = 15_000;

export type MetaErrorCode = "INVALID_JSON" | "ORGANIZATION_REQUIRED" | "UNAUTHORIZED" | "FORBIDDEN" | "FORBIDDEN_ORGANIZATION" | "INVALID_SIGNATURE" | "OPT_OUT" | "WINDOW_CLOSED" | "NOT_FOUND" | "CONFLICT" | "IDEMPOTENCY_CONFLICT" | "ASSET_CONFLICT" | "CONNECTION_REVOKED" | "VALIDATION_ERROR" | "META_NOT_CONFIGURED" | "META_PERMISSION_REQUIRED" | "META_UNAVAILABLE" | "FEATURE_DISABLED" | "INTERNAL_ERROR";
export class MetaError extends AppApiError {
  constructor(message: string, code: MetaErrorCode | (string & {}), status?: number) {
    super(message, code, status);
    this.name = "MetaError";
  }
}

export type Channel = "instagram" | "messenger" | "whatsapp";
export type AssetType = "instagram_account" | "facebook_page" | "whatsapp_business_account" | "whatsapp_phone_number" | "ad_account";
export type ConnectionState = "disconnected" | "pending" | "connected" | "expired" | "revoked" | "error";
export type Availability = "available" | "pending" | "denied";
export type Mode = "test" | "live";
export type CapabilityKey = "leadAds" | "instagramMessaging" | "messengerMessaging" | "whatsappMessaging" | "adsRead" | "adsManage";
export interface Capability {
  key: CapabilityKey;
  availability: Availability;
  reason: string | null;
  verifiedAt: string | null;
}
export interface MetaAsset {
  id: string;
  externalId: string;
  type: AssetType;
  name: string;
  selected: boolean;
  capabilities: Capability[];
}
export interface MetaConnection {
  id: string;
  provider: "meta";
  state: ConnectionState;
  mode: Mode;
  scopes: string[];
  assets: MetaAsset[];
  capabilities: Capability[];
  lastCheckedAt: string | null;
  expiresAt: string | null;
  errorCode: string | null;
}
export interface MetaStatus {
  connection: MetaConnection | null;
  capabilities: Capability[];
  mode: Mode;
}
export interface OAuthStart {
  authorizationUrl: string;
  expiresAt: string;
}

export interface LeadOrigin {
  leadId: string;
  contactId: string | null;
  opportunityId: string | null;
  externalLeadId: string;
  assetId: string;
  formId: string | null;
  adId: string | null;
  campaignId: string | null;
  propertyId: string | null;
  ingestionState: "pending" | "processed" | "failed";
  receivedAt: string;
}

// Same authenticated tenant transport as crmApi; no automatic retries or fallback.
export async function requestMeta<T>(organizationId: string, path: string, signal?: AbortSignal, input?: object, options?: { method?: "PATCH" | "PUT"; allowNull?: boolean }): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = globalThis.setTimeout(abort, REQUEST_TIMEOUT_MS);
  try {
    if (!organizationId.trim()) throw new AppApiError("Selecione uma organização.", "ORGANIZATION_REQUIRED", 400);
    const base = import.meta.env.VITE_API_URL?.trim();
    if (!base) throw new AppApiError("A plataforma ainda não está conectada à API.", "API_NOT_CONFIGURED");
    const session = await ensureValidAuthSession();
    if (!session) throw new AppApiError("Sua sessão expirou. Entre novamente.", "UNAUTHORIZED", 401);
    if (controller.signal.aborted) throw new AppApiError("Solicitação cancelada ou expirada.", "REQUEST_TIMEOUT");
    const response = await fetch(`${base.replace(/\/+$/u, "")}${path}`, {
      method: options?.method ?? (input === undefined ? "GET" : "POST"),
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "x-organization-id": organizationId,
        ...(input === undefined ? {} : { "content-type": "application/json" }),
      },
      body: input === undefined ? undefined : JSON.stringify(input),
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: { code?: string; message?: string } } | null;
    if (!response.ok || body?.success === false) {
      throw new MetaError(body?.error?.message || "Não foi possível concluir a operação Meta.", body?.error?.code || "API_ERROR", response.status);
    }
    if (body?.success !== true || (body.data === undefined || (body.data === null && !options?.allowNull))) {
      throw new AppApiError("Recebemos uma resposta inesperada da plataforma.", "INVALID_API_RESPONSE", response.status);
    }
    return body.data;
  } catch (error) {
    if (error instanceof AppApiError) throw error;
    if (controller.signal.aborted) throw new AppApiError("A plataforma demorou mais que o esperado para responder.", "REQUEST_TIMEOUT");
    throw new AppApiError("Não foi possível conectar à plataforma. Tente novamente.", "NETWORK_ERROR");
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
const connectionPath = (id: string) => `/meta/connections/${encodeURIComponent(id)}`;
// Do not interpret a malformed or incomplete response as a disconnected tenant.
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNullableString = (value: unknown) => value === null || typeof value === "string";
const isMode = (value: unknown) => value === "test" || value === "live";
const isCapability = (value: unknown): value is Capability => isRecord(value)
  && ["leadAds", "instagramMessaging", "messengerMessaging", "whatsappMessaging", "adsRead", "adsManage"].some((key) => key === value.key)
  && ["available", "pending", "denied"].some((availability) => availability === value.availability)
  && isNullableString(value.reason) && isNullableString(value.verifiedAt);
const isCapabilityList = (value: unknown): value is Capability[] => Array.isArray(value) && value.every(isCapability);
const isAsset = (value: unknown): value is MetaAsset => isRecord(value)
  && typeof value.id === "string" && value.id.length > 0 && typeof value.externalId === "string"
  && ["instagram_account", "facebook_page", "whatsapp_business_account", "whatsapp_phone_number", "ad_account"].some((type) => type === value.type)
  && typeof value.name === "string" && typeof value.selected === "boolean" && isCapabilityList(value.capabilities);
const isConnection = (value: unknown): value is MetaConnection => isRecord(value)
  && typeof value.id === "string" && value.id.length > 0 && value.provider === "meta" && isMode(value.mode)
  && ["disconnected", "pending", "connected", "expired", "revoked", "error"].some((state) => state === value.state)
  && Array.isArray(value.scopes) && value.scopes.every((scope: unknown) => typeof scope === "string")
  && Array.isArray(value.assets) && value.assets.every(isAsset) && isCapabilityList(value.capabilities)
  && isNullableString(value.lastCheckedAt) && isNullableString(value.expiresAt) && isNullableString(value.errorCode);
function isStatus(value: unknown): value is MetaStatus {
  return isRecord(value) && isMode(value.mode) && isCapabilityList(value.capabilities)
    && (value.connection === null || isConnection(value.connection));
}
export async function getMetaStatus(organizationId: string, signal?: AbortSignal): Promise<MetaStatus> {
  const status = await requestMeta<unknown>(organizationId, "/meta/status", signal);
  if (!isStatus(status)) throw new AppApiError("Recebemos um estado Meta inválido.", "INVALID_API_RESPONSE");
  return status;
}
export const listMetaConnections = (organizationId: string, signal?: AbortSignal) => requestMeta<{ items: MetaConnection[] }>(organizationId, "/meta/connections", signal);
export const listMetaAssets = (organizationId: string, id: string, signal?: AbortSignal) => requestMeta<{ items: MetaAsset[] }>(organizationId, `${connectionPath(id)}/assets`, signal);
export const startMetaOAuth = (organizationId: string, channel: Channel | null, signal?: AbortSignal) => requestMeta<OAuthStart>(organizationId, "/meta/oauth/start", signal, { channel });
export const selectMetaAssets = (organizationId: string, id: string, assetIds: string[], signal?: AbortSignal) => requestMeta<MetaConnection>(organizationId, `${connectionPath(id)}/assets`, signal, { assetIds });
export const testMetaConnection = (organizationId: string, id: string, signal?: AbortSignal) => requestMeta<MetaConnection>(organizationId, `${connectionPath(id)}/test`, signal, {});
export const revokeMetaConnection = (organizationId: string, id: string, signal?: AbortSignal) => requestMeta<MetaConnection>(organizationId, `${connectionPath(id)}/revoke`, signal, {});
