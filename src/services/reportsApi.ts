import { ensureValidAuthSession } from "../auth/session";
import { AppApiError } from "./appApi";

const REQUEST_TIMEOUT_MS = 15_000;
function apiBase() { const value = import.meta.env.VITE_API_URL?.trim(); if (!value) throw new AppApiError("A plataforma ainda não está conectada à API.", "API_NOT_CONFIGURED"); return value.replace(/\/+$/u, ""); }
async function tenantRequest<T>(organizationId: string, path: string): Promise<T> {
  const session = await ensureValidAuthSession(); if (!session) throw new AppApiError("Sua sessão expirou. Entre novamente.", "UNAUTHORIZED", 401);
  const controller = new AbortController(); const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase()}${path}`, { headers: { authorization: `Bearer ${session.accessToken}`, "x-organization-id": organizationId }, signal: controller.signal });
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

export interface OperationalReportFilters { from: string; to: string; view: "all" | "mine"; }
export interface OperationalReportTasks { dueInPeriod: number; completedInPeriod: number; pendingInPeriod: number; overdueCurrent: number; }
export interface OperationalReportVisits { totalInPeriod: number; scheduledInPeriod: number; confirmedInPeriod: number; completedInPeriod: number; canceledInPeriod: number; overdueCurrent: number; }
export interface OperationalReportAuthorizations { activeCurrent: number; expiringNext30Days: number; expiredCurrent: number; documentsPendingCurrent: number; }
export interface OperationalReportContracts { activeCurrent: number; expiringNext30Days: number; expiredCurrent: number; }
export interface OperationalReportInspections { openCurrent: number; draftCurrent: number; inProgressCurrent: number; reviewCurrent: number; completedInPeriod: number; overdueCurrent: number; }
export type OperationalCriticalItemKind = "task" | "visit" | "authorization" | "authorization_document" | "contract" | "inspection";
export type OperationalCriticalSeverity = "danger" | "warning";
export interface OperationalCriticalItem { kind: OperationalCriticalItemKind; id: string; title: string; description: string; responsibleName: string | null; dueAt: string | null; severity: OperationalCriticalSeverity; }
export interface OperationalReportResult {
  filters: OperationalReportFilters;
  generatedAt: string;
  tasks: OperationalReportTasks;
  visits: OperationalReportVisits;
  authorizations: OperationalReportAuthorizations;
  contracts: OperationalReportContracts;
  inspections: OperationalReportInspections;
  criticalItems: OperationalCriticalItem[];
}

export async function getOperationalReport(organizationId: string, filters: OperationalReportFilters): Promise<OperationalReportResult> {
  const query = new URLSearchParams({ from: filters.from, to: filters.to, view: filters.view });
  return tenantRequest(organizationId, `/corporate/reports/operations?${query}`);
}
