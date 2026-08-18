import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { FunnelIcon, SearchIcon, UsersIcon } from "../icons";
import {
  AppApiError,
} from "../../services/appApi";
import {
  createOpportunity,
  getOpportunityBoard,
  listContacts,
  moveOpportunityStage,
  type ContactListItem,
  type OpportunityCard,
  type OpportunityFunnelCode,
  type OpportunityRequiredField,
  type OpportunityStage,
} from "../../services/crmApi";

interface Props {
  organizationId: string;
  funnelCode: OpportunityFunnelCode;
  canCreate: boolean;
  canUpdate: boolean;
}

type TransitionState = {
  card: OpportunityCard;
  stage: OpportunityStage;
  lossReasonId: string;
} | null;

function currency(value: string | null): string {
  if (!value) return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(numeric);
}

function shortDate(value: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return null;
  return `${day}/${month}/${year}`;
}

function temperatureLabel(value: OpportunityCard["temperature"]): string | null {
  if (value === "hot") return "Quente";
  if (value === "warm") return "Morno";
  if (value === "cold") return "Frio";
  return null;
}

function terminalOutcome(stage: OpportunityStage): "success" | "loss" | null {
  if (stage.outcome === "won" || stage.outcome === "captured") return "success";
  if (stage.outcome === "lost" || stage.outcome === "not_captured") return "loss";
  return null;
}

function requiredFieldLabel(field: OpportunityRequiredField): string {
  if (field === "description") return "Descrição";
  if (field === "estimatedValue") return "Valor estimado";
  if (field === "expectedCloseDate") return "Previsão de fechamento";
  return "Temperatura";
}

function OpportunityCardView({ card, canUpdate, isDragging, onPointerDragStart, onPointerDragMove, onPointerDragEnd, onPointerDragCancel, onOpen }: { card: OpportunityCard; canUpdate: boolean; isDragging: boolean; onPointerDragStart: (card: OpportunityCard, clientX: number, clientY: number) => void; onPointerDragMove: (clientX: number, clientY: number) => void; onPointerDragEnd: (card: OpportunityCard, clientX: number, clientY: number) => void; onPointerDragCancel: () => void; onOpen: (card: OpportunityCard) => void }) {
  const date = shortDate(card.expectedCloseDate);
  const temp = temperatureLabel(card.temperature);
  const gesture = useRef<null | { pointerId: number; startX: number; startY: number; dragging: boolean }>(null);

  function clearGesture() {
    gesture.current = null;
  }

  return (
    <article
      className={`app-opportunity-card app-opportunity-card--${card.status}${canUpdate ? " is-draggable" : ""}${isDragging ? " is-dragging" : ""}`}
      role="link"
      tabIndex={0}
      aria-label={`Abrir ${card.title}, ${card.contact.name}`}
      onPointerDown={(event) => {
        if (!canUpdate || event.button !== 0 || !event.isPrimary) return;
        gesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
        if (!current.dragging && distance >= 6) {
          current.dragging = true;
          onPointerDragStart(card, event.clientX, event.clientY);
        }
        if (current.dragging) {
          event.preventDefault();
          onPointerDragMove(event.clientX, event.clientY);
        }
      }}
      onPointerUp={(event) => {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        clearGesture();
        if (current.dragging) {
          event.preventDefault();
          onPointerDragEnd(card, event.clientX, event.clientY);
          return;
        }
        onOpen(card);
      }}
      onPointerCancel={(event) => {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const wasDragging = current.dragging;
        clearGesture();
        if (wasDragging) onPointerDragCancel();
      }}
      onLostPointerCapture={(event) => {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const wasDragging = current.dragging;
        clearGesture();
        if (wasDragging) onPointerDragCancel();
      }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(card); } }}
    >
      <div className="app-opportunity-card__top">
        <strong>{card.title}</strong>
        {temp && <span className={`app-temperature app-temperature--${card.temperature}`}>{temp}</span>}
      </div>
      <div className="app-opportunity-card__contact"><UsersIcon /><span>{card.contact.name}</span></div>
      <div className="app-opportunity-card__value"><strong>{currency(card.estimatedValue)}</strong><span>{card.probability ?? 0}%</span></div>
      <div className="app-opportunity-card__meta">
        <span>{card.responsible?.displayName ?? "Sem responsável"}</span>
        {date && <span>Prev. {date}</span>}
      </div>
    </article>
  );
}

function OpportunityModal({ organizationId, funnelCode, onClose, onCreated }: { organizationId: string; funnelCode: OpportunityFunnelCode; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [probability, setProbability] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [temperature, setTemperature] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => {
      setContactsLoading(true);
      void listContacts(organizationId, { search: contactSearch, status: "active", pageSize: 100 })
        .then((result) => setContacts(result.items))
        .catch((loadError) => setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar os clientes."))
        .finally(() => setContactsLoading(false));
    }, 250);
    return () => globalThis.clearTimeout(timeout);
  }, [organizationId, contactSearch]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !contactId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createOpportunity(organizationId, {
        funnelCode,
        contactId,
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(estimatedValue.trim() ? { estimatedValue: estimatedValue.trim() } : {}),
        ...(probability !== "" ? { probability: Number(probability) } : {}),
        ...(expectedCloseDate ? { expectedCloseDate } : {}),
        ...(temperature === "cold" || temperature === "warm" || temperature === "hot" ? { temperature } : {}),
      });
      onCreated();
    } catch (saveError) {
      setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível criar a oportunidade.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="app-modal app-opportunity-modal" role="dialog" aria-modal="true" aria-labelledby="new-opportunity-title">
        <header><div><span className="app-section-eyebrow">CRM & Vendas</span><h2 id="new-opportunity-title">Nova oportunidade</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Fechar">×</button></header>
        <form onSubmit={submit}>
          {error && <div className="app-inline-error">{error}</div>}
          <div className="app-form-grid">
            <label className="is-wide"><span>Título da oportunidade *</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={220} placeholder={funnelCode === "buyers" ? "Ex.: Compra apartamento Asa Sul" : "Ex.: Captação casa Lago Sul"} required /></label>
            <label className="is-wide"><span>Buscar cliente</span><input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder="Nome, e-mail, telefone ou documento..." /></label>
            <label className="is-wide"><span>Cliente *</span><select value={contactId} onChange={(event) => setContactId(event.target.value)} required disabled={contactsLoading}><option value="">{contactsLoading ? "Carregando clientes..." : contacts.length === 0 ? "Nenhum cliente disponível" : "Selecione um cliente"}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.email ? ` — ${contact.email}` : ""}</option>)}</select></label>
            <label><span>Valor estimado</span><input value={estimatedValue} onChange={(event) => setEstimatedValue(event.target.value)} inputMode="decimal" placeholder="Ex.: 850000,00" /></label>
            <label><span>Probabilidade (%)</span><input value={probability} onChange={(event) => setProbability(event.target.value)} type="number" min="0" max="100" placeholder="Padrão da etapa" /></label>
            <label><span>Previsão de fechamento</span><input value={expectedCloseDate} onChange={(event) => setExpectedCloseDate(event.target.value)} type="date" /></label>
            <label><span>Temperatura</span><select value={temperature} onChange={(event) => setTemperature(event.target.value)}><option value="">Não informada</option><option value="cold">Frio</option><option value="warm">Morno</option><option value="hot">Quente</option></select></label>
            <label className="is-wide"><span>Descrição / observações</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={4} placeholder="Contexto comercial e informações importantes..." /></label>
          </div>
          <footer><button type="button" className="app-secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="app-primary-button" disabled={saving || !title.trim() || !contactId}>{saving ? "Criando..." : "Criar oportunidade"}</button></footer>
        </form>
      </section>
    </div>
  );
}

function TransitionModal({ state, lossReasons, saving, error, onClose, onConfirm }: { state: NonNullable<TransitionState>; lossReasons: Array<{ id: string; name: string }>; saving: boolean; error: string | null; onClose: () => void; onConfirm: (lossReasonId: string) => void }) {
  const [lossReasonId, setLossReasonId] = useState(state.lossReasonId);
  const outcome = terminalOutcome(state.stage);
  const isReopen = state.card.status !== "open" && !outcome;
  const requiresReason = outcome === "loss";
  const title = requiresReason
    ? (state.stage.outcome === "not_captured" ? "Marcar como não captado" : "Marcar como perdido")
    : isReopen ? "Reabrir oportunidade"
      : state.stage.outcome === "captured" ? "Confirmar imóvel captado"
        : state.stage.outcome === "won" ? "Confirmar oportunidade ganha"
          : "Confirmar mudança de etapa";
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  return (
    <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="app-modal app-transition-modal" role="dialog" aria-modal="true" aria-labelledby="transition-title">
        <header><div><span className="app-section-eyebrow">Mudança de etapa</span><h2 id="transition-title">{title}</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Fechar">×</button></header>
        <div className="app-transition-modal__body">
          {error && <div className="app-inline-error">{error}</div>}
          <p><strong>{state.card.title}</strong> será movida para <strong>{state.stage.name}</strong>.</p>
          {state.stage.requiredFields.length > 0 && <div className="app-transition-required"><strong>Dados obrigatórios nesta etapa</strong><ul>{state.stage.requiredFields.map((field) => <li key={field}>{requiredFieldLabel(field)}</li>)}</ul><small>O backend valida esses dados antes da mudança. Se faltar algo, abra a oportunidade, preencha e tente novamente.</small></div>}
          {requiresReason && <label><span>Motivo *</span><select value={lossReasonId} onChange={(event) => setLossReasonId(event.target.value)} autoFocus><option value="">Selecione um motivo</option>{lossReasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select></label>}
          {requiresReason && lossReasons.length === 0 && <p className="app-transition-modal__notice">Não há motivo de perda ativo neste funil. Configure pelo menos um em Preferências operacionais.</p>}
          {isReopen && <p className="app-transition-modal__notice">A oportunidade voltará ao status aberto e poderá seguir normalmente pelo funil.</p>}
        </div>
        <footer><button type="button" className="app-secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button type="button" className="app-primary-button" disabled={saving || (requiresReason && !lossReasonId)} onClick={() => onConfirm(lossReasonId)}>{saving ? "Salvando..." : "Confirmar"}</button></footer>
      </section>
    </div>
  );
}

export function FunnelPage({ organizationId, funnelCode, canCreate, canUpdate }: Props) {
  const [board, setBoard] = useState<Awaited<ReturnType<typeof getOpportunityBoard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [view, setView] = useState<"all" | "mine">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [draggedCard, setDraggedCard] = useState<OpportunityCard | null>(null);
  const [dragTargetStageId, setDragTargetStageId] = useState<string | null>(null);
  const [transition, setTransition] = useState<TransitionState>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const defaultTitle = funnelCode === "buyers" ? "Funil de compradores" : "Funil de captação";
  const title = board?.funnel.name || defaultTitle;
  const subtitle = funnelCode === "buyers"
    ? "Acompanhe compradores e locatários do primeiro contato até o fechamento."
    : "Gerencie a jornada do proprietário até a captação ou encerramento da oportunidade.";

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => globalThis.clearTimeout(timeout);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBoard(await getOpportunityBoard(organizationId, { funnel: funnelCode, search: debouncedSearch, view }));
    } catch (loadError) {
      setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar o funil.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, funnelCode, debouncedSearch, view]);

  useEffect(() => { void load(); }, [load]);

  const totalCards = useMemo(() => board?.funnel.stages.reduce((total, stage) => total + stage.opportunities.length, 0) ?? 0, [board]);

  function stageIdAtPoint(clientX: number, clientY: number): string | null {
    const element = document.elementFromPoint(clientX, clientY);
    const stage = element?.closest<HTMLElement>("[data-kanban-stage-id]");
    return stage?.dataset.kanbanStageId ?? null;
  }

  function cancelPointerDrag() {
    setDraggedCard(null);
    setDragTargetStageId(null);
  }

  function finishPointerDrag(card: OpportunityCard, clientX: number, clientY: number) {
    const stageId = stageIdAtPoint(clientX, clientY);
    cancelPointerDrag();
    if (!stageId) return;
    const stage = board?.funnel.stages.find((item) => item.id === stageId);
    if (stage) requestMove(card, stage);
  }

  async function executeMove(state: NonNullable<TransitionState>, lossReasonId = "") {
    if (moving) return;
    setMoving(true);
    setError(null);
    setTransitionError(null);
    try {
      await moveOpportunityStage(organizationId, state.card.id, state.stage.id, lossReasonId || undefined);
      setTransition(null);
      cancelPointerDrag();
      await load();
    } catch (moveError) {
      const message = moveError instanceof AppApiError ? moveError.message : "Não foi possível mover a oportunidade.";
      setTransitionError(message);
      cancelPointerDrag();
    } finally {
      setMoving(false);
    }
  }

  function requestMove(card: OpportunityCard, stage: OpportunityStage) {
    cancelPointerDrag();
    setTransitionError(null);
    if (!canUpdate) return;
    const currentStage = board?.funnel.stages.find((item) => item.opportunities.some((opportunity) => opportunity.id === card.id));
    if (!currentStage || currentStage.id === stage.id) return;
    if (terminalOutcome(stage) || card.status !== "open" || stage.requiredFields.length > 0) {
      setTransition({ card, stage, lossReasonId: "" });
      return;
    }
    void executeMove({ card, stage, lossReasonId: "" });
  }

  return (
    <>
      <section className="app-section-header">
        <div><span className="app-section-eyebrow">CRM & Vendas</span><h1>{title}</h1><p>{subtitle}</p></div>
        {canCreate && <button type="button" className="app-primary-button" onClick={() => setCreateOpen(true)}>+ Nova oportunidade</button>}
      </section>

      <section className="app-funnel-summary" aria-label="Resumo do funil">
        <article><span>Oportunidades ativas</span><strong>{board?.summary.active ?? 0}</strong><small>{currency(board?.summary.estimatedOpenValue ?? "0")}</small></article>
        <article><span>Conversão</span><strong>{(board?.summary.conversionRate ?? 0).toFixed(1)}%</strong><small>{board ? `${board.summary.won} ganhos · ${board.summary.lost} perdidos` : "—"}</small></article>
        <article><span>Probabilidade média</span><strong>{(board?.summary.averageProbability ?? 0).toFixed(1)}%</strong><small>Oportunidades abertas</small></article>
      </section>

      <section className="app-funnel-controls">
        <div className="app-segmented" aria-label="Visão do funil"><button type="button" className={view === "all" ? "is-active" : ""} onClick={() => setView("all")}>Todas</button><button type="button" className={view === "mine" ? "is-active" : ""} onClick={() => setView("mine")}>Minhas</button></div>
        <label className="app-funnel-search"><SearchIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar oportunidade ou cliente..." /></label>
        <span className="app-funnel-count">{totalCards} {totalCards === 1 ? "oportunidade" : "oportunidades"}</span>
      </section>

      {error && <div className="app-inline-error">{error}</div>}
      {loading && !board ? <div className="app-list-loading">Carregando funil...</div> : board && (
        <section className="app-kanban-wrap" aria-label={title}>
          <div className="app-kanban">
            {board.funnel.stages.map((stage) => (
              <section
                className={`app-kanban-column${draggedCard && canUpdate ? " is-drop-ready" : ""}${dragTargetStageId === stage.id ? " is-drop-target" : ""}`}
                key={stage.id}
                data-kanban-stage-id={stage.id}
              >
                <header style={{ borderTopColor: stage.color }}><div><strong>{stage.name}</strong><span>{stage.probability ?? 0}%</span></div><b>{stage.opportunities.length}</b></header>
                <div className="app-kanban-column__body">
                  {stage.opportunities.map((card) => <OpportunityCardView key={card.id} card={card} canUpdate={canUpdate} isDragging={draggedCard?.id === card.id} onPointerDragStart={(selected, clientX, clientY) => { setDraggedCard(selected); setDragTargetStageId(stageIdAtPoint(clientX, clientY)); }} onPointerDragMove={(clientX, clientY) => setDragTargetStageId(stageIdAtPoint(clientX, clientY))} onPointerDragEnd={finishPointerDrag} onPointerDragCancel={cancelPointerDrag} onOpen={(selected) => { globalThis.location.href = `/app/oportunidade/?id=${encodeURIComponent(selected.id)}`; }} />)}
                  {stage.opportunities.length === 0 && <div className="app-kanban-empty">Nenhuma oportunidade</div>}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}

      {createOpen && <OpportunityModal organizationId={organizationId} funnelCode={funnelCode} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void load(); }} />}
      {transition && <TransitionModal state={transition} lossReasons={board?.funnel.lossReasons ?? []} saving={moving} error={transitionError} onClose={() => { if (!moving) { setTransition(null); setTransitionError(null); cancelPointerDrag(); } }} onConfirm={(lossReasonId) => { if (transition) void executeMove(transition, lossReasonId); }} />}
    </>
  );
}
