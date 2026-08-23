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

export type CorporateContractType = "sale_purchase" | "rent" | "administration" | "intermediation" | "capture" | "exclusivity" | "services" | "other";
export type CorporateContractStatus = "draft" | "review" | "approved" | "sent" | "signed" | "active" | "closed" | "canceled";
export interface CorporateContractFields { type: CorporateContractType; status: CorporateContractStatus; title: string; amount: string | null; commissionPercent: string | null; startsAt: string | null; endsAt: string | null; renewalAt: string | null; responsibleMembershipId: string | null; paymentTerms: string | null; conditions: string | null; notes: string | null; cancelReason: string | null; }
export interface CorporateContractListItem { id: string; title: string; type: CorporateContractType; status: CorporateContractStatus; property: { id: string; internalCode: string; title: string }; counterparty: { id: string; name: string } | null; opportunity: { id: string; title: string } | null; authorization: { id: string; type: string; status: string } | null; amount: string | null; commissionPercent: string | null; startsAt: string | null; endsAt: string | null; renewalAt: string | null; responsible: { membershipId: string; displayName: string } | null; currentVersion: number; sentAt: string | null; signedAt: string | null; closedAt: string | null; canceledAt: string | null; createdAt: string; updatedAt: string; }
export interface CorporateContractListResult { total: number; drafts: number; active: number; pendingSignature: number; expiring: number; items: CorporateContractListItem[]; page: number; pageSize: number; totalItems: number; totalPages: number; }
export interface CorporateContractDetail extends CorporateContractListItem { propertyId: string; counterpartyContactId: string | null; opportunityId: string | null; authorizationId: string | null; responsibleMembershipId: string | null; paymentTerms: string | null; conditions: string | null; notes: string | null; cancelReason: string | null; parties: Array<{ contactId: string; name: string; email: string | null; phone: string | null; role: "owner" | "client" | "buyer" | "seller" | "tenant" | "landlord" | "guarantor" | "broker" | "other"; primary: boolean; signerRequired: boolean; participationPercentage: string | null }>; versions: Array<{ id: string; version: number; createdBy: { userId: string; displayName: string } | null; createdAt: string }>; timeline: Array<{ id: string; eventType: string; actor: { userId: string; displayName: string } | null; data: Record<string, unknown>; createdAt: string }>; }
export interface CorporateContractOptions { assignees: Array<{ membershipId: string; displayName: string; email: string }>; properties: Array<{ id: string; internalCode: string; title: string; purpose: string; responsibleMembershipId: string | null; owners: Array<{ contactId: string; name: string; email: string | null; phone: string | null; ownershipPercentage: string | null; primary: boolean }> }>; contacts: Array<{ id: string; name: string; email: string | null; phone: string | null }>; opportunities: Array<{ id: string; title: string; status: string; contactId: string; contactName: string; sourcePropertyId: string | null }>; authorizations: Array<{ id: string; propertyId: string; type: string; status: string; startsAt: string | null; endsAt: string | null }>; }

export async function listCorporateContracts(organizationId: string, filters: { search?: string; type?: CorporateContractType; status?: CorporateContractStatus; view?: "all" | "mine"; page?: number; pageSize?: number } = {}): Promise<CorporateContractListResult> { const query = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "" && value !== null) query.set(key, String(value)); return tenantRequest(organizationId, `/corporate/contracts${query.size ? `?${query}` : ""}`); }
export async function getCorporateContractOptions(organizationId: string): Promise<CorporateContractOptions> { return tenantRequest(organizationId, "/corporate/contracts/options"); }
export async function getCorporateContract(organizationId: string, id: string): Promise<CorporateContractDetail> { return tenantRequest(organizationId, `/corporate/contracts/${encodeURIComponent(id)}`); }
export async function createCorporateContract(organizationId: string, input: CorporateContractFields & { propertyId: string; counterpartyContactId: string | null; opportunityId: string | null; authorizationId: string | null }): Promise<CorporateContractDetail> { return tenantRequest(organizationId, "/corporate/contracts", { method: "POST", body: JSON.stringify(input) }); }
export async function updateCorporateContract(organizationId: string, id: string, fields: CorporateContractFields): Promise<CorporateContractDetail> { return tenantRequest(organizationId, `/corporate/contracts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) }); }
export async function deleteCorporateContract(organizationId: string, id: string): Promise<{id:string;archived:boolean}> { return tenantRequest(organizationId, "/corporate/contracts/"+encodeURIComponent(id), { method: "DELETE" }); }
