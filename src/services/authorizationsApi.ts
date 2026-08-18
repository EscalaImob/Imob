import { ensureValidAuthSession } from "../auth/session";
import { AppApiError } from "./appApi";

const REQUEST_TIMEOUT_MS = 15_000;
function apiBase() { const value = import.meta.env.VITE_API_URL?.trim(); if (!value) throw new AppApiError("A plataforma ainda não está conectada à API.", "API_NOT_CONFIGURED"); return value.replace(/\/+$/u, ""); }
async function tenantRequest<T>(organizationId: string, path: string, init: RequestInit = {}): Promise<T> {
  const session = await ensureValidAuthSession();
  if (!session) throw new AppApiError("Sua sessão expirou. Entre novamente.", "UNAUTHORIZED", 401);
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

export type PortfolioAuthorizationType = "sale" | "rent" | "sale_rent" | "capture";
export type PortfolioAuthorizationEditableStatus = "draft" | "awaiting_data" | "sent" | "signed" | "active" | "canceled";
export type PortfolioAuthorizationStatus = PortfolioAuthorizationEditableStatus | "expiring" | "expired";
export interface AuthorizationFields { type: PortfolioAuthorizationType; status: PortfolioAuthorizationEditableStatus; exclusive: boolean; commissionPercent: string | null; startsAt: string | null; endsAt: string | null; responsibleMembershipId: string | null; notes: string | null; cancelReason: string | null; }
export interface AuthorizationListItem { id: string; property: { id: string; internalCode: string; title: string }; primaryOwner: { id: string; name: string } | null; type: PortfolioAuthorizationType; status: PortfolioAuthorizationStatus; exclusive: boolean; commissionPercent: string | null; startsAt: string | null; endsAt: string | null; responsible: { membershipId: string; displayName: string } | null; sentAt: string | null; signedAt: string | null; createdAt: string; updatedAt: string; }
export interface AuthorizationListResult { total: number; active: number; expiring: number; expired: number; items: AuthorizationListItem[]; page: number; pageSize: number; totalItems: number; totalPages: number; }
export interface AuthorizationDetail extends AuthorizationListItem { baseStatus: PortfolioAuthorizationEditableStatus; parties: Array<{ contactId: string; name: string; email: string | null; phone: string | null; ownershipPercentage: string | null; primary: boolean; role: "owner"; signerRequired: boolean }>; notes: string | null; cancelReason: string | null; canceledAt: string | null; timeline: Array<{ id: string; eventType: string; actor: { userId: string; displayName: string } | null; data: Record<string, unknown>; createdAt: string }>; }
export interface AuthorizationDocumentItem { id: string; authorizationId: string; version: number; identifier: string; templateCode: string; templateVersion: number; sha256: string; contentType: "application/pdf"; sizeBytes: number; generatedBy: { userId: string; displayName: string } | null; generatedAt: string; signature: { status: "not_requested" | "pending" | "signed" | "failed" | "canceled"; provider: string | null; externalId: string | null; signedAt: string | null }; viewUrl: string; downloadUrl: string; urlExpiresInSeconds: number; }
export interface AuthorizationOptions { assignees: Array<{ membershipId: string; displayName: string; email: string }>; properties: Array<{ id: string; internalCode: string; title: string; purpose: "sale" | "rent" | "sale_rent"; responsibleMembershipId: string | null; authorizationStartsAt: string | null; authorizationEndsAt: string | null; commissionPercent: string | null; exclusive: boolean; owners: Array<{ contactId: string; name: string; email: string | null; phone: string | null; ownershipPercentage: string | null; primary: boolean }> }>; }

export type AuthorizationSignatureRequestStatus = "prepared" | "pending" | "signed" | "failed" | "canceled";
export interface AuthorizationSignatureRequestItem {
  id: string;
  authorizationId: string;
  document: { id: string; version: number; identifier: string; sha256: string };
  status: AuthorizationSignatureRequestStatus;
  provider: string | null;
  externalId: string | null;
  failure: { code: string | null; message: string | null } | null;
  signers: Array<{ id: string; contactId: string | null; name: string; email: string; role: "owner"; signingOrder: number; required: boolean; status: "pending" | "signed" | "declined" | "canceled"; signedAt: string | null }>;
  createdBy: { userId: string; displayName: string } | null;
  createdAt: string;
  sentAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  signedArtifact: { sha256: string; sizeBytes: number; storageKey: string } | null;
}

export async function listAuthorizations(organizationId: string, filters: { search?: string; type?: PortfolioAuthorizationType; status?: PortfolioAuthorizationStatus; expiresFrom?: string; expiresTo?: string; view?: "all" | "mine"; propertyId?: string; page?: number; pageSize?: number } = {}): Promise<AuthorizationListResult> { const query = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "" && value !== null) query.set(key, String(value)); return tenantRequest(organizationId, `/portfolio/authorizations${query.size ? `?${query}` : ""}`); }
export async function getAuthorizationOptions(organizationId: string): Promise<AuthorizationOptions> { return tenantRequest(organizationId, "/portfolio/authorizations/options"); }
export async function getAuthorization(organizationId: string, id: string): Promise<AuthorizationDetail> { return tenantRequest(organizationId, `/portfolio/authorizations/${encodeURIComponent(id)}`); }
export async function createAuthorization(organizationId: string, propertyId: string, fields: AuthorizationFields): Promise<AuthorizationDetail> { return tenantRequest(organizationId, "/portfolio/authorizations", { method: "POST", body: JSON.stringify({ propertyId, ...fields }) }); }
export async function updateAuthorization(organizationId: string, id: string, fields: AuthorizationFields): Promise<AuthorizationDetail> { return tenantRequest(organizationId, `/portfolio/authorizations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) }); }

export async function listAuthorizationDocuments(organizationId: string, authorizationId: string): Promise<AuthorizationDocumentItem[]> { return tenantRequest(organizationId, `/portfolio/authorizations/${encodeURIComponent(authorizationId)}/documents`); }
export async function generateAuthorizationDocument(organizationId: string, authorizationId: string): Promise<AuthorizationDocumentItem> { return tenantRequest(organizationId, `/portfolio/authorizations/${encodeURIComponent(authorizationId)}/documents`, { method: "POST" }); }

export async function listAuthorizationSignatureRequests(organizationId: string, authorizationId: string): Promise<AuthorizationSignatureRequestItem[]> { return tenantRequest(organizationId, `/portfolio/authorizations/${encodeURIComponent(authorizationId)}/signature-requests`); }
export async function prepareAuthorizationSignature(organizationId: string, authorizationId: string, documentId: string): Promise<AuthorizationSignatureRequestItem> { return tenantRequest(organizationId, `/portfolio/authorizations/${encodeURIComponent(authorizationId)}/signature-requests`, { method: "POST", body: JSON.stringify({ documentId }) }); }
export async function cancelAuthorizationSignaturePreparation(organizationId: string, authorizationId: string, requestId: string): Promise<AuthorizationSignatureRequestItem> { return tenantRequest(organizationId, `/portfolio/authorizations/${encodeURIComponent(authorizationId)}/signature-requests/${encodeURIComponent(requestId)}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) }); }
