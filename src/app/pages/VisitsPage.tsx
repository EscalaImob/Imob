import { useCallback, useEffect, useMemo, useState } from "react";
import { AppApiError } from "../../services/appApi";
import { listVisits, updateVisit, type VisitListItem, type VisitStatus, type VisitView } from "../../services/visitsApi";
import { PinIcon } from "../icons";
import { VisitModal } from "../components/VisitModal";

const statusLabels: Record<VisitStatus, string> = { scheduled: "Agendada", confirmed: "Confirmada", completed: "Realizada", canceled: "Cancelada" };
function formatDate(value: string): string { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }

interface Props {
  organizationId: string;
  canCreate: boolean;
  canUpdate: boolean;
  canReadContacts: boolean;
  canReadOpportunities: boolean; canReadProperties: boolean;
}

export function VisitsPage({ organizationId, canCreate, canUpdate, canReadContacts, canReadOpportunities, canReadProperties }: Props) {
  const [view, setView] = useState<VisitView>("all");
  const [status, setStatus] = useState<VisitStatus | "">("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Awaited<ReturnType<typeof listVisits>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisit, setModalVisit] = useState<VisitListItem | null | undefined>(undefined);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => { const timer = globalThis.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 250); return () => globalThis.clearTimeout(timer); }, [search]);
  const filters = useMemo(() => ({ view, ...(status ? { status } : {}), ...(debouncedSearch ? { search: debouncedSearch } : {}), page, pageSize: 50 }), [view, status, debouncedSearch, page]);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setResult(await listVisits(organizationId, filters)); } catch (loadError) { setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as visitas."); } finally { setLoading(false); } }, [organizationId, filters]);
  useEffect(() => { void load(); }, [load]);

  async function removeVisit(visit: VisitListItem) {
    if (visit.status === "canceled" || !globalThis.confirm(`Excluir a visita "${visit.title}"? Ela será cancelada e o histórico será preservado.`)) return;
    setRemovingId(visit.id); setError(null);
    try {
      await updateVisit(organizationId, visit.id, { title: visit.title, notes: visit.notes ?? undefined, location: visit.location, status: "canceled", startsAt: visit.startsAt, endsAt: visit.endsAt, responsibleMembershipId: visit.responsible?.membershipId, contactId: visit.contact.id, opportunityId: visit.opportunity?.id, propertyId: visit.property?.id, feedbackRating: visit.feedbackRating ?? undefined, feedbackNotes: visit.feedbackNotes ?? undefined, cancellationReason: "Excluída pelo usuário" });
      await load();
    } catch (removeError) { setError(removeError instanceof AppApiError ? removeError.message : "Não foi possível excluir a visita."); }
    finally { setRemovingId(null); }
  }

  return <>
    <section className="app-page-heading"><div><span className="app-section-eyebrow">Produtividade</span><h1>Gestão de visitas</h1><p>Agende, confirme e acompanhe visitas com histórico conectado ao CRM.</p></div>{canCreate && canReadContacts && <button className="app-primary-button" type="button" onClick={() => setModalVisit(null)}>+ Nova visita</button>}</section>
    {error && <div className="app-inline-error">{error}</div>}
    <section className="app-productivity-metrics">
      <article><strong>{result?.summary.total ?? "—"}</strong><span>Total</span></article>
      <article><strong>{result?.summary.scheduled ?? "—"}</strong><span>Agendadas</span></article>
      <article><strong>{result?.summary.completed ?? "—"}</strong><span>Realizadas</span></article>
      <article><strong>{result?.summary.today ?? "—"}</strong><span>Para hoje</span></article>
    </section>
    <section className="app-productivity-toolbar app-visits-toolbar">
      <div className="app-segmented"><button type="button" className={view === "all" ? "is-active" : ""} onClick={() => { setView("all"); setPage(1); }}>Todas</button><button type="button" className={view === "mine" ? "is-active" : ""} onClick={() => { setView("mine"); setPage(1); }}>Minhas</button></div>
      <input className="app-productivity-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, visita ou local..." />
      <select value={status} onChange={(event) => { setStatus(event.target.value as VisitStatus | ""); setPage(1); }}><option value="">Todos os status</option><option value="scheduled">Agendadas</option><option value="confirmed">Confirmadas</option><option value="completed">Realizadas</option><option value="canceled">Canceladas</option></select>
    </section>
    {loading ? <div className="app-list-loading">Carregando visitas...</div> : !result || result.items.length === 0 ? <section className="app-productivity-empty app-visits-empty"><PinIcon /><h2>Nenhuma visita encontrada</h2><p>{canCreate && canReadContacts ? "Agende a primeira visita ou ajuste os filtros." : "Não há visitas disponíveis para os filtros atuais."}</p></section> : <section className="app-visits-list app-action-table"><header><span>Visita</span><span>Cliente</span><span>Data e horário</span><span>Responsável</span><span>Status</span><span>Ações</span></header>{result.items.map((visit) => <div className="app-action-table-row" key={visit.id}><span><strong>{visit.title}</strong><small>{visit.location}{visit.property ? ` · ${visit.property.internalCode} — ${visit.property.title}` : visit.opportunity ? ` · ${visit.opportunity.title}` : ""}</small></span><span>{visit.contact.name}</span><span><strong>{formatDate(visit.startsAt)}</strong><small>até {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(visit.endsAt))}</small></span><span>{visit.responsible?.displayName ?? "—"}</span><span><em className={`app-visit-status status-${visit.status}`}>{statusLabels[visit.status]}</em>{visit.status === "completed" && visit.feedbackRating ? <small>{"★".repeat(visit.feedbackRating)}</small> : null}</span><span className="app-row-actions">{canUpdate&&<button className="app-secondary-button" type="button" onClick={()=>setModalVisit(visit)}>Editar</button>}{canUpdate&&visit.status!=="canceled"&&<button className="app-secondary-button is-danger" type="button" disabled={removingId===visit.id} onClick={()=>void removeVisit(visit)}>{removingId===visit.id?"Excluindo...":"Excluir"}</button>}</span></div>)}</section>}
    {result && result.totalPages > 1 && <div className="app-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button><span>{page} / {result.totalPages}</span><button type="button" disabled={page >= result.totalPages} onClick={() => setPage((current) => current + 1)}>Próxima</button></div>}
    {modalVisit !== undefined && <VisitModal organizationId={organizationId} visit={modalVisit} canReadContacts={canReadContacts} canReadOpportunities={canReadOpportunities} canReadProperties={canReadProperties} onClose={() => setModalVisit(undefined)} onSaved={() => { setModalVisit(undefined); void load(); }} />}
  </>;
}
