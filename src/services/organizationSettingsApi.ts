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
  timezone: string;
  status: "active" | "suspended" | "archived";
}

export interface OrganizationSettingsUpdate {
  name: string;
  legalName: string | null;
  timezone: string;
}

export async function getOrganizationSettings(organizationId: string): Promise<OrganizationSettings> {
  return tenantRequest(organizationId, "/organization/settings");
}

export async function updateOrganizationSettings(organizationId: string, input: OrganizationSettingsUpdate): Promise<OrganizationSettings> {
  return tenantRequest(organizationId, "/organization/settings", { method: "PATCH", body: JSON.stringify(input) });
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

export interface OrganizationLeadDistributionPolicy {
  intent: OrganizationLeadDistributionIntent; mode: OrganizationLeadDistributionMode; teamId: string | null; teamName: string | null;
  slaFirstResponseMinutes: number; rules: OrganizationLeadDistributionRule[]; eligibleMembers: OrganizationLeadDistributionMemberOption[];
}

export interface OrganizationLeadDistributionSettings {
  policies: OrganizationLeadDistributionPolicy[];
  members: OrganizationLeadDistributionMemberOption[];
  teams: OrganizationLeadDistributionTeamOption[];
}

export interface OrganizationLeadDistributionRuleUpdate {
  kind: OrganizationLeadDistributionRuleKind; regionState: string | null; regionCity: string | null; propertyType: OrganizationLeadDistributionPropertyType | null; teamId: string;
}
export interface OrganizationLeadDistributionSettingsUpdate {
  buyer: { mode: OrganizationLeadDistributionMode; teamId: string | null; slaFirstResponseMinutes: number; rules: OrganizationLeadDistributionRuleUpdate[] };
  capture: { mode: OrganizationLeadDistributionMode; teamId: string | null; slaFirstResponseMinutes: number; rules: OrganizationLeadDistributionRuleUpdate[] };
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

