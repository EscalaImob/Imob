import { ensureValidAuthSession } from "../auth/session";
import { AppApiError } from "./appApi";

const REQUEST_TIMEOUT_MS = 15_000;
function apiBase() { const value = import.meta.env.VITE_API_URL?.trim(); if (!value) throw new AppApiError("A plataforma ainda não está conectada à API.", "API_NOT_CONFIGURED"); return value.replace(/\/+$/u, ""); }
async function tenantRequest<T>(organizationId: string, path: string, init: RequestInit = {}): Promise<T> {
  const session = await ensureValidAuthSession(); if (!session) throw new AppApiError("Sua sessão expirou. Entre novamente.", "UNAUTHORIZED", 401);
  const controller = new AbortController(); const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase()}${path}`, { ...init, headers: { authorization: `Bearer ${session.accessToken}`, "x-organization-id": organizationId, ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) }, signal: controller.signal });
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

export type FinancialDirection = "income" | "expense";
export type FinancialStatus = "forecast" | "pending" | "settled" | "partial" | "overdue" | "canceled" | "reversed";
export type FinancialAccountType = "cash" | "bank" | "digital" | "other";
export interface FinancialTransactionFields {
  direction: FinancialDirection;
  status: FinancialStatus;
  description: string;
  amount: string;
  settledAmount: string;
  competenceDate: string;
  dueDate: string;
  settlementDate: string | null;
  categoryId: string | null;
  accountId: string | null;
  costCenterId: string | null;
  contractId: string | null;
  opportunityId: string | null;
  propertyId: string | null;
  contactId: string | null;
  responsibleMembershipId: string | null;
  supplierName: string | null;
  notes: string | null;
}
export interface FinancialTransactionListItem {
  id: string; direction: FinancialDirection; status: FinancialStatus; description: string; amount: string; settledAmount: string; competenceDate: string; dueDate: string; settlementDate: string | null;
  category: { id: string; name: string } | null; account: { id: string; name: string; type: FinancialAccountType } | null; costCenter: { id: string; name: string } | null;
  contract: { id: string; title: string } | null; opportunity: { id: string; title: string } | null; property: { id: string; internalCode: string; title: string } | null; contact: { id: string; name: string } | null;
  responsible: { membershipId: string; displayName: string } | null; supplierName: string | null; notes: string | null; createdAt: string; updatedAt: string;
}
export interface FinancialSummary { balance: string; inflows: string; outflows: string; overdueAmount: string; overdueCount: number; dueNext30Amount: string; dueNext30Count: number; projectedBalance: string; }
export interface FinancialTransactionListResult { currency: "BRL" | "USD" | "EUR"; summary: FinancialSummary; items: FinancialTransactionListItem[]; page: number; pageSize: number; totalItems: number; totalPages: number; }
export interface FinancialTransactionDetail extends FinancialTransactionListItem {
  categoryId: string | null; accountId: string | null; costCenterId: string | null; contractId: string | null; opportunityId: string | null; propertyId: string | null; contactId: string | null; responsibleMembershipId: string | null;
  timeline: Array<{ id: string; eventType: string; actor: { userId: string; displayName: string } | null; data: Record<string, unknown>; createdAt: string }>;
}
export interface FinancialOptions {
  settings: { currency: "BRL" | "USD" | "EUR"; defaultCommissionPercent: string; requireCategory: boolean; requireAccount: boolean; requireCostCenter: boolean };
  accounts: Array<{ id: string; name: string; type: FinancialAccountType }>;
  categories: Array<{ id: string; name: string; direction: FinancialDirection | "both" }>;
  costCenters: Array<{ id: string; name: string }>;
  assignees: Array<{ membershipId: string; displayName: string; email: string }>;
  contacts: Array<{ id: string; name: string; email: string | null; phone: string | null }>;
  properties: Array<{ id: string; internalCode: string; title: string }>;
  opportunities: Array<{ id: string; title: string; contactId: string; propertyId: string | null; status: string }>;
  contracts: Array<{ id: string; title: string; propertyId: string; counterpartyContactId: string | null; status: string }>;
}

export async function listFinancialTransactions(organizationId: string, filters: { search?: string; direction?: FinancialDirection; status?: FinancialStatus; accountId?: string; categoryId?: string; dueFrom?: string; dueTo?: string; view?: "all" | "mine"; page?: number; pageSize?: number } = {}): Promise<FinancialTransactionListResult> { const query = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "" && value !== null) query.set(key, String(value)); return tenantRequest(organizationId, `/corporate/finance/transactions${query.size ? `?${query}` : ""}`); }
export async function getFinancialOptions(organizationId: string): Promise<FinancialOptions> { return tenantRequest(organizationId, "/corporate/finance/options"); }
export async function getFinancialTransaction(organizationId: string, id: string): Promise<FinancialTransactionDetail> { return tenantRequest(organizationId, `/corporate/finance/transactions/${encodeURIComponent(id)}`); }
export async function createFinancialTransaction(organizationId: string, input: FinancialTransactionFields): Promise<FinancialTransactionDetail> { return tenantRequest(organizationId, "/corporate/finance/transactions", { method: "POST", body: JSON.stringify(input) }); }
export async function updateFinancialTransaction(organizationId: string, id: string, input: FinancialTransactionFields & { changeReason: string | null }): Promise<FinancialTransactionDetail> { return tenantRequest(organizationId, `/corporate/finance/transactions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }); }
