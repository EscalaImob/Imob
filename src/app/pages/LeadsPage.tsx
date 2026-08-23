import { useEffect, useMemo, useState, type FormEvent } from "react";
import { clearAuthSession } from "../../auth/session";
import { AppApiError } from "../../services/appApi";
import {
  assignLead,
  createLead,
  convertLead,
  distributeLead,
  listLeads,
  recordLeadFirstResponse,
  updateLead,
  type LeadAssignmentResult,
  type LeadListItem,
  type LeadStatus,
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
function formatTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function slaLabel(item: LeadListResult["items"][number]): string {
  switch (item.sla.state) {
    case "warning": return `atenção · até ${formatTime(item.sla.dueAt)}`;
    case "breached": return "SLA vencido";
    case "responded_on_time": return "Respondido no prazo";
    case "responded_late": return "Respondido com atraso";
    case "closed": return "SLA encerrado";
    default: return `até ${formatTime(item.sla.dueAt)}`;
  }
}

function slaClassName(item: LeadListResult["items"][number]): string {
  if (item.sla.state === "warning") return "app-lead-sla is-warning";
  if (item.sla.state === "breached" || item.sla.state === "responded_late") return "app-lead-sla is-breached";
  if (item.sla.state === "responded_on_time") return "app-lead-sla is-responded";
  if (item.sla.state === "closed") return "app-lead-sla is-closed";
  return "app-lead-sla";
}

function slaCaption(item: LeadListResult["items"][number]): string {
  if (item.sla.firstResponseAt) {
    const elapsed = item.sla.firstResponseElapsedMinutes === null ? "" : ` · ${item.sla.firstResponseElapsedMinutes} min`;
    return `1ª resposta ${formatTime(item.sla.firstResponseAt)}${elapsed}`;
  }
  if (item.sla.notifications.breach) return `Vencimento notificado · ${item.sla.firstResponseMinutes} min`;
  if (item.sla.notifications.warning) return `Aviso emitido · ${item.sla.firstResponseMinutes} min`;
  return `Aviso aos 80% · ${item.sla.firstResponseMinutes} min`;
}

function policyForIntent(
  settings: OrganizationLeadDistributionSettings | null,
  intent: "buyer" | "capture",
): OrganizationLeadDistributionPolicy | null {
  return settings?.policies.find((policy) => policy.intent === intent) ?? null;
}

function LeadCreateModal({ organizationId, onClose, onSaved }: { organizationId: string; onClose: () => void; onSaved: () => void }) {
  const [intent, setIntent] = useState<"buyer" | "capture">("buyer"); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!name.trim() || (!email.trim() && !phone.trim()) || saving) return; setSaving(true); setError(null); try { await createLead(organizationId, { intent, source: "manual", name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, message: message.trim() || null, campaign: null, sourcePage: null, propertyType: null, regionCity: null, regionState: null, relatedPropertyId: null }); onSaved(); } catch (saveError) { setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível criar o lead."); } finally { setSaving(false); } }
  return <div className="app-modal-backdrop"><section className="app-modal" role="dialog" aria-modal="true"><header className="app-modal__header"><div><span className="app-section-eyebrow">Leads</span><h2>Novo lead</h2></div><button type="button" onClick={onClose} disabled={saving}>×</button></header><form onSubmit={submit}><div className="app-modal__body app-task-form-grid">{error && <div className="app-inline-error is-wide">{error}</div>}<label><span>Intenção</span><select value={intent} onChange={(event) => setIntent(event.target.value as "buyer" | "capture")}><option value="buyer">Comprador / locatário</option><option value="capture">Proprietário / captação</option></select></label><label className="is-wide"><span>Nome *</span><input value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></label><label><span>E-mail</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Telefone</span><input value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label className="is-wide"><span>Mensagem</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} /></label></div><footer className="app-modal__footer"><button type="button" className="app-secondary-button" onClick={onClose}>Fechar</button><button type="submit" className="app-primary-button" disabled={saving || !name.trim() || (!email.trim() && !phone.trim())}>{saving ? "Criando..." : "Criar lead"}</button></footer></form></section></div>;
}

function LeadEditModal({ organizationId, item, onClose, onSaved }: { organizationId: string; item: LeadListItem; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item.name);
  const [email, setEmail] = useState(item.email ?? "");
  const [phone, setPhone] = useState(item.phone ?? "");
  const [message, setMessage] = useState(item.message ?? "");
  const [status, setStatus] = useState<LeadStatus>(item.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!name.trim() || saving) return;
    setSaving(true); setError(null);
    try { await updateLead(organizationId, item.id, { name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, message: message.trim() || null, status }); onSaved(); }
    catch (saveError) { setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível atualizar o lead."); }
    finally { setSaving(false); }
  }
  return <div className="app-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="app-modal" role="dialog" aria-modal="true"><header className="app-modal__header"><div><span className="app-section-eyebrow">Lead</span><h2>Editar lead</h2></div><button type="button" onClick={onClose} disabled={saving}>×</button></header><form onSubmit={submit}><div className="app-modal__body app-task-form-grid">{error && <div className="app-inline-error is-wide">{error}</div>}<label className="is-wide"><span>Nome *</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required autoFocus /></label><label><span>E-mail</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} /></label><label><span>Telefone</span><input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={32} /></label><label className="is-wide"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as LeadStatus)} disabled={item.status === "converted"}><option value="new">Novo</option><option value="in_progress">Em atendimento</option><option value="invalid">Inválido</option><option value="duplicate">Duplicado</option><option value="spam">Spam</option><option value="archived">Arquivado</option>{item.status === "converted" && <option value="converted">Convertido</option>}</select></label><label className="is-wide"><span>Mensagem</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={4000} /></label></div><footer className="app-modal__footer"><button type="button" className="app-secondary-button" onClick={onClose} disabled={saving}>Fechar</button><button type="submit" className="app-primary-button" disabled={saving || !name.trim() || item.status === "converted"}>{saving ? "Salvando..." : "Salvar alterações"}</button></footer></form></section></div>;
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
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [editingLead, setEditingLead] = useState<LeadListItem | null>(null);
  const [creatingLead, setCreatingLead] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [organizationId, debouncedSearch, intent, status, page, canManage, reloadKey]);

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

  async function registerFirstResponse(leadId: string) {
    if (!canManage || busyLeadId) return;
    setBusyLeadId(leadId);
    setActionMessage(null);
    try {
      const result = await recordLeadFirstResponse(organizationId, leadId);
      const refreshed = await listLeads(organizationId, { search: debouncedSearch, intent, status, page });
      setData(refreshed);
      setAssignmentDrafts(Object.fromEntries(refreshed.items.map((item) => [item.id, item.responsible?.membershipId ?? ""])));
      setActionMessage({
        type: "success",
        text: result.sla.breached
          ? "Primeira resposta registrada. O SLA permaneceu marcado como vencido no histórico."
          : "Primeira resposta registrada dentro do SLA.",
      });
    } catch (responseError) {
      setActionMessage({ type: "error", text: responseError instanceof AppApiError ? responseError.message : "Não foi possível registrar a primeira resposta." });
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

  async function convertSelectedLead() {
    if (!canManage || !selectedLeadId || busyLeadId) return;
    const selected = data?.items.find((item) => item.id === selectedLeadId);
    if (!selected || (selected.status !== "new" && selected.status !== "in_progress")) return;
    if (!globalThis.confirm(`Converter o lead de ${selected.name} em cliente e oportunidade no funil?`)) return;
    setBusyLeadId(selected.id); setActionMessage(null);
    try { const result = await convertLead(organizationId, selected.id); setSelectedLeadId(""); setActionMessage({ type: "success", text: `Lead convertido. Cliente e oportunidade criados no funil ${result.funnelCode === "capture" ? "de captação" : "de compradores"}.` }); setReloadKey((value) => value + 1); }
    catch (conversionError) { setActionMessage({ type: "error", text: conversionError instanceof AppApiError ? conversionError.message : "Não foi possível converter o lead." }); }
    finally { setBusyLeadId(null); }
  }

  return (
    <>
      <section className="app-section-header">
        <div><span className="app-section-eyebrow">CRM & Vendas</span><h1>Leads do site</h1><p>Uma fila única com intenção identificada para compradores/locatários ou proprietários/captação.</p></div>
        <div className="app-page-heading__actions">{canManage && <button type="button" className="app-primary-button" onClick={() => setCreatingLead(true)}>+ Novo lead</button>}<div className="app-last-received"><span>Último recebido</span><strong>{summary.lastReceivedAt ? formatDateTime(summary.lastReceivedAt) : "—"}</strong></div></div>
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
        {canManage && data && data.items.length > 0 && <div className="app-filter-bar"><label><span>Gerenciar lead</span><select value={selectedLeadId} onChange={(event) => setSelectedLeadId(event.target.value)}><option value="">Selecione um lead</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {statusLabels.get(item.status) ?? item.status}</option>)}</select></label><button className="app-secondary-button" type="button" disabled={!selectedLeadId} onClick={() => setEditingLead(data.items.find((item) => item.id === selectedLeadId) ?? null)}>Abrir e editar</button><button className="app-primary-button" type="button" disabled={!selectedLeadId || Boolean(busyLeadId) || !["new", "in_progress"].includes(data.items.find((item) => item.id === selectedLeadId)?.status ?? "")} onClick={() => void convertSelectedLead()}>{busyLeadId === selectedLeadId ? "Convertendo..." : "Converter em oportunidade"}</button></div>}

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
              return <tr key={item.id}><td>{formatDateTime(item.receivedAt)}</td><td><strong>{item.name}</strong><small>{item.email || item.phone || "Sem contato informado"}</small></td><td><span className={`app-intent app-intent--${item.intent}`}>{item.intent === "capture" ? "Captação" : "Comprador"}</span></td><td><span className="app-lead-context">{contextParts.length ? contextParts.join(" · ") : "Sem contexto"}</span></td><td>{item.source}</td><td><span className="app-message-preview">{item.message || "—"}</span></td><td><span className={slaClassName(item)}>{slaLabel(item)}</span><small className="app-lead-sla-caption">{slaCaption(item)}</small></td><td><span className="app-lead-responsible">{item.responsible?.displayName ?? "Não atribuído"}</span></td><td><span className={`app-status app-status--${item.status}`}>{statusLabels.get(item.status) ?? item.status}</span></td>{canManage && <td><div className="app-lead-assignment-controls"><select aria-label={`Responsável por ${item.name}`} value={draftMembershipId} disabled={Boolean(busyLeadId)} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Sem responsável</option>{eligibleMembers.map((member) => <option key={member.membershipId} value={member.membershipId}>{member.displayName}</option>)}</select><div><button type="button" className="app-secondary-button" disabled={Boolean(busyLeadId) || !assignmentChanged} onClick={() => void saveAssignment(item.id)}>{busy ? "Salvando..." : "Atribuir"}</button>{policy?.mode === "round_robin" && <button type="button" className="app-secondary-button" disabled={Boolean(busyLeadId) || eligibleMembers.length === 0} onClick={() => void applyRoundRobin(item.id)}>{busy ? "Distribuindo..." : "Rodízio"}</button>}{!item.sla.firstResponseAt && (item.status === "new" || item.status === "in_progress") && <button type="button" className="app-secondary-button app-lead-first-response" disabled={Boolean(busyLeadId)} onClick={() => void registerFirstResponse(item.id)}>{busy ? "Registrando..." : "Registrar 1ª resposta"}</button>}</div><small>{item.sla.firstResponseAt ? "SLA de 1ª resposta encerrado e preservado" : policy ? `${policy.mode === "round_robin" ? "Rodízio" : "Manual"} · ${routingLabel}` : "Configuração indisponível"}</small></div></td>}</tr>;
            })}</tbody></table></div>
            <div className="app-pagination"><span>{data.totalItems} {data.totalItems === 1 ? "lead" : "leads"}</span><div><button type="button" disabled={data.page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><span>{data.page} / {data.totalPages}</span><button type="button" disabled={data.page >= data.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button></div></div>
          </>
        ) : <div className="app-list-empty"><GlobeIcon /><strong>{filtered ? "Nenhum lead encontrado" : "Nenhum lead recebido ainda"}</strong><span>{filtered ? "Ajuste ou limpe os filtros para tentar novamente." : "Os formulários do site alimentarão esta fila preservando intenção, origem e contexto."}</span></div>}
      </section>
      {editingLead && <LeadEditModal organizationId={organizationId} item={editingLead} onClose={() => setEditingLead(null)} onSaved={() => { setEditingLead(null); setSelectedLeadId(""); setActionMessage({ type: "success", text: "Lead atualizado com sucesso." }); setReloadKey((value) => value + 1); }} />}
      {creatingLead && <LeadCreateModal organizationId={organizationId} onClose={() => setCreatingLead(false)} onSaved={() => { setCreatingLead(false); setReloadKey((value) => value + 1); }} />}
    </>
  );
}
