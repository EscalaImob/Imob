import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AppApiError } from "../../services/appApi";
import { listProperties, type PropertyListItem } from "../../services/propertiesApi";
import { getOpportunityBoard, listContacts, type ContactListItem, type OpportunityCard } from "../../services/crmApi";
import { createVisit, listVisitAssignees, updateVisit, type VisitAssignee, type VisitInput, type VisitListItem, type VisitStatus } from "../../services/visitsApi";

function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function defaultStart(): string {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return toLocalInput(date.toISOString());
}
function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

interface VisitModalProps {
  organizationId: string;
  visit?: VisitListItem | null;
  preset?: { contactId: string; contactName: string; opportunityId?: string; opportunityTitle?: string; propertyId?: string; propertyTitle?: string; title?: string };
  canReadContacts: boolean;
  canReadOpportunities: boolean;
  canReadProperties: boolean;
  onClose: () => void;
  onSaved: (visit: VisitListItem) => void;
}

export function VisitModal({ organizationId, visit, preset, canReadContacts, canReadOpportunities, canReadProperties, onClose, onSaved }: VisitModalProps) {
  const initialStart = visit ? toLocalInput(visit.startsAt) : defaultStart();
  const [title, setTitle] = useState(visit?.title ?? preset?.title ?? "");
  const [notes, setNotes] = useState(visit?.notes ?? "");
  const [location, setLocation] = useState(visit?.location ?? "");
  const [status, setStatus] = useState<VisitStatus>(visit?.status ?? "scheduled");
  const [startsAt, setStartsAt] = useState(initialStart);
  const [endsAt, setEndsAt] = useState(visit ? toLocalInput(visit.endsAt) : toLocalInput(new Date(new Date(initialStart).getTime() + 60 * 60_000).toISOString()));
  const [responsibleMembershipId, setResponsibleMembershipId] = useState(visit?.responsible?.membershipId ?? "");
  const [contactId, setContactId] = useState(visit?.contact.id ?? preset?.contactId ?? "");
  const [opportunityId, setOpportunityId] = useState(visit?.opportunity?.id ?? preset?.opportunityId ?? "");
  const [propertyId, setPropertyId] = useState(visit?.property?.id ?? preset?.propertyId ?? "");
  const [feedbackRating, setFeedbackRating] = useState(visit?.feedbackRating ? String(visit.feedbackRating) : "");
  const [feedbackNotes, setFeedbackNotes] = useState(visit?.feedbackNotes ?? "");
  const [cancellationReason, setCancellationReason] = useState(visit?.cancellationReason ?? "");
  const [assignees, setAssignees] = useState<VisitAssignee[]>([]);
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [properties, setProperties] = useState<PropertyListItem[]>([]);
  const [opportunities, setOpportunities] = useState<Array<OpportunityCard & { funnelCode: "buyers" | "capture" }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listVisitAssignees(organizationId).then((items) => { if (active) setAssignees(items); }).catch((loadError) => { if (active) setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar responsáveis."); });
    if (canReadContacts) {
      void listContacts(organizationId, { status: "active", pageSize: 100 }).then((result) => { if (active) setContacts(result.items); }).catch((loadError) => { if (active) setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar clientes."); });
    }
    if (canReadProperties) {
      void listProperties(organizationId, { pageSize: 100 }).then((result) => { if (active) setProperties(result.items); }).catch(() => undefined);
    }
    if (canReadOpportunities) {
      void Promise.all([getOpportunityBoard(organizationId, { funnel: "buyers", view: "all" }), getOpportunityBoard(organizationId, { funnel: "capture", view: "all" })]).then(([buyers, capture]) => {
        if (!active) return;
        setOpportunities([
          ...buyers.funnel.stages.flatMap((stage) => stage.opportunities.map((item) => ({ ...item, funnelCode: "buyers" as const }))),
          ...capture.funnel.stages.flatMap((stage) => stage.opportunities.map((item) => ({ ...item, funnelCode: "capture" as const }))),
        ]);
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [organizationId, canReadContacts, canReadOpportunities, canReadProperties]);

  const filteredOpportunities = useMemo(() => opportunities.filter((item) => !contactId || item.contact.id === contactId), [opportunities, contactId]);
  const invalidSchedule = useMemo(() => {
    const start = new Date(startsAt).getTime(); const end = new Date(endsAt).getTime();
    return !startsAt || !endsAt || !Number.isFinite(start) || !Number.isFinite(end) || end <= start;
  }, [startsAt, endsAt]);

  function chooseOpportunity(value: string) {
    setOpportunityId(value);
    const selected = opportunities.find((item) => item.id === value);
    if (selected) setContactId(selected.contact.id);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !location.trim() || !contactId || invalidSchedule || saving || (status === "canceled" && !cancellationReason.trim())) return;
    const input: VisitInput = {
      title: title.trim(),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      location: location.trim(),
      status,
      startsAt: toIso(startsAt)!,
      endsAt: toIso(endsAt)!,
      ...(responsibleMembershipId ? { responsibleMembershipId } : {}),
      contactId,
      ...(opportunityId ? { opportunityId } : {}),
      ...(propertyId ? { propertyId } : {}),
      ...(feedbackRating ? { feedbackRating: Number(feedbackRating) } : {}),
      ...(feedbackNotes.trim() ? { feedbackNotes: feedbackNotes.trim() } : {}),
      ...(status === "canceled" && cancellationReason.trim() ? { cancellationReason: cancellationReason.trim() } : {}),
    };
    setSaving(true); setError(null);
    try {
      const saved = visit ? await updateVisit(organizationId, visit.id, input) : await createVisit(organizationId, input);
      onSaved(saved);
    } catch (saveError) {
      setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível salvar a visita.");
    } finally { setSaving(false); }
  }

  return <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="app-modal app-visit-modal" role="dialog" aria-modal="true" aria-labelledby="visit-modal-title">
      <header className="app-modal__header"><div><span className="app-section-eyebrow">Produtividade</span><h2 id="visit-modal-title">{visit ? "Editar visita" : "Nova visita"}</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Fechar">×</button></header>
      <form onSubmit={submit}>
        <div className="app-modal__body app-task-form-grid">
          {error && <div className="app-inline-error is-wide">{error}</div>}
          <label className="is-wide"><span>Título *</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={220} required autoFocus /></label>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as VisitStatus)}><option value="scheduled">Agendada</option><option value="confirmed">Confirmada</option><option value="completed">Realizada</option><option value="canceled">Cancelada</option></select></label>
          <label><span>Responsável</span><select value={responsibleMembershipId} onChange={(event) => setResponsibleMembershipId(event.target.value)}><option value="">Eu (padrão)</option>{assignees.map((item) => <option key={item.membershipId} value={item.membershipId}>{item.displayName}</option>)}</select></label>
          <label><span>Início *</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label>
          <label><span>Fim *</span><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required /></label>
          {invalidSchedule && <div className="app-field-error is-wide">Informe um intervalo válido para a visita.</div>}
          <label className="is-wide"><span>Local *</span><input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={500} placeholder="Endereço, condomínio ou ponto de encontro" required /></label>
          <label><span>Cliente *</span><select value={contactId} onChange={(event) => { setContactId(event.target.value); if (opportunityId && !opportunities.some((item) => item.id === opportunityId && item.contact.id === event.target.value)) setOpportunityId(""); }} disabled={!canReadContacts} required><option value="">Selecione</option>{!canReadContacts && (visit || preset) && <option value={visit?.contact.id ?? preset!.contactId}>{visit?.contact.name ?? preset!.contactName}</option>}{contacts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Oportunidade</span><select value={opportunityId} onChange={(event) => chooseOpportunity(event.target.value)} disabled={!canReadOpportunities}><option value="">Sem vínculo</option>{!canReadOpportunities && (visit?.opportunity || preset?.opportunityId) && <option value={visit?.opportunity?.id ?? preset!.opportunityId!}>{visit?.opportunity?.title ?? preset!.opportunityTitle ?? "Oportunidade atual"}</option>}{filteredOpportunities.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.funnelCode === "buyers" ? "Compradores" : "Captação"}</option>)}</select></label><label><span>Imóvel</span><select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} disabled={!canReadProperties}><option value="">Sem imóvel vinculado</option>{!canReadProperties && (visit?.property || preset?.propertyId) && <option value={visit?.property?.id ?? preset!.propertyId!}>{visit?.property ? `${visit.property.internalCode} · ${visit.property.title}` : preset?.propertyTitle ?? "Imóvel atual"}</option>}{properties.map((item) => <option key={item.id} value={item.id}>{item.internalCode} · {item.title}</option>)}</select></label>
          <label className="is-wide"><span>Observações</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={4000} /></label>
          {status === "completed" && <><label><span>Avaliação da visita</span><select value={feedbackRating} onChange={(event) => setFeedbackRating(event.target.value)}><option value="">Sem nota</option><option value="1">1 — Muito baixa</option><option value="2">2 — Baixa</option><option value="3">3 — Neutra</option><option value="4">4 — Boa</option><option value="5">5 — Excelente</option></select></label><label className="is-wide"><span>Feedback pós-visita</span><textarea value={feedbackNotes} onChange={(event) => setFeedbackNotes(event.target.value)} rows={4} maxLength={4000} placeholder="Interesse, objeções, próximos passos..." /></label></>}
          {status === "canceled" && <label className="is-wide"><span>Motivo do cancelamento *</span><textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={3} maxLength={1000} required /></label>}
        </div>
        <footer className="app-modal__footer"><button type="button" className="app-secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="app-primary-button" disabled={saving || !title.trim() || !location.trim() || !contactId || invalidSchedule || (status === "canceled" && !cancellationReason.trim())}>{saving ? "Salvando..." : visit ? "Salvar visita" : "Agendar visita"}</button></footer>
      </form>
    </section>
  </div>;
}
