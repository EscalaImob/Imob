import { ensureValidAuthSession } from "../auth/session";
import { AppApiError, type AccessScope } from "./appApi";

const REQUEST_TIMEOUT_MS = 15_000;
function apiBase() { const value = import.meta.env.VITE_API_URL?.trim(); if (!value) throw new AppApiError("A plataforma ainda não está conectada à API.", "API_NOT_CONFIGURED"); return value.replace(/\/+$/u, ""); }
async function tenantRequest<T>(organizationId: string, path: string, init?: RequestInit): Promise<T> {
  const session = await ensureValidAuthSession(); if (!session) throw new AppApiError("Sua sessão expirou. Entre novamente.", "UNAUTHORIZED", 401);
  const controller = new AbortController(); const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase()}${path}`, { ...init, headers: { authorization: `Bearer ${session.accessToken}`, "x-organization-id": organizationId, ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) }, signal: controller.signal });
    let payload: unknown = null; try { payload = await response.json(); } catch { payload = null; }
    const body = payload as { success?: boolean; data?: T; error?: { code?: string; message?: string } } | null;
    if (!response.ok) throw new AppApiError(body?.error?.message || "Não foi possível concluir a operação.", body?.error?.code || "API_ERROR", response.status);
    if (body?.success !== true || body.data === undefined) throw new AppApiError("Recebemos uma resposta inesperada da plataforma.", "INVALID_API_RESPONSE", response.status);
    return body.data;
  } catch (error) {
    if (error instanceof AppApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new AppApiError("A plataforma demorou mais que o esperado para responder.", "REQUEST_TIMEOUT");
    throw new AppApiError("Não foi possível conectar à plataforma. Verifique sua conexão e tente novamente.", "NETWORK_ERROR");
  } finally { globalThis.clearTimeout(timeout); }
}

export type SalesGoalMetric = "vgv" | "revenue_commission" | "sales_count" | "rentals_count" | "properties_captured" | "exclusive_contracts" | "visits";
export type SalesGoalScopeType = "organization" | "team" | "member";
export interface SalesGoalInput { metric: SalesGoalMetric; scopeType: SalesGoalScopeType; teamId: string | null; membershipId: string | null; periodStart: string; targetValue: string; }
export interface SalesGoalProgress extends SalesGoalInput { id: string; scopeKey: string; metricLabel: string; unit: "currency" | "count"; scopeLabel: string; actualValue: string; percentage: number; remainingValue: string; projectionValue: string; previousActualValue: string; trendPercent: number | null; achieved: boolean; createdAt: string; updatedAt: string; }
export interface SalesGoalOption { id: string; label: string; }
export interface SalesGoalsDashboard { periodStart: string; currency: "BRL" | "USD" | "EUR"; generatedAt: string; permissionScope: AccessScope; goals: SalesGoalProgress[]; history: SalesGoalProgress[]; teams: SalesGoalOption[]; members: SalesGoalOption[]; }

export async function getSalesGoals(organizationId: string, period: string): Promise<SalesGoalsDashboard> { return tenantRequest(organizationId, `/sales/goals?period=${encodeURIComponent(period)}`); }
export async function createSalesGoal(organizationId: string, input: SalesGoalInput): Promise<SalesGoalProgress> { return tenantRequest(organizationId, "/sales/goals", { method: "POST", body: JSON.stringify(input) }); }
export async function updateSalesGoal(organizationId: string, goalId: string, input: SalesGoalInput): Promise<SalesGoalProgress> { return tenantRequest(organizationId, `/sales/goals/${encodeURIComponent(goalId)}`, { method: "PATCH", body: JSON.stringify(input) }); }
