import { ensureValidAuthSession } from "../auth/session";
import { AppApiError } from "./appApi";

const REQUEST_TIMEOUT_MS = 15_000;

export type ContactProfileCode =
  | "interested"
  | "buyer"
  | "tenant"
  | "owner"
  | "seller"
  | "landlord"
  | "investor"
  | "partner";

export type ContactStatus = "active" | "inactive" | "blocked" | "archived";

export interface ContactListItem {
  id: string;
  kind: "person" | "company";
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  source: string;
  status: ContactStatus;
  profiles: ContactProfileCode[];
  createdAt: string;
  lastActivityAt: string | null;
}

export interface ContactListResult {
  summary: {
    total: number;
    owners: number;
    interested: number;
    inactive: number;
  };
  items: ContactListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CreateContactInput {
  kind: "person" | "company";
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  city?: string;
  state?: string;
  source?: string;
  profiles: ContactProfileCode[];
}
export interface ContactDetail extends ContactListItem { whatsapp: string | null; }
export interface UpdateContactInput extends CreateContactInput { status: ContactStatus; }

export type LeadIntent = "buyer" | "capture";
export type LeadStatus = "new" | "in_progress" | "converted" | "invalid" | "duplicate" | "spam" | "archived";

export interface LeadListResult {
  summary: {
    pending: number;
    inProgress: number;
    converted: number;
    archived: number;
    total: number;
    lastReceivedAt: string | null;
    averageFirstResponseMinutes: number | null;
  };
  items: Array<{
    id: string;
    intent: LeadIntent;
    status: LeadStatus;
    source: string;
    name: string;
    email: string | null;
    phone: string | null;
    message: string | null;
    campaign: string | null;
    sourcePage: string | null;
    context: { relatedPropertyId: string | null; propertyType: string | null; city: string | null; state: string | null };
    sla: {
      firstResponseMinutes: number;
      warningAt: string;
      dueAt: string;
      state: "healthy" | "warning" | "breached" | "responded_on_time" | "responded_late" | "closed";
      breached: boolean;
      firstResponseAt: string | null;
      firstResponseMembershipId: string | null;
      firstResponseElapsedMinutes: number | null;
      notifications: {
        warning: { milestoneAt: string; emittedAt: string } | null;
        breach: { milestoneAt: string; emittedAt: string } | null;
      };
    };
    responsible: { membershipId: string; displayName: string } | null;
    receivedAt: string;
  }>;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

function apiBase(): string {
  const value = import.meta.env.VITE_API_URL?.trim();
  if (!value) throw new AppApiError("A plataforma ainda não está conectada à API.", "API_NOT_CONFIGURED");
  return value.replace(/\/+$/u, "");
}

async function tenantRequest<T>(
  organizationId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = await ensureValidAuthSession();
  if (!session) {
    throw new AppApiError("Sua sessão expirou. Entre novamente.", "UNAUTHORIZED", 401);
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "x-organization-id": organizationId,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const body = payload as { success?: boolean; data?: T; error?: { code?: string; message?: string; issues?: unknown } } | null;
    if (!response.ok) {
      throw new AppApiError(
        body?.error?.message || "Não foi possível concluir a operação.",
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
    throw new AppApiError("Não foi possível conectar à plataforma. Verifique sua conexão e tente novamente.", "NETWORK_ERROR");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function listContacts(
  organizationId: string,
  filters: { search?: string; profile?: string; status?: string; page?: number; pageSize?: number },
): Promise<ContactListResult> {
  const query = new URLSearchParams();
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  if (filters.profile) query.set("profile", filters.profile);
  if (filters.status) query.set("status", filters.status);
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  if (filters.pageSize) query.set("pageSize", String(filters.pageSize));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return tenantRequest<ContactListResult>(organizationId, `/crm/contacts${suffix}`);
}

export async function createContact(
  organizationId: string,
  input: CreateContactInput,
): Promise<ContactListItem> {
  return tenantRequest<ContactListItem>(organizationId, "/crm/contacts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type LeadListItem = LeadListResult["items"][number];
export interface LeadDetail extends LeadListItem { relatedContactId: string | null; archivedAt: string | null; updatedAt: string; }
export interface UpdateLeadInput { name: string; email: string | null; phone: string | null; message: string | null; status: LeadStatus; }
export interface CreateLeadInput { intent: LeadIntent; source: string; name: string; email: string | null; phone: string | null; message: string | null; campaign: string | null; sourcePage: string | null; propertyType: string | null; regionCity: string | null; regionState: string | null; relatedPropertyId: string | null; }

export async function getContact(organizationId: string, contactId: string): Promise<ContactDetail> {
  return tenantRequest<ContactDetail>(organizationId, `/crm/contacts/${encodeURIComponent(contactId)}`);
}

export async function updateContact(organizationId: string, contactId: string, input: UpdateContactInput): Promise<ContactDetail> {
  return tenantRequest<ContactDetail>(organizationId, `/crm/contacts/${encodeURIComponent(contactId)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function listLeads(
  organizationId: string,
  filters: { search?: string; intent?: string; status?: string; page?: number },
): Promise<LeadListResult> {
  const query = new URLSearchParams();
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  if (filters.intent) query.set("intent", filters.intent);
  if (filters.status) query.set("status", filters.status);
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return tenantRequest<LeadListResult>(organizationId, `/crm/leads${suffix}`);
}
export async function createLead(organizationId: string, input: CreateLeadInput): Promise<LeadDetail> {
  return tenantRequest<LeadDetail>(organizationId, "/crm/leads", { method: "POST", body: JSON.stringify(input) });
}

export async function getLead(organizationId: string, leadId: string): Promise<LeadDetail> {
  return tenantRequest<LeadDetail>(organizationId, `/crm/leads/${encodeURIComponent(leadId)}`);
}

export async function updateLead(organizationId: string, leadId: string, input: UpdateLeadInput): Promise<LeadDetail> {
  return tenantRequest<LeadDetail>(organizationId, `/crm/leads/${encodeURIComponent(leadId)}`, { method: "PATCH", body: JSON.stringify(input) });
}
export interface LeadConversionResult { leadId: string; contactId: string; opportunityId: string; funnelCode: "buyers" | "capture"; reusedContact: boolean; }
export async function convertLead(organizationId: string, leadId: string): Promise<LeadConversionResult> {
  return tenantRequest<LeadConversionResult>(organizationId, `/crm/leads/${encodeURIComponent(leadId)}/convert`, { method: "POST" });
}

export interface LeadAssignmentResult {
  id: string;
  intent: LeadIntent;
  status: LeadStatus;
  previousMembershipId: string | null;
  membershipId: string | null;
  responsible: { membershipId: string; displayName: string } | null;
  changed: boolean;
}

export async function assignLead(
  organizationId: string,
  leadId: string,
  membershipId: string | null,
): Promise<LeadAssignmentResult> {
  return tenantRequest<LeadAssignmentResult>(
    organizationId,
    `/crm/leads/${encodeURIComponent(leadId)}/assignment`,
    { method: "PATCH", body: JSON.stringify({ membershipId }) },
  );
}

export interface LeadFirstResponseResult {
  id: string;
  intent: LeadIntent;
  status: LeadStatus;
  changed: boolean;
  firstResponseAt: string;
  firstResponseMembershipId: string | null;
  sla: { firstResponseMinutes: number; dueAt: string; breached: boolean };
}

export async function recordLeadFirstResponse(
  organizationId: string,
  leadId: string,
): Promise<LeadFirstResponseResult> {
  return tenantRequest<LeadFirstResponseResult>(
    organizationId,
    `/crm/leads/${encodeURIComponent(leadId)}/first-response`,
    { method: "POST" },
  );
}

export async function distributeLead(
  organizationId: string,
  leadId: string,
): Promise<LeadAssignmentResult> {
  return tenantRequest<LeadAssignmentResult>(
    organizationId,
    `/crm/leads/${encodeURIComponent(leadId)}/distribution`,
    { method: "POST" },
  );
}


export type OpportunityFunnelCode = "buyers" | "capture";
export type OpportunityTemperature = "cold" | "warm" | "hot";
export type OpportunityRequiredField = "description" | "estimatedValue" | "expectedCloseDate" | "temperature";

export interface OpportunityCard {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  estimatedValue: string | null;
  probability: number | null;
  expectedCloseDate: string | null;
  temperature: OpportunityTemperature | null;
  lastActivityAt: string | null;
  createdAt: string;
  contact: { id: string; name: string; email: string | null; phone: string | null };
  responsible: { membershipId: string; displayName: string } | null;
}

export interface OpportunityStage {
  id: string;
  code: string;
  name: string;
  position: number;
  probability: number | null;
  outcome: string | null;
  color: string;
  requiredFields: OpportunityRequiredField[];
  opportunities: OpportunityCard[];
}

export interface OpportunityBoardResult {
  funnel: { id: string; code: OpportunityFunnelCode; name: string; stages: OpportunityStage[]; lossReasons: Array<{ id: string; name: string }> };
  summary: { active: number; won: number; lost: number; conversionRate: number; averageProbability: number; estimatedOpenValue: string };
}

export interface CreateOpportunityInput {
  funnelCode: OpportunityFunnelCode;
  contactId: string;
  title: string;
  description?: string;
  estimatedValue?: string;
  probability?: number;
  expectedCloseDate?: string;
  temperature?: OpportunityTemperature;
}

export async function getOpportunityBoard(
  organizationId: string,
  filters: { funnel: OpportunityFunnelCode; search?: string; view?: "all" | "mine" },
): Promise<OpportunityBoardResult> {
  const query = new URLSearchParams({ funnel: filters.funnel, view: filters.view ?? "all" });
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  return tenantRequest<OpportunityBoardResult>(organizationId, `/crm/opportunities?${query.toString()}`);
}

export async function createOpportunity(
  organizationId: string,
  input: CreateOpportunityInput,
): Promise<{ id: string }> {
  return tenantRequest<{ id: string }>(organizationId, "/crm/opportunities", { method: "POST", body: JSON.stringify(input) });
}

export async function moveOpportunityStage(
  organizationId: string,
  opportunityId: string,
  stageId: string,
  lossReasonId?: string,
): Promise<{ id: string; stageId: string; status: "open" | "won" | "lost" }> {
  return tenantRequest<{ id: string; stageId: string; status: "open" | "won" | "lost" }>(
    organizationId,
    `/crm/opportunities/${encodeURIComponent(opportunityId)}/stage`,
    { method: "PATCH", body: JSON.stringify({ stageId, ...(lossReasonId ? { lossReasonId } : {}) }) },
  );
}

export type OpportunityActivityType = "note" | "call" | "message";

export interface OpportunityTimelineEvent {
  id: string;
  eventType: string;
  actor: { userId: string; displayName: string } | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface OpportunityDetail {
  id: string;
  funnel: { id: string; code: OpportunityFunnelCode; name: string };
  stage: { id: string; code: string; name: string; probability: number | null; outcome: string | null };
  contact: { id: string; name: string; email: string | null; phone: string | null };
  responsible: { membershipId: string; displayName: string } | null;
  title: string;
  description: string | null;
  status: "open" | "won" | "lost";
  estimatedValue: string | null;
  probability: number | null;
  expectedCloseDate: string | null;
  temperature: OpportunityTemperature | null;
  lossReason: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  timeline: OpportunityTimelineEvent[];
}

export interface UpdateOpportunityInput {
  title: string;
  description?: string;
  estimatedValue?: string;
  probability?: number;
  expectedCloseDate?: string;
  temperature?: OpportunityTemperature;
}

export async function getOpportunityDetail(
  organizationId: string,
  opportunityId: string,
): Promise<OpportunityDetail> {
  return tenantRequest<OpportunityDetail>(organizationId, `/crm/opportunities/${encodeURIComponent(opportunityId)}`);
}

export async function updateOpportunity(
  organizationId: string,
  opportunityId: string,
  input: UpdateOpportunityInput,
): Promise<OpportunityDetail> {
  return tenantRequest<OpportunityDetail>(organizationId, `/crm/opportunities/${encodeURIComponent(opportunityId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function addOpportunityActivity(
  organizationId: string,
  opportunityId: string,
  input: { type: OpportunityActivityType; content: string },
): Promise<{ id: string }> {
  return tenantRequest<{ id: string }>(organizationId, `/crm/opportunities/${encodeURIComponent(opportunityId)}/activities`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
