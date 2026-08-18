import { useEffect, useMemo, useState } from "react";
import { clearAuthSession } from "../../auth/session";
import { AppApiError } from "../../services/appApi";
import {
  assignLead,
  distributeLead,
  listLeads,
  type LeadAssignmentResult,
  type LeadListResult,
} from "../../services/crmApi";
import {
  getOrganizationLeadDistribution,
  type OrganizationLeadDistributionPolicy,
  type OrganizationLeadDistributionSettings,
} from "../../services/organizationSettingsApi";
import { GlobeIcon, SearchIcon } from "../icons";

const statusLabels = new Map([
  ["new", "Novo"], ["in_progress", "Em atendimento"], ["converted", "Convertido"],
  ["invalid", "Inválido"], ["duplicate", "Duplicado"], ["spam", "Spam"], ["archived", "Arquivado"],
]);

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const propertyTypeLabels = new Map([
  ["apartment", "Apartamento"], ["house", "Casa"], ["commercial", "Comercial"], ["land", "Terreno"], ["rural", "Rural"],
  ["warehouse", "Galpão"], ["building", "Prédio"], ["room", "Sala"], ["other", "Outro"],
]);
function ruleMatchesLead(rule: OrganizationLeadDistributionPolicy["rules"][number], item: LeadListResult["items"][number]): boolean {
  if (rule.kind === "region") {
    if (!item.context.state || item.context.state.toUpperCase() !== rule.regionState) return false;
    return !rule.regionCity || Boolean(item.context.city && item.context.city.localeCompare(rule.regionCity, "pt-BR", { sensitivity: "base" }) === 0);
  }
  return Boolean(item.context.propertyType && item.context.propertyType === rule.propertyType);
}
function slaLabel(item: LeadListResult["items"][number]): string {
  if (item.sla.breached) return "SLA vencido";
  return `até ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.sla.dueAt))}`;
}

function policyForIntent(
  settings: OrganizationLeadDistributionSettings | null,
  intent: "buyer" | "capture",
): OrganizationLeadDistributionPolicy | null {
  return settings?.policies.find((policy) => policy.intent === intent) ?? null;
}

export function LeadsPage({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const [data, setData] = useState<LeadListResult | null>(null);
  const [distribution, setDistribution] = useState<OrganizationLeadDistributionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [intent, setIntent] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>(Object.create(null));
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => globalThis.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setActionMessage(null);
    const distributionPromise = canManage
      ? getOrganizationLeadDistribution(organizationId)
      : Promise.resolve<OrganizationLeadDistributionSettings | null>(null);
    void Promise.all([
      listLeads(organizationId, { search: debouncedSearch, intent, status, page }),
      distributionPromise,
    ])
      .then(([result, distributionResult]) => {
        if (!active) return;
        setData(result);
        setDistribution(distributionResult);
        setAssignmentDrafts(Object.fromEntries(result.items.map((item) => [item.id, item.responsible?.membershipId ?? ""])));
      })
      .catch((loadError) => {
        if (!active) return;
        if (loadError instanceof AppApiError && loadError.status === 401) {
          clearAuthSession();
          globalThis.location.replace("/login/");
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os leads.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, debouncedSearch, intent, status, page, canManage]);

  const filtered = Boolean(debouncedSearch || intent || status);
  const summary = data?.summary ?? { pending: 0, inProgress: 0, converted: 0, archived: 0, total: 0, lastReceivedAt: null, averageFirstResponseMinutes: null };
  const distributionByIntent = useMemo(() => new Map(distribution?.policies.map((policy) => [policy.intent, policy]) ?? []), [distribution]);

  function clearFilters() {
    setSearch(""); setDebouncedSearch(""); setIntent(""); setStatus(""); setPage(1);
  }

  function applyAssignmentResult(result: LeadAssignmentResult, message: string) {
    setData((current) => current ? {
      ...current,
      items: current.items.map((item) => item.id === result.id ? { ...item, responsible: result.responsible } : item),
    } : current);
    setAssignmentDrafts((current) => ({ ...current, [result.id]: result.membershipId ?? "" }));
    setActionMessage({ type: "success", text: message });
  }

  async function saveAssignment(leadId: string) {
    if (!canManage || busyLeadId) return;
    setBusyLeadId(leadId);
    setActionMessage(null);
    try {
      const membershipId = assignmentDrafts[leadId] || null;
      const result = await assignLead(organizationId, leadId, membershipId);
      applyAssignmentResult(
        result,
        result.responsible ? `Lead atribuído a ${result.responsible.displayName}.` : "Responsável removido do lead.",
      );
    } catch (assignmentError) {
      setActionMessage({ type: "error", text: assignmentError instanceof AppApiError ? assignmentError.message : "Não foi possível atribuir o lead." });
    } finally {
      setBusyLeadId(null);
    }
  }

  async function applyRoundRobin(leadId: string) {
    if (!canManage || busyLeadId) return;
    setBusyLeadId(leadId);
    setActionMessage(null);
    try {
      const result = await distributeLead(organizationId, leadId);
      applyAssignmentResult(result, result.responsible ? `Rodízio atribuiu o lead a ${result.responsible.displayName}.` : "Rodízio aplicado.");
    } catch (distributionError) {
      setActionMessage({ type: "error", text: distributionError instanceof AppApiError ? distributionError.message : "Não foi possível aplicar o rodízio." });
    } finally {
      setBusyLeadId(null);
    }
  }

  return (
    <>
      <section className="app-section-header">
        <div><span className="app-section-eyebrow">CRM & Vendas</span><h1>Leads do site</h1><p>Uma fila única com intenção identificada para compradores/locatários ou proprietários/captação.</p></div>
        <div className="app-last-received"><span>Último recebido</span><strong>{summary.lastReceivedAt ? formatDateTime(summary.lastReceivedAt) : "—"}</strong></div>
      </section>

      <section className="app-summary-cards" aria-label="Resumo de leads">
        <article><strong>{summary.pending}</strong><span>Pendentes</span></article>
        <article><strong>{summary.inProgress}</strong><span>Em atendimento</span></article>
        <article><strong>{summary.converted}</strong><span>Convertidos</span></article>
        <article><strong>{summary.archived}</strong><span>Arquivados</span></article>
        <article><strong>{summary.averageFirstResponseMinutes === null ? "—" : `${Math.round(summary.averageFirstResponseMinutes)} min`}</strong><span>Tempo médio de resposta</span></article>
      </section>

      <section className="app-list-card">
        <div className="app-filter-bar">
          <label className="app-filter-search"><SearchIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, e-mail, telefone ou mensagem..." /></label>
          <label><span>Intenção</span><select value={intent} onChange={(event) => { setIntent(event.target.value); setPage(1); }}><option value="">Todas</option><option value="buyer">Comprador / locatário</option><option value="capture">Proprietário / captação</option></select></label>
          <label><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todos</option><option value="new">Novos</option><option value="in_progress">Em atendimento</option><option value="converted">Convertidos</option><option value="invalid">Inválidos</option><option value="duplicate">Duplicados</option><option value="spam">Spam</option><option value="archived">Arquivados</option></select></label>
          <button className="app-filter-clear" type="button" onClick={clearFilters} disabled={!filtered}>Limpar</button>
        </div>

        {actionMessage && <div className={actionMessage.type === "error" ? "app-inline-error" : "app-inline-success"}>{actionMessage.text}</div>}
        {error ? <div className="app-inline-error">{error}</div> : loading && !data ? <div className="app-list-loading">Carregando leads...</div> : data && data.items.length > 0 ? (
          <>
            <div className="app-table-wrap"><table className="app-data-table app-leads-table"><thead><tr><th>Recebido</th><th>Lead</th><th>Intenção</th><th>Contexto</th><th>Origem</th><th>Mensagem</th><th>SLA</th><th>Responsável</th><th>Status</th>{canManage && <th>Atribuição</th>}</tr></thead><tbody>{data.items.map((item) => {
              const policy = distributionByIntent.get(item.intent) ?? null;
              const eligibleMembers = policy?.eligibleMembers ?? [];
              const matchedRule = policy?.rules.find((rule) => ruleMatchesLead(rule, item)) ?? null;
              const draftMembershipId = assignmentDrafts[item.id] ?? item.responsible?.membershipId ?? "";
              const assignmentChanged = draftMembershipId !== (item.responsible?.membershipId ?? "");
              const busy = busyLeadId === item.id;
              const contextParts = [item.context.propertyType ? propertyTypeLabels.get(item.context.propertyType) ?? item.context.propertyType : null, [item.context.city, item.context.state].filter(Boolean).join("/") || null].filter(Boolean);
              const routingLabel = matchedRule ? `Regra ${matchedRule.priority} · ${matchedRule.teamName}` : policy?.teamName ?? "Toda a organização";
              return <tr key={item.id}><td>{formatDateTime(item.receivedAt)}</td><td><strong>{item.name}</strong><small>{item.email || item.phone || "Sem contato informado"}</small></td><td><span className={`app-intent app-intent--${item.intent}`}>{item.intent === "capture" ? "Captação" : "Comprador"}</span></td><td><span className="app-lead-context">{contextParts.length ? contextParts.join(" · ") : "Sem contexto"}</span></td><td>{item.source}</td><td><span className="app-message-preview">{item.message || "—"}</span></td><td><span className={item.sla.breached ? "app-lead-sla is-breached" : "app-lead-sla"}>{slaLabel(item)}</span><small className="app-lead-sla-caption">{item.sla.firstResponseMinutes} min</small></td><td><span className="app-lead-responsible">{item.responsible?.displayName ?? "Não atribuído"}</span></td><td><span className={`app-status app-status--${item.status}`}>{statusLabels.get(item.status) ?? item.status}</span></td>{canManage && <td><div className="app-lead-assignment-controls"><select aria-label={`Responsável por ${item.name}`} value={draftMembershipId} disabled={Boolean(busyLeadId)} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Sem responsável</option>{eligibleMembers.map((member) => <option key={member.membershipId} value={member.membershipId}>{member.displayName}</option>)}</select><div><button type="button" className="app-secondary-button" disabled={Boolean(busyLeadId) || !assignmentChanged} onClick={() => void saveAssignment(item.id)}>{busy ? "Salvando..." : "Atribuir"}</button>{policy?.mode === "round_robin" && <button type="button" className="app-secondary-button" disabled={Boolean(busyLeadId) || eligibleMembers.length === 0} onClick={() => void applyRoundRobin(item.id)}>{busy ? "Distribuindo..." : "Rodízio"}</button>}</div><small>{policy ? `${policy.mode === "round_robin" ? "Rodízio" : "Manual"} · ${routingLabel}` : "Configuração indisponível"}</small></div></td>}</tr>;
            })}</tbody></table></div>
            <div className="app-pagination"><span>{data.totalItems} {data.totalItems === 1 ? "lead" : "leads"}</span><div><button type="button" disabled={data.page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><span>{data.page} / {data.totalPages}</span><button type="button" disabled={data.page >= data.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button></div></div>
          </>
        ) : <div className="app-list-empty"><GlobeIcon /><strong>{filtered ? "Nenhum lead encontrado" : "Nenhum lead recebido ainda"}</strong><span>{filtered ? "Ajuste ou limpe os filtros para tentar novamente." : "Os formulários do site alimentarão esta fila preservando intenção, origem e contexto."}</span></div>}
      </section>
    </>
  );
}
