import { ensureValidAuthSession } from "../auth/session";
import { AppApiError } from "./appApi";

const REQUEST_TIMEOUT_MS = 15_000;
function apiBase(): string {
  const value = import.meta.env.VITE_API_URL?.trim();
  if (!value) throw new AppApiError("A plataforma ainda não está conectada à API.", "API_NOT_CONFIGURED");
  return value.replace(/\/+$/u, "");
}
async function tenantRequest<T>(organizationId: string, path: string, init: RequestInit = {}): Promise<T> {
  const session = await ensureValidAuthSession();
  if (!session) throw new AppApiError("Sua sessão expirou. Entre novamente.", "UNAUTHORIZED", 401);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${session.accessToken}`, "x-organization-id": organizationId, ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
      signal: controller.signal,
    });
    let payload: unknown = null;
    try { payload = await response.json(); } catch { payload = null; }
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

export type VisitStatus = "scheduled" | "confirmed" | "completed" | "canceled";
export type VisitView = "all" | "mine";
export interface VisitAssignee { membershipId: string; userId: string; displayName: string; email: string; }
export interface VisitListItem {
  id: string; title: string; notes: string | null; location: string; status: VisitStatus; startsAt: string; endsAt: string;
  responsible: { membershipId: string; displayName: string } | null;
  contact: { id: string; name: string };
  opportunity: { id: string; title: string } | null;
  property: { id: string; internalCode: string; title: string } | null;
  feedbackRating: number | null; feedbackNotes: string | null; cancellationReason: string | null;
  confirmedAt: string | null; completedAt: string | null; canceledAt: string | null; createdAt: string; updatedAt: string;
}
export interface VisitListResult {
  summary: { total: number; scheduled: number; completed: number; today: number };
  items: VisitListItem[]; page: number; pageSize: number; totalItems: number; totalPages: number;
}
export interface VisitInput {
  title: string; notes?: string; location: string; status: VisitStatus; startsAt: string; endsAt: string;
  responsibleMembershipId?: string; contactId: string; opportunityId?: string; propertyId?: string; feedbackRating?: number; feedbackNotes?: string; cancellationReason?: string;
}
export async function listVisitAssignees(organizationId: string): Promise<VisitAssignee[]> {
  return tenantRequest<VisitAssignee[]>(organizationId, "/productivity/visits/assignees");
}
export async function listVisits(organizationId: string, filters: { search?: string; status?: VisitStatus; view?: VisitView; opportunityId?: string; from?: Date; to?: Date; page?: number; pageSize?: number } = {}): Promise<VisitListResult> {
  const query = new URLSearchParams();
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  if (filters.status) query.set("status", filters.status);
  if (filters.view) query.set("view", filters.view);
  if (filters.opportunityId) query.set("opportunityId", filters.opportunityId);
  if (filters.from) query.set("from", filters.from.toISOString());
  if (filters.to) query.set("to", filters.to.toISOString());
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  if (filters.pageSize) query.set("pageSize", String(filters.pageSize));
  return tenantRequest<VisitListResult>(organizationId, `/productivity/visits${query.size ? `?${query.toString()}` : ""}`);
}
export async function createVisit(organizationId: string, input: VisitInput): Promise<VisitListItem> {
  return tenantRequest<VisitListItem>(organizationId, "/productivity/visits", { method: "POST", body: JSON.stringify(input) });
}
export async function updateVisit(organizationId: string, visitId: string, input: VisitInput): Promise<VisitListItem> {
  return tenantRequest<VisitListItem>(organizationId, `/productivity/visits/${encodeURIComponent(visitId)}`, { method: "PATCH", body: JSON.stringify(input) });
}
