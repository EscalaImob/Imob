import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppApiError } from "../../services/appApi";
import { getMetaStatus, requestMeta, type Channel, type MetaStatus } from "../../services/metaApi";
import { assignConversation, closeConversation, isUuid, listConversations, listMessages, sendMessage, type ConversationFilters, type Message, type Page, type SendBlockedReason, type SendInput, type Thread, type ThreadStatus } from "../../services/conversationsApi";
import type { OrganizationMember } from "../../services/organizationSettingsApi";
import type { ContactDetail, LeadDetail, OpportunityDetail } from "../../services/crmApi";
import type { PropertyDetail } from "../../services/propertiesApi";
import "./meta.css";

interface Props {
  organizationId: string; membershipId: string; canSend: boolean; canAssign: boolean;
  canReadMembers: boolean; canReadMeta: boolean; canReadContact: boolean; canReadOpportunity: boolean; canReadProperty: boolean;
}
const channelLabels: Record<Channel, string> = { instagram: "Instagram Direct", messenger: "Messenger", whatsapp: "WhatsApp" };
const messageLabels: Record<Message["status"], string> = { received: "Recebida", pending: "Pendente — confirmação não recebida", sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Falhou" };
const reasons: Record<SendBlockedReason, string> = {
  FORBIDDEN: "Seu perfil não permite enviar mensagens.", CONVERSATION_CLOSED: "Conversa encerrada.",
  OPT_OUT: "O participante não autorizou mensagens (opt-out).", WINDOW_CLOSED: "Janela de resposta encerrada ou indisponível.",
  CONNECTION_REVOKED: "Conexão revogada ou desconectada.", META_PERMISSION_REQUIRED: "Permissão Meta pendente.",
  META_NOT_CONFIGURED: "Integração Meta não configurada.", FEATURE_DISABLED: "Envio desabilitado pelo servidor.",
  HANDOFF_REQUIRED: "É necessário assumir o atendimento humano antes de enviar.", META_UNAVAILABLE: "Serviço Meta indisponível.",
};
export function blockedReason(thread: Thread, canSend: boolean, membershipId: string, now = Date.now()): string | null {
  if (!canSend) return reasons.FORBIDDEN;
  if (thread.status === "closed") return reasons.CONVERSATION_CLOSED;
  if (thread.optOut) return reasons.OPT_OUT;
  if (!thread.canSend) return reasons[thread.sendBlockedReason as SendBlockedReason] ?? "Envio não autorizado pelo servidor.";
  if (thread.assigneeMembershipId !== membershipId) return reasons.HANDOFF_REQUIRED;
  if (!thread.windowEndsAt || !(Date.parse(thread.windowEndsAt) > now)) return reasons.WINDOW_CLOSED;
  return null;
}
export function conversationError(error: unknown): string {
  if (!(error instanceof AppApiError)) return "Não foi possível concluir a operação. Atualize e tente novamente.";
  if (error.code === "FORBIDDEN_ORGANIZATION" || error.code === "FORBIDDEN" || error.status === 403 && !(error.code in reasons)) return reasons.FORBIDDEN;
  if (error.code in reasons) return reasons[error.code as SendBlockedReason];
  if (error.code === "IDEMPOTENCY_CONFLICT") return "Conflito de idempotência. Não reenvie; atualize o histórico.";
  if (error.code === "NOT_FOUND" || error.status === 404) return "Conversa indisponível ou fora do seu escopo.";
  if (error.status === 503) return "Serviço temporariamente indisponível (503).";
  if (error.code === "CONFLICT") return "O estado da conversa mudou. Atualize antes de agir.";
  if (error.code === "UNAUTHORIZED") return "Sessão expirada. Entre novamente.";
  if (error.code === "REQUEST_TIMEOUT" || error.code === "NETWORK_ERROR") return "Não foi possível confirmar a operação por falha de comunicação.";
  return error.message;
}
export function chronological(previous: Message[], incoming: Message[]): Message[] {
  const unique = new Map(previous.map(m => [m.id, m]));
  for (const m of incoming) unique.set(m.id, m);
  return [...unique.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
}
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Não informado";
const participant = (thread: Thread) => thread.participantName?.trim() || "Participante sem nome informado";
type Attempt = SendInput & { uncertain: boolean; conflict?: boolean };
type ReadState<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; value: T };
function useRead<T>(key: string, enabled: boolean, read: (signal: AbortSignal) => Promise<T>): ReadState<T> | null {
  const [result, setResult] = useState<{ key: string; result: ReadState<T> } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setResult({ key, result: { state: "loading" } });
    void read(controller.signal).then(value => {
      if (!controller.signal.aborted) setResult({ key, result: { state: "ready", value } });
    }, error => {
      if (!controller.signal.aborted) setResult({ key, result: { state: "error", message: conversationError(error) } });
    });
    return () => controller.abort();
    // Caller supplies the complete request identity in key; do not rerun on callback identity.
  }, [key, enabled]);
  return enabled ? result?.key === key ? result.result : { state: "loading" } : null;
}
function ErrorText({ message }: { message: string }) { return <p className="meta-chat-error" role="alert">{message}</p>; }

export function ConversationsPage(props: Props) {
  // Includes all relevant grants: no old list, message, lookup or retry state on tenant/actor/grant changes.
  const key = [props.organizationId, props.membershipId, props.canSend, props.canAssign, props.canReadMembers, props.canReadMeta, props.canReadContact, props.canReadOpportunity, props.canReadProperty].join(":");
  return <ConversationWorkspace key={key} {...props} />;
}
function ConversationWorkspace(props: Props) {
  const { organizationId: org, membershipId } = props;
  const [filters, setFilters] = useState<ConversationFilters>({ page: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const attempts = useRef(new Map<string, Attempt>());
  const list = useRead(`list:${JSON.stringify(filters)}:${revision}`, true, signal => listConversations(org, filters, signal));
  const status = useRead(`status:${revision}`, props.canReadMeta, signal => getMetaStatus(org, signal));
  // Existing organization-members API; request only with its grant, use only active memberships.
  const roster = useRead(`members:${revision}`, props.canReadMembers, async signal => {
    const members = await requestMeta<OrganizationMember[]>(org, "/organization/members", signal);
    if (!Array.isArray(members)) throw new AppApiError("Lista de responsáveis inválida.", "INVALID_API_RESPONSE");
    return members.filter(m => m.membershipStatus === "active" && m.userStatus === "active" && isUuid(m.membershipId));
  });
  const members = roster?.state === "ready" ? roster.value : [];
  const memberName = (id: string | null) => id === null ? "Sem responsável" : id === membershipId ? "Você" : members.find(m => m.membershipId === id)?.displayName || id;
  const selected = list?.state === "ready" ? list.value.items.find(t => t.id === selectedId) : undefined;
  function filter(next: ConversationFilters) { setSelectedId(null); setNotice(""); setFilters(next); }
  function refresh() { setRevision(r => r + 1); }
  function changed(thread: Thread) {
    setNotice(thread.status === "closed" ? "Conversa encerrada pelo servidor." : "Responsável atualizado pelo servidor.");
    // Requery server scope; the returned thread may no longer be visible or match filters.
    refresh();
  }
  const connection = status?.state === "ready" ? status.value.connection : undefined;
  return <section className="meta-module meta-chat-module">
    <header className="app-section-header"><div><span className="app-section-eyebrow">Marketing</span><h1>Central de Conversas</h1><p>Atendimento humano em Instagram Direct, Messenger e WhatsApp.</p></div><button type="button" disabled={busy} onClick={refresh} className="app-primary-button">Atualizar</button></header>
    {status?.state === "loading" && <p role="status">Consultando conexão Meta…</p>}
    {status?.state === "error" && <ErrorText message={`Estado da conexão: ${status.message}`} />}
    {status?.state === "ready" && <ConnectionNotice status={status.value} />}
    {notice && <p role="status">{notice}</p>}
    <div className="meta-conversations">
      <section className="meta-panel meta-conversation-column" aria-label="Lista de conversas">
        <h2>Conversas</h2>
        <div className="meta-chat-filters">
          <label>Canal<select disabled={busy} value={filters.channel ?? ""} onChange={e => filter({ ...filters, channel: (e.target.value || undefined) as Channel | undefined, page: 1 })}><option value="">Todos</option>{Object.entries(channelLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>Situação<select disabled={busy} value={filters.status ?? ""} onChange={e => filter({ ...filters, status: (e.target.value || undefined) as ThreadStatus | undefined, page: 1 })}><option value="">Todas</option><option value="open">Abertas</option><option value="closed">Encerradas</option></select></label>
          <label>Responsável<select disabled={busy} value={filters.assigneeMembershipId ?? ""} onChange={e => filter({ ...filters, assigneeMembershipId: e.target.value || undefined, page: 1 })}><option value="">Todos os visíveis</option><option value={membershipId}>Minhas conversas</option>{members.filter(m => m.membershipId !== membershipId).map(m => <option key={m.membershipId} value={m.membershipId}>{m.displayName || m.membershipId}</option>)}{filters.assigneeMembershipId && filters.assigneeMembershipId !== membershipId && !members.some(m => m.membershipId === filters.assigneeMembershipId) && <option value={filters.assigneeMembershipId}>{filters.assigneeMembershipId}</option>}</select></label>
        </div>
        {roster?.state === "error" && <ErrorText message={`Lista de responsáveis: ${roster.message}`} />}
        {list?.state === "loading" && <p role="status">Carregando conversas…</p>}
        {list?.state === "error" && <ErrorText message={list.message} />}
        {list?.state === "ready" && <><p className="meta-muted">{list.value.totalItems} conversa(s) no escopo</p>
          {list.value.items.length === 0 ? <div className="meta-conversation-empty">Nenhuma conversa encontrada com os filtros selecionados.</div> : <ul className="meta-thread-list">{list.value.items.map(t => <li key={t.id}><button type="button" disabled={busy} aria-pressed={t.id === selectedId} onClick={() => { setSelectedId(t.id); setNotice(""); }}><strong>{participant(t)}</strong><span>{channelLabels[t.channel]} · {t.status === "open" ? "Aberta" : "Encerrada"}</span><small>{memberName(t.assigneeMembershipId)} · {dateLabel(t.lastMessageAt)}</small></button></li>)}</ul>}
          <div className="meta-chat-pagination"><button type="button" disabled={busy || list.value.page <= 1} onClick={() => filter({ ...filters, page: list.value.page - 1 })}>Anterior</button><span>Página {list.value.page} de {Math.max(1, list.value.totalPages)}</span><button type="button" disabled={busy || list.value.page >= list.value.totalPages} onClick={() => filter({ ...filters, page: list.value.page + 1 })}>Próxima</button></div></>}
      </section>
      {selected ? <ConversationDetail key={`${selected.id}:${revision}`} {...props} thread={selected} members={members} memberName={memberName} connectionBlocked={connection !== undefined && (connection === null || connection.state !== "connected")} attempts={attempts.current} setBusy={setBusy} onChanged={changed} onRefresh={refresh} onUnavailable={message => { setSelectedId(null); setNotice(message); refresh(); }} /> : <><section className="meta-panel meta-conversation-column" aria-label="Chat"><h2>Chat</h2><div className="meta-conversation-empty">Selecione uma conversa disponível.</div></section><section className="meta-panel meta-conversation-column" aria-label="Ficha do contato"><h2>Ficha do contato</h2><div className="meta-conversation-empty">Nenhuma conversa selecionada.</div></section></>}
    </div>
  </section>;
}
function ConnectionNotice({ status }: { status: MetaStatus }) {
  if (!status.connection || status.connection.state === "disconnected") return <p role="status">Meta desconectada. O histórico existente pode ser consultado conforme sua permissão.</p>;
  if (status.connection.state !== "connected") return <p role="status">Conexão Meta indisponível ({({ pending: "pendente", expired: "expirada", revoked: "revogada", error: "com erro" } as Record<string, string>)[status.connection.state] ?? "desconectada"}).</p>;
  return <p className="meta-muted" role="status">Conexão Meta registrada · {status.mode === "test" ? "modo teste" : "modo live"}. O envio depende das permissões e do estado de cada conversa.</p>;
}
interface DetailProps extends Props {
  thread: Thread; members: OrganizationMember[]; memberName: (id: string | null) => string; connectionBlocked: boolean;
  attempts: Map<string, Attempt>; setBusy: (value: boolean) => void; onChanged: (thread: Thread) => void; onRefresh: () => void; onUnavailable: (message: string) => void;
}
function ConversationDetail(props: DetailProps) {
  const { organizationId: org, membershipId, thread, attempts } = props;
  const [history, setHistory] = useState<Message[]>([]);
  const [page, setPage] = useState<Page<Message> | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [draft, setDraft] = useState(attempts.get(thread.id)?.text ?? "");
  const [assignee, setAssignee] = useState(thread.assigneeMembershipId ?? "");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState("");
  const [acting, setActing] = useState(false);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(Date.now());
  const active = useRef<AbortController | null>(null);
  const historyRequest = useRef<AbortController | null>(null);
  const alive = useRef(false);
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; active.current?.abort(); historyRequest.current?.abort(); };
  }, []);
  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), 1000);
    return () => globalThis.clearInterval(timer);
  }, []);
  async function loadHistory(next: number) {
    if (!alive.current || historyRequest.current) return;
    const controller = new AbortController(); historyRequest.current = controller;
    setLoading(true); setHistoryError(null);
    try {
      const result = await listMessages(org, thread.id, next, 20, controller.signal);
      if (!controller.signal.aborted && alive.current) { setHistory(previous => chronological(next === 1 ? [] : previous, result.items)); setPage(result); }
    } catch (error) {
      if (!controller.signal.aborted && alive.current) {
        setHistoryError(conversationError(error));
        if (error instanceof AppApiError && (error.status === 403 || error.status === 404)) { setHistory([]); setPage(null); setStale(true); props.onUnavailable(conversationError(error)); }
      }
    } finally {
      if (historyRequest.current === controller) historyRequest.current = null;
      if (!controller.signal.aborted && alive.current) setLoading(false);
    }
  }
  useEffect(() => { void loadHistory(1); return () => { historyRequest.current?.abort(); historyRequest.current = null; }; }, []);
  const attempt = attempts.get(thread.id);
  const pending = history.some(m => m.direction === "outbound" && m.status === "pending");
  const reason = blockedReason(thread, props.canSend, membershipId, now) ?? (props.connectionBlocked ? reasons.CONNECTION_REVOKED : null);
  const blocked = reason ?? (stale ? "Atualize a conversa para verificar o estado atual." : null) ?? (pending ? "Há mensagem pendente de confirmação. Atualize o histórico antes de enviar." : null) ?? (attempt?.conflict ? "Conflito de idempotência. Não reenvie." : null);
  const canMutate = props.canAssign && thread.status === "open" && !stale;
  async function mutate(action: "send" | "assign" | "close", membership: string | null = null) {
    // Synchronous lock, then fresh local window check; server remains authoritative.
    if (!alive.current || active.current || loading || historyRequest.current || historyError || stale) return;
    const text = draft.trim();
    if (action === "send") {
      if (blocked || blockedReason(thread, props.canSend, membershipId) || !text || text.length > 1000 || (attempt?.uncertain && attempt.text !== text)) return;
    } else if (!canMutate || (action === "assign" && membership !== null && membership !== membershipId && !props.members.some(m => m.membershipId === membership))) return;
    if (action !== "send" && !globalThis.confirm(action === "close" ? "Encerrar esta conversa?" : membership === null ? "Desatribuir esta conversa?" : "Confirmar a atribuição do atendimento?")) return;
    const controller = new AbortController(); active.current = controller;
    setActing(true); props.setBusy(true); setActionError(null); setActionNotice("");
    try {
      if (action === "send") {
        const previous = attempts.get(thread.id);
        const input = previous?.text === text ? previous : { text, idempotencyKey: globalThis.crypto.randomUUID(), uncertain: false };
        // Reserve client key before request; an aborted/ambiguous response can only retry this same text/key.
        attempts.set(thread.id, { ...input, uncertain: true });
        const result = await sendMessage(org, thread.id, { text: input.text, idempotencyKey: input.idempotencyKey }, controller.signal);
        if (!alive.current || controller.signal.aborted) return;
        attempts.delete(thread.id); setDraft(""); setHistory(previousHistory => chronological(previousHistory, [result]));
        setActionNotice(result.status === "pending" ? "Resultado pendente. Aguarde confirmação; não reenvie." : result.status === "failed" ? "O servidor registrou falha de envio." : "Estado da mensagem atualizado pelo servidor.");
      } else {
        const result = action === "assign" ? await assignConversation(org, thread.id, membership, controller.signal) : await closeConversation(org, thread.id, controller.signal);
        if (alive.current && !controller.signal.aborted) props.onChanged(result);
      }
    } catch (error) {
      if (!alive.current || controller.signal.aborted) return;
      const message = conversationError(error);
      if (action === "send") {
        const current = attempts.get(thread.id);
        if (current && error instanceof AppApiError && error.status && error.status >= 400 && error.status < 500) {
          attempts.set(thread.id, { ...current, uncertain: false, conflict: error.code === "IDEMPOTENCY_CONFLICT" });
          if (error.status === 403 || error.status === 404 || error.status === 409) setStale(true);
        }
      } else setStale(true);
      if (error instanceof AppApiError && error.status === 404) { setHistory([]); setPage(null); props.onUnavailable(message); }
      setActionError(message);
    } finally {
      if (active.current === controller) active.current = null;
      if (alive.current && !controller.signal.aborted) { setActing(false); props.setBusy(false); }
    }
  }
  return <>
    <section className="meta-panel meta-conversation-column meta-chat-column" aria-label="Chat">
      <div className="meta-panel-heading"><div><h2>{participant(thread)}</h2><p className="meta-muted">{channelLabels[thread.channel]} · {thread.status === "open" ? "Aberta" : "Encerrada"}</p></div><button type="button" disabled={acting} onClick={props.onRefresh}>Atualizar chat</button></div>
      {page && page.page < page.totalPages && <button type="button" disabled={loading || acting} onClick={() => void loadHistory(page.page + 1)}>Carregar mensagens anteriores</button>}
      {loading && <p role="status">Carregando mensagens…</p>}
      {historyError && <ErrorText message={historyError} />}
      <ol className="meta-chat-history" aria-label="Histórico em ordem cronológica">{history.map(m => <li key={m.id} className={`meta-message meta-message-${m.direction}`}><div><small>{m.direction === "inbound" ? "Participante" : "Atendimento"}</small><p>{m.text ?? "Conteúdo indisponível"}</p><small>{dateLabel(m.createdAt)} · {messageLabels[m.status]}</small></div></li>)}</ol>
      {!loading && !historyError && history.length === 0 && <div className="meta-conversation-empty">Nenhuma mensagem disponível.</div>}
      {blocked && <p role="status" className="meta-chat-blocked">{blocked}</p>}
      {actionError && <ErrorText message={actionError} />}{actionNotice && <p role="status">{actionNotice}</p>}
      {attempt?.uncertain && <p role="status">Não foi possível confirmar a tentativa. Uma nova tentativa explícita usará o mesmo texto e a mesma chave; não envie uma cópia.</p>}
      <form className="meta-composer" onSubmit={e => { e.preventDefault(); void mutate("send"); }}>
        <label htmlFor="meta-message">Mensagem</label><textarea id="meta-message" rows={3} maxLength={1000} value={draft} disabled={!!blocked || acting || loading || !!historyError || !!attempt?.uncertain} onChange={e => { const value = e.target.value; if (attempt && attempt.text !== value.trim()) attempts.delete(thread.id); setDraft(value); }} placeholder="Escreva sua resposta" />
        <small>{draft.length}/1000</small><button type="submit" className="app-primary-button" disabled={!!blocked || acting || loading || !!historyError || !draft.trim() || draft.trim().length > 1000}>{acting ? "Processando…" : attempt ? "Tentar novamente" : "Enviar"}</button>
      </form>
    </section>
    <section className="meta-panel meta-conversation-column" aria-label="Ficha do contato">
      <h2>Ficha do contato</h2><dl className="meta-chat-facts"><dt>Participante</dt><dd>{participant(thread)}</dd><dt>Responsável</dt><dd>{props.memberName(thread.assigneeMembershipId)}</dd><dt>Janela de resposta</dt><dd>{dateLabel(thread.windowEndsAt)}</dd><dt>Opt-out</dt><dd>{thread.optOut ? "Registrado" : "Não registrado (não presume consentimento)"}</dd></dl>
      <h3>Vínculos CRM</h3><LinkedRecord key={`contact:${thread.contactId}`} org={org} id={thread.contactId} allowed={props.canReadContact} label="Contato" kind="contact" />
      <LinkedRecord key={`lead:${thread.leadId}`} org={org} id={thread.leadId} allowed label="Lead" kind="lead" />
      <LinkedRecord key={`opportunity:${thread.opportunityId}`} org={org} id={thread.opportunityId} allowed={props.canReadOpportunity} label="Oportunidade" kind="opportunity" />
      <LinkedRecord key={`property:${thread.propertyId}`} org={org} id={thread.propertyId} allowed={props.canReadProperty} label="Imóvel" kind="property" />
      {canMutate && <div className="meta-chat-filters"><h3>Atendimento humano</h3><label>Responsável<select value={assignee} disabled={acting || loading || !!historyError} onChange={e => setAssignee(e.target.value)}><option value="">Sem responsável</option><option value={membershipId}>Você</option>{props.members.filter(m => m.membershipId !== membershipId).map(m => <option key={m.membershipId} value={m.membershipId}>{m.displayName || m.membershipId}</option>)}{assignee && assignee !== membershipId && !props.members.some(m => m.membershipId === assignee) && <option value={assignee} disabled>{assignee}</option>}</select></label>
        <button type="button" disabled={acting || loading || !!historyError || (assignee !== "" && assignee !== membershipId && !props.members.some(m => m.membershipId === assignee))} onClick={() => void mutate("assign", assignee || null)}>Confirmar atribuição</button><button type="button" disabled={acting || loading || !!historyError} onClick={() => void mutate("assign", membershipId)}>Assumir atendimento</button><button type="button" disabled={acting || loading || !!historyError} onClick={() => void mutate("close")}>Encerrar conversa</button></div>}
    </section>
  </>;
}
// Existing scoped CRM/portfolio GET routes, through the same abortable authenticated transport.
async function linkedName(org: string, id: string, kind: "contact" | "lead" | "opportunity" | "property", signal: AbortSignal): Promise<string | null> {
  const suffix = encodeURIComponent(id);
  const result = kind === "contact" ? await requestMeta<ContactDetail>(org, `/crm/contacts/${suffix}`, signal)
    : kind === "lead" ? await requestMeta<LeadDetail>(org, `/crm/leads/${suffix}`, signal)
    : kind === "opportunity" ? await requestMeta<OpportunityDetail>(org, `/crm/opportunities/${suffix}`, signal)
    : await requestMeta<PropertyDetail>(org, `/portfolio/properties/${suffix}`, signal);
  if (result.id !== id) throw new AppApiError("Vínculo inválido.", "INVALID_API_RESPONSE");
  const name = "name" in result ? result.name : result.title;
  return typeof name === "string" && name.trim() ? name : null;
}
function LinkedRecord({ org, id, allowed, label, kind }: { org: string; id: string | null; allowed: boolean; label: string; kind: "contact" | "lead" | "opportunity" | "property" }) {
  const result = useRead(`${org}:${id}:${kind}`, allowed && id !== null, signal => linkedName(org, id!, kind, signal));
  return <div className="meta-chat-link"><strong>{label}</strong><p>{!allowed || !id ? "Não vinculado ou indisponível" : result?.state === "loading" ? "Consultando vínculo…" : result?.state === "ready" ? result.value || id : result?.state === "error" ? "Vínculo indisponível" : id}</p></div>;
}
