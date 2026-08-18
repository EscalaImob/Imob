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

export type CorporateInspectionType = "entry" | "exit" | "valuation" | "technical" | "handover" | "custom";
export type CorporateInspectionStatus = "draft" | "in_progress" | "review" | "completed" | "canceled";
export type CorporateInspectionCondition = "excellent" | "good" | "regular" | "poor" | "not_applicable";
export interface CorporateInspectionChecklistItem { id: string; name: string; condition: CorporateInspectionCondition | null; observation: string | null; measurement: string | null; }
export interface CorporateInspectionEnvironment { id: string; name: string; items: CorporateInspectionChecklistItem[]; }
export interface CorporateInspectionFields { type: CorporateInspectionType; status: CorporateInspectionStatus; title: string; scheduledAt: string | null; responsibleMembershipId: string | null; summary: string | null; checklist: CorporateInspectionEnvironment[]; cancelReason: string | null; }
export interface CorporateInspectionListItem { id: string; title: string; type: CorporateInspectionType; status: CorporateInspectionStatus; property: { id: string; internalCode: string; title: string }; visit: { id: string; title: string; startsAt: string } | null; contract: { id: string; title: string } | null; responsible: { membershipId: string; displayName: string } | null; scheduledAt: string | null; startedAt: string | null; completedAt: string | null; canceledAt: string | null; currentVersion: number; environmentCount: number; itemCount: number; createdAt: string; updatedAt: string; }
export interface CorporateInspectionListResult { total: number; drafts: number; inProgress: number; review: number; completed: number; items: CorporateInspectionListItem[]; page: number; pageSize: number; totalItems: number; totalPages: number; }
export interface CorporateInspectionDetail extends CorporateInspectionListItem { propertyId: string; visitId: string | null; contractId: string | null; responsibleMembershipId: string | null; summary: string | null; checklist: CorporateInspectionEnvironment[]; cancelReason: string | null; versions: Array<{ id: string; version: number; createdBy: { userId: string; displayName: string } | null; createdAt: string }>; timeline: Array<{ id: string; eventType: string; actor: { userId: string; displayName: string } | null; data: Record<string, unknown>; createdAt: string }>; }
export interface CorporateInspectionOptions { assignees: Array<{ membershipId: string; displayName: string; email: string }>; properties: Array<{ id: string; internalCode: string; title: string; responsibleMembershipId: string | null }>; visits: Array<{ id: string; title: string; propertyId: string | null; startsAt: string; status: string }>; contracts: Array<{ id: string; title: string; propertyId: string; status: string }>; }

export async function listCorporateInspections(organizationId: string, filters: { search?: string; type?: CorporateInspectionType; status?: CorporateInspectionStatus; view?: "all" | "mine"; page?: number; pageSize?: number } = {}): Promise<CorporateInspectionListResult> { const query = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "" && value !== null) query.set(key, String(value)); return tenantRequest(organizationId, `/corporate/inspections${query.size ? `?${query}` : ""}`); }
export async function getCorporateInspectionOptions(organizationId: string): Promise<CorporateInspectionOptions> { return tenantRequest(organizationId, "/corporate/inspections/options"); }
export async function getCorporateInspection(organizationId: string, id: string): Promise<CorporateInspectionDetail> { return tenantRequest(organizationId, `/corporate/inspections/${encodeURIComponent(id)}`); }
export async function createCorporateInspection(organizationId: string, input: CorporateInspectionFields & { propertyId: string; visitId: string | null; contractId: string | null }): Promise<CorporateInspectionDetail> { return tenantRequest(organizationId, "/corporate/inspections", { method: "POST", body: JSON.stringify(input) }); }
export async function updateCorporateInspection(organizationId: string, id: string, fields: CorporateInspectionFields): Promise<CorporateInspectionDetail> { return tenantRequest(organizationId, `/corporate/inspections/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) }); }

export type CorporateInspectionEvidenceContentType = "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm" | "application/pdf";
export type CorporateInspectionEvidenceKind = "photo" | "video" | "document";
export interface CorporateInspectionEvidenceItem {
  id: string;
  inspectionId: string;
  inspectionVersion: number;
  environmentId: string | null;
  itemId: string | null;
  kind: CorporateInspectionEvidenceKind;
  originalName: string;
  contentType: CorporateInspectionEvidenceContentType;
  sizeBytes: number;
  caption: string | null;
  sortOrder: number;
  createdBy: { userId: string; displayName: string } | null;
  createdAt: string;
  viewUrl: string;
  downloadUrl: string;
  urlExpiresInSeconds: number;
}
export interface CorporateInspectionEvidenceUploadReady {
  evidenceId: string;
  uploadUrl: string;
  expiresInSeconds: number;
  requiredHeaders: { "content-type": CorporateInspectionEvidenceContentType };
}
export const CORPORATE_INSPECTION_EVIDENCE_MAX_COUNT = 80;
export const CORPORATE_INSPECTION_EVIDENCE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const CORPORATE_INSPECTION_EVIDENCE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const CORPORATE_INSPECTION_EVIDENCE_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export async function listCorporateInspectionEvidences(organizationId: string, inspectionId: string): Promise<CorporateInspectionEvidenceItem[]> {
  return tenantRequest(organizationId, `/corporate/inspections/${encodeURIComponent(inspectionId)}/evidences`);
}
export async function createCorporateInspectionEvidenceUpload(organizationId: string, inspectionId: string, file: File): Promise<CorporateInspectionEvidenceUploadReady> {
  return tenantRequest(organizationId, `/corporate/inspections/${encodeURIComponent(inspectionId)}/evidences/upload-url`, { method: "POST", body: JSON.stringify({ originalName: file.name, contentType: file.type, sizeBytes: file.size }) });
}
export async function uploadCorporateInspectionEvidenceFile(ready: CorporateInspectionEvidenceUploadReady, file: File): Promise<void> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(ready.uploadUrl, { method: "PUT", headers: { "content-type": ready.requiredHeaders["content-type"] }, body: file, signal: controller.signal });
    if (!response.ok) throw new AppApiError("Não foi possível enviar a evidência para o armazenamento.", "EVIDENCE_UPLOAD_FAILED", response.status);
  } catch (error) {
    if (error instanceof AppApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new AppApiError("O envio da evidência demorou mais que o esperado.", "EVIDENCE_UPLOAD_TIMEOUT");
    throw new AppApiError("Não foi possível enviar a evidência. Verifique sua conexão.", "EVIDENCE_UPLOAD_NETWORK_ERROR");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
export async function confirmCorporateInspectionEvidence(
  organizationId: string,
  inspectionId: string,
  ready: CorporateInspectionEvidenceUploadReady,
  file: File,
  target: { environmentId: string | null; itemId: string | null; caption?: string | null },
): Promise<CorporateInspectionEvidenceItem[]> {
  return tenantRequest(organizationId, `/corporate/inspections/${encodeURIComponent(inspectionId)}/evidences/confirm`, { method: "POST", body: JSON.stringify({ evidenceId: ready.evidenceId, originalName: file.name, contentType: file.type, sizeBytes: file.size, environmentId: target.environmentId, itemId: target.itemId, caption: target.caption ?? null }) });
}
export async function deleteCorporateInspectionEvidence(organizationId: string, inspectionId: string, evidenceId: string): Promise<CorporateInspectionEvidenceItem[]> {
  return tenantRequest(organizationId, `/corporate/inspections/${encodeURIComponent(inspectionId)}/evidences/${encodeURIComponent(evidenceId)}`, { method: "DELETE" });
}
