import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DocumentIcon, FunnelIcon, PinIcon, TasksIcon, UsersIcon } from "../icons";
import { TaskModal } from "../components/TaskModal";
import { VisitModal } from "../components/VisitModal";
import { AppApiError } from "../../services/appApi";
import {
  addOpportunityActivity,
  getOpportunityDetail,
  updateOpportunity,
  type OpportunityActivityType,
  type OpportunityDetail,
  type OpportunityTimelineEvent,
} from "../../services/crmApi";
import { listTasks, type TaskListItem } from "../../services/productivityApi";
import { listVisits, type VisitListItem } from "../../services/visitsApi";
import { listProperties, type PropertyListItem } from "../../services/propertiesApi";

interface Props {
  organizationId: string;
  canUpdate: boolean;
  canReadTask: boolean;
  canCreateTask: boolean;
  canUpdateTask: boolean;
  canReadVisit: boolean;
  canCreateVisit: boolean;
  canUpdateVisit: boolean;
  canReadProperties: boolean;
  canCreateProperty: boolean;
}

type Draft = {
  title: string;
  description: string;
  estimatedValue: string;
  probability: string;
  expectedCloseDate: string;
  temperature: "" | "cold" | "warm" | "hot";
};

function readOpportunityId(): string | null {
  return new URLSearchParams(globalThis.location.search).get("id")?.trim() || null;
}

function draftFrom(detail: OpportunityDetail): Draft {
  return {
    title: detail.title,
    description: detail.description ?? "",
    estimatedValue: detail.estimatedValue ?? "",
    probability: detail.probability === null ? "" : String(detail.probability),
    expectedCloseDate: detail.expectedCloseDate ?? "",
    temperature: detail.temperature ?? "",
  };
}

function formatCurrency(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function eventTitle(event: OpportunityTimelineEvent): string {
  if (event.eventType === "opportunity.created") return "Oportunidade criada";
  if (event.eventType === "opportunity.stage_changed") return "Etapa alterada";
  if (event.eventType === "opportunity.updated") return "Informações atualizadas";
  if (event.eventType === "opportunity.activity.note") return "Nota registrada";
  if (event.eventType === "opportunity.activity.call") return "Ligação registrada";
  if (event.eventType === "opportunity.activity.message") return "Mensagem registrada";
  if (event.eventType === "opportunity.task.created") return "Tarefa criada";
  if (event.eventType === "opportunity.task.updated") return "Tarefa atualizada";
  if (event.eventType === "opportunity.calendar_event.created") return "Compromisso agendado";
  if (event.eventType === "opportunity.visit.created") return "Visita agendada";
  if (event.eventType === "opportunity.visit.confirmed") return "Visita confirmada";
  if (event.eventType === "opportunity.visit.completed") return "Visita realizada";
  if (event.eventType === "opportunity.visit.canceled") return "Visita cancelada";
  if (event.eventType === "opportunity.visit.updated") return "Visita atualizada";
  if (event.eventType === "opportunity.property.created") return "Imóvel criado";
  if (event.eventType === "opportunity.property.linked") return "Imóvel vinculado";
  return "Atividade registrada";
}

function activityText(event: OpportunityTimelineEvent): string | null {
  const data = event.data;
  if (!data) return null;
  if (typeof data.content === "string") return data.content;
  if (event.eventType === "opportunity.stage_changed") {
    const from = typeof data.fromStageName === "string" ? data.fromStageName : null;
    const to = typeof data.toStageName === "string" ? data.toStageName : null;
    if (from && to) return `${from} → ${to}`;
  }
  if (event.eventType === "opportunity.created" && typeof data.stageName === "string") {
    return `Criada em ${data.stageName}`;
  }
  if (event.eventType === "opportunity.updated" && data.changes && typeof data.changes === "object") {
    const labels: Record<string, string> = {
      title: "título",
      description: "descrição",
      estimatedValue: "valor",
      probability: "probabilidade",
      expectedCloseDate: "previsão",
      temperature: "temperatura",
    };
    const keys = Object.keys(data.changes as Record<string, unknown>).map((key) => labels[key] ?? key);
    return keys.length ? `Campos alterados: ${keys.join(", ")}.` : null;
  }
  if (event.eventType === "opportunity.task.created" || event.eventType === "opportunity.task.updated") {
    const title = typeof data.title === "string" ? data.title : "Tarefa";
    const dueAt = typeof data.dueAt === "string" ? ` · prazo ${formatDateTime(data.dueAt)}` : "";
    return `${title}${dueAt}`;
  }
  if (event.eventType === "opportunity.calendar_event.created") {
    const title = typeof data.title === "string" ? data.title : "Compromisso";
    const startsAt = typeof data.startsAt === "string" ? ` · ${formatDateTime(data.startsAt)}` : "";
    return `${title}${startsAt}`;
  }
  if (event.eventType === "opportunity.property.created" || event.eventType === "opportunity.property.linked") {
    const code = typeof data.internalCode === "string" ? data.internalCode : null;
    const title = typeof data.title === "string" ? data.title : "Imóvel";
    return [code, title].filter(Boolean).join(" · ");
  }
  if (event.eventType.startsWith("opportunity.visit.")) {
    const title = typeof data.title === "string" ? data.title : "Visita";
    const startsAt = typeof data.startsAt === "string" ? ` · ${formatDateTime(data.startsAt)}` : "";
    const location = typeof data.location === "string" ? ` · ${data.location}` : "";
    const feedback = typeof data.feedbackRating === "number" ? ` · ${data.feedbackRating}/5` : "";
    const feedbackNotes = typeof data.feedbackNotes === "string" && data.feedbackNotes ? ` · ${data.feedbackNotes}` : "";
    const reason = typeof data.cancellationReason === "string" && data.cancellationReason ? ` · ${data.cancellationReason}` : "";
    return `${title}${startsAt}${location}${feedback}${feedbackNotes}${reason}`;
  }
  return null;
}

function statusLabel(status: OpportunityDetail["status"]): string {
  if (status === "won") return "Ganha";
  if (status === "lost") return "Perdida";
  return "Aberta";
}

function temperatureLabel(value: OpportunityDetail["temperature"]): string {
  if (value === "hot") return "Quente";
  if (value === "warm") return "Morno";
  if (value === "cold") return "Frio";
  return "Não informada";
}

export function OpportunityDetailPage({ organizationId, canUpdate, canReadTask, canCreateTask, canUpdateTask, canReadVisit, canCreateVisit, canUpdateVisit, canReadProperties, canCreateProperty }: Props) {
  const opportunityId = useMemo(readOpportunityId, []);
  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<OpportunityActivityType>("note");
  const [activityContent, setActivityContent] = useState("");
  const [activitySaving, setActivitySaving] = useState(false);
  const [relatedTasks, setRelatedTasks] = useState<TaskListItem[]>([]);
  const [taskModal, setTaskModal] = useState<TaskListItem | null | undefined>(undefined);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [relatedVisits, setRelatedVisits] = useState<VisitListItem[]>([]);
  const [visitModal, setVisitModal] = useState<VisitListItem | null | undefined>(undefined);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [captureProperty, setCaptureProperty] = useState<PropertyListItem | null>(null);

  const refreshTasks = useCallback(async () => {
    if (!opportunityId || !canReadTask) { setRelatedTasks([]); return; }
    setTasksLoading(true);
    try {
      const result = await listTasks(organizationId, { opportunityId, pageSize: 50 });
      setRelatedTasks(result.items.filter((task) => task.status !== "completed" && task.status !== "canceled"));
    } catch (taskError) {
      setError(taskError instanceof AppApiError ? taskError.message : "Não foi possível carregar as tarefas vinculadas.");
    } finally { setTasksLoading(false); }
  }, [organizationId, opportunityId, canReadTask]);

  const refreshVisits = useCallback(async () => {
    if (!opportunityId || !canReadVisit) { setRelatedVisits([]); return; }
    setVisitsLoading(true);
    try {
      const result = await listVisits(organizationId, { opportunityId, pageSize: 50 });
      setRelatedVisits(result.items.filter((visit) => visit.status === "scheduled" || visit.status === "confirmed"));
    } catch (visitError) {
      setError(visitError instanceof AppApiError ? visitError.message : "Não foi possível carregar as visitas vinculadas.");
    } finally { setVisitsLoading(false); }
  }, [organizationId, opportunityId, canReadVisit]);

  const refreshCaptureProperty = useCallback(async () => {
    if (!opportunityId || !canReadProperties) { setCaptureProperty(null); return; }
    try {
      const result = await listProperties(organizationId, { sourceOpportunityId: opportunityId, pageSize: 1 });
      setCaptureProperty(result.items[0] ?? null);
    } catch { setCaptureProperty(null); }
  }, [organizationId, opportunityId, canReadProperties]);

  const load = useCallback(async () => {
    if (!opportunityId) {
      setError("A oportunidade informada é inválida.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getOpportunityDetail(organizationId, opportunityId);
      setDetail(result);
      setDraft(draftFrom(result));
      if (canReadTask) void refreshTasks();
      if (canReadVisit) void refreshVisits();
      if (result.funnel.code === "capture" && canReadProperties) void refreshCaptureProperty();
    } catch (loadError) {
      setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar a oportunidade.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, opportunityId, canReadTask, refreshTasks, canReadVisit, refreshVisits, canReadProperties, refreshCaptureProperty]);

  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => {
    if (!detail || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(draftFrom(detail));
  }, [detail, draft]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    globalThis.addEventListener("beforeunload", handler);
    return () => globalThis.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function backToFunnel() {
    if (dirty && !globalThis.confirm("Existem alterações não salvas. Deseja sair mesmo assim?")) return;
    const code = detail?.funnel.code === "capture" ? "captacao" : "compradores";
    globalThis.location.href = `/app/funis/${code}/`;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !draft || !opportunityId || !canUpdate || saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOpportunity(organizationId, opportunityId, {
        title: draft.title.trim(),
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        ...(draft.estimatedValue.trim() ? { estimatedValue: draft.estimatedValue.trim() } : {}),
        ...(draft.probability !== "" ? { probability: Number(draft.probability) } : {}),
        ...(draft.expectedCloseDate ? { expectedCloseDate: draft.expectedCloseDate } : {}),
        ...(draft.temperature ? { temperature: draft.temperature } : {}),
      });
      setDetail(updated);
      setDraft(draftFrom(updated));
    } catch (saveError) {
      setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível salvar a oportunidade.");
    } finally {
      setSaving(false);
    }
  }

  async function registerActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!opportunityId || !canUpdate || !activityContent.trim() || activitySaving) return;
    setActivitySaving(true);
    setError(null);
    try {
      await addOpportunityActivity(organizationId, opportunityId, { type: activityType, content: activityContent.trim() });
      setActivityContent("");
      const refreshed = await getOpportunityDetail(organizationId, opportunityId);
      setDetail(refreshed);
      if (!dirty) setDraft(draftFrom(refreshed));
    } catch (activityError) {
      setError(activityError instanceof AppApiError ? activityError.message : "Não foi possível registrar a atividade.");
    } finally {
      setActivitySaving(false);
    }
  }

  if (loading) return <div className="app-list-loading">Carregando oportunidade...</div>;
  if (error && !detail) return <div className="app-inline-error">{error}</div>;
  if (!detail || !draft) return null;

  return (
    <>
      <section className="app-opportunity-detail-header">
        <div className="app-opportunity-detail-header__main">
          <button type="button" className="app-back-button" onClick={backToFunnel}>← Voltar</button>
          <div><span className="app-section-eyebrow">CRM & Vendas · Edição da oportunidade</span><h1>{detail.title}</h1><p>{detail.contact.name} · {detail.funnel.name}</p></div>
        </div>
        <div className="app-opportunity-detail-header__actions">
          {dirty && <span className="app-unsaved-indicator">Alterações não salvas</span>}
          <button type="submit" form="opportunity-edit-form" className="app-primary-button" disabled={!canUpdate || !dirty || saving}>{saving ? "Salvando..." : "Salvar alterações"}</button>
        </div>
      </section>

      {error && <div className="app-inline-error">{error}</div>}

      <div className="app-opportunity-detail-grid">
        <form id="opportunity-edit-form" className="app-detail-panel" onSubmit={save}>
          <header><div><DocumentIcon /><strong>Informações</strong></div><span className={`app-status-chip app-status-chip--${detail.status}`}>{statusLabel(detail.status)}</span></header>
          <div className="app-detail-form-grid">
            <label className="is-wide"><span>Título *</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={220} disabled={!canUpdate} required /></label>
            <label><span>Valor estimado</span><input value={draft.estimatedValue} onChange={(event) => setDraft({ ...draft, estimatedValue: event.target.value })} inputMode="decimal" disabled={!canUpdate} placeholder="0,00" /></label>
            <label><span>Probabilidade (%)</span><input value={draft.probability} onChange={(event) => setDraft({ ...draft, probability: event.target.value })} type="number" min="0" max="100" disabled={!canUpdate} /></label>
            <label><span>Previsão de fechamento</span><input value={draft.expectedCloseDate} onChange={(event) => setDraft({ ...draft, expectedCloseDate: event.target.value })} type="date" disabled={!canUpdate} /></label>
            <label><span>Temperatura</span><select value={draft.temperature} onChange={(event) => setDraft({ ...draft, temperature: event.target.value as Draft["temperature"] })} disabled={!canUpdate}><option value="">Não informada</option><option value="cold">Frio</option><option value="warm">Morno</option><option value="hot">Quente</option></select></label>
            <label className="is-wide"><span>Descrição / observações</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={4000} rows={6} disabled={!canUpdate} /></label>
          </div>
        </form>

        <aside className="app-detail-side">
          <section className="app-detail-panel app-detail-panel--compact">
            <header><div><FunnelIcon /><strong>Andamento</strong></div></header>
            <dl className="app-detail-facts">
              <div><dt>Funil</dt><dd>{detail.funnel.name}</dd></div>
              <div><dt>Etapa atual</dt><dd>{detail.stage.name}</dd></div>
              <div><dt>Probabilidade da oportunidade</dt><dd>{detail.probability ?? 0}%</dd></div>
              <div><dt>Temperatura</dt><dd>{temperatureLabel(detail.temperature)}</dd></div>
              {detail.lossReason && <div><dt>Motivo de perda</dt><dd>{detail.lossReason}</dd></div>}
            </dl>
            <button type="button" className="app-secondary-button app-detail-full-button" onClick={backToFunnel}>Abrir no funil</button>
          </section>

          <section className="app-detail-panel app-detail-panel--compact">
            <header><div><UsersIcon /><strong>Relacionamentos</strong></div></header>
            <dl className="app-detail-facts">
              <div><dt>Cliente</dt><dd>{detail.contact.name}</dd></div>
              {detail.contact.email && <div><dt>E-mail</dt><dd>{detail.contact.email}</dd></div>}
              {detail.contact.phone && <div><dt>Telefone</dt><dd>{detail.contact.phone}</dd></div>}
              <div><dt>Responsável</dt><dd>{detail.responsible?.displayName ?? "Sem responsável"}</dd></div>
              <div><dt>Origem</dt><dd>{detail.source}</dd></div>{detail.funnel.code === "capture" && <div className="app-detail-property-link"><dt>Imóvel captado</dt><dd>{captureProperty ? <a href={`/app/imovel/?id=${encodeURIComponent(captureProperty.id)}`}>{captureProperty.internalCode} · {captureProperty.title}</a> : canCreateProperty ? <a href={`/app/imovel/?sourceOpportunityId=${encodeURIComponent(detail.id)}`}>Criar imóvel rascunho →</a> : "Ainda não vinculado"}</dd></div>}
            </dl>
          </section>
        </aside>
      </div>

      {canReadTask && <section className="app-detail-panel app-opportunity-tasks-panel">
        <header><div><TasksIcon /><strong>Próximas tarefas</strong></div>{canCreateTask && <button type="button" className="app-secondary-button" onClick={() => setTaskModal(null)}>+ Criar tarefa</button>}</header>
        {tasksLoading ? <div className="app-list-loading app-list-loading--compact">Carregando tarefas...</div> : relatedTasks.length === 0 ? <div className="app-opportunity-tasks-empty"><p>Nenhuma tarefa vinculada a esta oportunidade.</p>{canCreateTask && <button type="button" className="app-primary-button" onClick={() => setTaskModal(null)}>Definir próximo passo</button>}</div> : <div className="app-opportunity-task-list">{relatedTasks.map((task) => <button type="button" key={task.id} disabled={!canUpdateTask} onClick={() => { if (canUpdateTask) setTaskModal(task); }}><span className={`app-task-priority app-task-priority--${task.priority}`}>{task.priority === "urgent" ? "Urgente" : task.priority === "high" ? "Alta" : task.priority === "low" ? "Baixa" : "Normal"}</span><strong>{task.title}</strong><span>{task.responsible?.displayName ?? "Sem responsável"}</span><time>{task.dueAt ? formatDateTime(task.dueAt) : "Sem prazo"}</time><small>{task.status === "completed" ? "Concluída" : task.status === "in_progress" ? "Em andamento" : task.status === "waiting" ? "Aguardando" : task.status === "canceled" ? "Cancelada" : "A fazer"}</small></button>)}</div>}
      </section>}

      {canReadVisit && <section className="app-detail-panel app-opportunity-tasks-panel">
        <header><div><PinIcon /><strong>Próximas visitas</strong></div>{canCreateVisit && <button type="button" className="app-secondary-button" onClick={() => setVisitModal(null)}>+ Agendar visita</button>}</header>
        {visitsLoading ? <div className="app-list-loading app-list-loading--compact">Carregando visitas...</div> : relatedVisits.length === 0 ? <div className="app-opportunity-tasks-empty"><p>Nenhuma visita futura vinculada a esta oportunidade.</p>{canCreateVisit && <button type="button" className="app-primary-button" onClick={() => setVisitModal(null)}>Agendar visita</button>}</div> : <div className="app-opportunity-visit-list">{relatedVisits.map((visit) => <button type="button" key={visit.id} disabled={!canUpdateVisit} onClick={() => { if (canUpdateVisit) setVisitModal(visit); }}><span className={`app-visit-status status-${visit.status}`}>{visit.status === "confirmed" ? "Confirmada" : "Agendada"}</span><strong>{visit.title}</strong><span>{visit.location}</span><time>{formatDateTime(visit.startsAt)}</time></button>)}</div>}
      </section>}

      <section className="app-opportunity-activity-grid">
        <article className="app-detail-panel">
          <header><div><TasksIcon /><strong>Registrar atividade</strong></div></header>
          {canUpdate ? <form className="app-activity-form" onSubmit={registerActivity}>
            <div className="app-segmented app-activity-types" aria-label="Tipo da atividade">
              <button type="button" className={activityType === "note" ? "is-active" : ""} onClick={() => setActivityType("note")}>Nota</button>
              <button type="button" className={activityType === "call" ? "is-active" : ""} onClick={() => setActivityType("call")}>Ligação</button>
              <button type="button" className={activityType === "message" ? "is-active" : ""} onClick={() => setActivityType("message")}>Mensagem</button>
            </div>
            <textarea value={activityContent} onChange={(event) => setActivityContent(event.target.value)} maxLength={2000} rows={5} placeholder={activityType === "note" ? "Registre uma observação importante..." : activityType === "call" ? "Resuma a ligação e o próximo passo..." : "Registre o conteúdo ou resultado da mensagem..."} />
            <div className="app-activity-form__footer"><small>As atividades ficam registradas de forma cronológica no histórico.</small><button type="submit" className="app-primary-button" disabled={!activityContent.trim() || activitySaving}>{activitySaving ? "Registrando..." : "Registrar atividade"}</button></div>
          </form> : <div className="app-detail-readonly-note">Seu perfil permite visualizar o histórico, mas não registrar novas atividades.</div>}
        </article>

        <article className="app-detail-panel">
          <header><div><DocumentIcon /><strong>Resumo</strong></div></header>
          <div className="app-opportunity-summary-list">
            <div><span>Valor</span><strong>{detail.estimatedValue ? formatCurrency(detail.estimatedValue) : "—"}</strong></div>
            <div><span>Criada em</span><strong>{formatDateTime(detail.createdAt)}</strong></div>
            <div><span>Última atividade</span><strong>{detail.lastActivityAt ? formatDateTime(detail.lastActivityAt) : "—"}</strong></div>
          </div>
        </article>
      </section>

      <section className="app-detail-panel app-timeline-panel">
        <header><div><DocumentIcon /><strong>Histórico da oportunidade</strong></div><span>{detail.timeline.length} {detail.timeline.length === 1 ? "evento" : "eventos"}</span></header>
        {detail.timeline.length === 0 ? <div className="app-timeline-empty">Nenhum evento registrado.</div> : <ol className="app-timeline">
          {detail.timeline.map((event) => <li key={event.id}>
            <span className="app-timeline__dot" aria-hidden="true" />
            <div className="app-timeline__content"><div><strong>{eventTitle(event)}</strong><time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time></div>{activityText(event) && <p>{activityText(event)}</p>}<small>{event.actor?.displayName ?? "Sistema"}</small></div>
          </li>)}
        </ol>}
      </section>
      {taskModal !== undefined && opportunityId && <TaskModal organizationId={organizationId} task={taskModal} preset={{ opportunityId, contactId: detail.contact.id, title: `Próximo passo — ${detail.title}` }} onClose={() => setTaskModal(undefined)} onSaved={() => { setTaskModal(undefined); void load(); }} />}
      {visitModal !== undefined && opportunityId && <VisitModal organizationId={organizationId} visit={visitModal} preset={{ contactId: detail.contact.id, contactName: detail.contact.name, opportunityId, opportunityTitle: detail.title, ...(captureProperty ? { propertyId: captureProperty.id, propertyTitle: `${captureProperty.internalCode} · ${captureProperty.title}` } : {}), title: `Visita — ${detail.contact.name}` }} canReadContacts={false} canReadOpportunities={false} canReadProperties={canReadProperties} onClose={() => setVisitModal(undefined)} onSaved={() => { setVisitModal(undefined); void load(); }} />}
    </>
  );
}
