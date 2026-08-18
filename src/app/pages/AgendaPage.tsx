import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AppApiError } from "../../services/appApi";
import { createCalendarEvent, listAgenda, listTaskAssignees, type AgendaItem, type CalendarEventType, type ProductivityAssignee } from "../../services/productivityApi";
import { CalendarIcon, PinIcon, TasksIcon } from "../icons";

function startOfDay(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; }
function addDays(date: Date, days: number) { const value = new Date(date); value.setDate(value.getDate() + days); return value; }
function startOfWeek(date: Date) { const value = startOfDay(date); value.setDate(value.getDate() - value.getDay()); return value; }
function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonthGrid(date: Date) { const start = startOfWeek(startOfMonth(date)); const end = new Date(date.getFullYear(), date.getMonth() + 1, 1); const cells = Math.ceil((end.getTime() - start.getTime()) / 86_400_000 / 7) * 7; return addDays(start, Math.max(35, cells)); }
function localInput(date: Date) { const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function labelDate(date: Date) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date); }
function labelTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function eventTypeLabel(type: AgendaItem["type"]) { return ({ task: "Tarefa", visit: "Visita", meeting: "Reunião", evaluation: "Avaliação", signature: "Assinatura", inspection: "Vistoria", custom: "Compromisso" } as const)[type] ?? "Compromisso"; }

function EventModal({ organizationId, defaultDate, onClose, onSaved }: { organizationId: string; defaultDate: Date; onClose: () => void; onSaved: () => void }) {
  const [assignees, setAssignees] = useState<ProductivityAssignee[]>([]);
  const [type, setType] = useState<CalendarEventType>("meeting");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const initialStart = useMemo(() => { const value = new Date(defaultDate); if (value.getHours() === 0) value.setHours(9); return value; }, [defaultDate]);
  const [startsAt, setStartsAt] = useState(localInput(initialStart));
  const [endsAt, setEndsAt] = useState(localInput(new Date(initialStart.getTime() + 60 * 60_000)));
  const [responsibleMembershipId, setResponsibleMembershipId] = useState("");
  const [privateEvent, setPrivateEvent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void listTaskAssignees(organizationId).then((items) => { setAssignees(items); }).catch((loadError) => setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar responsáveis.")); }, [organizationId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!title.trim() || saving) return;
    const start = new Date(startsAt); const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) { setError("Informe um horário válido para o compromisso."); return; }
    setSaving(true); setError(null);
    try { await createCalendarEvent(organizationId, { type, title: title.trim(), ...(description.trim() ? { description: description.trim() } : {}), startsAt: start.toISOString(), endsAt: end.toISOString(), ...(responsibleMembershipId ? { responsibleMembershipId } : {}), private: privateEvent }); onSaved(); }
    catch (saveError) { setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível criar o compromisso."); }
    finally { setSaving(false); }
  }
  return <div className="app-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="app-modal app-calendar-modal" role="dialog" aria-modal="true"><header className="app-modal__header"><div><span className="app-section-eyebrow">Agenda</span><h2>Novo compromisso</h2></div><button type="button" onClick={onClose} disabled={saving}>×</button></header><form onSubmit={submit}><div className="app-modal__body app-task-form-grid">{error && <div className="app-inline-error is-wide">{error}</div>}<label><span>Tipo</span><select value={type} onChange={(event) => setType(event.target.value as CalendarEventType)}><option value="meeting">Reunião</option><option value="evaluation">Avaliação</option><option value="signature">Assinatura</option><option value="inspection">Vistoria</option><option value="custom">Compromisso</option></select></label><label><span>Responsável</span><select value={responsibleMembershipId} onChange={(event) => setResponsibleMembershipId(event.target.value)}><option value="">Eu (padrão)</option>{assignees.map((item) => <option key={item.membershipId} value={item.membershipId}>{item.displayName}</option>)}</select></label><label className="is-wide"><span>Título *</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={220} required autoFocus /></label><label><span>Início</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label><label><span>Fim</span><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required /></label><label className="is-wide"><span>Descrição</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={4000} /></label><label className="app-checkbox-field is-wide"><input type="checkbox" checked={privateEvent} onChange={(event) => setPrivateEvent(event.target.checked)} /><span>Compromisso privado</span></label></div><footer className="app-modal__footer"><button type="button" className="app-secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="app-primary-button" disabled={saving || !title.trim()}>{saving ? "Salvando..." : "Criar compromisso"}</button></footer></form></section></div>;
}

export function AgendaPage({ organizationId, canCreate }: { organizationId: string; canCreate: boolean }) {
  const [view, setView] = useState<"month" | "week" | "day" | "list">("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const range = useMemo(() => {
    if (view === "month") return { from: startOfWeek(startOfMonth(anchor)), to: endOfMonthGrid(anchor) };
    if (view === "week") { const from = startOfWeek(anchor); return { from, to: addDays(from, 7) }; }
    if (view === "day") { const from = startOfDay(anchor); return { from, to: addDays(from, 1) }; }
    const from = startOfDay(anchor); return { from: addDays(from, -7), to: addDays(from, 30) };
  }, [anchor, view]);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setItems((await listAgenda(organizationId, range.from, range.to)).items); } catch (loadError) { setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar a agenda."); } finally { setLoading(false); } }, [organizationId, range.from.getTime(), range.to.getTime()]);
  useEffect(() => { void load(); }, [load]);
  function navigate(direction: number) { setAnchor((current) => { const value = new Date(current); if (view === "month") value.setMonth(value.getMonth() + direction); else if (view === "week") value.setDate(value.getDate() + direction * 7); else value.setDate(value.getDate() + direction); return value; }); }
  const title = view === "month" ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(anchor) : view === "week" ? `${labelDate(range.from)} — ${labelDate(addDays(range.to, -1))}` : new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(anchor);
  const monthDays = useMemo(() => { const days: Date[] = []; for (let date = new Date(range.from); date < range.to; date = addDays(date, 1)) days.push(date); return days; }, [range.from.getTime(), range.to.getTime()]);
  const itemsForDay = (date: Date) => items.filter((item) => { const when = new Date(item.startsAt); return when.getFullYear() === date.getFullYear() && when.getMonth() === date.getMonth() && when.getDate() === date.getDate(); });

  return <>
    <section className="app-module-header"><div><span className="app-section-eyebrow">Produtividade</span><h1>Agenda</h1><p>Visão consolidada de tarefas e compromissos da operação.</p></div>{canCreate && <button className="app-primary-button" type="button" onClick={() => setModalDate(new Date(anchor))}>+ Novo compromisso</button>}</section>
    {error && <div className="app-inline-error">{error}</div>}
    <section className="app-calendar-toolbar"><div><button type="button" onClick={() => navigate(-1)}>‹</button><button type="button" onClick={() => setAnchor(new Date())}>Hoje</button><button type="button" onClick={() => navigate(1)}>›</button></div><strong>{title}</strong><div className="app-segmented"><button type="button" className={view === "month" ? "is-active" : ""} onClick={() => setView("month")}>Mês</button><button type="button" className={view === "week" ? "is-active" : ""} onClick={() => setView("week")}>Semana</button><button type="button" className={view === "day" ? "is-active" : ""} onClick={() => setView("day")}>Dia</button><button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}>Lista</button></div></section>
    {loading ? <div className="app-list-loading">Carregando agenda...</div> : view === "month" ? <section className="app-calendar-month"><header>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => <span key={day}>{day}</span>)}</header><div className="app-calendar-month__grid">{monthDays.map((date) => <button type="button" className={`app-calendar-day${date.getMonth() !== anchor.getMonth() ? " is-outside" : ""}`} key={date.toISOString()} onDoubleClick={() => canCreate && setModalDate(date)}><strong>{date.getDate()}</strong><div>{itemsForDay(date).slice(0, 3).map((item) => <span className={`app-calendar-chip source-${item.source}`} key={`${item.source}-${item.id}`}><em>{item.allDay ? "" : labelTime(item.startsAt)}</em>{item.title}</span>)}{itemsForDay(date).length > 3 && <small>+ {itemsForDay(date).length - 3} itens</small>}</div></button>)}</div></section> : view === "week" ? <section className="app-calendar-week">{Array.from({ length: 7 }, (_, index) => addDays(range.from, index)).map((date) => <article key={date.toISOString()}><header><strong>{new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date)}</strong><span>{date.getDate()}</span></header><div>{itemsForDay(date).length === 0 ? <small>Sem compromissos</small> : itemsForDay(date).map((item) => <div className={`app-agenda-item source-${item.source}`} key={`${item.source}-${item.id}`}><time>{item.allDay ? "Prazo" : labelTime(item.startsAt)}</time><strong>{item.title}</strong><span>{eventTypeLabel(item.type)} · {item.responsible?.displayName ?? "Sem responsável"}</span></div>)}</div></article>)}</section> : <section className="app-calendar-list">{items.length === 0 ? <div className="app-productivity-empty"><CalendarIcon /><h2>Nenhum compromisso no período</h2><p>Crie um compromisso ou agende uma tarefa para vê-la aqui.</p></div> : items.map((item) => <article key={`${item.source}-${item.id}`}><div className="app-agenda-item__icon">{item.source === "task" ? <TasksIcon /> : item.source === "visit" ? <PinIcon /> : <CalendarIcon />}</div><div><strong>{item.title}</strong><span>{eventTypeLabel(item.type)}{item.opportunity ? ` · ${item.opportunity.title}` : ""}</span></div><div><strong>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(item.startsAt))}</strong><span>{item.allDay ? "Prazo" : `${labelTime(item.startsAt)} — ${labelTime(item.endsAt)}`}</span></div><span>{item.responsible?.displayName ?? "—"}</span></article>)}</section>}
    {modalDate && <EventModal organizationId={organizationId} defaultDate={modalDate} onClose={() => setModalDate(null)} onSaved={() => { setModalDate(null); void load(); }} />}
  </>;
}
