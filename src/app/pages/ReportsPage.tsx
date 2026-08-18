import { useEffect, useMemo, useState } from "react";
import { AppApiError } from "../../services/appApi";
import { getOperationalReport, type OperationalCriticalItem, type OperationalCriticalItemKind, type OperationalReportFilters, type OperationalReportResult } from "../../services/reportsApi";
import { ChartIcon, ClipboardIcon, ContractIcon, DocumentIcon, PinIcon, TasksIcon } from "../icons";

interface Props { organizationId: string; }

function localIsoDate(date: Date) {
  const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function initialFilters(): OperationalReportFilters { const to = new Date(); const from = new Date(to); from.setDate(from.getDate() - 29); return { from: localIsoDate(from), to: localIsoDate(to), view: "all" }; }
function dateLabel(value: string | null | undefined) { if (!value) return "—"; const date = /^\d{4}-\d{2}-\d{2}$/u.test(value) ? new Date(`${value}T12:00:00`) : new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date); }
function dateTimeLabel(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date); }
function criticalKindLabel(kind: OperationalCriticalItemKind) { return ({ task: "Tarefa", visit: "Visita", authorization: "Autorização", authorization_document: "Documento", contract: "Contrato", inspection: "Laudo / vistoria" } as const)[kind]; }
function criticalHref(item: OperationalCriticalItem) { if (item.kind === "task") return "/app/tarefas/"; if (item.kind === "visit") return "/app/visitas/"; if (item.kind === "authorization" || item.kind === "authorization_document") return `/app/autorizacao/?id=${encodeURIComponent(item.id)}`; if (item.kind === "contract") return `/app/contrato/?id=${encodeURIComponent(item.id)}`; return `/app/vistoria/?id=${encodeURIComponent(item.id)}`; }
function csvCell(value: string | number | null | undefined) { let text = String(value ?? ""); if (/^[=+\-@]/u.test(text)) text = `'${text}`; return `"${text.replace(/"/gu, '""')}"`; }
function downloadCsv(report: OperationalReportResult) {
  const rows: Array<Array<string | number | null | undefined>> = [
    ["Relatório operacional"], ["Período", `${dateLabel(report.filters.from)} a ${dateLabel(report.filters.to)}`], ["Visão", report.filters.view === "mine" ? "Meus registros" : "Todos os registros autorizados"], ["Gerado em", dateTimeLabel(report.generatedAt)], [],
    ["Indicador", "Valor"],
    ["Tarefas com prazo no período", report.tasks.dueInPeriod], ["Tarefas concluídas no período", report.tasks.completedInPeriod], ["Tarefas pendentes no período", report.tasks.pendingInPeriod], ["Tarefas vencidas", report.tasks.overdueCurrent],
    ["Visitas no período", report.visits.totalInPeriod], ["Visitas realizadas", report.visits.completedInPeriod], ["Visitas vencidas", report.visits.overdueCurrent],
    ["Autorizações ativas", report.authorizations.activeCurrent], ["Autorizações a vencer em 30 dias", report.authorizations.expiringNext30Days], ["Autorizações vencidas", report.authorizations.expiredCurrent], ["Documentos de autorização pendentes", report.authorizations.documentsPendingCurrent],
    ["Contratos ativos", report.contracts.activeCurrent], ["Contratos a vencer em 30 dias", report.contracts.expiringNext30Days], ["Contratos vencidos", report.contracts.expiredCurrent],
    ["Laudos / vistorias em aberto", report.inspections.openCurrent], ["Laudos / vistorias concluídos no período", report.inspections.completedInPeriod], ["Laudos / vistorias vencidos", report.inspections.overdueCurrent], [],
    ["Pendências críticas"], ["Tipo", "Título", "Descrição", "Responsável", "Prazo", "Severidade"],
    ...report.criticalItems.map((item) => [criticalKindLabel(item.kind), item.title, item.description, item.responsibleName ?? "—", dateTimeLabel(item.dueAt), item.severity === "danger" ? "Crítica" : "Atenção"]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `relatorio-operacional-${report.filters.from}-a-${report.filters.to}.csv`; document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

export function ReportsPage({ organizationId }: Props) {
  const [filters, setFilters] = useState<OperationalReportFilters>(initialFilters);
  const [report, setReport] = useState<OperationalReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    void getOperationalReport(organizationId, filters).then(setReport).catch((loadError) => setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar os relatórios.")).finally(() => setLoading(false));
  }, [organizationId, filters]);

  const metrics = useMemo(() => report ? [
    { label: "Tarefas pendentes", value: report.tasks.pendingInPeriod, helper: `${report.tasks.overdueCurrent} vencida(s)`, tone: report.tasks.overdueCurrent ? "danger" : "default" },
    { label: "Visitas no período", value: report.visits.totalInPeriod, helper: `${report.visits.completedInPeriod} realizada(s)`, tone: "default" },
    { label: "Documentos pendentes", value: report.authorizations.documentsPendingCurrent, helper: "Autorizações sem PDF", tone: report.authorizations.documentsPendingCurrent ? "warning" : "default" },
    { label: "Autorizações a vencer", value: report.authorizations.expiringNext30Days, helper: "Próximos 30 dias", tone: report.authorizations.expiringNext30Days ? "warning" : "default" },
    { label: "Contratos a vencer", value: report.contracts.expiringNext30Days, helper: "Próximos 30 dias", tone: report.contracts.expiringNext30Days ? "warning" : "default" },
    { label: "Laudos em aberto", value: report.inspections.openCurrent, helper: `${report.inspections.overdueCurrent} vencido(s)`, tone: report.inspections.overdueCurrent ? "danger" : "default" },
  ] : [], [report]);

  return <>
    <section className="app-page-heading app-reports-heading">
      <div><span className="app-section-eyebrow">Gestão corporativa</span><h1>Relatórios</h1><p>Consolide indicadores operacionais, acompanhe pendências e exporte a visão filtrada.</p></div>
      <button className="app-primary-button" type="button" disabled={!report || loading} onClick={() => { if (report) downloadCsv(report); }}>Exportar CSV</button>
    </section>

    <section className="app-context-banner app-reports-context"><ChartIcon/><div><strong>Relatório operacional consolidado</strong><p>Este primeiro painel reúne tarefas, visitas, autorizações, contratos e laudos. Os demais relatórios gerenciais entram nos próximos blocos.</p></div>{report && <span>Atualizado {dateTimeLabel(report.generatedAt)}</span>}</section>

    <section className="app-filter-panel app-reports-filters">
      <label><span>De</span><input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}/></label>
      <label><span>Até</span><input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}/></label>
      <div className="app-segmented"><button type="button" className={filters.view === "all" ? "is-active" : ""} onClick={() => setFilters((current) => ({ ...current, view: "all" }))}>Todos</button><button type="button" className={filters.view === "mine" ? "is-active" : ""} onClick={() => setFilters((current) => ({ ...current, view: "mine" }))}>Meus</button></div>
      <span className="app-reports-period">{dateLabel(report?.filters.from ?? filters.from)} — {dateLabel(report?.filters.to ?? filters.to)}</span>
    </section>

    {error && <div className="app-inline-error">{error}</div>}
    {loading && !report ? <section className="app-data-card"><div className="app-table-empty"><span className="app-spinner"/>Carregando relatório operacional...</div></section> : report && <>
      <section className="app-metrics app-metrics--compact app-reports-metrics">{metrics.map((metric) => <article className={`app-metric-card app-report-metric is-${metric.tone}`} key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.helper}</small></article>)}</section>

      <section className="app-reports-module-grid">
        <article className="app-data-card app-report-module"><header><TasksIcon/><div><strong>Tarefas</strong><span>No período selecionado</span></div></header><div><span><small>Com prazo</small><strong>{report.tasks.dueInPeriod}</strong></span><span><small>Concluídas</small><strong>{report.tasks.completedInPeriod}</strong></span><span><small>Pendentes</small><strong>{report.tasks.pendingInPeriod}</strong></span><span><small>Vencidas agora</small><strong>{report.tasks.overdueCurrent}</strong></span></div><a href="/app/tarefas/">Abrir tarefas</a></article>
        <article className="app-data-card app-report-module"><header><PinIcon/><div><strong>Visitas</strong><span>No período selecionado</span></div></header><div><span><small>Total</small><strong>{report.visits.totalInPeriod}</strong></span><span><small>Agendadas</small><strong>{report.visits.scheduledInPeriod}</strong></span><span><small>Confirmadas</small><strong>{report.visits.confirmedInPeriod}</strong></span><span><small>Realizadas</small><strong>{report.visits.completedInPeriod}</strong></span></div><a href="/app/visitas/">Abrir visitas</a></article>
        <article className="app-data-card app-report-module"><header><DocumentIcon/><div><strong>Autorizações</strong><span>Situação atual</span></div></header><div><span><small>Ativas</small><strong>{report.authorizations.activeCurrent}</strong></span><span><small>A vencer</small><strong>{report.authorizations.expiringNext30Days}</strong></span><span><small>Vencidas</small><strong>{report.authorizations.expiredCurrent}</strong></span><span><small>Sem PDF</small><strong>{report.authorizations.documentsPendingCurrent}</strong></span></div><a href="/app/autorizacoes/">Abrir autorizações</a></article>
        <article className="app-data-card app-report-module"><header><ContractIcon/><div><strong>Contratos</strong><span>Situação atual</span></div></header><div><span><small>Ativos</small><strong>{report.contracts.activeCurrent}</strong></span><span><small>A vencer</small><strong>{report.contracts.expiringNext30Days}</strong></span><span><small>Vencidos</small><strong>{report.contracts.expiredCurrent}</strong></span><span><small>Janela</small><strong>30d</strong></span></div><a href="/app/contratos/">Abrir contratos</a></article>
        <article className="app-data-card app-report-module"><header><ClipboardIcon/><div><strong>Laudos & vistorias</strong><span>Situação atual e período</span></div></header><div><span><small>Em aberto</small><strong>{report.inspections.openCurrent}</strong></span><span><small>Em execução</small><strong>{report.inspections.inProgressCurrent}</strong></span><span><small>Em revisão</small><strong>{report.inspections.reviewCurrent}</strong></span><span><small>Concluídos</small><strong>{report.inspections.completedInPeriod}</strong></span></div><a href="/app/vistorias/">Abrir laudos</a></article>
      </section>

      <section className="app-data-card app-report-critical-card">
        <header><div><strong>Pendências críticas</strong><span>{report.criticalItems.length} item(ns) priorizado(s)</span></div><small>Vencimentos e bloqueios que exigem acompanhamento</small></header>
        {!report.criticalItems.length ? <div className="app-report-critical-empty"><ChartIcon/><strong>Nenhuma pendência crítica encontrada</strong><span>Não há itens prioritários dentro do escopo atual.</span></div> : <div className="app-report-critical-table"><header><span>Tipo</span><span>Item</span><span>Responsável</span><span>Prazo</span><span>Prioridade</span></header>{report.criticalItems.map((item) => <a href={criticalHref(item)} key={`${item.kind}-${item.id}`}><span>{criticalKindLabel(item.kind)}</span><span><strong>{item.title}</strong><small>{item.description}</small></span><span>{item.responsibleName ?? "—"}</span><span>{dateTimeLabel(item.dueAt)}</span><span><em className={`app-report-severity is-${item.severity}`}>{item.severity === "danger" ? "Crítica" : "Atenção"}</em></span></a>)}</div>}
      </section>
    </>}
  </>;
}
