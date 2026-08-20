import { useEffect, useMemo, useState } from "react";
import { AppApiError } from "../../services/appApi";
import { createSalesGoal, getSalesGoals, updateSalesGoal, type SalesGoalInput, type SalesGoalMetric, type SalesGoalProgress, type SalesGoalScopeType, type SalesGoalsDashboard } from "../../services/salesGoalsApi";
import { TargetIcon } from "../icons";

interface Props { organizationId: string; canManage: boolean; }
const metrics: Array<{ value: SalesGoalMetric; label: string; unit: "currency" | "count" }> = [
  { value: "vgv", label: "VGV", unit: "currency" },
  { value: "revenue_commission", label: "Receita / comissão", unit: "currency" },
  { value: "sales_count", label: "Quantidade de vendas", unit: "count" },
  { value: "rentals_count", label: "Locações", unit: "count" },
  { value: "properties_captured", label: "Imóveis captados", unit: "count" },
  { value: "exclusive_contracts", label: "Contratos exclusivos", unit: "count" },
  { value: "visits", label: "Visitas realizadas", unit: "count" },
];
function currentMonth() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function periodStart(month: string) { return `${month}-01`; }
function periodLabel(value: string) { const date = new Date(`${value}T12:00:00`); return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date); }
function formatValue(goal: Pick<SalesGoalProgress, "unit"> & { value: string }, currency: SalesGoalsDashboard["currency"]) { const number = Number(goal.value); if (goal.unit === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 }).format(number || 0); return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(number || 0); }
function metricMeta(metric: SalesGoalMetric) { return metrics.find((item) => item.value === metric) ?? metrics[0]; }
function scopeTypeLabel(scope: SalesGoalScopeType) { return scope === "organization" ? "Empresa" : scope === "team" ? "Equipe" : "Usuário"; }
function progressTone(goal: SalesGoalProgress) { if (goal.achieved) return "achieved"; if (Number(goal.projectionValue) >= Number(goal.targetValue)) return "on-track"; return "behind"; }

function GoalModal({ dashboard, goal, saving, error, onClose, onSave }: { dashboard: SalesGoalsDashboard; goal: SalesGoalProgress | null; saving: boolean; error: string | null; onClose: () => void; onSave: (input: SalesGoalInput) => void; }) {
  const defaultScope: SalesGoalScopeType = dashboard.permissionScope === "organization" ? "organization" : dashboard.permissionScope === "team" && dashboard.teams.length ? "team" : "member";
  const [metric, setMetric] = useState<SalesGoalMetric>(goal?.metric ?? "vgv");
  const [scopeType, setScopeType] = useState<SalesGoalScopeType>(goal?.scopeType ?? defaultScope);
  const [teamId, setTeamId] = useState(goal?.teamId ?? dashboard.teams[0]?.id ?? "");
  const [membershipId, setMembershipId] = useState(goal?.membershipId ?? dashboard.members[0]?.id ?? "");
  const [targetValue, setTargetValue] = useState(goal?.targetValue ?? "");
  const meta = metricMeta(metric);
  const canChooseOrganization = dashboard.permissionScope === "organization";
  const canChooseTeam = dashboard.permissionScope !== "own" && dashboard.teams.length > 0;
  const canChooseMember = dashboard.members.length > 0;
  const validTarget = Number(targetValue) > 0;
  const targetSelected = scopeType === "organization" || (scopeType === "team" ? Boolean(teamId) : Boolean(membershipId));
  return <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="app-modal app-goal-modal" role="dialog" aria-modal="true" aria-labelledby="goal-modal-title">
      <header><div><span className="app-section-eyebrow">Meu painel · Metas de vendas</span><h2 id="goal-modal-title">{goal ? "Editar meta" : "Nova meta"}</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Fechar">×</button></header>
      <form onSubmit={(event) => { event.preventDefault(); if (!validTarget || !targetSelected) return; onSave({ metric, scopeType, teamId: scopeType === "team" ? teamId : null, membershipId: scopeType === "member" ? membershipId : null, periodStart: dashboard.periodStart, targetValue }); }}>
        {error && <div className="app-inline-error">{error}</div>}
        <div className="app-goal-form-grid">
          <label><span>Tipo de meta *</span><select value={metric} onChange={(event) => setMetric(event.target.value as SalesGoalMetric)}>{metrics.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>Período</span><input value={periodLabel(dashboard.periodStart)} disabled /></label>
          <label><span>Escopo *</span><select value={scopeType} onChange={(event) => setScopeType(event.target.value as SalesGoalScopeType)}>{canChooseOrganization && <option value="organization">Empresa</option>}{canChooseTeam && <option value="team">Equipe</option>}{canChooseMember && <option value="member">Usuário</option>}</select></label>
          {scopeType === "team" ? <label><span>Equipe *</span><select value={teamId} onChange={(event) => setTeamId(event.target.value)}>{dashboard.teams.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label> : scopeType === "member" ? <label><span>Usuário *</span><select value={membershipId} onChange={(event) => setMembershipId(event.target.value)}>{dashboard.members.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label> : <label><span>Referência</span><input value="Toda a organização" disabled /></label>}
          <label className="app-goal-target-field"><span>Objetivo mensal *</span><input type="number" min={meta.unit === "count" ? "1" : "0.01"} step={meta.unit === "count" ? "1" : "0.01"} value={targetValue} onChange={(event) => setTargetValue(event.target.value)} placeholder={meta.unit === "currency" ? "Ex.: 500000" : "Ex.: 10"}/><small>{meta.unit === "currency" ? `Valor na moeda ${dashboard.currency}.` : "Quantidade realizada no mês."}</small></label>
        </div>
        <footer><button type="button" className="app-secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="app-primary-button" disabled={saving || !validTarget || !targetSelected}>{saving ? "Salvando..." : goal ? "Salvar alteração" : "Criar meta"}</button></footer>
      </form>
    </section>
  </div>;
}

export function GoalsPage({ organizationId, canManage }: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [dashboard, setDashboard] = useState<SalesGoalsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricFilter, setMetricFilter] = useState<"all" | SalesGoalMetric>("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | SalesGoalScopeType>("all");
  const [editing, setEditing] = useState<SalesGoalProgress | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  async function load() { setLoading(true); setError(null); try { setDashboard(await getSalesGoals(organizationId, periodStart(month))); } catch (loadError) { setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as metas de vendas."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [organizationId, month]);

  const visibleGoals = useMemo(() => (dashboard?.goals ?? []).filter((goal) => (metricFilter === "all" || goal.metric === metricFilter) && (scopeFilter === "all" || goal.scopeType === scopeFilter)), [dashboard, metricFilter, scopeFilter]);
  const summary = useMemo(() => { const goals = dashboard?.goals ?? []; return { total: goals.length, achieved: goals.filter((goal) => goal.achieved).length, onTrack: goals.filter((goal) => !goal.achieved && Number(goal.projectionValue) >= Number(goal.targetValue)).length, behind: goals.filter((goal) => !goal.achieved && Number(goal.projectionValue) < Number(goal.targetValue)).length }; }, [dashboard]);

  async function saveGoal(input: SalesGoalInput) {
    if (!dashboard) return; setSaving(true); setModalError(null);
    try { if (editing) await updateSalesGoal(organizationId, editing.id, input); else await createSalesGoal(organizationId, input); setEditing(undefined); await load(); }
    catch (saveError) { setModalError(saveError instanceof AppApiError ? saveError.message : "Não foi possível salvar a meta."); }
    finally { setSaving(false); }
  }

  return <>
    <section className="app-page-heading app-goals-heading"><div><span className="app-section-eyebrow">Meu painel</span><h1>Metas de vendas</h1><p>Defina objetivos mensais e acompanhe o realizado por empresa, equipe ou usuário.</p></div>{canManage && <button className="app-primary-button" type="button" onClick={() => { setModalError(null); setEditing(null); }} disabled={!dashboard}>+ Nova meta</button>}</section>
    <section className="app-context-banner app-goals-context"><TargetIcon/><div><strong>Acompanhamento mensal de resultado</strong><p>O realizado é calculado a partir de negócios confirmados, transações liquidadas, captações e visitas concluídas.</p></div><span>{dashboard ? `Atualizado ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(dashboard.generatedAt))}` : ""}</span></section>
    <section className="app-filter-panel app-goals-filters"><label><span>Mês</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><label><span>Tipo de meta</span><select value={metricFilter} onChange={(event) => setMetricFilter(event.target.value as "all" | SalesGoalMetric)}><option value="all">Todos os tipos</option>{metrics.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}</select></label><label><span>Escopo</span><select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as "all" | SalesGoalScopeType)}><option value="all">Todos os escopos</option><option value="organization">Empresa</option><option value="team">Equipe</option><option value="member">Usuário</option></select></label><strong className="app-goals-period-label">{periodLabel(periodStart(month))}</strong></section>
    {error && <div className="app-inline-error">{error}</div>}
    {loading && !dashboard ? <section className="app-data-card"><div className="app-table-empty"><span className="app-spinner"/>Carregando metas...</div></section> : dashboard && <>
      <section className="app-metrics app-metrics--compact app-goals-metrics"><article className="app-metric-card"><span>Metas definidas</span><strong>{summary.total}</strong><small>No mês selecionado</small></article><article className="app-metric-card is-success"><span>Atingidas</span><strong>{summary.achieved}</strong><small>Realizado ≥ objetivo</small></article><article className="app-metric-card"><span>Em ritmo</span><strong>{summary.onTrack}</strong><small>Projeção alcança a meta</small></article><article className="app-metric-card is-danger"><span>Abaixo da projeção</span><strong>{summary.behind}</strong><small>Exigem acompanhamento</small></article></section>
      {!visibleGoals.length ? <section className="app-data-card app-goals-empty"><TargetIcon/><strong>Nenhuma meta definida para este filtro</strong><span>{canManage ? "Crie a primeira meta do mês para começar o acompanhamento." : "Não há metas disponíveis no seu escopo para este período."}</span>{canManage && <button className="app-secondary-button" type="button" onClick={() => setEditing(null)}>Criar meta</button>}</section> : <section className="app-goals-grid">{visibleGoals.map((goal) => { const tone = progressTone(goal); const capped = Math.max(0, Math.min(goal.percentage, 100)); return <article className={`app-data-card app-goal-card is-${tone}`} key={goal.id}><header><div><span>{scopeTypeLabel(goal.scopeType)} · {goal.scopeLabel}</span><strong>{goal.metricLabel}</strong></div><em>{goal.achieved ? "Atingida" : tone === "on-track" ? "Em ritmo" : "Atenção"}</em></header><div className="app-goal-progress"><div><span>Realizado</span><strong>{formatValue({ unit: goal.unit, value: goal.actualValue }, dashboard.currency)}</strong><small>de {formatValue({ unit: goal.unit, value: goal.targetValue }, dashboard.currency)}</small></div><b>{goal.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b><div className="app-goal-progress__track"><i style={{ width: `${capped}%` }} /></div></div><div className="app-goal-details"><span><small>Saldo restante</small><strong>{formatValue({ unit: goal.unit, value: goal.remainingValue }, dashboard.currency)}</strong></span><span><small>Projeção do mês</small><strong>{formatValue({ unit: goal.unit, value: goal.projectionValue }, dashboard.currency)}</strong></span><span><small>Mês anterior</small><strong>{formatValue({ unit: goal.unit, value: goal.previousActualValue }, dashboard.currency)}</strong></span><span><small>Comparação</small><strong>{goal.trendPercent === null ? "—" : `${goal.trendPercent > 0 ? "+" : ""}${goal.trendPercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</strong></span></div>{canManage && <footer><button className="app-secondary-button" type="button" onClick={() => { setModalError(null); setEditing(goal); }}>Editar meta</button></footer>}</article>; })}</section>}
      <section className="app-data-card app-goals-history"><header><div><strong>Histórico de metas</strong><span>Últimos seis meses anteriores ao período selecionado.</span></div></header>{!dashboard.history.length ? <div className="app-soft-empty">Ainda não há metas anteriores no seu escopo.</div> : <div className="app-goals-history-table"><header><span>Período</span><span>Meta</span><span>Escopo</span><span>Objetivo</span><span>Realizado</span><span>Resultado</span></header>{dashboard.history.map((goal) => <div key={goal.id}><span>{periodLabel(goal.periodStart)}</span><span><strong>{goal.metricLabel}</strong></span><span>{goal.scopeLabel}</span><span>{formatValue({ unit: goal.unit, value: goal.targetValue }, dashboard.currency)}</span><span>{formatValue({ unit: goal.unit, value: goal.actualValue }, dashboard.currency)}</span><span><em className={goal.achieved ? "is-achieved" : ""}>{goal.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</em></span></div>)}</div>}</section>
    </>}
    {editing !== undefined && dashboard && <GoalModal dashboard={dashboard} goal={editing} saving={saving} error={modalError} onClose={() => { if (!saving) setEditing(undefined); }} onSave={(input) => void saveGoal(input)} />}
  </>;
}
