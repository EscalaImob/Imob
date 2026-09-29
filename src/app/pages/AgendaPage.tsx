import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AppApiError } from "../../services/appApi";
import { createCalendarEvent, listAgenda, listTaskAssignees, updateCalendarEvent, type AgendaItem, type CalendarEventType, type ProductivityAssignee } from "../../services/productivityApi";
import { CalendarIcon, PinIcon, TasksIcon } from "../icons";
import { addMinutesToLocalInput, calendarDateFromKey, calendarDateKey, currentCalendarDate, formatInTimeZone, zonedDateKey, zonedDateTimeInput, zonedLocalInputToDate, zonedStartOfCalendarDate } from "../timezone";

function startOfDay(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; }
function isSameCalendarDay(left: Date, right: Date) { return calendarDateKey(left) === calendarDateKey(right); }
function addDays(date: Date, days: number) { const value = new Date(date); value.setDate(value.getDate() + days); return value; }
function startOfWeek(date: Date) { const value = startOfDay(date); value.setDate(value.getDate() - value.getDay()); return value; }
function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonthGrid(date: Date) { const start = startOfWeek(startOfMonth(date)); const end = new Date(date.getFullYear(), date.getMonth() + 1, 1); const cells = Math.ceil((end.getTime() - start.getTime()) / 86_400_000 / 7) * 7; return addDays(start, Math.max(35, cells)); }
function labelDate(date: Date) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date); }
function labelTime(value: string, timezone: string) { return formatInTimeZone(value, timezone, { hour: "2-digit", minute: "2-digit" }); }
function eventTypeLabel(type: AgendaItem["type"]) { return ({ task: "Tarefa", visit: "Visita", meeting: "Reunião", evaluation: "Avaliação", signature: "Assinatura", inspection: "Vistoria", custom: "Compromisso" } as const)[type] ?? "Compromisso"; }

function EventModal({ organizationId, timezone, defaultDate, eventItem, onClose, onSaved }: { organizationId: string; timezone: string; defaultDate: Date; eventItem?: AgendaItem; onClose: () => void; onSaved: () => void }) {
  const editing = Boolean(eventItem);
  const [assignees, setAssignees] = useState<ProductivityAssignee[]>([]);
  const [type, setType] = useState<CalendarEventType>((eventItem?.type as CalendarEventType | undefined) ?? "meeting");
  const [title, setTitle] = useState(eventItem?.title ?? "");
  const [description, setDescription] = useState(eventItem?.description ?? "");
  const [status, setStatus] = useState<"scheduled" | "completed" | "canceled">(eventItem?.status === "completed" || eventItem?.status === "canceled" ? eventItem.status : "scheduled");
  const initialStart = useMemo(() => eventItem ? zonedDateTimeInput(eventItem.startsAt, timezone) : `${calendarDateKey(defaultDate)}T09:00`, [defaultDate, eventItem, timezone]);
  const [startsAt, setStartsAt] = useState(initialStart);
  const [endsAt, setEndsAt] = useState(eventItem ? zonedDateTimeInput(eventItem.endsAt, timezone) : addMinutesToLocalInput(initialStart, 60));
  const [responsibleMembershipId, setResponsibleMembershipId] = useState(eventItem?.responsible?.membershipId ?? "");
  const [privateEvent, setPrivateEvent] = useState(eventItem?.private ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void listTaskAssignees(organizationId).then((items) => { setAssignees(items); }).catch((loadError) => setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar responsáveis.")); }, [organizationId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!title.trim() || saving) return;
    const start = zonedLocalInputToDate(startsAt, timezone); const end = zonedLocalInputToDate(endsAt, timezone);
    if (!start || !end || end <= start) { setError("Informe um horário válido para o compromisso."); return; }
    setSaving(true); setError(null);
    const input = { type, title: title.trim(), ...(description.trim() ? { description: description.trim() } : {}), startsAt: start.toISOString(), endsAt: end.toISOString(), status, ...(responsibleMembershipId ? { responsibleMembershipId } : {}), private: privateEvent };
    try { if (eventItem) await updateCalendarEvent(organizationId, eventItem.id, input); else await createCalendarEvent(organizationId, input); onSaved(); }
    catch (saveError) { setError(saveError instanceof AppApiError ? saveError.message : `Não foi possível ${editing ? "atualizar" : "criar"} o compromisso.`); }
    finally { setSaving(false); }
  }
  return <div className="app-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="app-modal app-calendar-modal" role="dialog" aria-modal="true"><header className="app-modal__header"><div><span className="app-section-eyebrow">Agenda</span><h2>{editing ? "Editar compromisso" : "Novo compromisso"}</h2></div><button type="button" onClick={onClose} disabled={saving}>×</button></header><form onSubmit={submit}><div className="app-modal__body app-task-form-grid">{error && <div className="app-inline-error is-wide">{error}</div>}<label><span>Tipo</span><select value={type} onChange={(event) => setType(event.target.value as CalendarEventType)}><option value="meeting">Reunião</option><option value="evaluation">Avaliação</option><option value="signature">Assinatura</option><option value="inspection">Vistoria</option><option value="custom">Compromisso</option></select></label><label><span>Responsável</span><select value={responsibleMembershipId} onChange={(event) => setResponsibleMembershipId(event.target.value)}><option value="">Eu (padrão)</option>{assignees.map((item) => <option key={item.membershipId} value={item.membershipId}>{item.displayName}</option>)}</select></label>{editing && <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="scheduled">Agendado</option><option value="completed">Concluído</option><option value="canceled">Cancelado</option></select></label>}<label className="is-wide"><span>Título *</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={220} required autoFocus /></label><label><span>Início</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label><label><span>Fim</span><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required /></label><label className="is-wide"><span>Descrição</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={4000} /></label><label className="app-checkbox-field is-wide"><input type="checkbox" checked={privateEvent} onChange={(event) => setPrivateEvent(event.target.checked)} /><span>Compromisso privado</span></label></div><footer className="app-modal__footer"><button type="button" className="app-secondary-button" onClick={onClose}>Fechar</button><button type="submit" className="app-primary-button" disabled={saving || !title.trim()}>{saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar compromisso"}</button></footer></form></section></div>;
}

export function AgendaPage({ organizationId, timezone, canCreate }: { organizationId: string; timezone: string; canCreate: boolean }) {
  const [view, setView] = useState<"month" | "week" | "day" | "list">("month");
  const [anchor, setAnchor] = useState(() => currentCalendarDate(timezone));
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AgendaItem | null>(null);
  const today = currentCalendarDate(timezone);
  useEffect(() => { setAnchor(currentCalendarDate(timezone)); }, [timezone]);
  function openEvent(item: AgendaItem) { if (item.source !== "event") return; setSelectedEvent(item); const dateKey = zonedDateKey(item.startsAt, timezone); setModalDate(dateKey ? calendarDateFromKey(dateKey) : currentCalendarDate(timezone)); }
  useEffect(() => {
    function handleEventClick(domEvent: MouseEvent) {
      const target = domEvent.target instanceof Element ? domEvent.target : null;
      const entry = target?.closest(".source-event, .app-calendar-list article");
      if (!entry) return;
      const eventItem = items.find((item) => item.source === "event" && entry.textContent?.includes(item.title));
      if (eventItem) openEvent(eventItem);
    }
    document.addEventListener("click", handleEventClick);
    return () => document.removeEventListener("click", handleEventClick);
  }, [items, timezone]);
  const range = useMemo(() => {
    if (view === "month") return { from: startOfWeek(startOfMonth(anchor)), to: endOfMonthGrid(anchor) };
    if (view === "week") { const from = startOfWeek(anchor); return { from, to: addDays(from, 7) }; }
    if (view === "day") { const from = startOfDay(anchor); return { from, to: addDays(from, 1) }; }
    const from = startOfDay(anchor); return { from: addDays(from, -7), to: addDays(from, 30) };
  }, [anchor, view]);
  const rangeFromKey = calendarDateKey(range.from);
  const rangeToKey = calendarDateKey(range.to);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const from = zonedStartOfCalendarDate(range.from, timezone);
      const to = zonedStartOfCalendarDate(range.to, timezone);
      setItems((await listAgenda(organizationId, from, to)).items);
    } catch (loadError) { setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar a agenda."); }
    finally { setLoading(false); }
  }, [organizationId, rangeFromKey, rangeToKey, timezone]);
  useEffect(() => { void load(); }, [load]);
  function navigate(direction: number) { setAnchor((current) => { const value = new Date(current); if (view === "month") value.setMonth(value.getMonth() + direction); else if (view === "week") value.setDate(value.getDate() + direction * 7); else value.setDate(value.getDate() + direction); return value; }); }
  const title = view === "month" ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(anchor) : view === "week" ? `${labelDate(range.from)} — ${labelDate(addDays(range.to, -1))}` : new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(anchor);
  const monthDays = useMemo(() => { const days: Date[] = []; for (let date = new Date(range.from); date < range.to; date = addDays(date, 1)) days.push(date); return days; }, [rangeFromKey, rangeToKey]);
  const itemsForDay = (date: Date) => items.filter((item) => zonedDateKey(item.startsAt, timezone) === calendarDateKey(date));

  return <>
    <section className="app-page-heading"><div><span className="app-section-eyebrow">Produtividade</span><h1>Agenda</h1><p>Visão consolidada de tarefas e compromissos da operação.</p></div>{canCreate && <button className="app-primary-button" type="button" onClick={() => setModalDate(new Date(anchor))}>+ Novo compromisso</button>}</section>
    {error && <div className="app-inline-error">{error}</div>}
    <section className="app-calendar-toolbar"><div><button type="button" onClick={() => navigate(-1)}>‹</button><button type="button" onClick={() => setAnchor(currentCalendarDate(timezone))}>Hoje</button><button type="button" onClick={() => navigate(1)}>›</button></div><strong>{title}</strong><div className="app-segmented"><button type="button" className={view === "month" ? "is-active" : ""} onClick={() => setView("month")}>Mês</button><button type="button" className={view === "week" ? "is-active" : ""} onClick={() => setView("week")}>Semana</button><button type="button" className={view === "day" ? "is-active" : ""} onClick={() => setView("day")}>Dia</button><button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}>Lista</button></div></section>
    {loading ? <div className="app-list-loading">Carregando agenda...</div> : view === "month" ? <section className="app-calendar-month"><header>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => <span key={day}>{day}</span>)}</header><div className="app-calendar-month__grid">{monthDays.map((date) => <button type="button" className={`app-calendar-day${date.getMonth() !== anchor.getMonth() ? " is-outside" : ""}${isSameCalendarDay(date, today) ? " is-today" : ""}`} aria-current={isSameCalendarDay(date, today) ? "date" : undefined} key={calendarDateKey(date)} onDoubleClick={() => canCreate && setModalDate(date)}><strong>{date.getDate()}</strong><div>{itemsForDay(date).slice(0, 3).map((item) => <span className={`app-calendar-chip source-${item.source}`} key={`${item.source}-${item.id}`}><em>{item.allDay ? "" : labelTime(item.startsAt, timezone)}</em>{item.title}</span>)}{itemsForDay(date).length > 3 && <small>+ {itemsForDay(date).length - 3} itens</small>}</div></button>)}</div></section> : view === "week" ? <section className="app-calendar-week">{Array.from({ length: 7 }, (_, index) => addDays(range.from, index)).map((date) => <article className={isSameCalendarDay(date, today) ? "is-today" : undefined} aria-current={isSameCalendarDay(date, today) ? "date" : undefined} key={calendarDateKey(date)}><header><strong>{new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date)}</strong><span>{date.getDate()}</span></header><div>{itemsForDay(date).length === 0 ? <small>Sem compromissos</small> : itemsForDay(date).map((item) => <div className={`app-agenda-item source-${item.source}`} key={`${item.source}-${item.id}`}><time>{item.allDay ? "Prazo" : labelTime(item.startsAt, timezone)}</time><strong>{item.title}</strong><span>{eventTypeLabel(item.type)} · {item.responsible?.displayName ?? "Sem responsável"}</span></div>)}</div></article>)}</section> : <section className="app-calendar-list">{items.length === 0 ? <div className="app-productivity-empty"><CalendarIcon /><h2>Nenhum compromisso no período</h2><p>Crie um compromisso ou agende uma tarefa para vê-la aqui.</p></div> : items.map((item) => <article key={`${item.source}-${item.id}`}><div className="app-agenda-item__icon">{item.source === "task" ? <TasksIcon /> : item.source === "visit" ? <PinIcon /> : <CalendarIcon />}</div><div><strong>{item.title}</strong><span>{eventTypeLabel(item.type)}{item.opportunity ? ` · ${item.opportunity.title}` : ""}</span></div><div><strong>{formatInTimeZone(item.startsAt, timezone, { day: "2-digit", month: "2-digit" })}</strong><span>{item.allDay ? "Prazo" : `${labelTime(item.startsAt, timezone)} — ${labelTime(item.endsAt, timezone)}`}</span></div><span>{item.responsible?.displayName ?? "—"}</span></article>)}</section>}
    {modalDate && <EventModal organizationId={organizationId} timezone={timezone} defaultDate={modalDate} eventItem={selectedEvent ?? undefined} onClose={() => { setModalDate(null); setSelectedEvent(null); }} onSaved={() => { setModalDate(null); setSelectedEvent(null); void load(); }} />}
  </>;
}
