import { useCallback, useEffect, useMemo, useState } from "react";
import { AppApiError } from "../../services/appApi";
import { listTasks, updateTask, type TaskListItem, type TaskPriority, type TaskStatus, type TaskView } from "../../services/productivityApi";
import { TasksIcon } from "../icons";
import { TaskModal } from "../components/TaskModal";

const statuses: Array<{ code: TaskStatus; label: string }> = [
  { code: "todo", label: "A fazer" }, { code: "in_progress", label: "Em andamento" }, { code: "waiting", label: "Aguardando" }, { code: "completed", label: "Concluída" }, { code: "canceled", label: "Cancelada" },
];
const priorityLabels: Record<TaskPriority, string> = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" };

function dateLabel(value: string | null): string {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function taskInput(task: TaskListItem, status: TaskStatus) {
  if (!task.dueAt) return null;
  return {
    title: task.title, ...(task.description ? { description: task.description } : {}), status, priority: task.priority,
    dueAt: task.dueAt, ...(task.scheduledStartAt ? { scheduledStartAt: task.scheduledStartAt } : {}), ...(task.scheduledEndAt ? { scheduledEndAt: task.scheduledEndAt } : {}),
    ...(task.responsible?.membershipId ? { responsibleMembershipId: task.responsible.membershipId } : {}), ...(task.contact?.id ? { contactId: task.contact.id } : {}), ...(task.opportunity?.id ? { opportunityId: task.opportunity.id } : {}), origin: task.origin,
  };
}

export function TasksPage({ organizationId, canCreate, canUpdate }: { organizationId: string; canCreate: boolean; canUpdate: boolean }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof listTasks>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [view, setView] = useState<TaskView>("all");
  const [display, setDisplay] = useState<"board" | "list">("board");
  const [page, setPage] = useState(1);
  const [modalTask, setModalTask] = useState<TaskListItem | null | undefined>(undefined);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setResult(await listTasks(organizationId, { search, priority: priority || undefined, view, page, pageSize: 50 })); }
    catch (loadError) { setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as tarefas."); }
    finally { setLoading(false); }
  }, [organizationId, search, priority, view, page]);

  useEffect(() => { const timer = globalThis.setTimeout(() => void load(), 250); return () => globalThis.clearTimeout(timer); }, [load]);
  const grouped = useMemo(() => Object.fromEntries(statuses.map((status) => [status.code, (result?.items ?? []).filter((task) => task.status === status.code)])) as Record<TaskStatus, TaskListItem[]>, [result?.items]);

  async function moveTask(taskId: string, status: TaskStatus) {
    if (!canUpdate) return;
    const task = result?.items.find((item) => item.id === taskId);
    if (!task || task.status === status) return;
    const input = taskInput(task, status);
    if (!input) { setError("Defina um prazo para a tarefa antes de alterar seu status."); return; }
    setError(null);
    try { await updateTask(organizationId, task.id, input); await load(); }
    catch (moveError) { setError(moveError instanceof AppApiError ? moveError.message : "Não foi possível mover a tarefa."); }
    finally { setDraggingId(null); }
  }

  return (
    <>
      <section className="app-module-header"><div><span className="app-section-eyebrow">Produtividade</span><h1>Quadro de tarefas</h1><p>Centralize próximos passos, prazos e responsabilidades da operação.</p></div>{canCreate && <button className="app-primary-button" type="button" onClick={() => setModalTask(null)}>+ Nova tarefa</button>}</section>
      {error && <div className="app-inline-error">{error}</div>}
      <section className="app-productivity-metrics">
        <article><strong>{result?.summary.pending ?? 0}</strong><span>Pendentes</span></article><article className="is-danger"><strong>{result?.summary.overdue ?? 0}</strong><span>Vencidas</span></article><article><strong>{result?.summary.dueToday ?? 0}</strong><span>Para hoje</span></article><article className="is-success"><strong>{result?.summary.completed ?? 0}</strong><span>Concluídas</span></article>
      </section>
      <section className="app-productivity-toolbar">
        <div className="app-segmented"><button type="button" className={view === "all" ? "is-active" : ""} onClick={() => { setPage(1); setView("all"); }}>Todas</button><button type="button" className={view === "mine" ? "is-active" : ""} onClick={() => { setPage(1); setView("mine"); }}>Minhas</button></div>
        <input className="app-productivity-search" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Buscar por título ou descrição..." />
        <select value={priority} onChange={(event) => { setPage(1); setPriority(event.target.value as TaskPriority | ""); }}><option value="">Todas as prioridades</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></select>
        <div className="app-segmented"><button type="button" className={display === "board" ? "is-active" : ""} onClick={() => setDisplay("board")}>Kanban</button><button type="button" className={display === "list" ? "is-active" : ""} onClick={() => setDisplay("list")}>Lista</button></div>
      </section>
      {loading ? <div className="app-list-loading">Carregando tarefas...</div> : !result || result.items.length === 0 ? <section className="app-productivity-empty"><TasksIcon /><h2>Tudo em dia por aqui!</h2><p>Nenhuma tarefa corresponde aos filtros atuais.</p>{canCreate && <button className="app-primary-button" type="button" onClick={() => setModalTask(null)}>Criar primeira tarefa</button>}</section> : display === "board" ? (
        <section className="app-task-board">
          {statuses.map((status) => <article className={`app-task-column app-task-column--${status.code}`} key={status.code} onDragOver={(event) => { if (canUpdate) event.preventDefault(); }} onDrop={() => { if (draggingId) void moveTask(draggingId, status.code); }}><header><strong>{status.label}</strong><span>{grouped[status.code].length}</span></header><div className="app-task-column__body">{grouped[status.code].map((task) => <button type="button" className={`app-task-card priority-${task.priority}`} key={task.id} draggable={canUpdate} onDragStart={() => setDraggingId(task.id)} onDragEnd={() => setDraggingId(null)} onClick={() => { if (canUpdate) setModalTask(task); }} aria-disabled={!canUpdate}><div><strong>{task.title}</strong><span className={`app-task-priority app-task-priority--${task.priority}`}>{priorityLabels[task.priority]}</span></div><p>{task.opportunity?.title ?? task.contact?.name ?? "Tarefa operacional"}</p><footer><span>{task.responsible?.displayName ?? "Sem responsável"}</span><time>{dateLabel(task.dueAt)}</time></footer></button>)}</div></article>)}
        </section>
      ) : (
        <section className="app-task-list"><header><span>Tarefa</span><span>Status</span><span>Prioridade</span><span>Responsável</span><span>Prazo</span></header>{result.items.map((task) => <button type="button" key={task.id} onClick={() => { if (canUpdate) setModalTask(task); }} aria-disabled={!canUpdate}><span><strong>{task.title}</strong><small>{task.opportunity?.title ?? task.contact?.name ?? "Sem vínculo"}</small></span><span>{statuses.find((item) => item.code === task.status)?.label}</span><span>{priorityLabels[task.priority]}</span><span>{task.responsible?.displayName ?? "—"}</span><span>{dateLabel(task.dueAt)}</span></button>)}</section>
      )}
      {result && result.totalPages > 1 && <div className="app-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><span>{page} / {result.totalPages}</span><button type="button" disabled={page >= result.totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>}
      {modalTask !== undefined && <TaskModal organizationId={organizationId} task={modalTask} onClose={() => setModalTask(undefined)} onSaved={() => { setModalTask(undefined); void load(); }} />}
    </>
  );
}
