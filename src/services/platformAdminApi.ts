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


export type PlatformOperationalAlarmState = "OK" | "ALARM" | "INSUFFICIENT_DATA" | "MISSING";

export interface PlatformOperationalAlarm {
  key: "errors" | "throttles" | "duration_p90";
  name: string;
  state: PlatformOperationalAlarmState;
  reason: string | null;
  updatedAt: string | null;
}

export interface PlatformOperationsHealth {
  status: "healthy" | "warning" | "critical";
  checkedAt: string;
  region: string;
  api: { status: "healthy"; service: string; version: string };
  database: { status: "healthy"; latencyMs: number };
  monitoring: { status: "healthy" | "warning"; available: boolean; message: string | null };
  alarms: PlatformOperationalAlarm[];
}

export type PlatformUserStatus = "active" | "suspended" | "archived";

export interface PlatformUser {
  id: string;
  email: string;
  displayName: string;
  status: PlatformUserStatus;
  createdAt: string;
  platformRoles: string[];
  activeOrganizations: Array<{
    organizationId: string;
    organizationName: string;
  }>;
}

export interface PlatformUserFilters {
  q?: string;
  status?: PlatformUserStatus | "all";
}

export async function listPlatformUsers(filters: PlatformUserFilters = {}): Promise<PlatformUser[]> {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  params.set("limit", "100");
  return platformRequest(`/platform/users?${params.toString()}`);
}


export type PlatformAuditScope = "platform" | "organization";

export interface PlatformAuditLog {
  id: string;
  scope: PlatformAuditScope;
  organizationId: string | null;
  organizationName: string | null;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string | null;
  createdAt: string;
}

export interface PlatformAuditFilters {
  q?: string;
  scope?: PlatformAuditScope | "all";
  organizationId?: string;
  createdFrom?: string;
  createdTo?: string;
}

export async function listPlatformAuditLogs(filters: PlatformAuditFilters = {}): Promise<PlatformAuditLog[]> {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.scope && filters.scope !== "all") params.set("scope", filters.scope);
  if (filters.organizationId?.trim()) params.set("organizationId", filters.organizationId.trim());
  if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) params.set("createdTo", filters.createdTo);
  params.set("limit", "100");
  return platformRequest(`/platform/audit-logs?${params.toString()}`);
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

export async function getPlatformOperationsHealth(): Promise<PlatformOperationsHealth> {
  return platformRequest("/platform/operations/health");
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


export interface PlatformAiStudioTelemetryBreakdown {
  key: string;
  total: number;
  succeeded: number;
  failed: number;
  renderMsP90: number | null;
}

export interface PlatformAiStudioTelemetryError {
  code: string;
  total: number;
}

export interface PlatformAiStudioTelemetryFeedbackReason {
  reason: string;
  total: number;
}

export interface PlatformAiStudioTelemetry {
  from: string;
  to: string;
  days: number;
  totalGenerations: number;
  succeeded: number;
  failed: number;
  regenerationCount: number;
  webGpuCount: number;
  webGpuUsedCount: number;
  wasmUsedCount: number;
  unknownVisionBackendCount: number;
  feedbackCount: number;
  likedCount: number;
  dislikedCount: number;
  renderMsP50: number | null;
  renderMsP90: number | null;
  renderMsAverage: number | null;
  preparationMsAverage: number | null;
  outputBytesAverage: number | null;
  imageCountAverage: number | null;
  browsers: PlatformAiStudioTelemetryBreakdown[];
  devices: PlatformAiStudioTelemetryBreakdown[];
  errors: PlatformAiStudioTelemetryError[];
  feedbackReasons: PlatformAiStudioTelemetryFeedbackReason[];
}

export async function getPlatformAiStudioTelemetry(days = 30): Promise<PlatformAiStudioTelemetry> {
  const safeDays = [7, 30, 60, 90].includes(days) ? days : 30;
  return platformRequest(`/platform/ai-studio/telemetry?days=${safeDays}`);
}

export interface PlatformAiStudioOrganization {
  organizationId: string;
  organizationName: string;
  enabled: boolean;
  planCode: string;
  monthlyReelLimit: number | null;
  currentMonthUsage: number;
}

export interface PlatformAiStudioOrganizationUpdate {
  enabled: boolean;
  planCode: string;
  monthlyReelLimit: number | null;
}

export async function listPlatformAiStudioOrganizations(): Promise<PlatformAiStudioOrganization[]> {
  return platformRequest("/platform/ai-studio/organizations");
}

export async function updatePlatformAiStudioOrganization(
  organizationId: string,
  input: PlatformAiStudioOrganizationUpdate,
): Promise<PlatformAiStudioOrganization> {
  return platformRequest(`/platform/ai-studio/organizations/${encodeURIComponent(organizationId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
