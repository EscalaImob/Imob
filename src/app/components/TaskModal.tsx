import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AppApiError } from "../../services/appApi";
import {
  createTask,
  listTaskAssignees,
  updateTask,
  type ProductivityAssignee,
  type TaskInput,
  type TaskListItem,
  type TaskPriority,
  type TaskStatus,
} from "../../services/productivityApi";

function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

interface TaskModalProps {
  organizationId: string;
  task?: TaskListItem | null;
  preset?: { opportunityId?: string; contactId?: string; title?: string };
  onClose: () => void;
  onSaved: (task: TaskListItem) => void;
}

export function TaskModal({ organizationId, task, preset, onClose, onSaved }: TaskModalProps) {
  const [assignees, setAssignees] = useState<ProductivityAssignee[]>([]);
  const [title, setTitle] = useState(task?.title ?? preset?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "normal");
  const [dueAt, setDueAt] = useState(toLocalInput(task?.dueAt));
  const [scheduledStartAt, setScheduledStartAt] = useState(toLocalInput(task?.scheduledStartAt));
  const [scheduledEndAt, setScheduledEndAt] = useState(toLocalInput(task?.scheduledEndAt));
  const [responsibleMembershipId, setResponsibleMembershipId] = useState(task?.responsible?.membershipId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listTaskAssignees(organizationId).then((items) => {
      if (!active) return;
      setAssignees(items);
    }).catch((loadError) => {
      if (active) setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar os responsáveis.");
    });
    return () => { active = false; };
  }, [organizationId]);

  const scheduleInvalid = useMemo(() => Boolean((scheduledStartAt && !scheduledEndAt) || (!scheduledStartAt && scheduledEndAt) || (scheduledStartAt && scheduledEndAt && new Date(scheduledEndAt).getTime() <= new Date(scheduledStartAt).getTime())), [scheduledStartAt, scheduledEndAt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !dueAt || scheduleInvalid || saving) return;
    setSaving(true); setError(null);
    const input: TaskInput = {
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      status,
      priority,
      dueAt: toIso(dueAt)!,
      ...(toIso(scheduledStartAt) ? { scheduledStartAt: toIso(scheduledStartAt) } : {}),
      ...(toIso(scheduledEndAt) ? { scheduledEndAt: toIso(scheduledEndAt) } : {}),
      ...(responsibleMembershipId ? { responsibleMembershipId } : {}),
      ...(task?.contact?.id ?? preset?.contactId ? { contactId: task?.contact?.id ?? preset?.contactId } : {}),
      ...(task?.opportunity?.id ?? preset?.opportunityId ? { opportunityId: task?.opportunity?.id ?? preset?.opportunityId } : {}),
      origin: task?.origin ?? (preset?.opportunityId ? "opportunity" : "manual"),
    };
    try {
      const saved = task ? await updateTask(organizationId, task.id, input) : await createTask(organizationId, input);
      onSaved(saved);
    } catch (saveError) {
      setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível salvar a tarefa.");
    } finally { setSaving(false); }
  }

  return (
    <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="app-modal app-task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <header className="app-modal__header"><div><span className="app-section-eyebrow">Produtividade</span><h2 id="task-modal-title">{task ? "Editar tarefa" : "Nova tarefa"}</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Fechar">×</button></header>
        <form onSubmit={submit}>
          <div className="app-modal__body app-task-form-grid">
            {error && <div className="app-inline-error is-wide">{error}</div>}
            <label className="is-wide"><span>Título *</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={220} required autoFocus /></label>
            <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}><option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="waiting">Aguardando</option><option value="completed">Concluída</option><option value="canceled">Cancelada</option></select></label>
            <label><span>Prioridade</span><select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
            <label><span>Responsável</span><select value={responsibleMembershipId} onChange={(event) => setResponsibleMembershipId(event.target.value)}><option value="">Eu (padrão)</option>{assignees.map((item) => <option key={item.membershipId} value={item.membershipId}>{item.displayName}</option>)}</select></label>
            <label><span>Prazo *</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required /></label>
            <label><span>Horário na agenda</span><input type="datetime-local" value={scheduledStartAt} onChange={(event) => setScheduledStartAt(event.target.value)} /></label>
            <label><span>Fim do horário</span><input type="datetime-local" value={scheduledEndAt} onChange={(event) => setScheduledEndAt(event.target.value)} /></label>
            {scheduleInvalid && <div className="app-field-error is-wide">Informe início e fim válidos para o horário da agenda.</div>}
            <label className="is-wide"><span>Descrição</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={5} /></label>
            {(task?.opportunity || preset?.opportunityId) && <div className="app-task-link-note is-wide"><strong>Vinculada à oportunidade</strong><span>{task?.opportunity?.title ?? "Oportunidade atual"}</span></div>}
          </div>
          <footer className="app-modal__footer"><button type="button" className="app-secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="app-primary-button" disabled={saving || !title.trim() || !dueAt || scheduleInvalid}>{saving ? "Salvando..." : task ? "Salvar tarefa" : "Criar tarefa"}</button></footer>
        </form>
      </section>
    </div>
  );
}
