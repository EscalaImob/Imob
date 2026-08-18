import { useEffect, useMemo, useState } from "react";
import { AppApiError } from "../../services/appApi";
import {
  addOrganizationRoleMember,
  addOrganizationTeamMember,
  createOrganizationOperationalFunnelStage,
  createOrganizationOperationalLossReason,
  createOrganizationRole,
  createOrganizationTeam,
  getOrganizationLeadDistribution,
  getOrganizationSettings,
  inviteOrganizationMembers,
  listOrganizationMembers,
  listOrganizationOperationalFunnels,
  listOrganizationPermissions,
  listOrganizationRoles,
  listOrganizationTeams,
  removeOrganizationRoleMember,
  removeOrganizationTeamMember,
  requestOrganizationMemberAccessReset,
  updateOrganizationMemberStatus,
  updateOrganizationLeadDistribution,
  updateOrganizationOperationalFunnel,
  updateOrganizationOperationalFunnelStageStatus,
  updateOrganizationOperationalLossReason,
  updateOrganizationRole,
  updateOrganizationSettings,
  updateOrganizationTeam,
  type ManagedOrganizationMembershipStatus,
  type OrganizationAccessScope,
  type OrganizationMember,
  type OrganizationMembershipStatus,
  type OrganizationLeadDistributionPropertyType,
  type OrganizationLeadDistributionSettings,
  type OrganizationLeadDistributionSettingsUpdate,
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
import { BuildingIcon, SettingsIcon, UsersIcon } from "../icons";

interface Props {
  organizationId: string;
  currentMembershipId: string;
  canUpdate: boolean;
  canReadUsers: boolean;
  canUpdateUsers: boolean;
  canInviteUsers: boolean;
  canReadTeams: boolean;
  canManageTeams: boolean;
  canReadRoles: boolean;
  canManageRoles: boolean;
  canReadPermissions: boolean;
  canReadFunnels: boolean;
  canManageFunnels: boolean;
  canReadLeadDistribution: boolean;
  canManageLeadDistribution: boolean;
  onUpdated: () => Promise<void> | void;
}

type SettingsSection = "company" | "people" | "operational";

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

function leadDistributionDraft(settings: OrganizationLeadDistributionSettings): OrganizationLeadDistributionSettingsUpdate {
  const policy = (intent: "buyer" | "capture") => {
    const current = settings.policies.find((item) => item.intent === intent);
    return {
      mode: current?.mode ?? "manual", teamId: current?.teamId ?? null, slaFirstResponseMinutes: current?.slaFirstResponseMinutes ?? 30,
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
    return policy.rules.some((rule) => {
      const team = settings.teams.find((item) => item.id === rule.teamId);
      if (!team || (policy.mode === "round_robin" && team.members.length === 0)) return true;
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

function toDraft(settings: OrganizationSettings): OrganizationSettingsUpdate {
  return {
    name: settings.name,
    legalName: settings.legalName,
    timezone: settings.timezone,
  };
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

export function SettingsPage({
  organizationId,
  currentMembershipId,
  canUpdate,
  canReadUsers,
  canUpdateUsers,
  canInviteUsers,
  canReadTeams,
  canManageTeams,
  canReadRoles,
  canManageRoles,
  canReadPermissions,
  canReadFunnels,
  canManageFunnels,
  canReadLeadDistribution,
  canManageLeadDistribution,
  onUpdated,
}: Props) {
  const [section, setSection] = useState<SettingsSection>("company");
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [draft, setDraft] = useState<OrganizationSettingsUpdate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [teams, setTeams] = useState<OrganizationTeam[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
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
    return draft.name.trim() !== settings.name || (draft.legalName?.trim() || null) !== settings.legalName || draft.timezone !== settings.timezone;
  }, [draft, settings]);

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

  function replaceTeam(updated: OrganizationTeam) {
    setTeams((current) => sortTeams(current.some((item) => item.id === updated.id)
      ? current.map((item) => item.id === updated.id ? updated : item)
      : [...current, updated]));
    setTeamDraftNames((current) => ({ ...current, [updated.id]: updated.name }));
  }

  async function save() {
    if (!draft || saving || !canUpdate) return;
    if (!draft.name.trim()) {
      setError("Informe o nome da organização.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateOrganizationSettings(organizationId, {
        name: draft.name.trim(),
        legalName: draft.legalName?.trim() || null,
        timezone: draft.timezone,
      });
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
    </section>

    <section className="app-settings-layout">
      <aside className="app-data-card app-settings-menu" aria-label="Seções das configurações">
        <button type="button" className={section === "company" ? "is-active" : ""} onClick={() => setSection("company")}><BuildingIcon/><span><strong>Empresa</strong><small>Dados básicos da organização</small></span></button>
        <button type="button" className={section === "people" ? "is-active" : ""} disabled={!canReadUsers && !canReadTeams && !canReadRoles && !canReadPermissions} onClick={() => setSection("people")}><UsersIcon/><span><strong>Usuários e equipes</strong><small>{canReadUsers || canReadTeams || canReadRoles || canReadPermissions ? "Acessos, times e permissões" : "Sem permissão"}</small></span></button>
        <button type="button" className={section === "operational" ? "is-active" : ""} disabled={!canReadFunnels && !canReadLeadDistribution} onClick={() => setSection("operational")}><SettingsIcon/><span><strong>Preferências operacionais</strong><small>{canReadFunnels || canReadLeadDistribution ? "Funis, distribuição e regras" : "Sem permissão"}</small></span></button>
      </aside>

      <div className="app-settings-content">
        {error && <div className="app-inline-error">{error}</div>}
        {success && <div className="app-inline-success">{success}</div>}

        {section === "company" && (loading || !settings || !draft ? <section className="app-data-card app-settings-loading"><span className="app-spinner"/><p>Carregando configurações...</p></section> : <>
          <section className="app-data-card app-settings-card">
            <header><div><BuildingIcon/><span><strong>Dados da empresa</strong><small>Informações usadas em toda a operação.</small></span></div>{!canUpdate && <em>Somente leitura</em>}</header>
            <div className="app-settings-form">
              <label><span>Nome da organização *</span><input value={draft.name} maxLength={160} disabled={!canUpdate || saving} onChange={(event) => setField("name", event.target.value)}/><small>Nome exibido no sistema e na seleção de organização.</small></label>
              <label><span>Razão social</span><input value={draft.legalName ?? ""} maxLength={200} disabled={!canUpdate || saving} onChange={(event) => setField("legalName", event.target.value || null)} placeholder="Razão social da empresa"/><small>Nome jurídico da organização, quando aplicável.</small></label>
              <label className="is-wide"><span>Fuso horário *</span><select value={draft.timezone} disabled={!canUpdate || saving} onChange={(event) => setField("timezone", event.target.value)}>{!timezoneKnown && <option value={draft.timezone}>{draft.timezone}</option>}{timezoneOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>Usado para datas, agenda, vencimentos e indicadores operacionais.</small></label>
            </div>
          </section>

          <section className="app-data-card app-settings-card app-settings-technical">
            <header><div><SettingsIcon/><span><strong>Identidade técnica</strong><small>Dados estruturais preservados pelo sistema.</small></span></div></header>
            <div className="app-settings-technical-grid"><span><small>Slug</small><strong>{settings.slug}</strong><p>Identificador estável da organização.</p></span><span><small>Status da organização</small><strong><em className={`app-settings-status is-${settings.status}`}>{statusLabel(settings.status)}</em></strong><p>O status estrutural não é alterado nesta tela.</p></span></div>
          </section>
        </>)}

        {section === "people" && <>
          {canReadUsers && <section className="app-data-card app-settings-card app-settings-members-card">
            <header><div><UsersIcon/><span><strong>Usuários da organização</strong><small>Convide pessoas, controle status e recupere acessos.</small></span></div><em>{members.length} {members.length === 1 ? "membro" : "membros"}</em></header>
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
                  <div className="app-settings-member-avatar" aria-hidden="true">{initials(member.displayName)}</div>
                  <div className="app-settings-member-identification"><strong>{member.displayName}{isCurrent && <em>Você</em>}</strong><span>{member.email}</span></div>
                  <span className={`app-settings-member-status is-${member.membershipStatus}`}>{membershipStatusLabel(member.membershipStatus)}</span>
                  <div className="app-settings-member-controls">
                    <label className="app-settings-member-action"><span>Status de acesso</span><select value={member.membershipStatus} disabled={!canUpdateUsers || isCurrent || updating || accessBusy} onChange={(event) => void setMemberStatus(member, event.target.value as ManagedOrganizationMembershipStatus)}>{member.membershipStatus === "invited" && <option value="invited" disabled>Convidado</option>}<option value="active">Ativo</option><option value="suspended">Suspenso</option><option value="archived">Arquivado</option></select>{isCurrent && <small>Seu próprio status não é alterado nesta tela.</small>}</label>
                    <div className="app-settings-member-access-actions">
                      {member.membershipStatus === "invited" && canInviteUsers && <button className="app-secondary-button" type="button" disabled={accessBusy || invitingMember} onClick={() => void inviteMember(member.email)}>{accessBusy ? "Enviando..." : "Reenviar convite"}</button>}
                      {canResetAccess && <button className="app-secondary-button" type="button" disabled={accessBusy || invitingMember} onClick={() => void requestAccessReset(member)}>{accessBusy ? "Solicitando..." : "Redefinir acesso"}</button>}
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
              const dirtyFunnel = operationalFunnelDirty(funnel, draft);
              const stages = [...draft.stages].sort((a, b) => a.position - b.position);
              const archivedStages = funnel.stages.filter((stage) => stage.status === "archived").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
              const newStageDraft = newStageDrafts[funnel.id] ?? { name: "", probability: "", color: "#64748B" };
              return <article key={funnel.id} className="app-settings-operational-funnel">
                <header>
                  <div><span className="app-settings-operational-code">{funnel.code === "buyers" ? "Compradores" : funnel.code === "capture" ? "Captação" : funnel.code}</span><label><span>Nome do funil</span><input value={draft.name} maxLength={120} disabled={!canManageFunnels || busy} onChange={(event) => setOperationalFunnelName(funnel.id, event.target.value)}/></label></div>
                  {canManageFunnels && <button className="app-primary-button" type="button" disabled={busy || !dirtyFunnel || !draft.name.trim() || stages.some((stage) => !stage.name.trim())} onClick={() => void saveOperationalFunnel(funnel)}>{busy ? "Salvando..." : "Salvar funil"}</button>}
                </header>
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
                <small className="app-settings-role-note">Etapas de encerramento são protegidas. Uma etapa com oportunidades vinculadas só pode ser arquivada depois que esses registros forem movidos para outra etapa.</small>
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
                return <article key={intentKey} className="app-settings-lead-distribution-policy">
                  <div className="app-settings-lead-distribution-policy-heading"><span className={`app-intent app-intent--${intentKey}`}>{intentKey === "buyer" ? "Compradores" : "Captação"}</span><div><strong>{title}</strong><small>{description}</small></div></div>
                  <div className="app-settings-lead-distribution-fields">
                    <label><span>Modo de distribuição</span><select value={draftPolicy.mode} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], mode: event.target.value === "round_robin" ? "round_robin" : "manual" } } : current)}><option value="manual">Manual</option><option value="round_robin">Rodízio</option></select></label>
                    <label><span>Equipe padrão</span><select value={draftPolicy.teamId ?? ""} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], teamId: event.target.value || null } } : current)}><option value="">Toda a organização</option>{leadDistribution.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                    <label><span>SLA de 1ª resposta</span><div className="app-settings-lead-sla-input"><input type="number" min={5} max={10080} step={5} value={draftPolicy.slaFirstResponseMinutes} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], slaFirstResponseMinutes: Number(event.target.value) } } : current)}/><em>min</em></div></label>
                  </div>
                  <div className="app-settings-lead-distribution-summary"><strong>{eligibleMembers.length} {eligibleMembers.length === 1 ? "membro ativo elegível" : "membros ativos elegíveis"} no fallback</strong><span>{draftPolicy.mode === "round_robin" ? "O rodízio usa primeiro a regra avançada que combinar com o contexto; sem combinação, usa a equipe padrão." : "A atribuição será manual; as regras ficam preservadas para quando o rodízio estiver ativo."}</span>{selectedTeam && <small>Equipe padrão: {selectedTeam.name}</small>}<small>SLA: {draftPolicy.slaFirstResponseMinutes} min para a primeira resposta.</small></div>
                  {draftPolicy.mode === "round_robin" && eligibleMembers.length === 0 && <div className="app-inline-error">Adicione pelo menos um membro ativo à equipe padrão ou use toda a organização antes de ativar o rodízio.</div>}
                  <section className="app-settings-lead-rules">
                    <div className="app-settings-lead-rules-heading"><div><strong>Regras avançadas</strong><span>Prioridade de cima para baixo. A primeira combinação define a equipe do rodízio.</span></div>{canManageLeadDistribution && <div><button type="button" className="app-secondary-button" disabled={leadDistributionBusy || leadDistribution.teams.length === 0 || draftPolicy.rules.length >= 20} onClick={() => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], rules: [...current[intentKey].rules, { kind: "region", regionState: "", regionCity: null, propertyType: null, teamId: leadDistribution.teams[0]?.id ?? "" }] } } : current)}>+ Região</button><button type="button" className="app-secondary-button" disabled={leadDistributionBusy || leadDistribution.teams.length === 0 || draftPolicy.rules.length >= 20} onClick={() => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], rules: [...current[intentKey].rules, { kind: "property_type", regionState: null, regionCity: null, propertyType: "apartment", teamId: leadDistribution.teams[0]?.id ?? "" }] } } : current)}>+ Tipo de imóvel</button></div>}</div>
                    {draftPolicy.rules.length === 0 ? <div className="app-settings-lead-rules-empty">Nenhuma regra avançada. O rodízio usa a equipe padrão.</div> : <div className="app-settings-lead-rules-list">{draftPolicy.rules.map((rule, ruleIndex) => <div key={`${intentKey}-${ruleIndex}`} className="app-settings-lead-rule-row"><span className="app-settings-lead-rule-priority">{ruleIndex + 1}</span><select value={rule.kind} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const rules = [...current[intentKey].rules]; const nextKind = event.target.value === "property_type" ? "property_type" : "region"; rules[ruleIndex] = nextKind === "region" ? { kind: "region", regionState: "", regionCity: null, propertyType: null, teamId: rule.teamId } : { kind: "property_type", regionState: null, regionCity: null, propertyType: "apartment", teamId: rule.teamId }; return { ...current, [intentKey]: { ...current[intentKey], rules } }; })}><option value="region">Região</option><option value="property_type">Tipo de imóvel</option></select>{rule.kind === "region" ? <><input aria-label="UF da regra" maxLength={2} placeholder="UF" value={rule.regionState ?? ""} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const rules = [...current[intentKey].rules]; rules[ruleIndex] = { ...rule, regionState: event.target.value.toUpperCase() }; return { ...current, [intentKey]: { ...current[intentKey], rules } }; })}/><input aria-label="Cidade da regra" maxLength={120} placeholder="Cidade (opcional)" value={rule.regionCity ?? ""} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const rules = [...current[intentKey].rules]; rules[ruleIndex] = { ...rule, regionCity: event.target.value || null }; return { ...current, [intentKey]: { ...current[intentKey], rules } }; })}/></> : <select value={rule.propertyType ?? "apartment"} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const rules = [...current[intentKey].rules]; rules[ruleIndex] = { ...rule, propertyType: event.target.value as OrganizationLeadDistributionPropertyType }; return { ...current, [intentKey]: { ...current[intentKey], rules } }; })}>{leadDistributionPropertyTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}<select aria-label="Equipe da regra" value={rule.teamId} disabled={!canManageLeadDistribution || leadDistributionBusy} onChange={(event) => setLeadDistributionDraftState((current) => { if (!current) return current; const rules = [...current[intentKey].rules]; rules[ruleIndex] = { ...rule, teamId: event.target.value }; return { ...current, [intentKey]: { ...current[intentKey], rules } }; })}>{leadDistribution.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>{canManageLeadDistribution && <button type="button" className="app-secondary-button" disabled={leadDistributionBusy} onClick={() => setLeadDistributionDraftState((current) => current ? { ...current, [intentKey]: { ...current[intentKey], rules: current[intentKey].rules.filter((_, index) => index !== ruleIndex) } } : current)}>Remover</button>}</div>)}</div>}
                  </section>
                </article>;
              })}
            </div>
            <div className="app-settings-lead-distribution-footer"><p>Regras avançadas valem para o rodízio e têm prioridade sobre a equipe padrão. Usuários suspensos/arquivados são excluídos; alterar a configuração reinicia os cursores aplicáveis.</p>{canManageLeadDistribution && <button className="app-primary-button" type="button" disabled={leadDistributionBusy || !leadDistributionDirty(leadDistribution, leadDistributionDraftState) || leadDistributionDraftInvalid(leadDistribution, leadDistributionDraftState)} onClick={() => void saveLeadDistribution()}>{leadDistributionBusy ? "Salvando..." : "Salvar distribuição"}</button>}</div>
          </div>}
        </section>}
        </>}
      </div>
    </section>
  </>;
}
