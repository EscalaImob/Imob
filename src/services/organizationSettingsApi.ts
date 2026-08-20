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
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "x-organization-id": organizationId,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
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
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export interface OrganizationSettings {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  cnpj: string | null;
  creci: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  responsibleName: string | null;
  responsibleEmail: string | null;
  responsiblePhone: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressPostalCode: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  timezone: string;
  status: "active" | "suspended" | "archived";
}

export interface OrganizationSettingsUpdate {
  name: string;
  legalName: string | null;
  cnpj: string | null;
  creci: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  responsibleName: string | null;
  responsibleEmail: string | null;
  responsiblePhone: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressPostalCode: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  timezone: string;
}

export async function getOrganizationSettings(organizationId: string): Promise<OrganizationSettings> {
  return tenantRequest(organizationId, "/organization/settings");
}

export async function updateOrganizationSettings(organizationId: string, input: OrganizationSettingsUpdate): Promise<OrganizationSettings> {
  return tenantRequest(organizationId, "/organization/settings", { method: "PATCH", body: JSON.stringify(input) });
}

export interface OrganizationIdentitySettings {
  id: string;
  organizationName: string;
  brandName: string | null;
  brandTagline: string | null;
  publicDescription: string | null;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  siteUrl: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  publicWhatsapp: string | null;
  instagramUrl: string | null;
  logoStorageKey: string | null;
  logoUrl: string | null;
}

export type OrganizationIdentitySettingsUpdate = Omit<OrganizationIdentitySettings, "id" | "organizationName" | "logoStorageKey" | "logoUrl">;

interface OrganizationIdentityLogoUpload {
  storageKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
  requiredHeaders: { "content-type": string };
}

export async function getOrganizationIdentity(organizationId: string): Promise<OrganizationIdentitySettings> {
  return tenantRequest(organizationId, "/organization/identity");
}

export async function updateOrganizationIdentity(organizationId: string, input: OrganizationIdentitySettingsUpdate): Promise<OrganizationIdentitySettings> {
  return tenantRequest(organizationId, "/organization/identity", { method: "PATCH", body: JSON.stringify(input) });
}

export async function uploadOrganizationIdentityLogo(organizationId: string, file: File): Promise<OrganizationIdentitySettings> {
  const upload = await tenantRequest<OrganizationIdentityLogoUpload>(organizationId, "/organization/identity/logo/upload-url", {
    method: "POST",
    body: JSON.stringify({ originalName: file.name, contentType: file.type, sizeBytes: file.size }),
  });
  const response = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.requiredHeaders, body: file });
  if (!response.ok) throw new AppApiError("Não foi possível enviar o logo selecionado.", "LOGO_UPLOAD_ERROR", response.status);
  return tenantRequest(organizationId, "/organization/identity/logo", { method: "PATCH", body: JSON.stringify({ storageKey: upload.storageKey }) });
}

export async function removeOrganizationIdentityLogo(organizationId: string): Promise<OrganizationIdentitySettings> {
  return tenantRequest(organizationId, "/organization/identity/logo", { method: "DELETE" });
}

export type OrganizationPropertyTypeCode = "apartment" | "house" | "commercial" | "land" | "rural" | "warehouse" | "building" | "room" | "other";
export type OrganizationPropertyPurpose = "sale" | "rent" | "sale_rent";
export type OrganizationPropertyAreaUnit = "m2" | "ha";
export interface OrganizationPropertyTypeCatalogItem { code: OrganizationPropertyTypeCode; label: string; enabled: boolean; }
export interface OrganizationPropertySettings {
  propertyTypes: OrganizationPropertyTypeCatalogItem[]; amenities: string[]; condominiumAmenities: string[];
  defaultPurpose: OrganizationPropertyPurpose; defaultAreaUnit: OrganizationPropertyAreaUnit;
  requireRegistryOnActive: boolean; requireDocumentationOnActive: boolean; requireSiteTitleOnActive: boolean;
}
export type OrganizationPropertySettingsUpdate = OrganizationPropertySettings;
export async function getOrganizationPropertySettings(organizationId: string): Promise<OrganizationPropertySettings> {
  return tenantRequest(organizationId, "/organization/property-settings");
}
export async function updateOrganizationPropertySettings(organizationId: string, input: OrganizationPropertySettingsUpdate): Promise<OrganizationPropertySettings> {
  return tenantRequest(organizationId, "/organization/property-settings", { method: "PATCH", body: JSON.stringify(input) });
}

export interface OrganizationDocumentSettings {
  authorizationPrefix: string;
  authorizationTitle: string;
  footerText: string | null;
  includePartyContacts: boolean;
  signaturePreparationEnabled: boolean;
}
export type OrganizationDocumentSettingsUpdate = OrganizationDocumentSettings;
export async function getOrganizationDocumentSettings(organizationId: string): Promise<OrganizationDocumentSettings> {
  return tenantRequest(organizationId, "/organization/document-settings");
}
export async function updateOrganizationDocumentSettings(organizationId: string, input: OrganizationDocumentSettingsUpdate): Promise<OrganizationDocumentSettings> {
  return tenantRequest(organizationId, "/organization/document-settings", { method: "PATCH", body: JSON.stringify(input) });
}

export type OrganizationFinancialCurrency = "BRL" | "USD" | "EUR";
export type OrganizationFinancialAccountType = "cash" | "bank" | "digital" | "other";
export type OrganizationFinancialDirection = "income" | "expense" | "both";
export interface OrganizationFinancialAccountSetting { id: string; name: string; type: OrganizationFinancialAccountType; active: boolean; }
export interface OrganizationFinancialCategorySetting { id: string; name: string; direction: OrganizationFinancialDirection; active: boolean; }
export interface OrganizationFinancialCostCenterSetting { id: string; name: string; active: boolean; }
export interface OrganizationFinancialSettings {
  currency: OrganizationFinancialCurrency;
  defaultCommissionPercent: string;
  requireCategory: boolean;
  requireAccount: boolean;
  requireCostCenter: boolean;
  accounts: OrganizationFinancialAccountSetting[];
  categories: OrganizationFinancialCategorySetting[];
  costCenters: OrganizationFinancialCostCenterSetting[];
}
export interface OrganizationFinancialSettingsUpdate {
  currency: OrganizationFinancialCurrency;
  defaultCommissionPercent: string;
  requireCategory: boolean;
  requireAccount: boolean;
  requireCostCenter: boolean;
  accounts: Array<Omit<OrganizationFinancialAccountSetting, "id"> & { id: string | null }>;
  categories: Array<Omit<OrganizationFinancialCategorySetting, "id"> & { id: string | null }>;
  costCenters: Array<Omit<OrganizationFinancialCostCenterSetting, "id"> & { id: string | null }>;
}
export async function getOrganizationFinancialSettings(organizationId: string): Promise<OrganizationFinancialSettings> {
  return tenantRequest(organizationId, "/organization/financial-settings");
}
export async function updateOrganizationFinancialSettings(organizationId: string, input: OrganizationFinancialSettingsUpdate): Promise<OrganizationFinancialSettings> {
  return tenantRequest(organizationId, "/organization/financial-settings", { method: "PATCH", body: JSON.stringify(input) });
}

export type OrganizationMembershipStatus = "invited" | "active" | "suspended" | "archived";
export type ManagedOrganizationMembershipStatus = "active" | "suspended" | "archived";

export interface OrganizationMember {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  membershipStatus: OrganizationMembershipStatus;
  userStatus: "active" | "suspended" | "archived";
}

export async function listOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  return tenantRequest(organizationId, "/organization/members");
}

export async function updateOrganizationMemberStatus(
  organizationId: string,
  membershipId: string,
  status: ManagedOrganizationMembershipStatus,
): Promise<OrganizationMember> {
  return tenantRequest(
    organizationId,
    `/organization/members/${encodeURIComponent(membershipId)}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

export type OrganizationTeamStatus = "active" | "archived";

export interface OrganizationTeam {
  id: string;
  name: string;
  status: OrganizationTeamStatus;
  members: OrganizationMember[];
}

export interface OrganizationTeamUpdate {
  name?: string;
  status?: OrganizationTeamStatus;
}

export async function listOrganizationTeams(organizationId: string): Promise<OrganizationTeam[]> {
  return tenantRequest(organizationId, "/organization/teams");
}

export async function createOrganizationTeam(organizationId: string, name: string): Promise<OrganizationTeam> {
  return tenantRequest(organizationId, "/organization/teams", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updateOrganizationTeam(
  organizationId: string,
  teamId: string,
  update: OrganizationTeamUpdate,
): Promise<OrganizationTeam> {
  return tenantRequest(organizationId, `/organization/teams/${encodeURIComponent(teamId)}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export async function addOrganizationTeamMember(
  organizationId: string,
  teamId: string,
  membershipId: string,
): Promise<OrganizationTeam> {
  return tenantRequest(
    organizationId,
    `/organization/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`,
    { method: "PUT" },
  );
}

export async function removeOrganizationTeamMember(
  organizationId: string,
  teamId: string,
  membershipId: string,
): Promise<OrganizationTeam> {
  return tenantRequest(
    organizationId,
    `/organization/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`,
    { method: "DELETE" },
  );
}

export type OrganizationAccessScope = "own" | "team" | "organization";

export interface OrganizationPermission {
  code: string;
  description: string;
}

export interface OrganizationRoleGrant {
  permissionCode: string;
  permissionDescription: string;
  scope: OrganizationAccessScope;
}

export interface OrganizationRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
  systemManaged: boolean;
  grants: OrganizationRoleGrant[];
  memberIds: string[];
}

export interface OrganizationRoleGrantInput {
  permissionCode: string;
  scope: OrganizationAccessScope;
}

export interface OrganizationRoleCreateInput {
  name: string;
  description: string | null;
  grants: OrganizationRoleGrantInput[];
}

export interface OrganizationRoleUpdateInput {
  name?: string;
  description?: string | null;
  grants?: OrganizationRoleGrantInput[];
}

export async function listOrganizationPermissions(organizationId: string): Promise<OrganizationPermission[]> {
  return tenantRequest(organizationId, "/organization/permissions");
}

export async function listOrganizationRoles(organizationId: string): Promise<OrganizationRole[]> {
  return tenantRequest(organizationId, "/organization/roles");
}

export async function createOrganizationRole(
  organizationId: string,
  input: OrganizationRoleCreateInput,
): Promise<OrganizationRole> {
  return tenantRequest(organizationId, "/organization/roles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateOrganizationRole(
  organizationId: string,
  roleId: string,
  input: OrganizationRoleUpdateInput,
): Promise<OrganizationRole> {
  return tenantRequest(organizationId, `/organization/roles/${encodeURIComponent(roleId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function addOrganizationRoleMember(
  organizationId: string,
  roleId: string,
  membershipId: string,
): Promise<OrganizationRole> {
  return tenantRequest(
    organizationId,
    `/organization/roles/${encodeURIComponent(roleId)}/members/${encodeURIComponent(membershipId)}`,
    { method: "PUT" },
  );
}

export async function removeOrganizationRoleMember(
  organizationId: string,
  roleId: string,
  membershipId: string,
): Promise<OrganizationRole> {
  return tenantRequest(
    organizationId,
    `/organization/roles/${encodeURIComponent(roleId)}/members/${encodeURIComponent(membershipId)}`,
    { method: "DELETE" },
  );
}

export interface OrganizationInvitationResultItem {
  email: string;
  membershipId: string;
  status: "invited" | "already_member";
}

export async function inviteOrganizationMembers(organizationId: string, emails: string[]): Promise<OrganizationInvitationResultItem[]> {
  return tenantRequest(organizationId, "/organization/members/invitations", { method: "POST", body: JSON.stringify({ emails }) });
}

export async function requestOrganizationMemberAccessReset(organizationId: string, membershipId: string): Promise<{ requested: true; member: OrganizationMember }> {
  return tenantRequest(organizationId, `/organization/members/${encodeURIComponent(membershipId)}/access-reset`, { method: "POST" });
}

export type OrganizationLeadDistributionIntent = "buyer" | "capture";
export type OrganizationLeadDistributionMode = "manual" | "round_robin";
export type OrganizationLeadDistributionRuleKind = "region" | "property_type";
export type OrganizationLeadDistributionPropertyType = "apartment" | "house" | "commercial" | "land" | "rural" | "warehouse" | "building" | "room" | "other";

export interface OrganizationLeadDistributionMemberOption {
  membershipId: string;
  displayName: string;
  email: string;
}

export interface OrganizationLeadDistributionTeamOption {
  id: string;
  name: string;
  members: OrganizationLeadDistributionMemberOption[];
}

export interface OrganizationLeadDistributionRule {
  id: string; kind: OrganizationLeadDistributionRuleKind; regionState: string | null; regionCity: string | null;
  propertyType: OrganizationLeadDistributionPropertyType | null; teamId: string; teamName: string; priority: number;
}

export interface OrganizationLeadDistributionDutyWindow {
  id: string; weekday: number; startTime: string; endTime: string; teamId: string; teamName: string; priority: number;
}

export interface OrganizationLeadDistributionPolicy {
  intent: OrganizationLeadDistributionIntent; mode: OrganizationLeadDistributionMode; teamId: string | null; teamName: string | null;
  slaFirstResponseMinutes: number; dutyWindows: OrganizationLeadDistributionDutyWindow[]; rules: OrganizationLeadDistributionRule[]; eligibleMembers: OrganizationLeadDistributionMemberOption[];
}

export interface OrganizationLeadDistributionSettings {
  policies: OrganizationLeadDistributionPolicy[];
  members: OrganizationLeadDistributionMemberOption[];
  teams: OrganizationLeadDistributionTeamOption[];
}

export interface OrganizationLeadDistributionRuleUpdate {
  kind: OrganizationLeadDistributionRuleKind; regionState: string | null; regionCity: string | null; propertyType: OrganizationLeadDistributionPropertyType | null; teamId: string;
}
export interface OrganizationLeadDistributionDutyWindowUpdate { weekday: number; startTime: string; endTime: string; teamId: string; }
export interface OrganizationLeadDistributionSettingsUpdate {
  buyer: { mode: OrganizationLeadDistributionMode; teamId: string | null; slaFirstResponseMinutes: number; dutyWindows: OrganizationLeadDistributionDutyWindowUpdate[]; rules: OrganizationLeadDistributionRuleUpdate[] };
  capture: { mode: OrganizationLeadDistributionMode; teamId: string | null; slaFirstResponseMinutes: number; dutyWindows: OrganizationLeadDistributionDutyWindowUpdate[]; rules: OrganizationLeadDistributionRuleUpdate[] };
}

export async function getOrganizationLeadDistribution(
  organizationId: string,
): Promise<OrganizationLeadDistributionSettings> {
  return tenantRequest(organizationId, "/organization/operational/lead-distribution");
}

export async function updateOrganizationLeadDistribution(
  organizationId: string,
  input: OrganizationLeadDistributionSettingsUpdate,
): Promise<OrganizationLeadDistributionSettings> {
  return tenantRequest(organizationId, "/organization/operational/lead-distribution", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type OrganizationOperationalRequiredField = "description" | "estimatedValue" | "expectedCloseDate" | "temperature";
export type OrganizationOperationalLossReasonStatus = "active" | "archived";

export interface OrganizationOperationalLossReason {
  id: string;
  name: string;
  status: OrganizationOperationalLossReasonStatus;
}

export type OrganizationOperationalFunnelStageStatus = "active" | "archived";

export interface OrganizationOperationalFunnelStage {
  id: string;
  code: string;
  name: string;
  position: number;
  probability: number | null;
  outcome: string | null;
  color: string;
  requiredFields: OrganizationOperationalRequiredField[];
  status: OrganizationOperationalFunnelStageStatus;
}

export interface OrganizationOperationalFunnel {
  id: string;
  code: string;
  name: string;
  status: string;
  stages: OrganizationOperationalFunnelStage[];
  lossReasons: OrganizationOperationalLossReason[];
}

export interface OrganizationOperationalFunnelStageCreate {
  name: string;
  probability: number | null;
  color: string;
  requiredFields: OrganizationOperationalRequiredField[];
}

export interface OrganizationOperationalFunnelUpdate {
  name: string;
  stages: Array<{
    id: string;
    name: string;
    position: number;
    probability: number | null;
    color: string;
    requiredFields: OrganizationOperationalRequiredField[];
  }>;
}

export async function listOrganizationOperationalFunnels(organizationId: string): Promise<OrganizationOperationalFunnel[]> {
  return tenantRequest(organizationId, "/organization/operational/funnels");
}

export async function updateOrganizationOperationalFunnel(
  organizationId: string,
  funnelId: string,
  input: OrganizationOperationalFunnelUpdate,
): Promise<OrganizationOperationalFunnel> {
  return tenantRequest(organizationId, `/organization/operational/funnels/${encodeURIComponent(funnelId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function createOrganizationOperationalFunnelStage(
  organizationId: string,
  funnelId: string,
  input: OrganizationOperationalFunnelStageCreate,
): Promise<OrganizationOperationalFunnel> {
  return tenantRequest(organizationId, `/organization/operational/funnels/${encodeURIComponent(funnelId)}/stages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateOrganizationOperationalFunnelStageStatus(
  organizationId: string,
  funnelId: string,
  stageId: string,
  status: OrganizationOperationalFunnelStageStatus,
): Promise<OrganizationOperationalFunnel> {
  return tenantRequest(organizationId, `/organization/operational/funnels/${encodeURIComponent(funnelId)}/stages/${encodeURIComponent(stageId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function createOrganizationOperationalLossReason(
  organizationId: string,
  funnelId: string,
  name: string,
): Promise<OrganizationOperationalLossReason> {
  return tenantRequest(organizationId, `/organization/operational/funnels/${encodeURIComponent(funnelId)}/loss-reasons`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updateOrganizationOperationalLossReason(
  organizationId: string,
  funnelId: string,
  lossReasonId: string,
  input: { name?: string; status?: OrganizationOperationalLossReasonStatus },
): Promise<OrganizationOperationalLossReason> {
  return tenantRequest(organizationId, `/organization/operational/funnels/${encodeURIComponent(funnelId)}/loss-reasons/${encodeURIComponent(lossReasonId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}


export interface OrganizationNotificationChannelPreference { inApp: boolean; email: boolean; }
export interface OrganizationNotificationSettings { taskAssigned: OrganizationNotificationChannelPreference; calendarEventAssigned: OrganizationNotificationChannelPreference; }
export type OrganizationNotificationSettingsUpdate = OrganizationNotificationSettings;
export async function getOrganizationNotificationSettings(organizationId: string): Promise<OrganizationNotificationSettings> { return tenantRequest(organizationId, "/organization/notification-settings"); }
export async function updateOrganizationNotificationSettings(organizationId: string, input: OrganizationNotificationSettingsUpdate): Promise<OrganizationNotificationSettings> { return tenantRequest(organizationId, "/organization/notification-settings", { method: "PATCH", body: JSON.stringify(input) }); }


export type OrganizationIntegrationKind = "webhook";
export type OrganizationIntegrationAuthType = "none" | "bearer";
export type OrganizationIntegrationStatus = "pending" | "connected" | "error" | "revoked";
export interface OrganizationIntegration {
  id: string; kind: OrganizationIntegrationKind; name: string; baseUrl: string; authType: OrganizationIntegrationAuthType;
  secretConfigured: boolean; secretLast4: string | null; status: OrganizationIntegrationStatus;
  lastCheckedAt: string | null; lastCheckStatus: "success" | "failed" | null; lastErrorCode: string | null; createdAt: string; updatedAt: string;
}
export interface OrganizationIntegrationCreateInput { kind: "webhook"; name: string; baseUrl: string; authType: OrganizationIntegrationAuthType; secret: string | null; }
export interface OrganizationIntegrationUpdateInput { name: string; baseUrl: string; authType: OrganizationIntegrationAuthType; secret?: string | null; }
export async function listOrganizationIntegrations(organizationId: string): Promise<OrganizationIntegration[]> { return tenantRequest(organizationId, "/organization/integrations"); }
export async function createOrganizationIntegration(organizationId: string, input: OrganizationIntegrationCreateInput): Promise<OrganizationIntegration> { return tenantRequest(organizationId, "/organization/integrations", { method: "POST", body: JSON.stringify(input) }); }
export async function updateOrganizationIntegration(organizationId: string, integrationId: string, input: OrganizationIntegrationUpdateInput): Promise<OrganizationIntegration> { return tenantRequest(organizationId, `/organization/integrations/${encodeURIComponent(integrationId)}`, { method: "PATCH", body: JSON.stringify(input) }); }
export async function testOrganizationIntegration(organizationId: string, integrationId: string): Promise<{ integration: OrganizationIntegration; httpStatus: number | null }> { return tenantRequest(organizationId, `/organization/integrations/${encodeURIComponent(integrationId)}/test`, { method: "POST" }); }
export async function revokeOrganizationIntegration(organizationId: string, integrationId: string): Promise<OrganizationIntegration> { return tenantRequest(organizationId, `/organization/integrations/${encodeURIComponent(integrationId)}/revoke`, { method: "POST" }); }

export type OrganizationAuditRetentionDays = 30 | 90 | 180 | 365 | 730;
export type OrganizationAuditPayloadVisibility = "metadata_only" | "redacted";
export interface OrganizationSecuritySettings {
  auditRetentionDays: OrganizationAuditRetentionDays;
  auditPayloadVisibility: OrganizationAuditPayloadVisibility;
  auditReadTrackingEnabled: boolean;
  allowMemberAccessReset: boolean;
}
export interface OrganizationSecurityAuditLog {
  id: string; action: string; entityType: string; entityId: string; actorUserId: string | null; actorDisplayName: string | null; actorEmail: string | null;
  before: unknown | null; after: unknown | null; metadata: unknown | null; requestId: string | null; createdAt: string;
}
export interface OrganizationSecurityAuditView { retentionDays: OrganizationAuditRetentionDays; payloadVisibility: OrganizationAuditPayloadVisibility; items: OrganizationSecurityAuditLog[]; }
export async function getOrganizationSecuritySettings(organizationId: string): Promise<OrganizationSecuritySettings> { return tenantRequest(organizationId, "/organization/security-settings"); }
export async function updateOrganizationSecuritySettings(organizationId: string, input: OrganizationSecuritySettings): Promise<OrganizationSecuritySettings> { return tenantRequest(organizationId, "/organization/security-settings", { method: "PATCH", body: JSON.stringify(input) }); }
export async function listOrganizationAuditLogs(organizationId: string, limit = 50): Promise<OrganizationSecurityAuditView> { return tenantRequest(organizationId, `/organization/audit-logs?limit=${encodeURIComponent(String(limit))}`); }

export type OrganizationDataTransferResource = "contacts" | "properties" | "settings";
export type OrganizationDataTransferDirection = "import" | "export";
export type OrganizationDataTransferStatus = "pending_upload" | "validated" | "completed" | "completed_with_errors" | "failed";
export interface OrganizationDataTransferValidationError { row: number | null; field: string; message: string; }
export interface OrganizationDataTransfer { id:string;direction:OrganizationDataTransferDirection;resource:OrganizationDataTransferResource;format:"csv"|"json";status:OrganizationDataTransferStatus;originalName:string|null;contentType:string;sizeBytes:number;sha256:string|null;totalRows:number;validRows:number;errorRows:number;validationErrors:OrganizationDataTransferValidationError[];createdAt:string;updatedAt:string;completedAt:string|null; }
export interface OrganizationDataImportUpload extends OrganizationDataTransfer { uploadUrl:string;expiresInSeconds:number;requiredHeaders:{"content-type":string}; }
export interface OrganizationDataExportDownload extends OrganizationDataTransfer { downloadUrl:string;expiresInSeconds:number; }
export async function listOrganizationDataTransfers(organizationId:string,limit=20):Promise<OrganizationDataTransfer[]>{return tenantRequest(organizationId,`/organization/data-transfers?limit=${encodeURIComponent(String(limit))}`);}
export async function startOrganizationDataImport(organizationId:string,resource:OrganizationDataTransferResource,file:File):Promise<OrganizationDataImportUpload>{return tenantRequest(organizationId,"/organization/data-transfers/imports",{method:"POST",body:JSON.stringify({resource,originalName:file.name,contentType:file.type||(resource==="settings"?"application/json":"text/csv"),sizeBytes:file.size})});}
export async function uploadOrganizationDataImport(upload:OrganizationDataImportUpload,file:File):Promise<void>{const response=await fetch(upload.uploadUrl,{method:"PUT",headers:{"content-type":upload.requiredHeaders["content-type"]},body:file});if(!response.ok)throw new AppApiError("Não foi possível enviar o arquivo para o armazenamento privado.","DATA_TRANSFER_UPLOAD_FAILED",response.status);}
export async function previewOrganizationDataImport(organizationId:string,transferId:string):Promise<OrganizationDataTransfer>{return tenantRequest(organizationId,`/organization/data-transfers/${encodeURIComponent(transferId)}/preview`,{method:"POST"});}
export async function createAndPreviewOrganizationDataImport(organizationId:string,resource:OrganizationDataTransferResource,file:File):Promise<OrganizationDataTransfer>{const upload=await startOrganizationDataImport(organizationId,resource,file);await uploadOrganizationDataImport(upload,file);return previewOrganizationDataImport(organizationId,upload.id);}
export async function commitOrganizationDataImport(organizationId:string,transferId:string):Promise<OrganizationDataTransfer>{return tenantRequest(organizationId,`/organization/data-transfers/${encodeURIComponent(transferId)}/commit`,{method:"POST"});}
export async function createOrganizationDataExport(organizationId:string,resource:OrganizationDataTransferResource):Promise<OrganizationDataExportDownload>{return tenantRequest(organizationId,"/organization/data-transfers/exports",{method:"POST",body:JSON.stringify({resource})});}
export async function downloadOrganizationDataExport(organizationId:string,transferId:string):Promise<OrganizationDataExportDownload>{return tenantRequest(organizationId,`/organization/data-transfers/${encodeURIComponent(transferId)}/download`);}
