import { useEffect, useMemo, useState } from "react";
import { AppApiError } from "../../services/appApi";
import { ensureValidAuthSession } from "../../auth/session";
import { confirmOnboardingAvatar, createOnboardingAvatarUpload, uploadOnboardingAvatar } from "../../services/registrationApi";
import {
  addOrganizationRoleMember,
  addOrganizationTeamMember,
  createOrganizationOperationalFunnelStage,
  createOrganizationOperationalLossReason,
  createOrganizationRole,
  createOrganizationTeam,
  getOrganizationIdentity,
  getOrganizationDocumentSettings,
  getOrganizationFinancialSettings,
  getOrganizationNotificationSettings,
  getOrganizationSecuritySettings,
  listOrganizationDataTransfers,
  createAndPreviewOrganizationDataImport,
  commitOrganizationDataImport,
  createOrganizationDataExport,
  downloadOrganizationDataExport,
  listOrganizationAuditLogs,
  listOrganizationIntegrations,
  createOrganizationIntegration,
  updateOrganizationIntegration,
  testOrganizationIntegration,
  revokeOrganizationIntegration,
  getOrganizationLeadDistribution,
  getOrganizationPropertySettings,
  getOrganizationSettings,
  inviteOrganizationMembers,
  listOrganizationMembers,
  listOrganizationOperationalFunnels,
  listOrganizationPermissions,
  listOrganizationRoles,
  listOrganizationTeams,
  removeOrganizationIdentityLogo,
  removeOrganizationRoleMember,
  removeOrganizationTeamMember,
  requestOrganizationMemberAccessReset,
  updateOrganizationIdentity,
  updateOrganizationDocumentSettings,
  updateOrganizationFinancialSettings,
  updateOrganizationNotificationSettings,
  updateOrganizationSecuritySettings,
  updateOrganizationMemberStatus,
  updateOrganizationLeadDistribution,
  updateOrganizationPropertySettings,
  updateOrganizationOperationalFunnel,
  updateOrganizationOperationalFunnelStageStatus,
  updateOrganizationOperationalLossReason,
  updateOrganizationRole,
  updateOrganizationSettings,
  updateOrganizationTeam,
  uploadOrganizationIdentityLogo,
  type ManagedOrganizationMembershipStatus,
  type OrganizationAccessScope,
  type OrganizationMember,
  type OrganizationMembershipStatus,
  type OrganizationLeadDistributionPropertyType,
  type OrganizationLeadDistributionSettings,
  type OrganizationLeadDistributionSettingsUpdate,
  type OrganizationPropertySettings,
  type OrganizationPropertySettingsUpdate,
  type OrganizationDocumentSettings,
  type OrganizationDocumentSettingsUpdate,
  type OrganizationFinancialSettings,
  type OrganizationFinancialSettingsUpdate,
  type OrganizationNotificationSettings,
  type OrganizationNotificationSettingsUpdate,
  type OrganizationSecuritySettings,
  type OrganizationSecurityAuditView,
  type OrganizationDataTransfer,
  type OrganizationDataTransferResource,
  type OrganizationIntegration,
  type OrganizationIntegrationAuthType,
  type OrganizationFinancialAccountType,
  type OrganizationFinancialDirection,
  type OrganizationIdentitySettings,
  type OrganizationIdentitySettingsUpdate,
  type OrganizationOperationalFunnel,
  type OrganizationOperationalFunnelStage,
  type OrganizationOperationalFunnelUpdate,
  type OrganizationOperationalLossReason,
  type OrganizationOperationalRequiredField,
  type OrganizationPermission,
  type OrganizationRole,
  type OrganizationRoleGrantInput,
  type OrganizationSettings,
  type OrganizationSettingsUpdate,
  type OrganizationTeam,
} from "../../services/organizationSettingsApi";
import { BellIcon, BuildingIcon, DocumentIcon, GlobeIcon, SettingsIcon, UsersIcon } from "../icons";
import { applyPanelTheme, defaultPanelTheme, readPanelTheme, resetPanelTheme, savePanelTheme, type PanelTheme } from "../panelTheme";

interface Props {
  organizationId: string;
  currentMembershipId: string;
  currentUser: { displayName: string; avatarUrl: string | null };
  canUpdate: boolean;
  canReadUsers: boolean;
  canUpdateUsers: boolean;
  canInviteUsers: boolean;
  canReadTeams: boolean;
  canManageTeams: boolean;
  canReadRoles: boolean;
  canManageRoles: boolean;
  canReadPermissions: boolean;
  canReadAuditLogs: boolean;
  canReadFunnels: boolean;
  canManageFunnels: boolean;
  canReadLeadDistribution: boolean;
  canManageLeadDistribution: boolean;
  canReadContacts: boolean;
  canCreateContact: boolean;
  canReadProperties: boolean;
  canCreateProperty: boolean;
  onUpdated: () => Promise<void> | void;
}

type SettingsSection = "company" | "identity" | "appearance" | "properties" | "documents" | "financial" | "notifications" | "integrations" | "security" | "transfers" | "people" | "operational";

type RoleGrantDraft = Record<string, OrganizationAccessScope | "">;
interface RoleDraft {
  name: string;
  description: string;
  grants: RoleGrantDraft;
}

interface OperationalFunnelDraft {
  name: string;
  stages: OrganizationOperationalFunnelStage[];
}

const leadDistributionPropertyTypes: Array<[OrganizationLeadDistributionPropertyType, string]> = [
  ["apartment", "Apartamento"], ["house", "Casa"], ["commercial", "Comercial"], ["land", "Terreno"], ["rural", "Rural"],
  ["warehouse", "Galpão"], ["building", "Prédio"], ["room", "Sala"], ["other", "Outro"],
];

const leadDistributionWeekdays: Array<[number, string]> = [[0, "Domingo"], [1, "Segunda"], [2, "Terça"], [3, "Quarta"], [4, "Quinta"], [5, "Sexta"], [6, "Sábado"]];

function leadDistributionDraft(settings: OrganizationLeadDistributionSettings): OrganizationLeadDistributionSettingsUpdate {
  const policy = (intent: "buyer" | "capture") => {
    const current = settings.policies.find((item) => item.intent === intent);
    return {
      mode: current?.mode ?? "manual", teamId: current?.teamId ?? null, slaFirstResponseMinutes: current?.slaFirstResponseMinutes ?? 30,
      dutyWindows: (current?.dutyWindows ?? []).map((duty) => ({ weekday: duty.weekday, startTime: duty.startTime, endTime: duty.endTime, teamId: duty.teamId })),
      rules: (current?.rules ?? []).map((rule) => ({ kind: rule.kind, regionState: rule.regionState, regionCity: rule.regionCity, propertyType: rule.propertyType, teamId: rule.teamId })),
    };
  };
  return { buyer: policy("buyer"), capture: policy("capture") };
}

function leadDistributionDirty(
  settings: OrganizationLeadDistributionSettings,
  draft: OrganizationLeadDistributionSettingsUpdate,
): boolean {
  return JSON.stringify(leadDistributionDraft(settings)) !== JSON.stringify(draft);
}

function leadDistributionDraftInvalid(settings: OrganizationLeadDistributionSettings, draft: OrganizationLeadDistributionSettingsUpdate): boolean {
  return (["buyer", "capture"] as const).some((intentKey) => {
    const policy = draft[intentKey];
    if (!Number.isInteger(policy.slaFirstResponseMinutes) || policy.slaFirstResponseMinutes < 5 || policy.slaFirstResponseMinutes > 10080) return true;
    const baseTeam = policy.teamId ? settings.teams.find((item) => item.id === policy.teamId) : null;
    if (policy.mode === "round_robin" && (baseTeam?.members ?? settings.members).length === 0) return true;
    const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/u;
    if (policy.dutyWindows.some((duty) => { const team = settings.teams.find((item) => item.id === duty.teamId); return !team || !Number.isInteger(duty.weekday) || duty.weekday < 0 || duty.weekday > 6 || !timePattern.test(duty.startTime) || !timePattern.test(duty.endTime) || duty.startTime === duty.endTime; })) return true;
    return policy.rules.some((rule) => {
      const team = settings.teams.find((item) => item.id === rule.teamId);
      if (!team) return true;
      return rule.kind === "region" ? !/^[A-Za-z]{2}$/u.test(rule.regionState ?? "") : !rule.propertyType;
    });
  });
}

function operationalFunnelDraft(funnel: OrganizationOperationalFunnel): OperationalFunnelDraft {
  return {
    name: funnel.name,
    stages: funnel.stages
      .filter((stage) => stage.status !== "archived")
      .map((stage) => ({ ...stage, requiredFields: [...stage.requiredFields] }))
      .sort((a, b) => a.position - b.position),
  };
}

function operationalFunnelUpdate(draft: OperationalFunnelDraft): OrganizationOperationalFunnelUpdate {
  return {
    name: draft.name.trim(),
    stages: draft.stages.map((stage, index) => ({
      id: stage.id,
      name: stage.name.trim(),
      position: index + 1,
      probability: stage.probability,
      color: stage.color.toUpperCase(),
      requiredFields: [...stage.requiredFields],
    })),
  };
}

function operationalFunnelDirty(funnel: OrganizationOperationalFunnel, draft: OperationalFunnelDraft): boolean {
  const current = operationalFunnelUpdate(operationalFunnelDraft(funnel));
  const next = operationalFunnelUpdate(draft);
  return JSON.stringify(current) !== JSON.stringify(next);
}

function outcomeLabel(outcome: string | null): string | null {
  if (outcome === "won") return "Ganho";
  if (outcome === "lost") return "Perdido";
  if (outcome === "captured") return "Captado";
  if (outcome === "not_captured") return "Não captado";
  return null;
}

const operationalRequiredFieldOptions: Array<{ value: OrganizationOperationalRequiredField; label: string }> = [
  { value: "description", label: "Descrição" },
  { value: "estimatedValue", label: "Valor estimado" },
  { value: "expectedCloseDate", label: "Previsão de fechamento" },
  { value: "temperature", label: "Temperatura" },
];

const timezoneOptions = [
  ["America/Sao_Paulo", "Brasília, São Paulo, Rio de Janeiro (UTC-3)"],
  ["America/Fortaleza", "Fortaleza, Recife, Salvador (UTC-3)"],
  ["America/Belem", "Belém (UTC-3)"],
  ["America/Manaus", "Manaus (UTC-4)"],
  ["America/Cuiaba", "Cuiabá (UTC-4)"],
  ["America/Rio_Branco", "Rio Branco (UTC-5)"],
  ["America/Noronha", "Fernando de Noronha (UTC-2)"],
] as const;

const brazilStateOptions = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] as const;

function optionalDraftText(value: string | null): string | null {
  return value?.trim() || null;
}

function digitsOnly(value: string | null): string | null {
  const normalized = value?.replace(/\D/gu, "") ?? "";
  return normalized || null;
}

function normalizedCnpj(value: string | null): string | null {
  const normalized = value?.replace(/[^0-9A-Za-z]/gu, "").toUpperCase() ?? "";
  return normalized || null;
}

function cnpjIsValid(value: string): boolean {
  if (!/^[0-9A-Z]{14}$/u.test(value)) return false;
  if (!/^\d{14}$/u.test(value)) return true;
  if (/^(\d)\1{13}$/u.test(value)) return false;
  const digit = (base: string, weights: number[]) => {
    const total = base.split("").reduce((sum, character, index) => sum + Number(character) * (weights[index] ?? 0), 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = digit(value.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(value.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${first}${second}` === value.slice(12);
}

function normalizeCompanyDraft(draft: OrganizationSettingsUpdate): OrganizationSettingsUpdate {
  return {
    name: draft.name.trim(),
    legalName: optionalDraftText(draft.legalName),
    cnpj: normalizedCnpj(draft.cnpj),
    creci: optionalDraftText(draft.creci)?.toUpperCase() ?? null,
    stateRegistration: optionalDraftText(draft.stateRegistration)?.toUpperCase() ?? null,
    municipalRegistration: optionalDraftText(draft.municipalRegistration)?.toUpperCase() ?? null,
    responsibleName: optionalDraftText(draft.responsibleName),
    responsibleEmail: optionalDraftText(draft.responsibleEmail)?.toLowerCase() ?? null,
    responsiblePhone: digitsOnly(draft.responsiblePhone),
    contactEmail: optionalDraftText(draft.contactEmail)?.toLowerCase() ?? null,
    contactPhone: digitsOnly(draft.contactPhone),
    addressPostalCode: digitsOnly(draft.addressPostalCode),
    addressStreet: optionalDraftText(draft.addressStreet),
    addressNumber: optionalDraftText(draft.addressNumber),
    addressComplement: optionalDraftText(draft.addressComplement),
    addressDistrict: optionalDraftText(draft.addressDistrict),
    addressCity: optionalDraftText(draft.addressCity),
    addressState: optionalDraftText(draft.addressState)?.toUpperCase() ?? null,
    timezone: draft.timezone,
  };
}

function companyDraftError(draft: OrganizationSettingsUpdate): string | null {
  const normalized = normalizeCompanyDraft(draft);
  if (!normalized.name) return "Informe o nome da organização.";
  if (normalized.cnpj && !cnpjIsValid(normalized.cnpj)) return "Informe um CNPJ válido.";
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
  if (normalized.responsibleEmail && !emailPattern.test(normalized.responsibleEmail)) return "Informe um e-mail válido para o responsável.";
  if (normalized.contactEmail && !emailPattern.test(normalized.contactEmail)) return "Informe um e-mail corporativo válido.";
  if (normalized.responsiblePhone && (normalized.responsiblePhone.length < 10 || normalized.responsiblePhone.length > 15)) return "Informe um telefone válido para o responsável.";
  if (normalized.contactPhone && (normalized.contactPhone.length < 10 || normalized.contactPhone.length > 15)) return "Informe um telefone corporativo válido.";
  if ((normalized.responsibleEmail || normalized.responsiblePhone) && !normalized.responsibleName) return "Informe o nome do responsável principal.";
  if (normalized.addressPostalCode && normalized.addressPostalCode.length !== 8) return "Informe um CEP com 8 dígitos.";
  if (normalized.addressState && !brazilStateOptions.includes(normalized.addressState as typeof brazilStateOptions[number])) return "Informe uma UF válida.";
  const addressCore = [normalized.addressPostalCode, normalized.addressStreet, normalized.addressNumber, normalized.addressDistrict, normalized.addressCity, normalized.addressState];
  const hasAddress = addressCore.some(Boolean) || Boolean(normalized.addressComplement);
  if (hasAddress && addressCore.some((value) => !value)) return "Preencha CEP, logradouro, número, bairro, cidade e UF do endereço.";
  return null;
}

function toDraft(settings: OrganizationSettings): OrganizationSettingsUpdate {
  return {
    name: settings.name,
    legalName: settings.legalName,
    cnpj: settings.cnpj,
    creci: settings.creci,
    stateRegistration: settings.stateRegistration,
    municipalRegistration: settings.municipalRegistration,
    responsibleName: settings.responsibleName,
    responsibleEmail: settings.responsibleEmail,
    responsiblePhone: settings.responsiblePhone,
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
    addressPostalCode: settings.addressPostalCode,
    addressStreet: settings.addressStreet,
    addressNumber: settings.addressNumber,
    addressComplement: settings.addressComplement,
    addressDistrict: settings.addressDistrict,
    addressCity: settings.addressCity,
    addressState: settings.addressState,
    timezone: settings.timezone,
  };
}

function identityToDraft(settings: OrganizationIdentitySettings): OrganizationIdentitySettingsUpdate {
  return {
    brandName: settings.brandName,
    brandTagline: settings.brandTagline,
    publicDescription: settings.publicDescription,
    brandPrimaryColor: settings.brandPrimaryColor,
    brandSecondaryColor: settings.brandSecondaryColor,
    siteUrl: settings.siteUrl,
    publicEmail: settings.publicEmail,
    publicPhone: settings.publicPhone,
    publicWhatsapp: settings.publicWhatsapp,
    instagramUrl: settings.instagramUrl,
  };
}

function normalizeIdentityDraft(draft: OrganizationIdentitySettingsUpdate): OrganizationIdentitySettingsUpdate {
  return {
    brandName: optionalDraftText(draft.brandName),
    brandTagline: optionalDraftText(draft.brandTagline),
    publicDescription: optionalDraftText(draft.publicDescription),
    brandPrimaryColor: draft.brandPrimaryColor.trim().toUpperCase(),
    brandSecondaryColor: draft.brandSecondaryColor.trim().toUpperCase(),
    siteUrl: optionalDraftText(draft.siteUrl),
    publicEmail: optionalDraftText(draft.publicEmail)?.toLowerCase() ?? null,
    publicPhone: digitsOnly(draft.publicPhone),
    publicWhatsapp: digitsOnly(draft.publicWhatsapp),
    instagramUrl: optionalDraftText(draft.instagramUrl),
  };
}

function identityUrlIsValid(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function identityDraftError(draft: OrganizationIdentitySettingsUpdate): string | null {
  const normalized = normalizeIdentityDraft(draft);
  if (!/^#[0-9A-F]{6}$/u.test(normalized.brandPrimaryColor)) return "Informe uma cor primária válida no formato #RRGGBB.";
  if (!/^#[0-9A-F]{6}$/u.test(normalized.brandSecondaryColor)) return "Informe uma cor secundária válida no formato #RRGGBB.";
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
  if (normalized.publicEmail && !emailPattern.test(normalized.publicEmail)) return "Informe um e-mail público válido.";
  if (normalized.publicPhone && (normalized.publicPhone.length < 10 || normalized.publicPhone.length > 15)) return "Informe um telefone público válido.";
  if (normalized.publicWhatsapp && (normalized.publicWhatsapp.length < 10 || normalized.publicWhatsapp.length > 15)) return "Informe um WhatsApp público válido.";
  if (normalized.siteUrl && !identityUrlIsValid(normalized.siteUrl)) return "Informe uma URL válida para o site.";
  if (normalized.instagramUrl && !identityUrlIsValid(normalized.instagramUrl)) return "Informe uma URL válida para o Instagram.";
  return null;
}


function normalizedPropertySettingsDraft(draft: OrganizationPropertySettingsUpdate): OrganizationPropertySettingsUpdate {
  const clean = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);
  return {
    ...draft,
    propertyTypes: draft.propertyTypes.map((item) => ({ ...item, label: item.label.trim() })),
    amenities: clean(draft.amenities),
    condominiumAmenities: clean(draft.condominiumAmenities),
  };
}

function propertySettingsDraftError(draft: OrganizationPropertySettingsUpdate): string | null {
  const normalized = normalizedPropertySettingsDraft(draft);
  if (!normalized.propertyTypes.some((item) => item.enabled)) return "Mantenha pelo menos um tipo de imóvel habilitado.";
  if (normalized.propertyTypes.some((item) => !item.label || item.label.length > 60)) return "Informe nomes válidos de até 60 caracteres para os tipos de imóvel.";
  const validateCatalog = (values: string[], name: string) => {
    if (values.length > 60) return `${name} aceita no máximo 60 itens.`;
    if (values.some((value) => !value || value.length > 60)) return `${name} deve ter itens de 1 a 60 caracteres.`;
    const keys = values.map((value) => value.toLocaleLowerCase("pt-BR"));
    if (new Set(keys).size !== keys.length) return `${name} não pode conter itens duplicados.`;
    return null;
  };
  return validateCatalog(normalized.amenities, "Comodidades") ?? validateCatalog(normalized.condominiumAmenities, "Comodidades do condomínio");
}

function normalizeDocumentSettingsDraft(draft: OrganizationDocumentSettingsUpdate): OrganizationDocumentSettingsUpdate {
  return { ...draft, authorizationPrefix: draft.authorizationPrefix.trim().toUpperCase(), authorizationTitle: draft.authorizationTitle.trim(), footerText: draft.footerText?.trim() || null };
}

function documentSettingsDraftError(draft: OrganizationDocumentSettingsUpdate): string | null {
  const normalized = normalizeDocumentSettingsDraft(draft);
  if (!/^[A-Z0-9][A-Z0-9-]{1,11}$/u.test(normalized.authorizationPrefix)) return "Use de 2 a 12 letras, números ou hífens no prefixo documental.";
  if (!normalized.authorizationTitle || normalized.authorizationTitle.length > 160) return "Informe um título de documento de até 160 caracteres.";
  if (normalized.footerText && normalized.footerText.length > 500) return "O rodapé deve possuir no máximo 500 caracteres.";
  return null;
}

function financialSettingsToDraft(settings: OrganizationFinancialSettings): OrganizationFinancialSettingsUpdate {
  return { ...settings, accounts: settings.accounts.map((item) => ({ ...item })), categories: settings.categories.map((item) => ({ ...item })), costCenters: settings.costCenters.map((item) => ({ ...item })) };
}

function normalizeFinancialSettingsDraft(draft: OrganizationFinancialSettingsUpdate): OrganizationFinancialSettingsUpdate {
  const commission = draft.defaultCommissionPercent.trim().replace(",", ".");
  return { ...draft, defaultCommissionPercent: commission, accounts: draft.accounts.map((item) => ({ ...item, name: item.name.trim().replace(/\s+/gu, " ") })), categories: draft.categories.map((item) => ({ ...item, name: item.name.trim().replace(/\s+/gu, " ") })), costCenters: draft.costCenters.map((item) => ({ ...item, name: item.name.trim().replace(/\s+/gu, " ") })) };
}

function financialSettingsDraftError(draft: OrganizationFinancialSettingsUpdate): string | null {
  const normalized = normalizeFinancialSettingsDraft(draft);
  if (!/^\d{1,3}(?:\.\d{1,4})?$/u.test(normalized.defaultCommissionPercent) || Number(normalized.defaultCommissionPercent) < 0 || Number(normalized.defaultCommissionPercent) > 100) return "Informe uma comissão padrão entre 0 e 100%.";
  const validate = (items: Array<{ name: string }>, label: string) => { const names = items.map((item) => item.name); if (names.some((name) => !name || name.length > 160)) return `${label}: informe nomes de até 160 caracteres.`; const keys = names.map((name) => name.toLocaleLowerCase("pt-BR")); return new Set(keys).size === keys.length ? null : `${label}: não use nomes duplicados.`; };
  const catalogError = validate(normalized.accounts, "Contas") ?? validate(normalized.categories, "Categorias") ?? validate(normalized.costCenters, "Centros de custo");
  if (catalogError) return catalogError;
  if (normalized.requireAccount && !normalized.accounts.some((item) => item.active)) return "Mantenha ao menos uma conta ativa quando conta for obrigatória.";
  if (normalized.requireCategory && !normalized.categories.some((item) => item.active)) return "Mantenha ao menos uma categoria ativa quando categoria for obrigatória.";
  if (normalized.requireCostCenter && !normalized.costCenters.some((item) => item.active)) return "Mantenha ao menos um centro de custo ativo quando centro de custo for obrigatório.";
  return null;
}

function statusLabel(status: OrganizationSettings["status"]): string {
  if (status === "active") return "Ativa";
  if (status === "suspended") return "Suspensa";
  return "Arquivada";
}

function membershipStatusLabel(status: OrganizationMembershipStatus): string {
  if (status === "active") return "Ativo";
  if (status === "invited") return "Convidado";
  if (status === "suspended") return "Suspenso";
  return "Arquivado";
}

function initials(name: string): string {
  return name.trim().split(/\s+/u).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

function sortTeams(teams: OrganizationTeam[]): OrganizationTeam[] {
  return [...teams].sort((left, right) => {
    if (left.status !== right.status) return left.status === "active" ? -1 : 1;
    return left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" });
  });
}

function memberEligibleForTeam(member: OrganizationMember): boolean {
  return member.userStatus === "active" && (member.membershipStatus === "active" || member.membershipStatus === "invited");
}

function roleDraft(role: OrganizationRole): RoleDraft {
  return {
    name: role.name,
    description: role.description ?? "",
    grants: Object.fromEntries(role.grants.map((grant) => [grant.permissionCode, grant.scope])),
  };
}

function roleGrantsFromDraft(draft: RoleGrantDraft): OrganizationRoleGrantInput[] {
  return Object.entries(draft)
    .filter((entry): entry is [string, OrganizationAccessScope] => entry[1] !== "")
    .map(([permissionCode, scope]) => ({ permissionCode, scope }))
    .sort((left, right) => left.permissionCode.localeCompare(right.permissionCode));
}

function roleIsDirty(role: OrganizationRole, draft: RoleDraft): boolean {
  if (draft.name.trim() !== role.name) return true;
  if ((draft.description.trim() || null) !== role.description) return true;
  const current = role.grants
    .map(({ permissionCode, scope }) => ({ permissionCode, scope }))
    .sort((left, right) => left.permissionCode.localeCompare(right.permissionCode));
  const next = roleGrantsFromDraft(draft.grants);
  return JSON.stringify(current) !== JSON.stringify(next);
}

function permissionGroup(code: string): string {
  if (code.startsWith("organization.")) return "Organização";
  if (code.startsWith("users.")) return "Usuários";
  if (code.startsWith("teams.")) return "Equipes";
  if (code.startsWith("roles.") || code.startsWith("permissions.")) return "Perfis e permissões";
  if (code.startsWith("audit_logs.")) return "Auditoria";
  if (code.startsWith("crm.")) return "CRM e Vendas";
  if (code.startsWith("productivity.")) return "Produtividade";
  if (code.startsWith("portfolio.")) return "Portfólio";
  if (code.startsWith("corporate.")) return "Gestão Corporativa";
  return "Outras permissões";
}

function scopeLabel(scope: OrganizationAccessScope): string {
  if (scope === "own") return "Próprio";
  if (scope === "team") return "Equipe";
  return "Organização";
}

const permissionGroupOrder = [
  "Organização",
  "Usuários",
  "Equipes",
  "Perfis e permissões",
  "CRM e Vendas",
  "Portfólio",
  "Produtividade",
  "Gestão Corporativa",
  "Auditoria",
  "Outras permissões",
];


function integrationStatusLabel(status: OrganizationIntegration["status"]): string { if (status === "connected") return "Conectada"; if (status === "error") return "Erro"; if (status === "revoked") return "Revogada"; return "Pendente"; }
function dataTransferResourceLabel(resource: OrganizationDataTransferResource): string { return resource === "contacts" ? "Contatos" : resource === "properties" ? "Imóveis" : "Configurações"; }
function dataTransferStatusLabel(status: OrganizationDataTransfer["status"]): string { if (status === "pending_upload") return "Aguardando arquivo"; if (status === "validated") return "Validada"; if (status === "completed") return "Concluída"; if (status === "completed_with_errors") return "Concluída com erros"; return "Falhou"; }
function downloadTransferTemplate(resource: "contacts" | "properties"): void { const content = resource === "contacts" ? "tipo;nome;documento;email;telefone;whatsapp;cidade;uf;origem;perfis\npessoa;SMOKE 12 IMPORT;;smoke12@example.com;;;São Paulo;SP;importacao;interessado\n" : "titulo;tipo;finalidade;referencia_externa;cidade;uf;valor_venda;area_total;unidade_area;quartos;suites;banheiros;vagas;comodidades;descricao\nSMOKE 12 IMOVEL;Apartamento;Venda;SMOKE12;São Paulo;SP;850000.50;80;m2;2;1;2;1;Piscina|Sacada;Imóvel importado pelo smoke do bloco 12\n"; const blob=new Blob(["\uFEFF",content],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const link=document.createElement("a");link.href=url;link.download=`modelo-importacao-${resource}.csv`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url); }
function openDataTransferDownload(url:string):void { const link=document.createElement("a");link.href=url;link.rel="noopener noreferrer";document.body.appendChild(link);link.click();link.remove(); }
function IntegrationSettingsRow({ item, canUpdate, busy, onSave, onTest, onRevoke }: { item: OrganizationIntegration; canUpdate: boolean; busy: boolean; onSave: (item: OrganizationIntegration, name: string, baseUrl: string, authType: OrganizationIntegrationAuthType, secret: string)=>Promise<void>; onTest:(item:OrganizationIntegration)=>Promise<void>; onRevoke:(item:OrganizationIntegration)=>Promise<void>; }) {
  const [name,setName]=useState(item.name); const [baseUrl,setBaseUrl]=useState(item.baseUrl); const [authType,setAuthType]=useState<OrganizationIntegrationAuthType>(item.authType); const [secret,setSecret]=useState("");
  useEffect(()=>{ setName(item.name); setBaseUrl(item.baseUrl); setAuthType(item.authType); setSecret(""); },[item.id,item.name,item.baseUrl,item.authType,item.updatedAt]);
  const dirty=name.trim()!==item.name || baseUrl.trim()!==item.baseUrl || authType!==item.authType || Boolean(secret.trim());
  return <article className={`app-integration-row is-${item.status}`}><div className="app-integration-row__top"><div><strong>{item.name}</strong><small>{item.kind === "webhook" ? "Webhook / API HTTP" : item.kind} · <span>{integrationStatusLabel(item.status)}</span></small></div><div className="app-integration-row__status"><span>{integrationStatusLabel(item.status)}</span>{item.lastCheckedAt && <small>Último teste {new Date(item.lastCheckedAt).toLocaleString("pt-BR")}</small>}</div></div><div className="app-settings-form"><label><span>Nome</span><input value={name} disabled={!canUpdate||busy} onChange={(event)=>setName(event.target.value)}/></label><label><span>URL HTTPS</span><input value={baseUrl} disabled={!canUpdate||busy} onChange={(event)=>setBaseUrl(event.target.value)}/></label><label><span>Autenticação</span><select value={authType} disabled={!canUpdate||busy} onChange={(event)=>setAuthType(event.target.value as OrganizationIntegrationAuthType)}><option value="bearer">Bearer token</option><option value="none">Sem autenticação</option></select></label><label><span>{item.secretConfigured ? `Nova credencial (atual termina em ${item.secretLast4 ?? "••••"})` : "Credencial"}</span><input type="password" autoComplete="new-password" value={secret} disabled={!canUpdate||busy||authType==="none"} onChange={(event)=>setSecret(event.target.value)} placeholder={item.secretConfigured ? "Deixe vazio para manter a atual" : "Informe uma nova credencial"}/></label></div>{item.lastErrorCode && <div className="app-integration-error-code">Falha sanitizada: {item.lastErrorCode}</div>}<div className="app-settings-inline-actions">{canUpdate && <button className="app-secondary-button" type="button" disabled={busy||!dirty} onClick={()=>void onSave(item,name,baseUrl,authType,secret)}>Salvar</button>}<button className="app-secondary-button" type="button" disabled={!canUpdate||busy||item.status==="revoked"} onClick={()=>void onTest(item)}>Testar conexão</button>{canUpdate && <button className="app-secondary-button is-danger" type="button" disabled={busy||item.status==="revoked"} onClick={()=>void onRevoke(item)}>Revogar</button>}</div></article>;
}

export function SettingsPage({
  organizationId,
  currentMembershipId,
  currentUser,
  canUpdate,
  canReadUsers,
  canUpdateUsers,
  canInviteUsers,
  canReadTeams,
  canManageTeams,
  canReadRoles,
  canManageRoles,
  canReadPermissions,
  canReadAuditLogs,
  canReadFunnels,
  canManageFunnels,
  canReadLeadDistribution,
  canManageLeadDistribution,
  canReadContacts,
  canCreateContact,
  canReadProperties,
  canCreateProperty,
  onUpdated,
}: Props) {
  const initialSection = new URLSearchParams(globalThis.location.search).get("section");
  const [section, setSection] = useState<SettingsSection>(initialSection === "transfers" || initialSection === "operational" || initialSection === "appearance" ? initialSection : "company");
  const [panelTheme, setPanelTheme] = useState<PanelTheme>(() => readPanelTheme(organizationId, currentMembershipId));
  const [panelThemeSaved, setPanelThemeSaved] = useState(false);
  useEffect(() => { const loaded = readPanelTheme(organizationId, currentMembershipId); setPanelTheme(loaded); applyPanelTheme(loaded); }, [organizationId, currentMembershipId]);
  function changePanelColor(field: keyof PanelTheme, value: string) { const next = { ...panelTheme, [field]: value.toUpperCase() }; setPanelTheme(next); setPanelThemeSaved(false); applyPanelTheme(next); }
  function persistPanelTheme() { savePanelTheme(organizationId, currentMembershipId, panelTheme); setPanelThemeSaved(true); }
  function restorePanelTheme() { resetPanelTheme(organizationId, currentMembershipId); setPanelTheme(defaultPanelTheme); setPanelThemeSaved(true); }
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [draft, setDraft] = useState<OrganizationSettingsUpdate | null>(null);
  const [identity, setIdentity] = useState<OrganizationIdentitySettings | null>(null);
  const [identityDraftState, setIdentityDraftState] = useState<OrganizationIdentitySettingsUpdate | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityLogoFile, setIdentityLogoFile] = useState<File | null>(null);
  const [identityLogoPreviewUrl, setIdentityLogoPreviewUrl] = useState<string | null>(null);
  const [identityRemoveLogo, setIdentityRemoveLogo] = useState(false);
  const [propertySettings, setPropertySettings] = useState<OrganizationPropertySettings | null>(null);
  const [propertySettingsDraftState, setPropertySettingsDraftState] = useState<OrganizationPropertySettingsUpdate | null>(null);
  const [propertySettingsLoading, setPropertySettingsLoading] = useState(false);
  const [propertySettingsSaving, setPropertySettingsSaving] = useState(false);
  const [documentSettings, setDocumentSettings] = useState<OrganizationDocumentSettings | null>(null);
  const [documentSettingsDraftState, setDocumentSettingsDraftState] = useState<OrganizationDocumentSettingsUpdate | null>(null);
  const [documentSettingsLoading, setDocumentSettingsLoading] = useState(false);
  const [documentSettingsSaving, setDocumentSettingsSaving] = useState(false);
  const [financialSettings, setFinancialSettings] = useState<OrganizationFinancialSettings | null>(null);
  const [financialSettingsDraftState, setFinancialSettingsDraftState] = useState<OrganizationFinancialSettingsUpdate | null>(null);
  const [financialSettingsLoading, setFinancialSettingsLoading] = useState(false);
  const [financialSettingsSaving, setFinancialSettingsSaving] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<OrganizationNotificationSettings | null>(null);
  const [notificationSettingsDraft, setNotificationSettingsDraft] = useState<OrganizationNotificationSettingsUpdate | null>(null);
  const [notificationSettingsLoading, setNotificationSettingsLoading] = useState(false);
  const [notificationSettingsSaving, setNotificationSettingsSaving] = useState(false);
  const [integrations, setIntegrations] = useState<OrganizationIntegration[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationBusyId, setIntegrationBusyId] = useState<string | null>(null);
  const [integrationName, setIntegrationName] = useState("");
  const [integrationBaseUrl, setIntegrationBaseUrl] = useState("");
  const [integrationAuthType, setIntegrationAuthType] = useState<OrganizationIntegrationAuthType>("bearer");
  const [integrationSecret, setIntegrationSecret] = useState("");
  const [securitySettings, setSecuritySettings] = useState<OrganizationSecuritySettings | null>(null);
  const [securityDraft, setSecurityDraft] = useState<OrganizationSecuritySettings | null>(null);
  const [securityAudit, setSecurityAudit] = useState<OrganizationSecurityAuditView | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securitySaving, setSecuritySaving] = useState(false);
  const [dataTransfers, setDataTransfers] = useState<OrganizationDataTransfer[]>([]);
  const [dataTransfersLoading, setDataTransfersLoading] = useState(false);
  const [dataTransferBusy, setDataTransferBusy] = useState(false);
  const [dataImportResource, setDataImportResource] = useState<OrganizationDataTransferResource>("contacts");
  const [dataImportFile, setDataImportFile] = useState<File | null>(null);
  const [dataImportPreview, setDataImportPreview] = useState<OrganizationDataTransfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [teams, setTeams] = useState<OrganizationTeam[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [profilePhotoSaving, setProfilePhotoSaving] = useState(false);
  const [memberUpdatingId, setMemberUpdatingId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitingMember, setInvitingMember] = useState(false);
  const [memberAccessBusyId, setMemberAccessBusyId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamBusyKey, setTeamBusyKey] = useState<string | null>(null);
  const [teamDraftNames, setTeamDraftNames] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<OrganizationRole[]>([]);
  const [permissions, setPermissions] = useState<OrganizationPermission[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, RoleDraft>>({});
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);
  const [roleBusyKey, setRoleBusyKey] = useState<string | null>(null);
  const [operationalFunnels, setOperationalFunnels] = useState<OrganizationOperationalFunnel[]>([]);
  const [collapsedOperationalFunnels, setCollapsedOperationalFunnels] = useState<Set<string>>(() => new Set());
  const [operationalDrafts, setOperationalDrafts] = useState<Record<string, OperationalFunnelDraft>>({});
  const [operationalLoading, setOperationalLoading] = useState(false);
  const [operationalBusyId, setOperationalBusyId] = useState<string | null>(null);
  const [lossReasonBusyKey, setLossReasonBusyKey] = useState<string | null>(null);
  const [newLossReasonNames, setNewLossReasonNames] = useState<Record<string, string>>({});
  const [lossReasonDraftNames, setLossReasonDraftNames] = useState<Record<string, string>>({});
  const [stageBusyKey, setStageBusyKey] = useState<string | null>(null);
  const [newStageDrafts, setNewStageDrafts] = useState<Record<string, { name: string; probability: string; color: string }>>({});
  const [leadDistribution, setLeadDistribution] = useState<OrganizationLeadDistributionSettings | null>(null);
  const [leadDistributionDraftState, setLeadDistributionDraftState] = useState<OrganizationLeadDistributionSettingsUpdate | null>(null);
  const [leadDistributionBusy, setLeadDistributionBusy] = useState(false);
  const [collapsedLeadPolicies, setCollapsedLeadPolicies] = useState<Set<"buyer" | "capture">>(() => new Set());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSuccess(null);

    void getOrganizationSettings(organizationId)
      .then((result) => {
        if (!active) return;
        setSettings(result);
        setDraft(toDraft(result));
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as configurações da organização.");
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [organizationId]);

  useEffect(() => {
    if (section !== "identity") return;
    let active = true;
    setIdentityLoading(true);
    setError(null);
    setSuccess(null);
    void getOrganizationIdentity(organizationId)
      .then((result) => {
        if (!active) return;
        setIdentity(result);
        setIdentityDraftState(identityToDraft(result));
        setIdentityLogoFile(null);
        setIdentityRemoveLogo(false);
        setIdentityLogoPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar a identidade da organização.");
      })
      .finally(() => { if (active) setIdentityLoading(false); });
    return () => { active = false; };
  }, [organizationId, section]);

  useEffect(() => () => { if (identityLogoPreviewUrl) URL.revokeObjectURL(identityLogoPreviewUrl); }, [identityLogoPreviewUrl]);

  useEffect(() => {
    if (section !== "properties") return;
    let active = true;
    setPropertySettingsLoading(true);
    setError(null);
    setSuccess(null);
    void getOrganizationPropertySettings(organizationId)
      .then((result) => {
        if (!active) return;
        setPropertySettings(result);
        setPropertySettingsDraftState(result);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as configurações de imóveis.");
      })
      .finally(() => { if (active) setPropertySettingsLoading(false); });
    return () => { active = false; };
  }, [organizationId, section]);

  useEffect(() => {
    if (section !== "documents") return;
    let active = true;
    setDocumentSettingsLoading(true);
    setError(null);
    setSuccess(null);
    void getOrganizationDocumentSettings(organizationId)
      .then((result) => {
        if (!active) return;
        setDocumentSettings(result);
        setDocumentSettingsDraftState(result);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as configurações de documentos.");
      })
      .finally(() => { if (active) setDocumentSettingsLoading(false); });
    return () => { active = false; };
  }, [organizationId, section]);

  useEffect(() => {
    if (section !== "financial") return;
    let active = true;
    setFinancialSettingsLoading(true);
    setError(null);
    setSuccess(null);
    void getOrganizationFinancialSettings(organizationId)
      .then((result) => { if (!active) return; setFinancialSettings(result); setFinancialSettingsDraftState(financialSettingsToDraft(result)); })
      .catch((loadError) => { if (!active) return; setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as configurações financeiras."); })
      .finally(() => { if (active) setFinancialSettingsLoading(false); });
    return () => { active = false; };
  }, [organizationId, section]);

  useEffect(() => {
    if (section !== "notifications") return;
    let active = true;
    setNotificationSettingsLoading(true); setError(null); setSuccess(null);
    void getOrganizationNotificationSettings(organizationId)
      .then((result) => { if (!active) return; setNotificationSettings(result); setNotificationSettingsDraft(structuredClone(result)); })
      .catch((loadError) => { if (!active) return; setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as configurações de notificações."); })
      .finally(() => { if (active) setNotificationSettingsLoading(false); });
    return () => { active = false; };
  }, [organizationId, section]);

  useEffect(() => {
    if (section !== "security") return;
    let active = true;
    setSecurityLoading(true);
    setError(null);
    setSuccess(null);

    const settingsRequest = getOrganizationSecuritySettings(organizationId).then((result) => {
      if (!active) return;
      setSecuritySettings(result);
      setSecurityDraft(structuredClone(result));
    });
    const auditRequest = canReadAuditLogs
      ? listOrganizationAuditLogs(organizationId, 50).then((result) => { if (active) setSecurityAudit(result); })
      : Promise.resolve().then(() => { if (active) setSecurityAudit(null); });

    void Promise.all([settingsRequest, auditRequest])
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as configurações de privacidade e segurança.");
      })
      .finally(() => { if (active) setSecurityLoading(false); });
    return () => { active = false; };
  }, [organizationId, section, canReadAuditLogs]);

  useEffect(() => {
    if (section !== "transfers") return;
    let active = true; setDataTransfersLoading(true); setError(null); setSuccess(null);
    void listOrganizationDataTransfers(organizationId, 20).then((items) => { if (active) setDataTransfers(items); }).catch((loadError) => { if (active) setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar o histórico de importações e exportações."); }).finally(() => { if (active) setDataTransfersLoading(false); });
    return () => { active = false; };
  }, [organizationId, section]);

  useEffect(() => {
    if (section !== "people" || (!canReadUsers && !canReadTeams && !canReadRoles && !canReadPermissions)) return;
    let active = true;
    setPeopleLoading(true);
    setError(null);
    setSuccess(null);

    const membersRequest = canReadUsers ? listOrganizationMembers(organizationId) : Promise.resolve([] as OrganizationMember[]);
    const teamsRequest = canReadTeams ? listOrganizationTeams(organizationId) : Promise.resolve([] as OrganizationTeam[]);
    const rolesRequest = canReadRoles ? listOrganizationRoles(organizationId) : Promise.resolve([] as OrganizationRole[]);
    const permissionsRequest = canReadPermissions ? listOrganizationPermissions(organizationId) : Promise.resolve([] as OrganizationPermission[]);

    void Promise.all([membersRequest, teamsRequest, rolesRequest, permissionsRequest])
      .then(([loadedMembers, loadedTeams, loadedRoles, loadedPermissions]) => {
        if (!active) return;
        setMembers(loadedMembers);
        setTeams(sortTeams(loadedTeams));
        setTeamDraftNames(Object.fromEntries(loadedTeams.map((team) => [team.id, team.name])));
        setRoles(loadedRoles);
        setPermissions(loadedPermissions);
        setRoleDrafts(Object.fromEntries(loadedRoles.map((role) => [role.id, roleDraft(role)])));
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar usuários, equipes e perfis da organização.");
      })
      .finally(() => { if (active) setPeopleLoading(false); });

    return () => { active = false; };
  }, [canReadPermissions, canReadRoles, canReadTeams, canReadUsers, organizationId, section]);

  useEffect(() => {
    if (section !== "operational" || (!canReadFunnels && !canReadLeadDistribution)) return;
    let active = true;
    setOperationalLoading(true);
    setError(null);
    setSuccess(null);
    const funnelsRequest = canReadFunnels
      ? listOrganizationOperationalFunnels(organizationId)
      : Promise.resolve([] as OrganizationOperationalFunnel[]);
    const distributionRequest = canReadLeadDistribution
      ? getOrganizationLeadDistribution(organizationId)
      : Promise.resolve(null);
    void Promise.allSettled([funnelsRequest, distributionRequest])
      .then(([funnelsResult, distributionResult]) => {
        if (!active) return;

        if (funnelsResult.status === "fulfilled") {
          const loaded = funnelsResult.value;
          setOperationalFunnels(loaded);
          setOperationalDrafts(Object.fromEntries(loaded.map((funnel) => [funnel.id, operationalFunnelDraft(funnel)])));
          setLossReasonDraftNames(Object.fromEntries(loaded.flatMap((funnel) => funnel.lossReasons.map((reason) => [reason.id, reason.name]))));
        } else {
          setOperationalFunnels([]);
          setOperationalDrafts({});
          setLossReasonDraftNames({});
        }

        if (distributionResult.status === "fulfilled") {
          const loadedDistribution = distributionResult.value;
          setLeadDistribution(loadedDistribution);
          setLeadDistributionDraftState(loadedDistribution ? leadDistributionDraft(loadedDistribution) : null);
        } else {
          setLeadDistribution(null);
          setLeadDistributionDraftState(null);
        }

        const failed = funnelsResult.status === "rejected"
          ? funnelsResult.reason
          : distributionResult.status === "rejected"
            ? distributionResult.reason
            : null;
        if (failed) {
          setError(failed instanceof AppApiError ? failed.message : "Não foi possível carregar todas as preferências operacionais.");
        }
      })
      .finally(() => { if (active) setOperationalLoading(false); });
    return () => { active = false; };
  }, [canReadFunnels, canReadLeadDistribution, organizationId, section]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return JSON.stringify(normalizeCompanyDraft(draft)) !== JSON.stringify(normalizeCompanyDraft(toDraft(settings)));
  }, [draft, settings]);

  const identityDirty = useMemo(() => {
    if (!identity || !identityDraftState) return false;
    return identityLogoFile !== null || identityRemoveLogo || JSON.stringify(normalizeIdentityDraft(identityDraftState)) !== JSON.stringify(normalizeIdentityDraft(identityToDraft(identity)));
  }, [identity, identityDraftState, identityLogoFile, identityRemoveLogo]);

  const propertySettingsDirty = useMemo(() => {
    if (!propertySettings || !propertySettingsDraftState) return false;
    return JSON.stringify(normalizedPropertySettingsDraft(propertySettingsDraftState)) !== JSON.stringify(normalizedPropertySettingsDraft(propertySettings));
  }, [propertySettings, propertySettingsDraftState]);

  const documentSettingsDirty = useMemo(() => {
    if (!documentSettings || !documentSettingsDraftState) return false;
    return JSON.stringify(normalizeDocumentSettingsDraft(documentSettingsDraftState)) !== JSON.stringify(normalizeDocumentSettingsDraft(documentSettings));
  }, [documentSettings, documentSettingsDraftState]);

  const financialSettingsDirty = useMemo(() => {
    if (!financialSettings || !financialSettingsDraftState) return false;
    return JSON.stringify(normalizeFinancialSettingsDraft(financialSettingsDraftState)) !== JSON.stringify(normalizeFinancialSettingsDraft(financialSettingsToDraft(financialSettings)));
  }, [financialSettings, financialSettingsDraftState]);


  useEffect(() => {
    if (section !== "integrations") return;
    let active = true;
    setIntegrationsLoading(true); setError(null);
    void listOrganizationIntegrations(organizationId).then((items) => { if (active) setIntegrations(items); }).catch((loadError) => { if (active) setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as integrações."); }).finally(() => { if (active) setIntegrationsLoading(false); });
    return () => { active = false; };
  }, [organizationId, section]);

  const notificationSettingsDirty = useMemo(() => {
    if (!notificationSettings || !notificationSettingsDraft) return false;
    return JSON.stringify(notificationSettings) !== JSON.stringify(notificationSettingsDraft);
  }, [notificationSettings, notificationSettingsDraft]);

  const securitySettingsDirty = useMemo(() => {
    if (!securitySettings || !securityDraft) return false;
    return JSON.stringify(securitySettings) !== JSON.stringify(securityDraft);
  }, [securitySettings, securityDraft]);


  const permissionGroups = useMemo(() => {
    const groups = new Map<string, OrganizationPermission[]>();
    for (const permission of permissions) {
      const group = permissionGroup(permission.code);
      const list = groups.get(group) ?? [];
      list.push(permission);
      groups.set(group, list);
    }
    return [...groups.entries()].sort((left, right) => {
      const leftIndex = permissionGroupOrder.indexOf(left[0]);
      const rightIndex = permissionGroupOrder.indexOf(right[0]);
      return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
    });
  }, [permissions]);

  const timezoneKnown = Boolean(draft && timezoneOptions.some(([value]) => value === draft.timezone));

  function setField<K extends keyof OrganizationSettingsUpdate>(field: K, value: OrganizationSettingsUpdate[K]) {
    setDraft((current) => current ? { ...current, [field]: value } : current);
    setSuccess(null);
  }

  function setIdentityField<K extends keyof OrganizationIdentitySettingsUpdate>(field: K, value: OrganizationIdentitySettingsUpdate[K]) {
    setIdentityDraftState((current) => current ? { ...current, [field]: value } : current);
    setSuccess(null);
  }

  function setPropertySettingsField<K extends keyof OrganizationPropertySettingsUpdate>(field: K, value: OrganizationPropertySettingsUpdate[K]) {
    setPropertySettingsDraftState((current) => current ? { ...current, [field]: value } : current);
    setSuccess(null);
  }

  function setDocumentSettingsField<K extends keyof OrganizationDocumentSettingsUpdate>(field: K, value: OrganizationDocumentSettingsUpdate[K]) {
    setDocumentSettingsDraftState((current) => current ? { ...current, [field]: value } : current);
    setSuccess(null);
  }

  function setFinancialSettingsField<K extends keyof OrganizationFinancialSettingsUpdate>(field: K, value: OrganizationFinancialSettingsUpdate[K]) {
    setFinancialSettingsDraftState((current) => current ? { ...current, [field]: value } : current);
    setSuccess(null);
  }

  function updateFinancialAccount(index: number, update: Partial<OrganizationFinancialSettingsUpdate["accounts"][number]>) { setFinancialSettingsDraftState((current) => current ? { ...current, accounts: current.accounts.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item) } : current); setSuccess(null); }
  function updateFinancialCategory(index: number, update: Partial<OrganizationFinancialSettingsUpdate["categories"][number]>) { setFinancialSettingsDraftState((current) => current ? { ...current, categories: current.categories.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item) } : current); setSuccess(null); }
  function updateFinancialCostCenter(index: number, update: Partial<OrganizationFinancialSettingsUpdate["costCenters"][number]>) { setFinancialSettingsDraftState((current) => current ? { ...current, costCenters: current.costCenters.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item) } : current); setSuccess(null); }

  function setPropertyTypeLabel(index: number, label: string) {
    setPropertySettingsDraftState((current) => current ? {
      ...current,
      propertyTypes: current.propertyTypes.map((item, itemIndex) => itemIndex === index ? { ...item, label } : item),
    } : current);
    setSuccess(null);
  }

  function setPropertyTypeEnabled(index: number, enabled: boolean) {
    setPropertySettingsDraftState((current) => current ? {
      ...current,
      propertyTypes: current.propertyTypes.map((item, itemIndex) => itemIndex === index ? { ...item, enabled } : item),
    } : current);
    setSuccess(null);
  }


  function selectIdentityLogo(file: File | null) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Selecione um logo em PNG, JPG ou WEBP.");
      return;
    }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setError("O logo deve possuir no máximo 5 MB.");
      return;
    }
    setIdentityLogoPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(file); });
    setIdentityLogoFile(file);
    setIdentityRemoveLogo(false);
    setError(null);
    setSuccess(null);
  }

  function markIdentityLogoForRemoval() {
    setIdentityLogoFile(null);
    setIdentityLogoPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
    setIdentityRemoveLogo(true);
    setError(null);
    setSuccess(null);
  }

  function replaceTeam(updated: OrganizationTeam) {
    setTeams((current) => sortTeams(current.some((item) => item.id === updated.id)
      ? current.map((item) => item.id === updated.id ? updated : item)
      : [...current, updated]));
    setTeamDraftNames((current) => ({ ...current, [updated.id]: updated.name }));
  }

  async function save() {
    if (!draft || saving || !canUpdate) return;
    const validationError = companyDraftError(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    const normalized = normalizeCompanyDraft(draft);

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateOrganizationSettings(organizationId, normalized);
      setSettings(updated);
      setDraft(toDraft(updated));
      setSuccess("Configurações da organização salvas.");
      await onUpdated();
    } catch (saveError) {
      setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível salvar as configurações da organização.");
    } finally {
      setSaving(false);
    }
  }

  async function saveIdentity() {
    if (!identityDraftState || identitySaving || !canUpdate) return;
    const validationError = identityDraftError(identityDraftState);
    if (validationError) { setError(validationError); return; }
    const normalized = normalizeIdentityDraft(identityDraftState);
    setIdentitySaving(true);
    setError(null);
    setSuccess(null);
    try {
      let updated = await updateOrganizationIdentity(organizationId, normalized);
      setIdentity(updated);
      setIdentityDraftState(identityToDraft(updated));
      if (identityLogoFile) updated = await uploadOrganizationIdentityLogo(organizationId, identityLogoFile);
      else if (identityRemoveLogo) updated = await removeOrganizationIdentityLogo(organizationId);
      setIdentity(updated);
      setIdentityDraftState(identityToDraft(updated));
      setIdentityLogoFile(null);
      setIdentityRemoveLogo(false);
      setIdentityLogoPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
      setSuccess("Identidade e canais públicos salvos.");
      await onUpdated();
    } catch (saveError) {
      setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível salvar a identidade da organização.");
    } finally {
      setIdentitySaving(false);
    }
  }

  async function savePropertySettings() {
    if (!propertySettingsDraftState || propertySettingsSaving || !canUpdate) return;
    const validationError = propertySettingsDraftError(propertySettingsDraftState);
    if (validationError) { setError(validationError); return; }
    const normalized = normalizedPropertySettingsDraft(propertySettingsDraftState);
    setPropertySettingsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateOrganizationPropertySettings(organizationId, normalized);
      setPropertySettings(updated);
      setPropertySettingsDraftState(updated);
      setSuccess("Configurações de imóveis salvas.");
    } catch (saveError) {
      setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível salvar as configurações de imóveis.");
    } finally {
      setPropertySettingsSaving(false);
    }
  }

  async function saveDocumentSettings() {
    if (!documentSettingsDraftState || documentSettingsSaving || !canUpdate) return;
    const validationError = documentSettingsDraftError(documentSettingsDraftState);
    if (validationError) { setError(validationError); return; }
    const normalized = normalizeDocumentSettingsDraft(documentSettingsDraftState);
    setDocumentSettingsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateOrganizationDocumentSettings(organizationId, normalized);
      setDocumentSettings(updated);
      setDocumentSettingsDraftState(updated);
      setSuccess("Configurações de documentos salvas.");
    } catch (saveError) {
      setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível salvar as configurações de documentos.");
    } finally {
      setDocumentSettingsSaving(false);
    }
  }

  async function saveFinancialSettings() {
    if (!financialSettingsDraftState || financialSettingsSaving || !canUpdate) return;
    const validationError = financialSettingsDraftError(financialSettingsDraftState);
    if (validationError) { setError(validationError); return; }
    const normalized = normalizeFinancialSettingsDraft(financialSettingsDraftState);
    setFinancialSettingsSaving(true); setError(null); setSuccess(null);
    try {
      const updated = await updateOrganizationFinancialSettings(organizationId, normalized);
      setFinancialSettings(updated); setFinancialSettingsDraftState(financialSettingsToDraft(updated)); setSuccess("Configurações financeiras salvas.");
    } catch (saveError) { setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível salvar as configurações financeiras."); }
    finally { setFinancialSettingsSaving(false); }
  }

  function setNotificationChannel(event: "taskAssigned" | "calendarEventAssigned", channel: "inApp" | "email", value: boolean) {
    setNotificationSettingsDraft((current) => current ? { ...current, [event]: { ...current[event], [channel]: value } } : current);
  }

  async function saveNotificationSettings() {
    if (!notificationSettingsDraft || notificationSettingsSaving || !canUpdate) return;
    setNotificationSettingsSaving(true); setError(null); setSuccess(null);
    try {
      const updated = await updateOrganizationNotificationSettings(organizationId, notificationSettingsDraft);
      setNotificationSettings(updated); setNotificationSettingsDraft(structuredClone(updated)); setSuccess("Configurações de notificações salvas.");
    } catch (saveError) { setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível salvar as configurações de notificações."); }
    finally { setNotificationSettingsSaving(false); }
  }


  async function saveSecuritySettings() {
    if (!securityDraft || securitySaving || !canUpdate) return;
    setSecuritySaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateOrganizationSecuritySettings(organizationId, securityDraft);
      setSecuritySettings(updated);
      setSecurityDraft(structuredClone(updated));
      if (canReadAuditLogs) setSecurityAudit(await listOrganizationAuditLogs(organizationId, 50));
      setSuccess("Políticas de privacidade e segurança salvas.");
    } catch (saveError) {
      setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível salvar as políticas de privacidade e segurança.");
    } finally {
      setSecuritySaving(false);
    }
  }

  async function refreshSecurityAudit() {
    if (!canReadAuditLogs || securityLoading) return;
    setError(null);
    try { setSecurityAudit(await listOrganizationAuditLogs(organizationId, 50)); }
    catch (loadError) { setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível atualizar a trilha de auditoria."); }
  }

  async function refreshDataTransfers() { if (dataTransfersLoading) return; setDataTransfersLoading(true); setError(null); try { setDataTransfers(await listOrganizationDataTransfers(organizationId, 20)); } catch (loadError) { setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível atualizar o histórico de transferências."); } finally { setDataTransfersLoading(false); } }
  async function previewDataImport() { if (dataTransferBusy || !dataImportFile) return; const canImport=dataImportResource==="contacts"?canCreateContact:dataImportResource==="properties"?canCreateProperty:canUpdate; if(!canImport){setError("Seu perfil não possui permissão para importar este recurso.");return;} setDataTransferBusy(true);setError(null);setSuccess(null);setDataImportPreview(null);try{const preview=await createAndPreviewOrganizationDataImport(organizationId,dataImportResource,dataImportFile);setDataImportPreview(preview);setDataTransfers(await listOrganizationDataTransfers(organizationId,20));setSuccess(preview.errorRows===0?`Prévia concluída: ${preview.validRows} registro(s) válido(s).`:`Prévia concluída com ${preview.errorRows} erro(s). Corrija o arquivo antes de importar.`);}catch(importError){setError(importError instanceof AppApiError?importError.message:"Não foi possível validar o arquivo de importação.");}finally{setDataTransferBusy(false);} }
  async function commitDataImport() { if(dataTransferBusy||!dataImportPreview||dataImportPreview.status!=="validated"||dataImportPreview.errorRows!==0)return;setDataTransferBusy(true);setError(null);setSuccess(null);try{const completed=await commitOrganizationDataImport(organizationId,dataImportPreview.id);setDataImportPreview(completed);setDataImportFile(null);setDataTransfers(await listOrganizationDataTransfers(organizationId,20));setSuccess(completed.status==="completed"?`Importação concluída: ${completed.validRows} registro(s) processado(s).`:"A importação terminou com erros; consulte o histórico.");}catch(importError){setError(importError instanceof AppApiError?importError.message:"Não foi possível concluir a importação.");}finally{setDataTransferBusy(false);} }
  async function exportOrganizationData(resource:OrganizationDataTransferResource){if(dataTransferBusy)return;const canExport=resource==="contacts"?canReadContacts:resource==="properties"?canReadProperties:true;if(!canExport){setError("Seu perfil não possui permissão para exportar este recurso.");return;}setDataTransferBusy(true);setError(null);setSuccess(null);try{const result=await createOrganizationDataExport(organizationId,resource);openDataTransferDownload(result.downloadUrl);setDataTransfers(await listOrganizationDataTransfers(organizationId,20));setSuccess(`Exportação de ${dataTransferResourceLabel(resource).toLocaleLowerCase("pt-BR")} gerada com ${result.totalRows} registro(s).`);}catch(exportError){setError(exportError instanceof AppApiError?exportError.message:"Não foi possível gerar a exportação.");}finally{setDataTransferBusy(false);} }
  async function downloadPreviousDataExport(transfer:OrganizationDataTransfer){if(dataTransferBusy||transfer.direction!=="export")return;setDataTransferBusy(true);setError(null);try{const result=await downloadOrganizationDataExport(organizationId,transfer.id);openDataTransferDownload(result.downloadUrl);}catch(downloadError){setError(downloadError instanceof AppApiError?downloadError.message:"Não foi possível baixar esta exportação.");}finally{setDataTransferBusy(false);} }

  async function addIntegration() {
    if (!canUpdate || integrationBusyId) return;
    const name = integrationName.trim(); const baseUrl = integrationBaseUrl.trim(); const secret = integrationSecret.trim();
    if (!name) { setError("Informe um nome para a integração."); return; }
    if (!/^https:\/\//iu.test(baseUrl)) { setError("Informe uma URL HTTPS válida para a integração."); return; }
    if (integrationAuthType === "bearer" && secret.length < 8) { setError("Informe uma credencial Bearer com pelo menos 8 caracteres."); return; }
    setIntegrationBusyId("new"); setError(null); setSuccess(null);
    try {
      const created = await createOrganizationIntegration(organizationId, { kind: "webhook", name, baseUrl, authType: integrationAuthType, secret: integrationAuthType === "bearer" ? secret : null });
      setIntegrations((current) => [...current, created].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")));
      setIntegrationName(""); setIntegrationBaseUrl(""); setIntegrationSecret(""); setSuccess("Integração cadastrada. Teste a conexão antes de usar.");
    } catch (saveError) { setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível cadastrar a integração."); }
    finally { setIntegrationBusyId(null); }
  }

  async function saveIntegration(item: OrganizationIntegration, name: string, baseUrl: string, authType: OrganizationIntegrationAuthType, secret: string) {
    if (!canUpdate || integrationBusyId) return;
    setIntegrationBusyId(item.id); setError(null); setSuccess(null);
    try {
      const updated = await updateOrganizationIntegration(organizationId, item.id, { name: name.trim(), baseUrl: baseUrl.trim(), authType, ...(secret.trim() ? { secret: secret.trim() } : {}) });
      setIntegrations((current) => current.map((value) => value.id === updated.id ? updated : value)); setSuccess("Integração atualizada.");
    } catch (saveError) { setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível atualizar a integração."); }
    finally { setIntegrationBusyId(null); }
  }

  async function testIntegration(item: OrganizationIntegration) {
    if (!canUpdate || integrationBusyId) return;
    setIntegrationBusyId(item.id); setError(null); setSuccess(null);
    try { const result = await testOrganizationIntegration(organizationId, item.id); setIntegrations((current)=>current.map((value)=>value.id===item.id?result.integration:value)); setSuccess(result.integration.status === "connected" ? `Conexão validada${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ""}.` : "A conexão falhou de forma segura; revise URL e credencial."); }
    catch (testError) { setError(testError instanceof AppApiError ? testError.message : "Não foi possível testar a integração."); }
    finally { setIntegrationBusyId(null); }
  }

  async function revokeIntegration(item: OrganizationIntegration) {
    if (!canUpdate || integrationBusyId || item.status === "revoked") return;
    setIntegrationBusyId(item.id); setError(null); setSuccess(null);
    try { const updated = await revokeOrganizationIntegration(organizationId, item.id); setIntegrations((current)=>current.map((value)=>value.id===item.id?updated:value)); setSuccess("Integração revogada e credencial removida."); }
    catch (revokeError) { setError(revokeError instanceof AppApiError ? revokeError.message : "Não foi possível revogar a integração."); }
    finally { setIntegrationBusyId(null); }
  }

  async function setMemberStatus(member: OrganizationMember, status: ManagedOrganizationMembershipStatus) {
    if (!canUpdateUsers || member.membershipId === currentMembershipId || memberUpdatingId) return;
    setMemberUpdatingId(member.membershipId);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateOrganizationMemberStatus(organizationId, member.membershipId, status);
      setMembers((current) => current.map((item) => item.membershipId === updated.membershipId ? updated : item));
      setTeams((current) => current.map((team) => ({
        ...team,
        members: team.members.map((item) => item.membershipId === updated.membershipId ? updated : item),
      })));
      setSuccess(`Status de ${updated.displayName} atualizado.`);
      await onUpdated();
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível atualizar o usuário.");
    } finally {
      setMemberUpdatingId(null);
    }
  }

  async function changeProfilePhoto(file: File | null) {
    if (!file) return;
    const preview=URL.createObjectURL(file); setProfilePhotoPreview(preview); setProfilePhotoSaving(true); setError(null);
    try { const session=await ensureValidAuthSession(); if(!session) throw new AppApiError("Sua sessão expirou. Entre novamente.","UNAUTHORIZED",401); const upload=await createOnboardingAvatarUpload(file,session.accessToken); await uploadOnboardingAvatar(upload,file); await confirmOnboardingAvatar(upload.storageKey,session.accessToken); await onUpdated(); }
    catch(photoError){setProfilePhotoPreview(null);setError(photoError instanceof Error?photoError.message:"Não foi possível alterar a foto de perfil.")}
    finally{setProfilePhotoSaving(false);URL.revokeObjectURL(preview)}
  }
  async function removeMember(member: OrganizationMember) {
    if (!canUpdateUsers || member.membershipId === currentMembershipId || memberUpdatingId) return;
    if (!globalThis.confirm(`Excluir ${member.displayName} da organização? O acesso será arquivado e os vínculos históricos preservados.`)) return;
    setMemberUpdatingId(member.membershipId); setError(null); setSuccess(null);
    try {
      await updateOrganizationMemberStatus(organizationId, member.membershipId, "archived");
      setMembers((current) => current.filter((item) => item.membershipId !== member.membershipId));
      setTeams((current) => current.map((team) => ({ ...team, members: team.members.filter((item) => item.membershipId !== member.membershipId) })));
      setSuccess(`${member.displayName} foi removido da organização.`);
      await onUpdated();
    } catch (removeError) {
      setError(removeError instanceof AppApiError ? removeError.message : "Não foi possível excluir o usuário.");
    } finally { setMemberUpdatingId(null); }
  }

  async function inviteMember(emailInput = inviteEmail) {
    const email = emailInput.trim().toLowerCase();
    if (!canInviteUsers || invitingMember || memberAccessBusyId || !email) {
      if (!email) setError("Informe o e-mail da pessoa que deseja convidar.");
      return;
    }

    const existing = members.find((member) => member.email.toLowerCase() === email);
    setInvitingMember(true);
    if (existing) setMemberAccessBusyId(existing.membershipId);
    setError(null);
    setSuccess(null);

    try {
      const result = await inviteOrganizationMembers(organizationId, [email]);
      const invitation = result[0];
      if (!invitation) throw new Error("Invitation response is empty.");
      if (canReadUsers) setMembers(await listOrganizationMembers(organizationId));
      setInviteEmail("");
      if (invitation.status === "invited") setSuccess(`Convite enviado para ${invitation.email}.`);
      else if (existing?.membershipStatus === "invited") setSuccess(`Convite reenviado para ${invitation.email}.`);
      else setSuccess(`${invitation.email} já faz parte desta organização.`);
      await onUpdated();
    } catch (inviteError) {
      setError(inviteError instanceof AppApiError ? inviteError.message : "Não foi possível enviar o convite.");
    } finally {
      setInvitingMember(false);
      setMemberAccessBusyId(null);
    }
  }

  async function requestAccessReset(member: OrganizationMember) {
    if (!canUpdateUsers || memberAccessBusyId || member.membershipStatus !== "active" || member.userStatus !== "active") return;
    if (!globalThis.confirm(`Enviar um link de redefinição de senha para ${member.email}?`)) return;
    setMemberAccessBusyId(member.membershipId);
    setError(null);
    setSuccess(null);
    try {
      await requestOrganizationMemberAccessReset(organizationId, member.membershipId);
      setSuccess(`Solicitação de redefinição registrada para ${member.email}. Se a conta estiver apta, o link será enviado por e-mail.`);
    } catch (accessError) {
      setError(accessError instanceof AppApiError ? accessError.message : "Não foi possível solicitar a redefinição de acesso.");
    } finally {
      setMemberAccessBusyId(null);
    }
  }

  async function createTeam() {
    const name = newTeamName.trim();
    if (!canManageTeams || creatingTeam || !name) {
      if (!name) setError("Informe o nome da nova equipe.");
      return;
    }

    setCreatingTeam(true);
    setError(null);
    setSuccess(null);

    try {
      const created = await createOrganizationTeam(organizationId, name);
      replaceTeam(created);
      setNewTeamName("");
      setSuccess(`Equipe ${created.name} criada.`);
    } catch (createError) {
      setError(createError instanceof AppApiError ? createError.message : "Não foi possível criar a equipe.");
    } finally {
      setCreatingTeam(false);
    }
  }

  async function saveTeamName(team: OrganizationTeam) {
    const name = (teamDraftNames[team.id] ?? team.name).trim();
    if (!canManageTeams || teamBusyKey || !name || name === team.name) return;

    setTeamBusyKey(`team:${team.id}`);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateOrganizationTeam(organizationId, team.id, { name });
      replaceTeam(updated);
      setSuccess(`Equipe renomeada para ${updated.name}.`);
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível renomear a equipe.");
    } finally {
      setTeamBusyKey(null);
    }
  }

  async function toggleTeamStatus(team: OrganizationTeam) {
    if (!canManageTeams || teamBusyKey) return;
    const nextStatus = team.status === "active" ? "archived" : "active";
    if (nextStatus === "archived" && !globalThis.confirm(`Arquivar a equipe ${team.name}? Os vínculos serão preservados e poderão ser reativados depois.`)) return;

    setTeamBusyKey(`team:${team.id}`);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateOrganizationTeam(organizationId, team.id, { status: nextStatus });
      replaceTeam(updated);
      setSuccess(nextStatus === "archived" ? `Equipe ${updated.name} arquivada.` : `Equipe ${updated.name} reativada.`);
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível alterar a equipe.");
    } finally {
      setTeamBusyKey(null);
    }
  }

  async function toggleTeamMember(team: OrganizationTeam, member: OrganizationMember) {
    if (!canManageTeams || team.status !== "active" || teamBusyKey || !memberEligibleForTeam(member)) return;
    const assigned = team.members.some((item) => item.membershipId === member.membershipId);
    const key = `${team.id}:${member.membershipId}`;
    setTeamBusyKey(key);
    setError(null);
    setSuccess(null);

    try {
      const updated = assigned
        ? await removeOrganizationTeamMember(organizationId, team.id, member.membershipId)
        : await addOrganizationTeamMember(organizationId, team.id, member.membershipId);
      replaceTeam(updated);
      setSuccess(assigned ? `${member.displayName} removido de ${updated.name}.` : `${member.displayName} vinculado a ${updated.name}.`);
      await onUpdated();
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível alterar os membros da equipe.");
    } finally {
      setTeamBusyKey(null);
    }
  }

  function replaceRole(updated: OrganizationRole) {
    setRoles((current) => current.some((item) => item.id === updated.id)
      ? current.map((item) => item.id === updated.id ? updated : item)
      : [...current, updated]);
    setRoleDrafts((current) => ({ ...current, [updated.id]: roleDraft(updated) }));
  }

  function setRoleDraftField(roleId: string, field: "name" | "description", value: string) {
    setRoleDrafts((current) => ({
      ...current,
      [roleId]: {
        ...(current[roleId] ?? { name: "", description: "", grants: {} }),
        [field]: value,
      },
    }));
    setSuccess(null);
  }

  function setRoleGrant(roleId: string, permissionCode: string, scope: OrganizationAccessScope | "") {
    setRoleDrafts((current) => {
      const draft = current[roleId] ?? { name: "", description: "", grants: {} };
      return {
        ...current,
        [roleId]: { ...draft, grants: { ...draft.grants, [permissionCode]: scope } },
      };
    });
    setSuccess(null);
  }

  async function createRole() {
    const name = newRoleName.trim();
    if (!canManageRoles || creatingRole || !name) {
      if (!name) setError("Informe o nome do novo perfil de acesso.");
      return;
    }

    setCreatingRole(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createOrganizationRole(organizationId, {
        name,
        description: newRoleDescription.trim() || null,
        grants: [],
      });
      replaceRole(created);
      setNewRoleName("");
      setNewRoleDescription("");
      setSuccess(`Perfil ${created.name} criado. Agora configure as permissões e os membros.`);
    } catch (createError) {
      setError(createError instanceof AppApiError ? createError.message : "Não foi possível criar o perfil de acesso.");
    } finally {
      setCreatingRole(false);
    }
  }

  async function saveRole(role: OrganizationRole) {
    const draft = roleDrafts[role.id];
    if (!draft || role.systemManaged || !canManageRoles || roleBusyKey || !roleIsDirty(role, draft)) return;
    if (!draft.name.trim()) {
      setError("Informe o nome do perfil de acesso.");
      return;
    }

    setRoleBusyKey(`role:${role.id}`);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateOrganizationRole(organizationId, role.id, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        grants: roleGrantsFromDraft(draft.grants),
      });
      replaceRole(updated);
      setSuccess(`Perfil ${updated.name} salvo.`);
      await onUpdated();
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível salvar o perfil de acesso.");
    } finally {
      setRoleBusyKey(null);
    }
  }

  async function toggleRoleMember(role: OrganizationRole, member: OrganizationMember) {
    if (!canManageRoles || roleBusyKey) return;
    const assigned = role.memberIds.includes(member.membershipId);
    const isCurrent = member.membershipId === currentMembershipId;
    if (isCurrent) return;
    if (!assigned && !memberEligibleForTeam(member)) return;

    setRoleBusyKey(`${role.id}:${member.membershipId}`);
    setError(null);
    setSuccess(null);
    try {
      const updated = assigned
        ? await removeOrganizationRoleMember(organizationId, role.id, member.membershipId)
        : await addOrganizationRoleMember(organizationId, role.id, member.membershipId);
      replaceRole(updated);
      setSuccess(assigned
        ? `${member.displayName} removido do perfil ${updated.name}.`
        : `${member.displayName} recebeu o perfil ${updated.name}.`);
      await onUpdated();
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível alterar os perfis do usuário.");
    } finally {
      setRoleBusyKey(null);
    }
  }

  function setOperationalFunnelName(funnelId: string, name: string) {
    setOperationalDrafts((current) => ({
      ...current,
      [funnelId]: { ...(current[funnelId] ?? { name: "", stages: [] }), name },
    }));
  }

  function setOperationalStage(funnelId: string, stageId: string, patch: Partial<OrganizationOperationalFunnelStage>) {
    setOperationalDrafts((current) => {
      const draft = current[funnelId];
      if (!draft) return current;
      return {
        ...current,
        [funnelId]: {
          ...draft,
          stages: draft.stages.map((stage) => stage.id === stageId ? { ...stage, ...patch } : stage),
        },
      };
    });
  }

  function toggleOperationalRequiredField(funnelId: string, stageId: string, field: OrganizationOperationalRequiredField) {
    setOperationalDrafts((current) => {
      const draft = current[funnelId];
      if (!draft) return current;
      return {
        ...current,
        [funnelId]: {
          ...draft,
          stages: draft.stages.map((stage) => stage.id === stageId
            ? { ...stage, requiredFields: stage.requiredFields.includes(field) ? stage.requiredFields.filter((item) => item !== field) : [...stage.requiredFields, field] }
            : stage),
        },
      };
    });
  }

  function replaceOperationalLossReason(funnelId: string, updated: OrganizationOperationalLossReason) {
    setOperationalFunnels((current) => current.map((funnel) => funnel.id !== funnelId ? funnel : {
      ...funnel,
      lossReasons: funnel.lossReasons.some((reason) => reason.id === updated.id)
        ? funnel.lossReasons.map((reason) => reason.id === updated.id ? updated : reason)
        : [...funnel.lossReasons, updated],
    }));
    setLossReasonDraftNames((current) => ({ ...current, [updated.id]: updated.name }));
  }

  function replaceOperationalFunnel(updated: OrganizationOperationalFunnel) {
    setOperationalFunnels((current) => current.map((item) => item.id === updated.id ? updated : item));
    setOperationalDrafts((current) => ({ ...current, [updated.id]: operationalFunnelDraft(updated) }));
  }

  async function createOperationalStage(funnelId: string) {
    if (stageBusyKey) return;
    const draft = newStageDrafts[funnelId] ?? { name: "", probability: "", color: "#64748B" };
    const name = draft.name.trim();
    if (!name) return;
    const probability = draft.probability.trim() === "" ? null : Number(draft.probability);
    setStageBusyKey(`${funnelId}:new`);
    setError(null);
    setSuccess(null);
    try {
      const updated = await createOrganizationOperationalFunnelStage(organizationId, funnelId, {
        name,
        probability,
        color: draft.color.toUpperCase(),
        requiredFields: [],
      });
      replaceOperationalFunnel(updated);
      setNewStageDrafts((current) => ({ ...current, [funnelId]: { name: "", probability: "", color: "#64748B" } }));
      setSuccess(`Etapa “${name}” criada antes das etapas de encerramento.`);
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível criar a etapa do funil.");
    } finally {
      setStageBusyKey(null);
    }
  }

  async function toggleOperationalStageStatus(funnelId: string, stage: OrganizationOperationalFunnelStage) {
    if (stageBusyKey) return;
    const nextStatus = stage.status === "active" ? "archived" : "active";
    setStageBusyKey(stage.id);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateOrganizationOperationalFunnelStageStatus(organizationId, funnelId, stage.id, nextStatus);
      replaceOperationalFunnel(updated);
      setSuccess(`Etapa “${stage.name}” ${nextStatus === "active" ? "reativada" : "arquivada"}.`);
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível alterar o status da etapa.");
    } finally {
      setStageBusyKey(null);
    }
  }

  async function createLossReason(funnelId: string) {
    const name = newLossReasonNames[funnelId]?.trim() ?? "";
    if (!name || lossReasonBusyKey) return;
    setLossReasonBusyKey(`${funnelId}:new`);
    setError(null); setSuccess(null);
    try {
      const created = await createOrganizationOperationalLossReason(organizationId, funnelId, name);
      replaceOperationalLossReason(funnelId, created);
      setNewLossReasonNames((current) => ({ ...current, [funnelId]: "" }));
      setSuccess(`Motivo “${created.name}” criado.`);
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível criar o motivo de perda.");
    } finally { setLossReasonBusyKey(null); }
  }

  async function saveLossReason(funnelId: string, reason: OrganizationOperationalLossReason) {
    const name = lossReasonDraftNames[reason.id]?.trim() ?? reason.name;
    if (!name || lossReasonBusyKey || name === reason.name) return;
    setLossReasonBusyKey(reason.id); setError(null); setSuccess(null);
    try {
      const updated = await updateOrganizationOperationalLossReason(organizationId, funnelId, reason.id, { name });
      replaceOperationalLossReason(funnelId, updated);
      setSuccess(`Motivo “${updated.name}” atualizado.`);
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível atualizar o motivo de perda.");
    } finally { setLossReasonBusyKey(null); }
  }

  async function toggleLossReasonStatus(funnelId: string, reason: OrganizationOperationalLossReason) {
    if (lossReasonBusyKey) return;
    setLossReasonBusyKey(reason.id); setError(null); setSuccess(null);
    try {
      const updated = await updateOrganizationOperationalLossReason(organizationId, funnelId, reason.id, { status: reason.status === "active" ? "archived" : "active" });
      replaceOperationalLossReason(funnelId, updated);
      setSuccess(`Motivo “${updated.name}” ${updated.status === "active" ? "reativado" : "arquivado"}.`);
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível alterar o motivo de perda.");
    } finally { setLossReasonBusyKey(null); }
  }

  function moveOperationalStage(funnelId: string, stageId: string, direction: -1 | 1) {
    setOperationalDrafts((current) => {
      const draft = current[funnelId];
      if (!draft) return current;
      const stages = [...draft.stages].sort((a, b) => a.position - b.position);
      const index = stages.findIndex((stage) => stage.id === stageId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= stages.length) return current;
      [stages[index], stages[target]] = [stages[target]!, stages[index]!];
      return {
        ...current,
        [funnelId]: { ...draft, stages: stages.map((stage, stageIndex) => ({ ...stage, position: stageIndex + 1 })) },
      };
    });
  }

  async function saveOperationalFunnel(funnel: OrganizationOperationalFunnel) {
    const draft = operationalDrafts[funnel.id];
    if (!draft || operationalBusyId) return;
    setOperationalBusyId(funnel.id);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateOrganizationOperationalFunnel(organizationId, funnel.id, operationalFunnelUpdate(draft));
      replaceOperationalFunnel(updated);
      setSuccess(`Funil ${updated.name} atualizado.`);
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível salvar a configuração do funil.");
    } finally {
      setOperationalBusyId(null);
    }
  }

  async function saveLeadDistribution() {
    if (!canManageLeadDistribution || !leadDistribution || !leadDistributionDraftState || leadDistributionBusy) return;
    setLeadDistributionBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateOrganizationLeadDistribution(
        organizationId,
        leadDistributionDraftState,
      );
      setLeadDistribution(updated);
      setLeadDistributionDraftState(leadDistributionDraft(updated));
      setSuccess("Distribuição de leads atualizada.");
    } catch (updateError) {
      setError(updateError instanceof AppApiError ? updateError.message : "Não foi possível salvar a distribuição de leads.");
    } finally {
      setLeadDistributionBusy(false);
    }
  }

  return <>
    <section className="app-page-heading app-settings-heading">
      <div><span className="app-section-eyebrow">Sistema</span><h1>Configurações</h1><p>Administre os dados básicos e as regras da sua organização.</p></div>
      {section === "company" && canUpdate && <button className="app-primary-button" type="button" disabled={!dirty || saving || loading} onClick={() => void save()}>{saving ? "Salvando..." : "Salvar alterações"}</button>}
      {section === "identity" && canUpdate && <button className="app-primary-button" type="button" disabled={!identityDirty || identitySaving || identityLoading} onClick={() => void saveIdentity()}>{identitySaving ? "Salvando..." : "Salvar identidade"}</button>}
      {section === "properties" && canUpdate && <button className="app-primary-button" type="button" disabled={!propertySettingsDirty || propertySettingsSaving || propertySettingsLoading} onClick={() => void savePropertySettings()}>{propertySettingsSaving ? "Salvando..." : "Salvar imóveis"}</button>}
      {section === "documents" && canUpdate && <button className="app-primary-button" type="button" disabled={!documentSettingsDirty || documentSettingsSaving || documentSettingsLoading} onClick={() => void saveDocumentSettings()}>{documentSettingsSaving ? "Salvando..." : "Salvar documentos"}</button>}
      {section === "financial" && canUpdate && <button className="app-primary-button" type="button" disabled={!financialSettingsDirty || financialSettingsSaving || financialSettingsLoading} onClick={() => void saveFinancialSettings()}>{financialSettingsSaving ? "Salvando..." : "Salvar financeiro"}</button>}
      {section === "notifications" && canUpdate && <button className="app-primary-button" type="button" disabled={!notificationSettingsDirty || notificationSettingsSaving || notificationSettingsLoading} onClick={() => void saveNotificationSettings()}>{notificationSettingsSaving ? "Salvando..." : "Salvar notificações"}</button>}
      {section === "security" && canUpdate && <button className="app-primary-button" type="button" disabled={!securitySettingsDirty || securitySaving || securityLoading} onClick={() => void saveSecuritySettings()}>{securitySaving ? "Salvando..." : "Salvar segurança"}</button>}
    </section>

    <section className="app-settings-layout">
      <aside className="app-data-card app-settings-menu" aria-label="Seções das configurações">
        <button type="button" className={section === "company" ? "is-active" : ""} onClick={() => setSection("company")}><BuildingIcon/><span><strong>Empresa</strong><small>Dados básicos da organização</small></span></button>
        <button type="button" className={section === "identity" ? "is-active" : ""} onClick={() => setSection("identity")}><GlobeIcon/><span><strong>Identidade e site</strong><small>Marca, logo e canais públicos</small></span></button>
        <button type="button" className={section === "appearance" ? "is-active" : ""} onClick={() => setSection("appearance")}><SettingsIcon/><span><strong>Aparência do painel</strong><small>Cores exclusivas para minha conta</small></span></button>
        <button type="button" className={section === "properties" ? "is-active" : ""} onClick={() => setSection("properties")}><BuildingIcon/><span><strong>Configurações de imóveis</strong><small>Catálogos, padrões e regras</small></span></button>
        <button type="button" className={section === "documents" ? "is-active" : ""} onClick={() => setSection("documents")}><DocumentIcon/><span><strong>Configurações de documentos</strong><small>Modelos, numeração e assinatura</small></span></button>
        <button type="button" className={section === "financial" ? "is-active" : ""} onClick={() => setSection("financial")}><SettingsIcon/><span><strong>Configurações financeiras</strong><small>Categorias, contas, comissão e moeda</small></span></button>
        <button type="button" className={section === "notifications" ? "is-active" : ""} onClick={() => setSection("notifications")}><BellIcon/><span><strong>Notificações</strong><small>Eventos e canais da organização</small></span></button>
        <button type="button" className={section === "security" ? "is-active" : ""} onClick={() => setSection("security")}><SettingsIcon/><span><strong>Privacidade e segurança</strong><small>Retenção, auditoria e acesso sensível</small></span></button>
        <button type="button" className={section === "transfers" ? "is-active" : ""} onClick={() => setSection("transfers")}><DocumentIcon/><span><strong>Importação e exportação</strong><small>Contatos, imóveis e configurações</small></span></button>
        <button type="button" className={section === "people" ? "is-active" : ""} disabled={!canReadUsers && !canReadTeams && !canReadRoles && !canReadPermissions} onClick={() => setSection("people")}><UsersIcon/><span><strong>Usuários e equipes</strong><small>{canReadUsers || canReadTeams || canReadRoles || canReadPermissions ? "Acessos, times e permissões" : "Sem permissão"}</small></span></button>
        <button type="button" className={section === "operational" ? "is-active" : ""} disabled={!canReadFunnels && !canReadLeadDistribution} onClick={() => setSection("operational")}><SettingsIcon/><span><strong>Preferências operacionais</strong><small>{canReadFunnels || canReadLeadDistribution ? "Funis, distribuição e regras" : "Sem permissão"}</small></span></button>
      </aside>

      <div className="app-settings-content">
        {error && <div className="app-inline-error">{error}</div>}
        {success && <div className="app-inline-success">{success}</div>}

        {section === "appearance" && <section className="app-data-card app-settings-card"><header><div><SettingsIcon/><span><strong>Cores do meu painel</strong><small>Preferência vinculada a esta conta e organização; não altera a experiência de outros usuários.</small></span></div><div className="app-document-export-actions"><button type="button" className="app-secondary-button" onClick={restorePanelTheme}>Restaurar padrão</button><button type="button" className="app-primary-button" onClick={persistPanelTheme}>Salvar cores</button></div></header><div className="app-theme-preview"/><div className="app-theme-grid">{([{ field: "primary", label: "Cor principal", note: "Botões, links, seleção ativa e destaques." }, { field: "accent", label: "Cor de apoio", note: "Detalhes visuais, gráficos e realces secundários." }, { field: "sidebar", label: "Fundo do menu", note: "Área de navegação lateral do painel." }, { field: "background", label: "Fundo do conteúdo", note: "Plano de fundo atrás dos cards e formulários." }, { field: "heading", label: "Títulos", note: "Títulos de páginas, cards, tabelas e módulos." }, { field: "subtitle", label: "Subtítulos", note: "Descrições abaixo dos títulos e textos introdutórios." }, { field: "content", label: "Conteúdo", note: "Valores, campos, linhas de tabelas e textos principais." }, { field: "muted", label: "Textos auxiliares", note: "Legendas, rótulos, datas, placeholders e observações." }, { field: "sidebarText", label: "Textos do menu", note: "Itens, grupos e informações da navegação lateral." }] as Array<{ field: keyof PanelTheme; label: string; note: string }>).map((option) => <label className="app-theme-color" key={option.field}><input type="color" value={panelTheme[option.field]} onChange={(event) => changePanelColor(option.field, event.target.value)}/><span><strong>{option.label}</strong><small>{option.note} · {panelTheme[option.field]}</small></span></label>)}</div>{panelThemeSaved && <div className="app-inline-success">Preferência de cores salva para sua conta.</div>}</section>}

        {section === "company" && (loading || !settings || !draft ? <section className="app-data-card app-settings-loading"><span className="app-spinner"/><p>Carregando configurações...</p></section> : <>
          <section className="app-data-card app-settings-card">
            <header><div><BuildingIcon/><span><strong>Cadastro corporativo</strong><small>Identificação jurídica e fiscal da organização.</small></span></div>{!canUpdate && <em>Somente leitura</em>}</header>
            <div className="app-settings-form">
              <label><span>Nome da organização *</span><input value={draft.name} maxLength={160} disabled={!canUpdate || saving} onChange={(event) => setField("name", event.target.value)}/><small>Nome exibido internamente na plataforma.</small></label>
              <label><span>Razão social</span><input value={draft.legalName ?? ""} maxLength={200} disabled={!canUpdate || saving} onChange={(event) => setField("legalName", event.target.value || null)} placeholder="Razão social da empresa"/><small>Nome jurídico da organização, quando aplicável.</small></label>
              <label><span>CNPJ</span><input value={draft.cnpj ?? ""} maxLength={20} inputMode="text" disabled={!canUpdate || saving} onChange={(event) => setField("cnpj", event.target.value || null)} placeholder="00.000.000/0000-00"/><small>Identificador fiscal da pessoa jurídica, quando aplicável.</small></label>
              <label><span>CRECI</span><input value={draft.creci ?? ""} maxLength={40} disabled={!canUpdate || saving} onChange={(event) => setField("creci", event.target.value || null)} placeholder="Ex.: 12345-J/SP"/><small>Registro profissional/corporativo usado pela operação imobiliária.</small></label>
              <label><span>Inscrição estadual</span><input value={draft.stateRegistration ?? ""} maxLength={40} disabled={!canUpdate || saving} onChange={(event) => setField("stateRegistration", event.target.value || null)} placeholder="Quando aplicável"/></label>
              <label><span>Inscrição municipal</span><input value={draft.municipalRegistration ?? ""} maxLength={40} disabled={!canUpdate || saving} onChange={(event) => setField("municipalRegistration", event.target.value || null)} placeholder="Quando aplicável"/></label>
            </div>
          </section>

          <section className="app-data-card app-settings-card">
            <header><div><UsersIcon/><span><strong>Responsável e contatos</strong><small>Referências administrativas da organização.</small></span></div></header>
            <div className="app-settings-form">
              <label><span>Responsável principal</span><input value={draft.responsibleName ?? ""} maxLength={160} disabled={!canUpdate || saving} onChange={(event) => setField("responsibleName", event.target.value || null)} placeholder="Nome completo"/><small>Obrigatório quando houver e-mail ou telefone do responsável.</small></label>
              <label><span>E-mail do responsável</span><input type="email" value={draft.responsibleEmail ?? ""} maxLength={320} disabled={!canUpdate || saving} onChange={(event) => setField("responsibleEmail", event.target.value || null)} placeholder="responsavel@empresa.com.br"/></label>
              <label><span>Telefone do responsável</span><input value={draft.responsiblePhone ?? ""} maxLength={24} inputMode="tel" disabled={!canUpdate || saving} onChange={(event) => setField("responsiblePhone", event.target.value || null)} placeholder="(11) 99999-9999"/></label>
              <label><span>E-mail corporativo</span><input type="email" value={draft.contactEmail ?? ""} maxLength={320} disabled={!canUpdate || saving} onChange={(event) => setField("contactEmail", event.target.value || null)} placeholder="contato@empresa.com.br"/></label>
              <label><span>Telefone corporativo</span><input value={draft.contactPhone ?? ""} maxLength={24} inputMode="tel" disabled={!canUpdate || saving} onChange={(event) => setField("contactPhone", event.target.value || null)} placeholder="(11) 3333-4444"/><small>Contato administrativo. Canais públicos pertencem à seção Identidade e site.</small></label>
              <label><span>Fuso horário *</span><select value={draft.timezone} disabled={!canUpdate || saving} onChange={(event) => setField("timezone", event.target.value)}>{!timezoneKnown && <option value={draft.timezone}>{draft.timezone}</option>}{timezoneOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>Usado em datas, agenda, vencimentos e indicadores operacionais.</small></label>
            </div>
          </section>

          <section className="app-data-card app-settings-card">
            <header><div><BuildingIcon/><span><strong>Endereço principal</strong><small>Endereço corporativo usado nos dados da organização.</small></span></div></header>
            <div className="app-settings-form">
              <label><span>CEP</span><input value={draft.addressPostalCode ?? ""} maxLength={12} inputMode="numeric" disabled={!canUpdate || saving} onChange={(event) => setField("addressPostalCode", event.target.value || null)} placeholder="00000-000"/></label>
              <label><span>Logradouro</span><input value={draft.addressStreet ?? ""} maxLength={200} disabled={!canUpdate || saving} onChange={(event) => setField("addressStreet", event.target.value || null)} placeholder="Rua, avenida..."/></label>
              <label><span>Número</span><input value={draft.addressNumber ?? ""} maxLength={40} disabled={!canUpdate || saving} onChange={(event) => setField("addressNumber", event.target.value || null)} placeholder="Número ou s/n"/></label>
              <label><span>Complemento</span><input value={draft.addressComplement ?? ""} maxLength={120} disabled={!canUpdate || saving} onChange={(event) => setField("addressComplement", event.target.value || null)} placeholder="Sala, conjunto, bloco..."/></label>
              <label><span>Bairro</span><input value={draft.addressDistrict ?? ""} maxLength={120} disabled={!canUpdate || saving} onChange={(event) => setField("addressDistrict", event.target.value || null)} placeholder="Bairro"/></label>
              <label><span>Cidade</span><input value={draft.addressCity ?? ""} maxLength={120} disabled={!canUpdate || saving} onChange={(event) => setField("addressCity", event.target.value || null)} placeholder="Cidade"/></label>
              <label><span>UF</span><select value={draft.addressState ?? ""} disabled={!canUpdate || saving} onChange={(event) => setField("addressState", event.target.value || null)}><option value="">Selecione</option>{brazilStateOptions.map((state) => <option key={state} value={state}>{state}</option>)}</select><small>Ao preencher o endereço, CEP, logradouro, número, bairro, cidade e UF devem estar completos.</small></label>
            </div>
          </section>

          <section className="app-data-card app-settings-card app-settings-technical">
            <header><div><SettingsIcon/><span><strong>Identidade técnica</strong><small>Dados estruturais preservados pelo sistema.</small></span></div></header>
            <div className="app-settings-technical-grid"><span><small>Slug</small><strong>{settings.slug}</strong><p>Identificador estável da organização.</p></span><span><small>Status da organização</small><strong><em className={`app-settings-status is-${settings.status}`}>{statusLabel(settings.status)}</em></strong><p>O status estrutural não é alterado nesta tela.</p></span></div>
          </section>
        </>)}

        {section === "properties" && (propertySettingsLoading || !propertySettings || !propertySettingsDraftState ? <section className="app-data-card app-settings-loading"><span className="app-spinner"/><p>Carregando configurações de imóveis...</p></section> : <>
          <section className="app-data-card app-settings-card">
            <header><div><BuildingIcon/><span><strong>Catálogo de tipos</strong><small>Tipos exibidos no cadastro de imóveis da organização.</small></span></div>{!canUpdate && <em>Somente leitura</em>}</header>
            <div className="app-settings-property-types">
              {propertySettingsDraftState.propertyTypes.map((item, index) => <div className="app-settings-property-type" key={item.code}>
                <label className="app-inline-check"><input type="checkbox" checked={item.enabled} disabled={!canUpdate || propertySettingsSaving} onChange={(event) => setPropertyTypeEnabled(index, event.target.checked)}/><span>Habilitado</span></label>
                <input value={item.label} maxLength={60} disabled={!canUpdate || propertySettingsSaving} onChange={(event) => setPropertyTypeLabel(index, event.target.value)} aria-label={`Nome do tipo ${item.code}`}/>
                <code>{item.code}</code>
              </div>)}
            </div>
          </section>
          <section className="app-data-card app-settings-card">
            <header><div><SettingsIcon/><span><strong>Padrões e regras</strong><small>Valores iniciais e requisitos para ativação de imóveis.</small></span></div></header>
            <div className="app-settings-form">
              <label><span>Finalidade padrão</span><select value={propertySettingsDraftState.defaultPurpose} disabled={!canUpdate || propertySettingsSaving} onChange={(event) => setPropertySettingsField("defaultPurpose", event.target.value as OrganizationPropertySettings["defaultPurpose"])}><option value="sale">Venda</option><option value="rent">Aluguel</option><option value="sale_rent">Venda e aluguel</option></select><small>Aplicada ao iniciar um novo cadastro.</small></label>
              <label><span>Unidade de área padrão</span><select value={propertySettingsDraftState.defaultAreaUnit} disabled={!canUpdate || propertySettingsSaving} onChange={(event) => setPropertySettingsField("defaultAreaUnit", event.target.value as OrganizationPropertySettings["defaultAreaUnit"])}><option value="m2">m²</option><option value="ha">hectare</option></select><small>Aplicada ao iniciar um novo cadastro.</small></label>
            </div>
            <div className="app-settings-rules-list">
              <label><input type="checkbox" checked={propertySettingsDraftState.requireRegistryOnActive} disabled={!canUpdate || propertySettingsSaving} onChange={(event) => setPropertySettingsField("requireRegistryOnActive", event.target.checked)}/><span><strong>Exigir matrícula para ativar</strong><small>Imóveis sem matrícula permanecem em status anterior.</small></span></label>
              <label><input type="checkbox" checked={propertySettingsDraftState.requireDocumentationOnActive} disabled={!canUpdate || propertySettingsSaving} onChange={(event) => setPropertySettingsField("requireDocumentationOnActive", event.target.checked)}/><span><strong>Exigir documentação conferida para ativar</strong><small>O campo Documentação OK deve estar marcado.</small></span></label>
              <label><input type="checkbox" checked={propertySettingsDraftState.requireSiteTitleOnActive} disabled={!canUpdate || propertySettingsSaving} onChange={(event) => setPropertySettingsField("requireSiteTitleOnActive", event.target.checked)}/><span><strong>Exigir título público para ativar</strong><small>O cadastro precisa estar preparado para divulgação.</small></span></label>
            </div>
          </section>
          <section className="app-data-card app-settings-card">
            <header><div><SettingsIcon/><span><strong>Comodidades</strong><small>Um item por linha. O cadastro de imóveis usa exatamente estes catálogos.</small></span></div></header>
            <div className="app-settings-form">
              <label><span>Comodidades do imóvel</span><textarea rows={10} disabled={!canUpdate || propertySettingsSaving} value={propertySettingsDraftState.amenities.join("\n")} onChange={(event) => setPropertySettingsField("amenities", event.target.value.split(/\r?\n/u))}/><small>Ex.: Piscina, Escritório, Varanda gourmet.</small></label>
              <label><span>Comodidades do condomínio</span><textarea rows={10} disabled={!canUpdate || propertySettingsSaving} value={propertySettingsDraftState.condominiumAmenities.join("\n")} onChange={(event) => setPropertySettingsField("condominiumAmenities", event.target.value.split(/\r?\n/u))}/><small>Ex.: Portaria, Academia, Coworking.</small></label>
            </div>
          </section>
        </>)}

        {section === "documents" && (documentSettingsLoading || !documentSettings || !documentSettingsDraftState ? <section className="app-data-card app-settings-loading"><span className="app-spinner"/><p>Carregando configurações de documentos...</p></section> : <>
          <section className="app-data-card app-settings-card">
            <header><div><DocumentIcon/><span><strong>Modelo de autorização</strong><small>Parâmetros usados nas novas versões de documentos de autorização.</small></span></div>{!canUpdate && <em>Somente leitura</em>}</header>
            <div className="app-settings-form">
              <label><span>Prefixo da numeração</span><input value={documentSettingsDraftState.authorizationPrefix} maxLength={12} disabled={!canUpdate || documentSettingsSaving} onChange={(event) => setDocumentSettingsField("authorizationPrefix", event.target.value.toUpperCase())} placeholder="AUT"/><small>Exemplo: {normalizeDocumentSettingsDraft(documentSettingsDraftState).authorizationPrefix || "AUT"}-EI-12345678-XXXXXXXX-V001.</small></label>
              <label><span>Título do documento</span><input value={documentSettingsDraftState.authorizationTitle} maxLength={160} disabled={!canUpdate || documentSettingsSaving} onChange={(event) => setDocumentSettingsField("authorizationTitle", event.target.value)} placeholder="AUTORIZAÇÃO DE COMERCIALIZAÇÃO"/><small>Aplicado às novas versões geradas.</small></label>
              <label className="is-wide"><span>Rodapé / observação padrão</span><textarea rows={5} value={documentSettingsDraftState.footerText ?? ""} maxLength={500} disabled={!canUpdate || documentSettingsSaving} onChange={(event) => setDocumentSettingsField("footerText", event.target.value || null)} placeholder="Texto institucional opcional para o final do documento."/><small>O texto é capturado no snapshot imutável de cada PDF gerado.</small></label>
            </div>
          </section>
          <section className="app-data-card app-settings-card">
            <header><div><SettingsIcon/><span><strong>Composição e assinatura</strong><small>Regras aplicadas pelo backend ao gerar e preparar documentos.</small></span></div></header>
            <div className="app-settings-rules-list">
              <label><input type="checkbox" checked={documentSettingsDraftState.includePartyContacts} disabled={!canUpdate || documentSettingsSaving} onChange={(event) => setDocumentSettingsField("includePartyContacts", event.target.checked)}/><span><strong>Incluir contatos das partes no PDF</strong><small>Quando desmarcado, nomes e participações permanecem, mas e-mail e telefone não entram no documento.</small></span></label>
              <label><input type="checkbox" checked={documentSettingsDraftState.signaturePreparationEnabled} disabled={!canUpdate || documentSettingsSaving} onChange={(event) => setDocumentSettingsField("signaturePreparationEnabled", event.target.checked)}/><span><strong>Permitir preparação de assinatura eletrônica</strong><small>Quando desmarcado, novas preparações de assinatura são bloqueadas pelo backend.</small></span></label>
            </div>
            <div className="app-document-warning">As alterações valem apenas para novas versões geradas. Documentos já existentes continuam imutáveis e preservam o snapshot usado na geração.</div>
          </section>
        </>)}

        {section === "financial" && (financialSettingsLoading || !financialSettings || !financialSettingsDraftState ? <section className="app-data-card app-settings-loading"><span className="app-spinner"/><p>Carregando configurações financeiras...</p></section> : <>
          <section className="app-data-card app-settings-card">
            <header><div><SettingsIcon/><span><strong>Parâmetros financeiros</strong><small>Moeda, comissão padrão e obrigatoriedade dos vínculos operacionais.</small></span></div>{!canUpdate && <em>Somente leitura</em>}</header>
            <div className="app-settings-form">
              <label><span>Moeda da organização</span><select value={financialSettingsDraftState.currency} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => setFinancialSettingsField("currency", event.target.value as OrganizationFinancialSettings["currency"])}><option value="BRL">Real brasileiro (BRL)</option><option value="USD">Dólar americano (USD)</option><option value="EUR">Euro (EUR)</option></select><small>Usada na exibição do Financeiro e dos relatórios.</small></label>
              <label><span>Comissão padrão (%)</span><input inputMode="decimal" value={financialSettingsDraftState.defaultCommissionPercent} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => setFinancialSettingsField("defaultCommissionPercent", event.target.value)} placeholder="5,00"/><small>Aplicada como padrão em novas autorizações quando o imóvel não possui comissão própria.</small></label>
            </div>
            <div className="app-settings-rules-list">
              <label><input type="checkbox" checked={financialSettingsDraftState.requireCategory} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => setFinancialSettingsField("requireCategory", event.target.checked)}/><span><strong>Exigir categoria no lançamento</strong><small>O backend bloqueia receitas e despesas sem categoria.</small></span></label>
              <label><input type="checkbox" checked={financialSettingsDraftState.requireAccount} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => setFinancialSettingsField("requireAccount", event.target.checked)}/><span><strong>Exigir conta no lançamento</strong><small>O backend bloqueia lançamentos sem conta financeira.</small></span></label>
              <label><input type="checkbox" checked={financialSettingsDraftState.requireCostCenter} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => setFinancialSettingsField("requireCostCenter", event.target.checked)}/><span><strong>Exigir centro de custo no lançamento</strong><small>O backend bloqueia lançamentos sem centro de custo.</small></span></label>
            </div>
          </section>
          <section className="app-data-card app-settings-card">
            <header><div><SettingsIcon/><span><strong>Contas financeiras</strong><small>Catálogo disponível nos lançamentos da organização.</small></span></div>{canUpdate && <button className="app-secondary-button" type="button" disabled={financialSettingsSaving} onClick={() => setFinancialSettingsField("accounts", [...financialSettingsDraftState.accounts, { id: null, name: "Nova conta", type: "bank", active: true }])}>+ Conta</button>}</header>
            <div className="app-settings-financial-catalog">{financialSettingsDraftState.accounts.map((item, index) => <div key={item.id ?? `account-${index}`} className="app-settings-financial-row"><label className="app-inline-check"><input type="checkbox" checked={item.active} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => updateFinancialAccount(index, { active: event.target.checked })}/><span>Ativa</span></label><input value={item.name} maxLength={160} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => updateFinancialAccount(index, { name: event.target.value })}/><select value={item.type} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => updateFinancialAccount(index, { type: event.target.value as OrganizationFinancialAccountType })}><option value="cash">Caixa</option><option value="bank">Banco</option><option value="digital">Digital</option><option value="other">Outra</option></select></div>)}</div>
          </section>
          <section className="app-data-card app-settings-card">
            <header><div><SettingsIcon/><span><strong>Categorias financeiras</strong><small>Classificação reutilizada por receitas, despesas e relatórios.</small></span></div>{canUpdate && <button className="app-secondary-button" type="button" disabled={financialSettingsSaving} onClick={() => setFinancialSettingsField("categories", [...financialSettingsDraftState.categories, { id: null, name: "Nova categoria", direction: "both", active: true }])}>+ Categoria</button>}</header>
            <div className="app-settings-financial-catalog">{financialSettingsDraftState.categories.map((item, index) => <div key={item.id ?? `category-${index}`} className="app-settings-financial-row"><label className="app-inline-check"><input type="checkbox" checked={item.active} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => updateFinancialCategory(index, { active: event.target.checked })}/><span>Ativa</span></label><input value={item.name} maxLength={160} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => updateFinancialCategory(index, { name: event.target.value })}/><select value={item.direction} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => updateFinancialCategory(index, { direction: event.target.value as OrganizationFinancialDirection })}><option value="both">Receita e despesa</option><option value="income">Receita</option><option value="expense">Despesa</option></select></div>)}</div>
          </section>
          <section className="app-data-card app-settings-card">
            <header><div><SettingsIcon/><span><strong>Centros de custo</strong><small>Estrutura operacional disponível nos lançamentos e análises financeiras.</small></span></div>{canUpdate && <button className="app-secondary-button" type="button" disabled={financialSettingsSaving} onClick={() => setFinancialSettingsField("costCenters", [...financialSettingsDraftState.costCenters, { id: null, name: "Novo centro de custo", active: true }])}>+ Centro de custo</button>}</header>
            <div className="app-settings-financial-catalog">{financialSettingsDraftState.costCenters.map((item, index) => <div key={item.id ?? `cost-${index}`} className="app-settings-financial-row is-simple"><label className="app-inline-check"><input type="checkbox" checked={item.active} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => updateFinancialCostCenter(index, { active: event.target.checked })}/><span>Ativo</span></label><input value={item.name} maxLength={160} disabled={!canUpdate || financialSettingsSaving} onChange={(event) => updateFinancialCostCenter(index, { name: event.target.value })}/></div>)}</div>
          </section>
        </>)}

        {section === "notifications" && (notificationSettingsLoading || !notificationSettings || !notificationSettingsDraft ? <section className="app-data-card app-settings-loading"><span className="app-spinner"/><p>Carregando configurações de notificações...</p></section> : <>
          <section className="app-data-card app-settings-card">
            <header><div><BellIcon/><span><strong>Eventos gerais</strong><small>Preferências fora do SLA específico dos leads.</small></span></div>{!canUpdate && <em>Somente leitura</em>}</header>
            <div className="app-notification-settings-grid">
              <div className="app-notification-settings-row"><div><strong>Tarefa atribuída</strong><small>Quando um membro passa a ser responsável por uma tarefa.</small></div><label><input type="checkbox" checked={notificationSettingsDraft.taskAssigned.inApp} disabled={!canUpdate || notificationSettingsSaving} onChange={(event) => setNotificationChannel("taskAssigned", "inApp", event.target.checked)}/><span>Na plataforma</span></label><label><input type="checkbox" checked={notificationSettingsDraft.taskAssigned.email} disabled={!canUpdate || notificationSettingsSaving} onChange={(event) => setNotificationChannel("taskAssigned", "email", event.target.checked)}/><span>E-mail</span></label></div>
              <div className="app-notification-settings-row"><div><strong>Compromisso atribuído</strong><small>Quando um membro é definido como responsável por um evento da agenda.</small></div><label><input type="checkbox" checked={notificationSettingsDraft.calendarEventAssigned.inApp} disabled={!canUpdate || notificationSettingsSaving} onChange={(event) => setNotificationChannel("calendarEventAssigned", "inApp", event.target.checked)}/><span>Na plataforma</span></label><label><input type="checkbox" checked={notificationSettingsDraft.calendarEventAssigned.email} disabled={!canUpdate || notificationSettingsSaving} onChange={(event) => setNotificationChannel("calendarEventAssigned", "email", event.target.checked)}/><span>E-mail</span></label></div>
            </div>
            <div className="app-document-warning">Falhas de entrega por e-mail ficam registradas com código sanitizado e não impedem a criação da tarefa ou do compromisso. A central pelo sino usa somente entregas do membro dentro da organização ativa.</div>
          </section>
        </>)}


        {section === "integrations" && (integrationsLoading ? <section className="app-data-card app-settings-loading"><span className="app-spinner"/><p>Carregando integrações...</p></section> : <>
          <section className="app-data-card app-settings-card">
            <header><div><GlobeIcon/><span><strong>Nova conexão</strong><small>Cadastre uma API externa por HTTPS. A credencial é enviada uma vez e nunca volta para o navegador.</small></span></div>{!canUpdate && <em>Somente leitura</em>}</header>
            <div className="app-settings-form">
              <label><span>Nome *</span><input value={integrationName} maxLength={160} disabled={!canUpdate || Boolean(integrationBusyId)} onChange={(event)=>setIntegrationName(event.target.value)} placeholder="Ex.: Webhook do ERP"/></label>
              <label><span>URL HTTPS *</span><input type="url" value={integrationBaseUrl} maxLength={1000} disabled={!canUpdate || Boolean(integrationBusyId)} onChange={(event)=>setIntegrationBaseUrl(event.target.value)} placeholder="https://api.exemplo.com/health"/></label>
              <label><span>Autenticação</span><select value={integrationAuthType} disabled={!canUpdate || Boolean(integrationBusyId)} onChange={(event)=>setIntegrationAuthType(event.target.value as OrganizationIntegrationAuthType)}><option value="bearer">Bearer token</option><option value="none">Sem autenticação</option></select></label>
              <label><span>Credencial {integrationAuthType === "bearer" ? "*" : ""}</span><input type="password" autoComplete="new-password" value={integrationSecret} maxLength={4096} disabled={!canUpdate || Boolean(integrationBusyId) || integrationAuthType === "none"} onChange={(event)=>setIntegrationSecret(event.target.value)} placeholder="Não será exibida novamente"/><small>Criptografada no backend; respostas e auditoria mostram somente os 4 últimos caracteres.</small></label>
            </div>
            {canUpdate && <div className="app-settings-inline-actions"><button type="button" className="app-primary-button" disabled={Boolean(integrationBusyId)} onClick={()=>void addIntegration()}>{integrationBusyId === "new" ? "Cadastrando..." : "+ Cadastrar integração"}</button></div>}
          </section>
          <section className="app-data-card app-settings-card">
            <header><div><SettingsIcon/><span><strong>Conexões cadastradas</strong><small>Teste, atualize ou revogue sem expor as credenciais armazenadas.</small></span></div></header>
            {integrations.length === 0 ? <div className="app-settings-empty">Nenhuma integração cadastrada.</div> : <div className="app-integrations-list">{integrations.map((item)=><IntegrationSettingsRow key={item.id} item={item} canUpdate={canUpdate} busy={integrationBusyId===item.id} onSave={saveIntegration} onTest={testIntegration} onRevoke={revokeIntegration}/>)}</div>}
          </section>
          <div className="app-document-warning">Somente URLs HTTPS públicas podem ser testadas. Endereços locais/privados são bloqueados para reduzir risco de SSRF. Falhas externas são registradas apenas por código sanitizado.</div>
        </>)}

        {section === "identity" && (identityLoading || !identity || !identityDraftState ? <section className="app-data-card app-settings-loading"><span className="app-spinner"/><p>Carregando identidade...</p></section> : <>
          <section className="app-data-card app-settings-card">
            <header><div><GlobeIcon/><span><strong>Identidade visual</strong><small>Logo e cores reutilizados nas experiências públicas.</small></span></div>{!canUpdate && <em>Somente leitura</em>}</header>
            <div className="app-settings-identity-visual">
              <div className="app-settings-logo-editor">
                <div className="app-settings-logo-preview" style={{ background: identityDraftState.brandPrimaryColor }}>
                  {(identityLogoPreviewUrl || (!identityRemoveLogo && identity.logoUrl)) ? <img src={identityLogoPreviewUrl || identity.logoUrl || ""} alt="Pré-visualização do logo"/> : <span>{initials(identityDraftState.brandName || identity.organizationName)}</span>}
                </div>
                <div className="app-settings-logo-copy"><strong>Logo da imobiliária</strong><p>PNG, JPG ou WEBP, até 5 MB. O arquivo fica privado e é entregue por URL temporária.</p></div>
                {canUpdate && <div className="app-settings-logo-actions"><label className="app-secondary-button"><input type="file" accept="image/png,image/jpeg,image/webp" disabled={identitySaving} onChange={(event) => selectIdentityLogo(event.target.files?.[0] ?? null)}/>{identityLogoFile ? "Trocar arquivo" : "Selecionar logo"}</label>{(identity.logoStorageKey || identityLogoFile) && !identityRemoveLogo && <button className="app-secondary-button" type="button" disabled={identitySaving} onClick={markIdentityLogoForRemoval}>Remover logo</button>}</div>}
              </div>
              <div className="app-settings-form app-settings-color-form">
                <label><span>Cor primária</span><div className="app-settings-color-input"><input type="color" value={identityDraftState.brandPrimaryColor} disabled={!canUpdate || identitySaving} onChange={(event) => setIdentityField("brandPrimaryColor", event.target.value.toUpperCase())}/><input value={identityDraftState.brandPrimaryColor} maxLength={7} disabled={!canUpdate || identitySaving} onChange={(event) => setIdentityField("brandPrimaryColor", event.target.value)}/></div><small>Usada em ações, destaques e elementos da marca.</small></label>
                <label><span>Cor secundária</span><div className="app-settings-color-input"><input type="color" value={identityDraftState.brandSecondaryColor} disabled={!canUpdate || identitySaving} onChange={(event) => setIdentityField("brandSecondaryColor", event.target.value.toUpperCase())}/><input value={identityDraftState.brandSecondaryColor} maxLength={7} disabled={!canUpdate || identitySaving} onChange={(event) => setIdentityField("brandSecondaryColor", event.target.value)}/></div><small>Usada em textos, contrastes e apoio visual.</small></label>
              </div>
            </div>
          </section>

          <section className="app-data-card app-settings-card">
            <header><div><GlobeIcon/><span><strong>Dados públicos e canais</strong><small>Conteúdo institucional preparado para site e experiências públicas.</small></span></div></header>
            <div className="app-settings-form">
              <label><span>Nome público da marca</span><input value={identityDraftState.brandName ?? ""} maxLength={160} disabled={!canUpdate || identitySaving} onChange={(event) => setIdentityField("brandName", event.target.value || null)} placeholder={identity.organizationName}/><small>Se vazio, a plataforma pode usar o nome da organização.</small></label>
              <label><span>Frase de destaque</span><input value={identityDraftState.brandTagline ?? ""} maxLength={240} disabled={!canUpdate || identitySaving} onChange={(event) => setIdentityField("brandTagline", event.target.value || null)} placeholder="Ex.: Imóveis que combinam com a sua história"/></label>
              <label className="is-wide"><span>Descrição pública</span><textarea rows={5} value={identityDraftState.publicDescription ?? ""} maxLength={1000} disabled={!canUpdate || identitySaving} onChange={(event) => setIdentityField("publicDescription", event.target.value || null)} placeholder="Apresente a imobiliária, sua região de atuação e seus diferenciais."/></label>
              <label><span>Site</span><input type="url" value={identityDraftState.siteUrl ?? ""} maxLength={500} disabled={!canUpdate || identitySaving} onChange={(event) => setIdentityField("siteUrl", event.target.value || null)} placeholder="https://www.suaimobiliaria.com.br"/></label>
              <label><span>Instagram</span><input type="url" value={identityDraftState.instagramUrl ?? ""} maxLength={500} disabled={!canUpdate || identitySaving} onChange={(event) => setIdentityField("instagramUrl", event.target.value || null)} placeholder="https://instagram.com/suaimobiliaria"/></label>
              <label><span>E-mail público</span><input type="email" value={identityDraftState.publicEmail ?? ""} maxLength={320} disabled={!canUpdate || identitySaving} onChange={(event) => setIdentityField("publicEmail", event.target.value || null)} placeholder="contato@suaimobiliaria.com.br"/></label>
              <label><span>Telefone público</span><input value={identityDraftState.publicPhone ?? ""} maxLength={24} inputMode="tel" disabled={!canUpdate || identitySaving} onChange={(event) => setIdentityField("publicPhone", event.target.value || null)} placeholder="(11) 3333-4444"/></label>
              <label><span>WhatsApp público</span><input value={identityDraftState.publicWhatsapp ?? ""} maxLength={24} inputMode="tel" disabled={!canUpdate || identitySaving} onChange={(event) => setIdentityField("publicWhatsapp", event.target.value || null)} placeholder="(11) 99999-9999"/><small>Salvo somente com dígitos para reutilização segura em links e integrações.</small></label>
            </div>
          </section>

          <section className="app-data-card app-settings-card">
            <header><div><GlobeIcon/><span><strong>Prévia pública</strong><small>Visualização dos parâmetros atuais, sem publicar um site nesta etapa.</small></span></div></header>
            <div className="app-settings-brand-preview" style={{ borderColor: identityDraftState.brandPrimaryColor }}>
              <div className="app-settings-brand-preview__hero" style={{ background: identityDraftState.brandPrimaryColor, color: identityDraftState.brandSecondaryColor }}>
                <div className="app-settings-brand-preview__logo">{(identityLogoPreviewUrl || (!identityRemoveLogo && identity.logoUrl)) ? <img src={identityLogoPreviewUrl || identity.logoUrl || ""} alt=""/> : <span style={{ color: identityDraftState.brandPrimaryColor }}>{initials(identityDraftState.brandName || identity.organizationName)}</span>}</div>
                <div><strong>{identityDraftState.brandName || identity.organizationName}</strong>{identityDraftState.brandTagline && <p>{identityDraftState.brandTagline}</p>}</div>
              </div>
              <div className="app-settings-brand-preview__body" style={{ color: identityDraftState.brandSecondaryColor }}>
                {identityDraftState.publicDescription ? <p>{identityDraftState.publicDescription}</p> : <p className="is-placeholder">Adicione uma descrição pública para visualizar a apresentação da marca.</p>}
                <div className="app-settings-brand-preview__channels">{identityDraftState.publicEmail && <span>{identityDraftState.publicEmail}</span>}{identityDraftState.publicPhone && <span>{identityDraftState.publicPhone}</span>}{identityDraftState.publicWhatsapp && <span>WhatsApp {identityDraftState.publicWhatsapp}</span>}{identityDraftState.instagramUrl && <span>Instagram</span>}</div>
                {identityDraftState.siteUrl && <span className="app-settings-brand-preview__cta" style={{ background: identityDraftState.brandPrimaryColor }}>Acessar site</span>}
              </div>
            </div>
          </section>
        </>)}

        {section === "security" && (securityLoading || !securitySettings || !securityDraft ? <section className="app-data-card app-settings-loading"><span className="app-spinner"/><p>Carregando privacidade e segurança...</p></section> : <>
          <section className="app-data-card app-settings-card">
            <header><div><SettingsIcon/><span><strong>Políticas de proteção</strong><small>Retenção, exposição de auditoria e operações administrativas sensíveis.</small></span></div>{!canUpdate && <em>Somente leitura</em>}</header>
            <div className="app-settings-security-grid">
              <label><span>Retenção da auditoria</span><select value={securityDraft.auditRetentionDays} disabled={!canUpdate || securitySaving} onChange={(event) => setSecurityDraft((current) => current ? { ...current, auditRetentionDays: Number(event.target.value) as OrganizationSecuritySettings["auditRetentionDays"] } : current)}><option value={30}>30 dias</option><option value={90}>90 dias</option><option value={180}>180 dias</option><option value={365}>1 ano</option><option value={730}>2 anos</option></select><small>Registros anteriores ao período são removidos pelo backend ao aplicar ou consultar a política.</small></label>
              <label><span>Detalhes exibidos na auditoria</span><select value={securityDraft.auditPayloadVisibility} disabled={!canUpdate || securitySaving} onChange={(event) => setSecurityDraft((current) => current ? { ...current, auditPayloadVisibility: event.target.value as OrganizationSecuritySettings["auditPayloadVisibility"] } : current)}><option value="redacted">Dados redigidos</option><option value="metadata_only">Somente metadados</option></select><small>Segredos, tokens, senhas e credenciais continuam redigidos independentemente desta opção.</small></label>
            </div>
            <div className="app-settings-security-toggles">
              <label><input type="checkbox" checked={securityDraft.auditReadTrackingEnabled} disabled={!canUpdate || securitySaving} onChange={(event) => setSecurityDraft((current) => current ? { ...current, auditReadTrackingEnabled: event.target.checked } : current)}/><span><strong>Auditar consultas à trilha</strong><small>Registra quem consultou eventos administrativos quando o acesso é permitido.</small></span></label>
              <label><input type="checkbox" checked={securityDraft.allowMemberAccessReset} disabled={!canUpdate || securitySaving} onChange={(event) => setSecurityDraft((current) => current ? { ...current, allowMemberAccessReset: event.target.checked } : current)}/><span><strong>Permitir redefinição administrativa de acesso</strong><small>Quando desabilitado, o backend bloqueia solicitações de redefinição feitas por administradores.</small></span></label>
            </div>
          </section>

          <section className="app-data-card app-settings-card">
            <header><div><DocumentIcon/><span><strong>Trilha de auditoria</strong><small>Eventos recentes dentro da retenção configurada e sempre limitados à organização ativa.</small></span></div>{canReadAuditLogs ? <button className="app-secondary-button" type="button" onClick={() => void refreshSecurityAudit()}>Atualizar</button> : <em>Sem permissão audit_logs.read</em>}</header>
            {!canReadAuditLogs ? <div className="app-settings-empty">Seu perfil não possui permissão para visualizar a trilha de auditoria.</div> : !securityAudit || securityAudit.items.length === 0 ? <div className="app-settings-empty">Nenhum evento disponível dentro da retenção atual.</div> : <div className="app-settings-audit-list">
              {securityAudit.items.map((item) => <article key={item.id} className="app-settings-audit-row"><div className="app-settings-audit-row__heading"><div><strong>{item.action}</strong><span>{item.entityType} · {item.entityId}</span></div><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("pt-BR")}</time></div><div className="app-settings-audit-row__meta"><span>{item.actorDisplayName || item.actorEmail || "Sistema"}</span>{item.requestId && <span>Request {item.requestId}</span>}</div>{securityAudit.payloadVisibility === "redacted" && (item.before !== null || item.after !== null || item.metadata !== null) && <details><summary>Dados redigidos do evento</summary><pre>{JSON.stringify({ before: item.before, after: item.after, metadata: item.metadata }, null, 2)}</pre></details>}</article>)}
            </div>}
            <div className="app-document-warning">A API aplica RBAC para leitura da auditoria, retenção por organização e redação recursiva de campos sensíveis antes da persistência.</div>
          </section>
        </>)}

        {section === "transfers" && <>
          <section className="app-data-card app-settings-card"><header><div><DocumentIcon/><span><strong>Importar dados</strong><small>CSV para contatos e imóveis; JSON exportado pela plataforma para configurações.</small></span></div><em>Prévia obrigatória</em></header><div className="app-data-transfer-import"><div className="app-settings-form app-data-transfer-import__form"><label><span>Recurso</span><select value={dataImportResource} disabled={dataTransferBusy} onChange={(event)=>{setDataImportResource(event.target.value as OrganizationDataTransferResource);setDataImportFile(null);setDataImportPreview(null);}}><option value="contacts" disabled={!canCreateContact}>Contatos{!canCreateContact?" — sem permissão":""}</option><option value="properties" disabled={!canCreateProperty}>Imóveis{!canCreateProperty?" — sem permissão":""}</option><option value="settings" disabled={!canUpdate}>Configurações{!canUpdate?" — sem permissão":""}</option></select><small>As permissões são verificadas novamente no backend.</small></label><label><span>Arquivo {dataImportResource==="settings"?"JSON":"CSV"}</span><input type="file" accept={dataImportResource==="settings"?".json,application/json":".csv,text/csv"} disabled={dataTransferBusy} onChange={(event)=>{setDataImportFile(event.target.files?.[0]??null);setDataImportPreview(null);}}/><small>UTF-8, até 2 MB. Nada é persistido antes da confirmação.</small></label></div><div className="app-settings-inline-actions app-data-transfer-actions">{dataImportResource!=="settings"&&<button className="app-secondary-button" type="button" disabled={dataTransferBusy} onClick={()=>downloadTransferTemplate(dataImportResource)}>Baixar modelo CSV</button>}<button className="app-primary-button" type="button" disabled={dataTransferBusy||!dataImportFile||(dataImportResource==="contacts"?!canCreateContact:dataImportResource==="properties"?!canCreateProperty:!canUpdate)} onClick={()=>void previewDataImport()}>{dataTransferBusy?"Processando...":"Validar arquivo"}</button></div>{dataImportPreview&&<div className={`app-data-transfer-preview is-${dataImportPreview.errorRows>0||dataImportPreview.status==="failed"?"error":"valid"}`}><div className="app-data-transfer-preview__summary"><div><strong>Prévia da importação</strong><span>{dataTransferResourceLabel(dataImportPreview.resource)} · {dataImportPreview.originalName}</span></div><div><span><b>{dataImportPreview.totalRows}</b> linha(s)</span><span><b>{dataImportPreview.validRows}</b> válida(s)</span><span><b>{dataImportPreview.errorRows}</b> erro(s)</span></div></div>{dataImportPreview.validationErrors.length>0&&<div className="app-data-transfer-errors">{dataImportPreview.validationErrors.slice(0,20).map((issue,index)=><div key={`${issue.row??"file"}-${issue.field}-${index}`}><strong>{issue.row?`Linha ${issue.row}`:"Arquivo"} · {issue.field}</strong><span>{issue.message}</span></div>)}</div>}{dataImportPreview.status==="validated"&&dataImportPreview.errorRows===0&&<div className="app-data-transfer-commit"><span>Nenhum erro encontrado. Confirme para persistir os dados.</span><button className="app-primary-button" type="button" disabled={dataTransferBusy} onClick={()=>void commitDataImport()}>{dataTransferBusy?"Importando...":"Confirmar importação"}</button></div>}</div>}</div></section>
          <section className="app-data-card app-settings-card"><header><div><DocumentIcon/><span><strong>Exportar dados</strong><small>Arquivos privados gerados apenas dentro do escopo permitido ao perfil.</small></span></div></header><div className="app-data-transfer-export-grid"><article><div><strong>Contatos</strong><span>CSV com os contatos visíveis ao seu escopo.</span></div><button className="app-secondary-button" type="button" disabled={!canReadContacts||dataTransferBusy} onClick={()=>void exportOrganizationData("contacts")}>{canReadContacts?"Exportar CSV":"Sem permissão"}</button></article><article><div><strong>Imóveis</strong><span>CSV com os imóveis visíveis ao seu escopo.</span></div><button className="app-secondary-button" type="button" disabled={!canReadProperties||dataTransferBusy} onClick={()=>void exportOrganizationData("properties")}>{canReadProperties?"Exportar CSV":"Sem permissão"}</button></article><article><div><strong>Configurações</strong><span>JSON reutilizável sem segredos de integrações.</span></div><button className="app-secondary-button" type="button" disabled={dataTransferBusy} onClick={()=>void exportOrganizationData("settings")}>Exportar JSON</button></article></div><div className="app-document-warning">Arquivos ficam em armazenamento privado, com chave isolada por organização e URLs temporárias.</div></section>
          <section className="app-data-card app-settings-card"><header><div><DocumentIcon/><span><strong>Histórico de transferências</strong><small>Importações e exportações recentes desta organização.</small></span></div><button className="app-secondary-button" type="button" disabled={dataTransfersLoading||dataTransferBusy} onClick={()=>void refreshDataTransfers()}>Atualizar</button></header>{dataTransfersLoading?<div className="app-settings-members-loading"><span className="app-spinner"/><p>Carregando transferências...</p></div>:dataTransfers.length===0?<div className="app-settings-empty">Nenhuma transferência registrada ainda.</div>:<div className="app-data-transfer-history">{dataTransfers.map((transfer)=><article key={transfer.id}><div className="app-data-transfer-history__main"><span className={`app-data-transfer-direction is-${transfer.direction}`}>{transfer.direction==="import"?"Importação":"Exportação"}</span><div><strong>{dataTransferResourceLabel(transfer.resource)}</strong><span>{transfer.originalName||`${transfer.format.toUpperCase()} gerado pela plataforma`}</span></div></div><div className="app-data-transfer-history__numbers"><span className={`is-${transfer.status}`}>{dataTransferStatusLabel(transfer.status)}</span><small>{transfer.totalRows} registro(s) · {new Date(transfer.createdAt).toLocaleString("pt-BR")}</small></div>{transfer.direction==="export"&&transfer.status==="completed"&&<button className="app-secondary-button" type="button" disabled={dataTransferBusy} onClick={()=>void downloadPreviousDataExport(transfer)}>Baixar</button>}</article>)}</div>}</section>
        </>}

        {section === "people" && <>
          {canReadUsers && <section className="app-data-card app-settings-card app-settings-members-card">
            <header><div><UsersIcon/><span><strong>Usuários da organização</strong><small>Convide pessoas, controle status e recupere acessos.</small></span></div><em>{members.length} {members.length === 1 ? "membro" : "membros"}</em></header>
            <div className="app-profile-photo-editor"><span className="app-profile-photo-editor__preview">{profilePhotoPreview||currentUser.avatarUrl?<img src={profilePhotoPreview??currentUser.avatarUrl??""} alt="Foto de perfil"/>:initials(currentUser.displayName)}</span><div className="app-profile-photo-editor__body"><strong>Foto de perfil</strong><small>JPEG, PNG ou WebP de até 10 MB. A alteração aparece imediatamente em todo o painel.</small><label className="app-secondary-button"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={profilePhotoSaving} onChange={(event)=>void changeProfilePhoto(event.target.files?.[0]??null)}/>{profilePhotoSaving?"Salvando...":"Alterar foto"}</label></div></div>
            {canInviteUsers && <form className="app-settings-member-invite" onSubmit={(event) => { event.preventDefault(); void inviteMember(); }}>
              <label><span>Convidar por e-mail</span><input type="email" value={inviteEmail} maxLength={320} disabled={invitingMember || Boolean(memberAccessBusyId)} onChange={(event) => setInviteEmail(event.target.value)} placeholder="nome@imobiliaria.com.br"/></label>
              <button className="app-primary-button" type="submit" disabled={invitingMember || Boolean(memberAccessBusyId) || !inviteEmail.trim()}>{invitingMember ? "Enviando..." : "Enviar convite"}</button>
            </form>}
            {peopleLoading ? <div className="app-settings-members-loading"><span className="app-spinner"/><p>Carregando usuários...</p></div> : members.length === 0 ? <div className="app-settings-members-empty"><UsersIcon/><strong>Nenhum usuário encontrado</strong><p>Convide a primeira pessoa para participar desta organização.</p></div> : <div className="app-settings-members-list">
              {members.map((member) => {
                const isCurrent = member.membershipId === currentMembershipId;
                const updating = memberUpdatingId === member.membershipId;
                const accessBusy = memberAccessBusyId === member.membershipId;
                const canResetAccess = canUpdateUsers && member.membershipStatus === "active" && member.userStatus === "active";
                return <article key={member.membershipId} className="app-settings-member-row">
                  <div className="app-settings-member-avatar" aria-hidden="true">{isCurrent&&(profilePhotoPreview||currentUser.avatarUrl)?<img src={profilePhotoPreview??currentUser.avatarUrl??""} alt=""/>:initials(member.displayName)}</div>
                  <div className="app-settings-member-identification"><strong>{member.displayName}{isCurrent && <em>Você</em>}</strong><span>{member.email}</span></div>
                  <span className={`app-settings-member-status is-${member.membershipStatus}`}>{membershipStatusLabel(member.membershipStatus)}</span>
                  <div className="app-settings-member-controls">
                    <label className="app-settings-member-action"><span>Status de acesso</span><select value={member.membershipStatus} disabled={!canUpdateUsers || isCurrent || updating || accessBusy} onChange={(event) => void setMemberStatus(member, event.target.value as ManagedOrganizationMembershipStatus)}>{member.membershipStatus === "invited" && <option value="invited" disabled>Convidado</option>}<option value="active">Ativo</option><option value="suspended">Suspenso</option><option value="archived">Arquivado</option></select>{isCurrent && <small>Seu próprio status não é alterado nesta tela.</small>}</label>
                    <div className="app-settings-member-access-actions">
                      {member.membershipStatus === "invited" && canInviteUsers && <button className="app-secondary-button" type="button" disabled={accessBusy || invitingMember} onClick={() => void inviteMember(member.email)}>{accessBusy ? "Enviando..." : "Reenviar convite"}</button>}
                      {canResetAccess && <button className="app-secondary-button" type="button" disabled={accessBusy || invitingMember} onClick={() => void requestAccessReset(member)}>{accessBusy ? "Solicitando..." : "Redefinir acesso"}</button>}
                      {isCurrent && <button className="app-secondary-button" type="button" onClick={() => setSection("company")}>Editar perfil</button>}
                      {!isCurrent && canUpdateUsers && <button className="app-secondary-button is-danger" type="button" disabled={updating || accessBusy} onClick={() => void removeMember(member)}>{updating ? "Excluindo..." : "Excluir usuário"}</button>}
                    </div>
                  </div>
                </article>;
              })}
            </div>}
          </section>}

          <section className="app-data-card app-settings-card app-settings-teams-card">
            <header><div><UsersIcon/><span><strong>Equipes</strong><small>Agrupe membros para os escopos operacionais da organização.</small></span></div><em>{canReadTeams ? `${teams.length} ${teams.length === 1 ? "equipe" : "equipes"}` : "Sem permissão"}</em></header>
            {!canReadTeams ? <div className="app-settings-teams-no-access"><p>Seu perfil não possui permissão para visualizar as equipes desta organização.</p></div> : <>
              {canManageTeams && <form className="app-settings-team-create" onSubmit={(event) => { event.preventDefault(); void createTeam(); }}>
                <label><span>Nova equipe</span><input value={newTeamName} maxLength={120} disabled={creatingTeam} onChange={(event) => setNewTeamName(event.target.value)} placeholder="Ex.: Comercial, Captação, Backoffice"/></label>
                <button className="app-primary-button" type="submit" disabled={creatingTeam || !newTeamName.trim()}>{creatingTeam ? "Criando..." : "Criar equipe"}</button>
              </form>}

              {peopleLoading ? <div className="app-settings-members-loading"><span className="app-spinner"/><p>Carregando equipes...</p></div> : teams.length === 0 ? <div className="app-settings-members-empty"><UsersIcon/><strong>Nenhuma equipe criada</strong><p>Crie a primeira equipe para organizar responsáveis e futuros escopos de acesso por time.</p></div> : <div className="app-settings-team-list">
                {teams.map((team) => {
                  const teamBusy = teamBusyKey === `team:${team.id}`;
                  const draftName = teamDraftNames[team.id] ?? team.name;
                  const nameDirty = draftName.trim() !== team.name;
                  return <article key={team.id} className={`app-settings-team${team.status === "archived" ? " is-archived" : ""}`}>
                    <header>
                      <div className="app-settings-team-title"><span className="app-settings-member-avatar" aria-hidden="true">{initials(team.name)}</span><label><span>Nome da equipe</span><input value={draftName} maxLength={120} disabled={!canManageTeams || teamBusy} onChange={(event) => setTeamDraftNames((current) => ({ ...current, [team.id]: event.target.value }))}/></label><em className={`app-settings-team-status is-${team.status}`}>{team.status === "active" ? "Ativa" : "Arquivada"}</em></div>
                      {canManageTeams && <div className="app-settings-team-actions"><button className="app-secondary-button" type="button" disabled={teamBusy || !nameDirty || !draftName.trim()} onClick={() => void saveTeamName(team)}>Salvar nome</button><button className="app-secondary-button" type="button" disabled={teamBusy} onClick={() => void toggleTeamStatus(team)}>{team.status === "active" ? "Arquivar" : "Reativar"}</button></div>}
                    </header>
                    <div className="app-settings-team-members">
                      <div className="app-settings-team-members-heading"><strong>Membros</strong><span>{team.members.length} vinculado{team.members.length === 1 ? "" : "s"}</span></div>
                      {!canReadUsers ? <p>Os vínculos existem, mas seu perfil não pode consultar a lista completa de usuários.</p> : members.length === 0 ? <p>Nenhum membro disponível para vínculo.</p> : <div className="app-settings-team-member-grid">
                        {members.map((member) => {
                          const assigned = team.members.some((item) => item.membershipId === member.membershipId);
                          const eligible = memberEligibleForTeam(member);
                          const busy = teamBusyKey === `${team.id}:${member.membershipId}`;
                          return <label key={member.membershipId} className={!eligible ? "is-disabled" : ""}>
                            <input type="checkbox" checked={assigned} disabled={!canManageTeams || team.status !== "active" || !eligible || Boolean(teamBusyKey)} onChange={() => void toggleTeamMember(team, member)}/>
                            <span><strong>{member.displayName}</strong><small>{member.email} · {membershipStatusLabel(member.membershipStatus)}{busy ? " · salvando..." : ""}</small></span>
                          </label>;
                        })}
                      </div>}
                      {team.status === "archived" && <small className="app-settings-team-note">Equipe arquivada: vínculos preservados em modo somente leitura.</small>}
                    </div>
                  </article>;
                })}
              </div>}
            </>}
          </section>

          <section className="app-data-card app-settings-card app-settings-roles-card">
            <header><div><UsersIcon/><span><strong>Perfis e permissões</strong><small>Defina o que cada perfil pode fazer e em qual alcance.</small></span></div><em>{canReadRoles ? `${roles.length} ${roles.length === 1 ? "perfil" : "perfis"}` : "Sem permissão"}</em></header>
            {!canReadRoles ? <div className="app-settings-teams-no-access"><p>Seu perfil não possui permissão para visualizar os perfis de acesso desta organização.</p></div> : <>
              {canManageRoles && <form className="app-settings-role-create" onSubmit={(event) => { event.preventDefault(); void createRole(); }}>
                <label><span>Novo perfil</span><input value={newRoleName} maxLength={120} disabled={creatingRole} onChange={(event) => setNewRoleName(event.target.value)} placeholder="Ex.: Corretor, Gestor comercial, Financeiro"/></label>
                <label><span>Descrição</span><input value={newRoleDescription} maxLength={500} disabled={creatingRole} onChange={(event) => setNewRoleDescription(event.target.value)} placeholder="Resumo das responsabilidades deste perfil"/></label>
                <button className="app-primary-button" type="submit" disabled={creatingRole || !newRoleName.trim()}>{creatingRole ? "Criando..." : "Criar perfil"}</button>
              </form>}

              {peopleLoading ? <div className="app-settings-members-loading"><span className="app-spinner"/><p>Carregando perfis...</p></div> : roles.length === 0 ? <div className="app-settings-members-empty"><UsersIcon/><strong>Nenhum perfil encontrado</strong><p>Crie um perfil para organizar permissões e acessos dos usuários.</p></div> : <div className="app-settings-role-list">
                {roles.map((role) => {
                  const draft = roleDrafts[role.id] ?? roleDraft(role);
                  const roleBusy = roleBusyKey === `role:${role.id}`;
                  const roleAssignedToCurrent = role.memberIds.includes(currentMembershipId);
                  const definitionLocked = role.systemManaged || roleAssignedToCurrent;
                  const dirtyRole = !definitionLocked && roleIsDirty(role, draft);
                  return <article key={role.id} className={`app-settings-role${role.systemManaged ? " is-system" : ""}`}>
                    <header>
                      <div className="app-settings-role-title">
                        <span className="app-settings-member-avatar" aria-hidden="true">{initials(role.name)}</span>
                        <label><span>Nome do perfil</span><input value={draft.name} maxLength={120} disabled={!canManageRoles || definitionLocked || roleBusy} onChange={(event) => setRoleDraftField(role.id, "name", event.target.value)}/></label>
                        <em className={`app-settings-role-badge${role.systemManaged ? " is-system" : roleAssignedToCurrent ? " is-self" : ""}`}>{role.systemManaged ? "Sistema" : roleAssignedToCurrent ? "Em uso por você" : "Personalizado"}</em>
                      </div>
                      {canManageRoles && !definitionLocked && <button className="app-secondary-button" type="button" disabled={roleBusy || !dirtyRole || !draft.name.trim()} onClick={() => void saveRole(role)}>{roleBusy ? "Salvando..." : "Salvar perfil"}</button>}
                    </header>

                    <div className="app-settings-role-body">
                      <label className="app-settings-role-description"><span>Descrição</span><textarea value={draft.description} maxLength={500} rows={2} disabled={!canManageRoles || definitionLocked || roleBusy} onChange={(event) => setRoleDraftField(role.id, "description", event.target.value)} placeholder="Responsabilidades e limites deste perfil."/></label>

                      <div className="app-settings-role-permissions">
                        <div className="app-settings-role-subheading"><strong>Permissões</strong><span>{role.grants.length} configurada{role.grants.length === 1 ? "" : "s"}</span></div>
                        {!canReadPermissions ? <p>O catálogo de permissões não está disponível para este perfil.</p> : definitionLocked ? <div className="app-settings-role-grant-summary">
                          {role.grants.map((grant) => <span key={`${grant.permissionCode}:${grant.scope}`}><strong>{grant.permissionCode}</strong><small>{scopeLabel(grant.scope)}</small></span>)}
                        </div> : <div className="app-settings-permission-groups">
                          {permissionGroups.map(([group, groupPermissions]) => <details key={group}>
                            <summary><strong>{group}</strong><span>{groupPermissions.filter((permission) => Boolean(draft.grants[permission.code])).length}/{groupPermissions.length}</span></summary>
                            <div className="app-settings-permission-list">
                              {groupPermissions.map((permission) => <label key={permission.code}>
                                <span><strong>{permission.code}</strong><small>{permission.description}</small></span>
                                <select value={draft.grants[permission.code] ?? ""} disabled={!canManageRoles || roleBusy} onChange={(event) => setRoleGrant(role.id, permission.code, event.target.value as OrganizationAccessScope | "")}>
                                  <option value="">Sem acesso</option>
                                  <option value="own">Próprio</option>
                                  <option value="team">Equipe</option>
                                  <option value="organization">Organização</option>
                                </select>
                              </label>)}
                            </div>
                          </details>)}
                        </div>}
                        {role.systemManaged && <small className="app-settings-role-note">Perfil estrutural protegido: as permissões são mantidas pelo sistema.</small>}
                        {!role.systemManaged && roleAssignedToCurrent && <small className="app-settings-role-note">Este perfil está atribuído ao seu próprio acesso. Outra pessoa administradora deve alterá-lo, evitando que você remova permissões necessárias para continuar administrando a organização.</small>}
                      </div>

                      <div className="app-settings-role-members">
                        <div className="app-settings-role-subheading"><strong>Membros com este perfil</strong><span>{role.memberIds.length} vinculado{role.memberIds.length === 1 ? "" : "s"}</span></div>
                        {!canReadUsers ? <p>Os vínculos existem, mas seu perfil não pode consultar a lista completa de usuários.</p> : members.length === 0 ? <p>Nenhum membro disponível.</p> : <div className="app-settings-team-member-grid">
                          {members.map((member) => {
                            const assigned = role.memberIds.includes(member.membershipId);
                            const eligible = memberEligibleForTeam(member);
                            const isCurrent = member.membershipId === currentMembershipId;
                            const busy = roleBusyKey === `${role.id}:${member.membershipId}`;
                            const disabled = !canManageRoles || Boolean(roleBusyKey) || isCurrent || (!assigned && !eligible);
                            return <label key={member.membershipId} className={!eligible && !assigned ? "is-disabled" : ""}>
                              <input type="checkbox" checked={assigned} disabled={disabled} onChange={() => void toggleRoleMember(role, member)}/>
                              <span><strong>{member.displayName}{isCurrent ? " · Você" : ""}</strong><small>{member.email} · {membershipStatusLabel(member.membershipStatus)}{busy ? " · salvando..." : ""}</small></span>
                            </label>;
                          })}
                        </div>}
                        <small className="app-settings-role-note">Os perfis do seu próprio acesso não podem ser atribuídos nem removidos nesta tela, evitando autoelevação ou perda acidental de permissões.</small>
                      </div>
                    </div>
                  </article>;
                })}
              </div>}
            </>}
          </section>
        </>}
        {section === "operational" && <>{canReadFunnels && <section className="app-data-card app-settings-card app-settings-operational-card">
          <header><div><SettingsIcon/><span><strong>Funis</strong><small>Personalize etapas, campos obrigatórios, probabilidades, cores e motivos de perda.</small></span></div><em>{canManageFunnels ? "Editável" : "Somente leitura"}</em></header>
          {operationalLoading ? <div className="app-settings-members-loading"><span className="app-spinner"/><p>Carregando funis...</p></div> : operationalFunnels.length === 0 ? <div className="app-settings-members-empty"><SettingsIcon/><strong>Nenhum funil disponível</strong><p>Os funis estruturais da organização ainda não foram encontrados.</p></div> : <div className="app-settings-operational-funnels">
            {operationalFunnels.map((funnel) => {
              const draft = operationalDrafts[funnel.id] ?? operationalFunnelDraft(funnel);
              const busy = operationalBusyId === funnel.id;
              const collapsed = collapsedOperationalFunnels.has(funnel.id);
              const dirtyFunnel = operationalFunnelDirty(funnel, draft);
              const stages = [...draft.stages].sort((a, b) => a.position - b.position);
              const archivedStages = funnel.stages.filter((stage) => stage.status === "archived").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
              const newStageDraft = newStageDrafts[funnel.id] ?? { name: "", probability: "", color: "#64748B" };
              return <article key={funnel.id} className="app-settings-operational-funnel">
                <header>
                  <div><button className="app-settings-operational-code" type="button" aria-expanded={!collapsed} onClick={() => setCollapsedOperationalFunnels((current) => { const next = new Set(current); if (next.has(funnel.id)) next.delete(funnel.id); else next.add(funnel.id); return next; })}><span>{funnel.code === "buyers" ? "Compradores" : funnel.code === "capture" ? "Captação" : funnel.code}</span><b aria-hidden="true">{collapsed ? "+" : "−"}</b></button><label><span>Nome do funil</span><input value={draft.name} maxLength={120} disabled={!canManageFunnels || busy} onChange={(event) => setOperationalFunnelName(funnel.id, event.target.value)}/></label></div>
                  {canManageFunnels && <button className="app-primary-button" type="button" disabled={busy || !dirtyFunnel || !draft.name.trim() || stages.some((stage) => !stage.name.trim())} onClick={() => void saveOperationalFunnel(funnel)}>{busy ? "Salvando..." : "Salvar funil"}</button>}
                </header>
                {!collapsed && <div className="app-settings-operational-funnel-body">
                {canManageFunnels && <div className="app-settings-operational-stage-create">
                  <label><span>Nova etapa</span><input value={newStageDraft.name} maxLength={120} disabled={Boolean(stageBusyKey)} onChange={(event) => setNewStageDrafts((current) => ({ ...current, [funnel.id]: { ...newStageDraft, name: event.target.value } }))} placeholder="Ex.: Em negociação"/></label>
                  <label><span>Probabilidade inicial</span><div className="app-settings-operational-probability"><input type="number" min="0" max="100" step="1" value={newStageDraft.probability} disabled={Boolean(stageBusyKey)} onChange={(event) => setNewStageDrafts((current) => ({ ...current, [funnel.id]: { ...newStageDraft, probability: event.target.value } }))}/><b>%</b></div></label>
                  <label><span>Cor</span><div className="app-settings-operational-color"><input type="color" value={newStageDraft.color} disabled={Boolean(stageBusyKey)} onChange={(event) => setNewStageDrafts((current) => ({ ...current, [funnel.id]: { ...newStageDraft, color: event.target.value.toUpperCase() } }))}/><code>{newStageDraft.color.toUpperCase()}</code></div></label>
                  <button type="button" className="app-secondary-button" disabled={Boolean(stageBusyKey) || !newStageDraft.name.trim() || (newStageDraft.probability !== "" && (Number.isNaN(Number(newStageDraft.probability)) || Number(newStageDraft.probability) < 0 || Number(newStageDraft.probability) > 100))} onClick={() => void createOperationalStage(funnel.id)}>{stageBusyKey === `${funnel.id}:new` ? "Criando..." : "Adicionar etapa"}</button>
                </div>}
                <div className="app-settings-operational-stage-head"><span>Ordem</span><span>Etapa</span><span>Probabilidade</span><span>Cor</span><span>Ações</span></div>
                <div className="app-settings-operational-stages">
                  {stages.map((stage, index) => {
                    const terminal = outcomeLabel(stage.outcome);
                    const stageBusy = stageBusyKey === stage.id;
                    return <div className="app-settings-operational-stage" key={stage.id}>
                      <div className="app-settings-operational-order"><strong>{index + 1}</strong><span><button type="button" disabled={!canManageFunnels || busy || Boolean(stageBusyKey) || index === 0} onClick={() => moveOperationalStage(funnel.id, stage.id, -1)} aria-label={`Mover ${stage.name} para cima`}>↑</button><button type="button" disabled={!canManageFunnels || busy || Boolean(stageBusyKey) || index === stages.length - 1} onClick={() => moveOperationalStage(funnel.id, stage.id, 1)} aria-label={`Mover ${stage.name} para baixo`}>↓</button></span></div>
                      <label><span>Nome</span><input value={stage.name} maxLength={120} disabled={!canManageFunnels || busy || Boolean(stageBusyKey)} onChange={(event) => setOperationalStage(funnel.id, stage.id, { name: event.target.value })}/><small>{terminal ? `${terminal} · etapa estrutural de encerramento` : stage.code}</small></label>
                      <label><span>Probabilidade</span><div className="app-settings-operational-probability"><input type="number" min="0" max="100" step="1" value={stage.probability ?? ""} disabled={!canManageFunnels || busy || Boolean(stageBusyKey)} onChange={(event) => setOperationalStage(funnel.id, stage.id, { probability: event.target.value === "" ? null : Number(event.target.value) })}/><b>%</b></div></label>
                      <label><span>Cor</span><div className="app-settings-operational-color"><input type="color" value={stage.color} disabled={!canManageFunnels || busy || Boolean(stageBusyKey)} onChange={(event) => setOperationalStage(funnel.id, stage.id, { color: event.target.value.toUpperCase() })}/><code>{stage.color.toUpperCase()}</code></div></label>
                      <div className="app-settings-operational-stage-action">{terminal ? <span>Protegida</span> : canManageFunnels ? <button type="button" className="app-secondary-button" disabled={busy || Boolean(stageBusyKey)} onClick={() => void toggleOperationalStageStatus(funnel.id, stage)}>{stageBusy ? "Arquivando..." : "Arquivar"}</button> : <span>Ativa</span>}</div>
                      <div className="app-settings-operational-required"><span>Campos obrigatórios para entrar nesta etapa</span><div>{operationalRequiredFieldOptions.map((option) => <label key={option.value}><input type="checkbox" checked={stage.requiredFields.includes(option.value)} disabled={!canManageFunnels || busy || Boolean(stageBusyKey)} onChange={() => toggleOperationalRequiredField(funnel.id, stage.id, option.value)}/><span>{option.label}</span></label>)}</div></div>
                    </div>;
                  })}
                </div>
                {archivedStages.length > 0 && <section className="app-settings-archived-stages">
                  <div className="app-settings-role-subheading"><strong>Etapas arquivadas</strong><span>{archivedStages.length}</span></div>
                  <div>{archivedStages.map((stage) => <div key={stage.id}><span><strong>{stage.name}</strong><small>{stage.code}</small></span>{canManageFunnels && <button type="button" className="app-secondary-button" disabled={Boolean(stageBusyKey)} onClick={() => void toggleOperationalStageStatus(funnel.id, stage)}>{stageBusyKey === stage.id ? "Reativando..." : "Reativar"}</button>}</div>)}</div>
                  <small className="app-settings-role-note">Uma etapa reativada volta antes das etapas de encerramento. Depois, ajuste a ordem e salve o funil.</small>
                </section>}
                <section className="app-settings-loss-reasons">
                  <div className="app-settings-role-subheading"><strong>Motivos de perda</strong><span>{funnel.lossReasons.filter((reason) => reason.status === "active").length} ativos</span></div>
                  {canManageFunnels && <div className="app-settings-loss-reason-create"><input value={newLossReasonNames[funnel.id] ?? ""} maxLength={120} disabled={Boolean(lossReasonBusyKey)} onChange={(event) => setNewLossReasonNames((current) => ({ ...current, [funnel.id]: event.target.value }))} placeholder="Novo motivo de perda"/><button type="button" className="app-secondary-button" disabled={Boolean(lossReasonBusyKey) || !(newLossReasonNames[funnel.id] ?? "").trim()} onClick={() => void createLossReason(funnel.id)}>Adicionar</button></div>}
                  <div className="app-settings-loss-reason-list">{funnel.lossReasons.map((reason) => {
                    const reasonBusy = lossReasonBusyKey === reason.id;
                    const reasonName = lossReasonDraftNames[reason.id] ?? reason.name;
                    return <div key={reason.id} className={reason.status === "archived" ? "is-archived" : ""}><input value={reasonName} maxLength={120} disabled={!canManageFunnels || Boolean(lossReasonBusyKey)} onChange={(event) => setLossReasonDraftNames((current) => ({ ...current, [reason.id]: event.target.value }))}/><span>{reason.status === "active" ? "Ativo" : "Arquivado"}</span>{canManageFunnels && <><button type="button" className="app-secondary-button" disabled={Boolean(lossReasonBusyKey) || !reasonName.trim() || reasonName.trim() === reason.name} onClick={() => void saveLossReason(funnel.id, reason)}>{reasonBusy ? "Salvando..." : "Salvar"}</button><button type="button" className="app-secondary-button" disabled={Boolean(lossReasonBusyKey)} onClick={() => void toggleLossReasonStatus(funnel.id, reason)}>{reason.status === "active" ? "Arquivar" : "Reativar"}</button></>}</div>;
                  })}</div>
                  <small className="app-settings-role-note">Oportunidades encerradas preservam o texto do motivo usado naquele momento, mesmo se o catálogo mudar depois.</small>
                </section>
                <small className="app-settings-role-note">Etapas de encerramento são protegidas. Uma etapa com oportunidades vinculadas só pode ser arquivada depois que esses registros forem movidos para outra etapa.</small></div>}
              </article>;
            })}
          </div>}
        </section>}
        {canReadLeadDistribution && <section className="app-data-card app-settings-card app-settings-lead-distribution-card">
          <header><div><UsersIcon/><span><strong>Distribuição de leads</strong><small>Defina como cada intenção recebe um responsável na central de Leads do Site.</small></span></div><em>{canManageLeadDistribution ? "Editável" : "Somente leitura"}</em></header>
          {operationalLoading && !leadDistribution ? <div className="app-settings-members-loading"><span className="app-spinner"/><p>Carregando distribuição...</p></div> : !leadDistribution || !leadDistributionDraftState ? <div className="app-settings-members-empty"><UsersIcon/><strong>Distribuição indisponível</strong><p>Não foi possível carregar as políticas de distribuição desta organização.</p></div> : <div className="app-settings-lead-distribution-body">
            <div className="app-settings-lead-distribution-grid">
              {([
                ["buyer", "Compradores / locatários", "Leads de interesse em compra ou locação."],
                ["capture", "Proprietários / captação", "Leads de proprietários interessados em anunciar ou captar um imóvel."],
              ] as const).map(([intentKey, title, description]) => {
                const draftPolicy = leadDistributionDraftState[intentKey];
                const selectedTeam = draftPolicy.teamId ? leadDistribution.teams.find((team) => team.id === draftPolicy.teamId) ?? null : null;
                const eligibleMembers = selectedTeam?.members ?? leadDistribution.members;
                const collapsedPolicy = collapsedLeadPolicies.has(intentKey);
                return <article key={intentKey} className="app-settings-lead-distribution-policy">
                  <button type="button" className="app-settings-lead-distribution-policy-heading" aria-expanded={!collapsedPolicy} onClick={() => setCollapsedLeadPolicies((current) => { const next = new Set(current); if (next.has(intentKey)) next.delete(intentKey); else next.add(intentKey); return next; })}><span className={`app-intent app-intent--${intentKey}`}>{intentKey === "buyer" ? "Compradores" : "Captação"}</span><div><strong>{title}</strong><small>{description}</small></div><b aria-hidden="true">{collapsedPolicy ? "+" : "−"}</b></button>
                  {!collapsedPolicy && <div className="app-settings-lead-distribution-policy-body">
                  <div className="app-settings-lead-distribution-fields">
                    <label><span>Modo de distribuição</span><select value={draftPolicy.mode} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], mode: event.target.value === "round_robin" ? "round_robin" : "manual" } } : current)}><option value="manual">Manual</option><option value="round_robin">Rodízio</option></select></label>
                    <label><span>Equipe padrão</span><select value={draftPolicy.teamId ?? ""} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], teamId: event.target.value || null } } : current)}><option value="">Toda a organização</option>{leadDistribution.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                    <label><span>SLA de 1ª resposta</span><div className="app-settings-lead-sla-input"><input type="number" min={5} max={10080} step={5} value={draftPolicy.slaFirstResponseMinutes} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], slaFirstResponseMinutes: Number(event.target.value) } } : current)}/><em>min</em></div></label>
                  </div>
                  <div className="app-settings-lead-distribution-summary"><strong>{eligibleMembers.length} {eligibleMembers.length === 1 ? "membro ativo elegível" : "membros ativos elegíveis"} no fallback</strong><span>{draftPolicy.mode === "round_robin" ? "O rodízio usa primeiro um plantão ativo; depois a primeira regra avançada compatível; sem combinação, usa a equipe padrão." : "A atribuição será manual; as regras ficam preservadas para quando o rodízio estiver ativo."}</span>{selectedTeam && <small>Equipe padrão: {selectedTeam.name}</small>}<small>SLA: {draftPolicy.slaFirstResponseMinutes} min para a primeira resposta.</small><small>Aviso operacional aos 80% do prazo e vencimento aos 100%. Cada lead preserva o SLA vigente no momento em que foi recebido.</small></div>
                  {draftPolicy.mode === "round_robin" && eligibleMembers.length === 0 && <div className="app-inline-error">Adicione pelo menos um membro ativo à equipe padrão ou use toda a organização antes de ativar o rodízio.</div>}
                  <section className="app-settings-lead-rules app-settings-lead-duty">
                    <div className="app-settings-lead-rules-heading"><div><strong>Plantões semanais</strong><span>Faixas recorrentes no fuso da organização. Plantão ativo tem prioridade sobre regras avançadas e fallback.</span></div>{canManageLeadDistribution && <div><button type="button" className="app-secondary-button" disabled={leadDistributionBusy || leadDistribution.teams.length === 0 || draftPolicy.dutyWindows.length >= 20} onClick={() => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], dutyWindows: [...current[intentKey].dutyWindows, { weekday: 1, startTime: "08:00", endTime: "18:00", teamId: leadDistribution.teams[0]?.id ?? "" }] } } : current)}>+ Adicionar plantão</button></div>}</div>
                    {draftPolicy.dutyWindows.length === 0 ? <div className="app-settings-lead-rules-empty">Nenhum plantão configurado. Clique em “+ Adicionar plantão” para definir dia da semana, horário inicial, horário final e equipe responsável.</div> : <div className="app-settings-lead-rules-list">{draftPolicy.dutyWindows.map((duty, dutyIndex) => <div key={`${intentKey}-duty-${dutyIndex}`} className="app-settings-lead-duty-row"><span className="app-settings-lead-rule-priority">{dutyIndex + 1}</span><label className="app-settings-lead-duty-field"><span>Dia</span><select aria-label="Dia do plantão" value={duty.weekday} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const dutyWindows = [...current[intentKey].dutyWindows]; dutyWindows[dutyIndex] = { ...duty, weekday: Number(event.target.value) }; return { ...current, [intentKey]: { ...current[intentKey], dutyWindows } }; })}>{leadDistributionWeekdays.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="app-settings-lead-duty-field app-settings-lead-duty-field--time"><span>Início</span><input aria-label="Início do plantão" type="time" value={duty.startTime} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const dutyWindows = [...current[intentKey].dutyWindows]; dutyWindows[dutyIndex] = { ...duty, startTime: event.target.value }; return { ...current, [intentKey]: { ...current[intentKey], dutyWindows } }; })}/></label><label className="app-settings-lead-duty-field app-settings-lead-duty-field--time"><span>Fim</span><input aria-label="Fim do plantão" type="time" value={duty.endTime} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const dutyWindows = [...current[intentKey].dutyWindows]; dutyWindows[dutyIndex] = { ...duty, endTime: event.target.value }; return { ...current, [intentKey]: { ...current[intentKey], dutyWindows } }; })}/></label><label className="app-settings-lead-duty-field app-settings-lead-duty-field--team"><span>Equipe</span><select aria-label="Equipe do plantão" value={duty.teamId} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const dutyWindows = [...current[intentKey].dutyWindows]; dutyWindows[dutyIndex] = { ...duty, teamId: event.target.value }; return { ...current, [intentKey]: { ...current[intentKey], dutyWindows } }; })}>{leadDistribution.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>{canManageLeadDistribution && <button type="button" className="app-secondary-button" disabled={leadDistributionBusy} onClick={() => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], dutyWindows: current[intentKey].dutyWindows.filter((_, index) => index !== dutyIndex) } } : current)}>Remover</button>}</div>)}</div>}
                    {draftPolicy.dutyWindows.some((duty) => { const team = leadDistribution.teams.find((item) => item.id === duty.teamId); return Boolean(team && team.members.length === 0); }) && <small className="app-settings-lead-duty-note">Se uma equipe de plantão ficar sem membro ativo elegível, o motor tenta a próxima rota aplicável antes de falhar.</small>}
                  </section>
                  <section className="app-settings-lead-rules">
                    <div className="app-settings-lead-rules-heading"><div><strong>Regras avançadas</strong><span>Prioridade de cima para baixo. A primeira combinação define a equipe do rodízio.</span></div>{canManageLeadDistribution && <div><button type="button" className="app-secondary-button" disabled={leadDistributionBusy || leadDistribution.teams.length === 0 || draftPolicy.rules.length >= 20} onClick={() => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], rules: [...current[intentKey].rules, { kind: "region", regionState: "", regionCity: null, propertyType: null, teamId: leadDistribution.teams[0]?.id ?? "" }] } } : current)}>+ Região</button><button type="button" className="app-secondary-button" disabled={leadDistributionBusy || leadDistribution.teams.length === 0 || draftPolicy.rules.length >= 20} onClick={() => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], rules: [...current[intentKey].rules, { kind: "property_type", regionState: null, regionCity: null, propertyType: "apartment", teamId: leadDistribution.teams[0]?.id ?? "" }] } } : current)}>+ Tipo de imóvel</button></div>}</div>
                    {draftPolicy.rules.length === 0 ? <div className="app-settings-lead-rules-empty">Nenhuma regra avançada. O rodízio usa a equipe padrão.</div> : <div className="app-settings-lead-rules-list">{draftPolicy.rules.map((rule, ruleIndex) => <div key={`${intentKey}-${ruleIndex}`} className="app-settings-lead-rule-row"><span className="app-settings-lead-rule-priority">{ruleIndex + 1}</span><select value={rule.kind} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const rules = [...current[intentKey].rules]; const nextKind = event.target.value === "property_type" ? "property_type" : "region"; rules[ruleIndex] = nextKind === "region" ? { kind: "region", regionState: "", regionCity: null, propertyType: null, teamId: rule.teamId } : { kind: "property_type", regionState: null, regionCity: null, propertyType: "apartment", teamId: rule.teamId }; return { ...current, [intentKey]: { ...current[intentKey], rules } }; })}><option value="region">Região</option><option value="property_type">Tipo de imóvel</option></select>{rule.kind === "region" ? <><input aria-label="UF da regra" maxLength={2} placeholder="UF" value={rule.regionState ?? ""} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const rules = [...current[intentKey].rules]; rules[ruleIndex] = { ...rule, regionState: event.target.value.toUpperCase() }; return { ...current, [intentKey]: { ...current[intentKey], rules } }; })}/><input aria-label="Cidade da regra" maxLength={120} placeholder="Cidade (opcional)" value={rule.regionCity ?? ""} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const rules = [...current[intentKey].rules]; rules[ruleIndex] = { ...rule, regionCity: event.target.value || null }; return { ...current, [intentKey]: { ...current[intentKey], rules } }; })}/></> : <select value={rule.propertyType ?? "apartment"} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const rules = [...current[intentKey].rules]; rules[ruleIndex] = { ...rule, propertyType: event.target.value as OrganizationLeadDistributionPropertyType }; return { ...current, [intentKey]: { ...current[intentKey], rules } }; })}>{leadDistributionPropertyTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}<select aria-label="Equipe da regra" value={rule.teamId} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const rules = [...current[intentKey].rules]; rules[ruleIndex] = { ...rule, teamId: event.target.value }; return { ...current, [intentKey]: { ...current[intentKey], rules } }; })}>{leadDistribution.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>{canManageLeadDistribution && <button type="button" className="app-secondary-button" disabled={leadDistributionBusy} onClick={() => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], rules: current[intentKey].rules.filter((_, index) => index !== ruleIndex) } } : current)}>Remover</button>}</div>)}</div>}
                  </section></div>}
                </article>;
              })}
            </div>
            <div className="app-settings-lead-distribution-footer"><p>Plantões ativos têm prioridade sobre regras avançadas; regras avançadas têm prioridade sobre a equipe padrão. Rotas sem membro elegível são puladas; usuários suspensos/arquivados são excluídos e salvar a configuração reinicia os cursores aplicáveis.</p>{canManageLeadDistribution && <button className="app-primary-button" type="button" disabled={leadDistributionBusy || !leadDistributionDirty(leadDistribution, leadDistributionDraftState) || leadDistributionDraftInvalid(leadDistribution, leadDistributionDraftState)} onClick={() => void saveLeadDistribution()}>{leadDistributionBusy ? "Salvando..." : "Salvar distribuição"}</button>}</div>
          </div>}
        </section>}
        </>}
      </div>
    </section>
  </>;
}
