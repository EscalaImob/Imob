import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppApiError } from "../../services/appApi";
import {
  getMetaStatus, revokeMetaConnection, selectMetaAssets, startMetaOAuth, testMetaConnection,
  readMetaConnectionsV2, listMetaConnectionsV2, selectMetaAssetsV2, testMetaConnectionV2, revokeMetaConnectionV2,
  type MetaConnectionRead, type MetaConnectionV2, type OAuthProduct, type CredentialState, type MetaConnection,
  type AssetType, type Availability, type Capability, type CapabilityKey, type ConnectionState, type MetaStatus,
} from "../../services/metaApi";
import "./meta.css";
import { MetaAutomationSection } from "./MetaAutomationSection";
import { MetaCampaignSection } from "./MetaCampaignSection";
import { MetaInsightsSection } from "./MetaInsightsSection";
import type { ActionGrants } from "../../services/automationApi";

const stateLabels: Record<ConnectionState, string> = {
  disconnected: "Desconectada", pending: "Pendente", connected: "Conectada",
  expired: "Expirada", revoked: "Revogada", error: "Com erro",
};
const capabilityLabels: Record<CapabilityKey, string> = {
  leadAds: "Lead Ads", instagramMessaging: "Mensagens Instagram", messengerMessaging: "Mensagens Messenger",
  whatsappMessaging: "Mensagens WhatsApp", adsRead: "Consulta de anúncios", adsManage: "Gestão de anúncios",
};
const availabilityLabels: Record<Availability, string> = {
  available: "Disponível", pending: "Pendente", denied: "Indisponível",
};
const assetLabels: Record<AssetType, string> = {
  instagram_account: "Conta Instagram", facebook_page: "Página Facebook", whatsapp_business_account: "Conta WhatsApp Business",
  whatsapp_phone_number: "Número WhatsApp", ad_account: "Conta de anúncios",
};
function dateLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}
function CapabilityList({ capabilities }: { capabilities: Capability[] }) {
  return capabilities.length ? (
    <ul className="meta-capabilities">
      {capabilities.map((capability) => (
        <li key={capability.key}>
          <div><strong>{capabilityLabels[capability.key] ?? capability.key}</strong>
            <span className="meta-state">{availabilityLabels[capability.availability] ?? "Indisponível"}</span></div>
          {capability.reason && <p>{capability.reason}</p>}
          {capability.verifiedAt && <small>Verificada em {dateLabel(capability.verifiedAt)}</small>}
        </li>
      ))}
    </ul>
  ) : <p className="meta-muted">Nenhuma capacidade informada.</p>;
}
function errorDetails(error: unknown) {
  return error instanceof AppApiError ? { code: error.code, message: error.message, status: error.status } : {
    code: "UNEXPECTED_ERROR", message: "Não foi possível concluir a operação Meta.", status: undefined,
  };
}
// A response in test mode must never lead to a provider redirect. In live mode the
// server alone checks OAuth configuration, flags and authorization before issuing the URL.
type OAuthChannel = null | "instagram";
function authorizationDestination(raw: string, expiresAt: string, channel: OAuthChannel): URL {
  const expiration = Date.parse(expiresAt);
  let url: URL;
  try { url = new URL(raw); } catch { throw new AppApiError("URL de autorização inválida.", "INVALID_API_RESPONSE"); }
  if (url.protocol !== "https:" || url.username || url.password || !Number.isFinite(expiration) || expiration <= Date.now()) {
    throw new AppApiError("Autorização inválida ou expirada. Atualize o estado e tente novamente.", "INVALID_API_RESPONSE");
  }
  // Never follow a Facebook/other-provider URL in the Instagram Login flow.
  // Server remains responsible for the actual authorization endpoint and state.
  if (channel === "instagram" && !["https://www.instagram.com", "https://instagram.com"].includes(url.origin)) {
    throw new AppApiError("O servidor não retornou uma autorização Instagram válida.", "INVALID_API_RESPONSE");
  }
  return url;
}

type Action = "connect" | "test" | "revoke" | "assets";
type MarketingPageProps = { contractVersion?: 1 | 2; organizationId: string; canManage: boolean; canReadAutomation: boolean; automationGrants: ActionGrants; canReadInsights: boolean; canReadCampaigns: boolean; canWriteCampaigns: boolean };
export function MarketingPage(props: MarketingPageProps) {
  // The app also keys this page by membership/grants. Ensure local state cannot
  // survive a tenant or write-permission change even if reused independently.
  const query = new URLSearchParams(globalThis.location?.search ?? "");
  const callback = query.get("connection");
  const returning = (callback === "success" || callback === "error") && readOAuthOrigin() !== null;
  // Explicit engineering opt-in; default pilot V1 is unchanged. The marker keeps
  // a V2 return in V2 even though the fixed server callback drops the opt-in query.
  const v2 = returning || props.contractVersion === 2 || query.get("metaContractVersion") === "2";
  if (v2) return <MarketingTenantV2 key={`v2:${props.organizationId}:${props.canManage}`} {...props} />;
  return <MarketingTenantPage key={`${props.organizationId}:${props.canManage}`} {...props} />;
}
function MarketingTenantPage({ organizationId, canManage, canReadAutomation, automationGrants, canReadInsights, canReadCampaigns, canWriteCampaigns }: MarketingPageProps) {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<ReturnType<typeof errorDetails> | null>(null);
  const [actionError, setActionError] = useState<ReturnType<typeof errorDetails> | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [oauthChannel, setOAuthChannel] = useState<OAuthChannel>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const actionController = useRef<AbortController | null>(null);
  useLayoutEffect(() => () => { actionController.current?.abort(); actionController.current = null; }, [organizationId, canManage]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setStatus(null);
    setError(null);
    setSelected([]);
    void getMetaStatus(organizationId, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setStatus(next);
      setSelected(next.connection?.assets.filter((asset) => asset.selected).map((asset) => asset.id) ?? []);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(errorDetails(failure));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [organizationId, refresh]);

  const connection = status?.connection ?? null;
  const state = connection?.state ?? "disconnected";
  const blocked = actionError?.status === 401 || actionError?.status === 403 || actionError?.status === 503;
  const writable = canManage && !loading && !!status && !busy && !blocked;
  const canConnect = writable && status?.mode === "live" && state !== "connected" && state !== "pending";
  const canTest = writable && !!connection && state !== "revoked" && state !== "disconnected";
  const canRevoke = canTest;
  const canSelect = writable && !!connection && state === "connected";
  const changed = !!connection && connection.assets.some((asset) => asset.selected !== selected.includes(asset.id));

  function reload() {
    if (actionController.current) return;
    setLoading(true);
    setStatus(null);
    setActionError(null);
    setNotice(null);
    setRefresh((value) => value + 1);
  }
  async function run(action: Action) {
    if (actionController.current || !status) return;
    if (action === "connect" ? !canConnect : action === "test" ? !canTest : action === "revoke" ? !canRevoke : !canSelect || !changed) return;
    if (action === "revoke" && !globalThis.confirm("Revogar a conexão Meta desta organização? O acesso local será desativado.")) return;
    const controller = new AbortController();
    actionController.current = controller;
    setBusy(action);
    setActionError(null);
    setNotice(null);
    try {
      if (action === "connect") {
        const result = await startMetaOAuth(organizationId, oauthChannel, controller.signal);
        if (controller.signal.aborted) return;
        const destination = authorizationDestination(result.authorizationUrl, result.expiresAt, oauthChannel);
        if (globalThis.location.pathname.replace(/\/+$/u, "") === "/app/marketing") globalThis.location.assign(destination.href);
        return;
      }
      if (!connection) return;
      if (action === "test") await testMetaConnection(organizationId, connection.id, controller.signal);
      if (action === "revoke") await revokeMetaConnection(organizationId, connection.id, controller.signal);
      if (action === "assets") await selectMetaAssets(organizationId, connection.id, connection.assets.filter((asset) => selected.includes(asset.id)).map((asset) => asset.id), controller.signal);
      if (controller.signal.aborted) return;
      setNotice("Operação recebida. Consulte abaixo o estado atualizado pelo servidor.");
      setLoading(true);
      setStatus(null);
      setRefresh((value) => value + 1);
    } catch (failure) {
      if (!controller.signal.aborted) setActionError(errorDetails(failure));
    } finally {
      if (actionController.current === controller) {
        actionController.current = null;
        setBusy(null);
      }
    }
  }

  return (
    <section className="meta-module">
      <header className="app-section-header">
        <div><span className="app-section-eyebrow">Marketing</span><h1>Integração Meta</h1>
          <p>Gerencie a conexão, os ativos e as capacidades autorizadas para esta organização.</p></div>
        <button className="app-secondary-button" type="button" onClick={reload} disabled={loading || !!busy}>Atualizar estado</button>
      </header>
      {loading && <div className="meta-panel" role="status">Carregando estado da integração…</div>}
      {error && <div className="meta-panel" role="alert"><strong>{error.status === 403 ? "Acesso não autorizado" : error.status === 503 ? "Integração indisponível" : "Não foi possível carregar a integração"}</strong><p>{error.message}</p><button type="button" className="app-secondary-button" onClick={reload}>Tentar novamente</button></div>}
      {actionError && <div className="meta-panel" role="alert"><strong>{actionError.status === 403 ? "Acesso não autorizado" : actionError.status === 503 ? "Integração indisponível" : "Operação não concluída"}</strong><p>{actionError.message}</p>{blocked && <p>Atualize o estado antes de tentar outra operação.</p>}</div>}
      {notice && <p role="status">{notice}</p>}
      {status && !loading && <>
        <section className="meta-panel">
          <div className="meta-panel-heading"><h2>Conexão Meta</h2><span className="meta-state">{stateLabels[state]}</span></div>
          <p className="meta-muted">Modo informado pelo servidor: {status.mode === "live" ? "Produção (live)" : "Teste (test) — sem redirecionamento OAuth real"}.</p>
          {!connection && <p>Nenhuma conexão registrada para esta organização.</p>}
          {state === "pending" && <p>Aguardando conclusão da conexão ou liberação das permissões.</p>}
          {connection && <dl className="meta-details">
            <div><dt>Última verificação</dt><dd>{dateLabel(connection.lastCheckedAt)}</dd></div>
            <div><dt>Expiração</dt><dd>{dateLabel(connection.expiresAt)}</dd></div>
            <div><dt>Permissões concedidas</dt><dd>{connection.scopes.join(", ") || "Nenhuma informada"}</dd></div>
            {connection.errorCode && <div><dt>Código de erro</dt><dd>{connection.errorCode}</dd></div>}
          </dl>}
          {!canManage && <p className="meta-muted">Acesso somente para leitura. Alterações exigem a permissão de atualização da organização.</p>}
          {canManage && status.mode !== "live" && <p className="meta-muted">Conexão real indisponível enquanto o servidor estiver em modo de teste.</p>}
          <fieldset disabled={!canConnect} aria-describedby="meta-oauth-help">
            <legend>Tipo de conexão</legend>
            <label className="meta-select"><input type="radio" name="meta-oauth-channel" checked={oauthChannel === null} onChange={() => setOAuthChannel(null)} /> Facebook (fluxo existente)</label>
            <label className="meta-select"><input type="radio" name="meta-oauth-channel" checked={oauthChannel === "instagram"} onChange={() => setOAuthChannel("instagram")} /> Instagram Login (conta profissional)</label>
          </fieldset>
          <p className="meta-muted" id="meta-oauth-help">Instagram Login depende de configuração e autorização do servidor. A seleção não conecta uma conta nem habilita mensagens, WhatsApp ou anúncios.</p>
          <div className="meta-actions">
            <button type="button" className="app-primary-button" disabled={!canConnect} onClick={() => void run("connect")}>{busy === "connect" ? "Iniciando…" : oauthChannel === "instagram" ? "Conectar Instagram" : "Conectar Meta"}</button>
            <button type="button" className="app-secondary-button" disabled={!canTest} onClick={() => void run("test")}>{busy === "test" ? "Verificando…" : "Testar conexão"}</button>
            <button type="button" className="app-secondary-button" disabled={!canRevoke} onClick={() => void run("revoke")}>{busy === "revoke" ? "Revogando…" : "Revogar conexão"}</button>
          </div>
        </section>
        <section className="meta-panel"><h2>Capacidades da integração</h2><CapabilityList capabilities={status.capabilities} />
          {connection && <><h3>Capacidades da conexão</h3><CapabilityList capabilities={connection.capabilities} /></>}
          <p className="meta-muted">A disponibilidade é definida pelo servidor. Não concede autorização para envio, automação ou gestão de anúncios por si só.</p>
        </section>
        <section className="meta-panel"><h2>Ativos descobertos</h2>
          {!connection?.assets.length ? <p className="meta-muted">Nenhum ativo disponível nesta conexão.</p> : <>
            <div className="meta-asset-list">{connection.assets.map((asset) => <article className="meta-asset" key={asset.id}>
              <div className="meta-panel-heading"><div><strong>{asset.name}</strong><p className="meta-muted">{assetLabels[asset.type]} · {asset.selected ? "Selecionado" : "Não selecionado"}</p></div>
                <label className="meta-select"><input type="checkbox" checked={selected.includes(asset.id)} disabled={!canSelect} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, asset.id] : ids.filter((id) => id !== asset.id))} /> Selecionar <span className="meta-sr-only">{asset.name}</span></label></div>
              <CapabilityList capabilities={asset.capabilities} />
            </article>)}</div>
            <div className="meta-actions"><button type="button" className="app-primary-button" disabled={!canSelect || !changed} onClick={() => void run("assets")}>{busy === "assets" ? "Salvando…" : "Salvar seleção"}</button></div>
          </>}
        </section>
      </>}
      {canReadAutomation && <MetaAutomationSection org={organizationId} grants={automationGrants} />}
      {canReadInsights && <MetaInsightsSection key={`${refresh}:${loading}:${connection?.state ?? "unknown"}:${connection?.assets.filter(a => a.selected && a.type === "ad_account").map(a => a.id).join(",") ?? ""}`} org={organizationId} assets={connection?.state === "connected" ? connection.assets : []} />}
      {canReadCampaigns && <MetaCampaignSection org={organizationId} status={status} statusLoading={loading} statusBusy={!!busy} canWrite={canWriteCampaigns} />}
    </section>
  );
}

// ORQ061 — the callback carries no grant or tenant identifier. Keep only a
// short-lived, tab-local routing hint (never OAuth state/code/token); server
// authentication and membership remain authoritative for every request.
const originKey = "escala.meta.v2.oauth-origin";
type OAuthOrigin = { organizationId: string; expiresAt: number };
function readOAuthOrigin(): OAuthOrigin | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(originKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<OAuthOrigin>;
    // Invalid stored values still select V2 and fail closed at callback.
    return typeof value.organizationId === "string" && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) ?
      { organizationId: value.organizationId, expiresAt: value.expiresAt } : { organizationId: "", expiresAt: 0 };
  } catch { return { organizationId: "", expiresAt: 0 }; }
}
function clearCallback() {
  const url = new URL(globalThis.location.href);
  url.searchParams.delete("connection");
  url.searchParams.set("metaContractVersion", "2");
  globalThis.history.replaceState(globalThis.history.state, "", url.pathname + url.search + url.hash);
  globalThis.sessionStorage.removeItem(originKey);
}
const productLabels: Record<Exclude<OAuthProduct, null> | "legacy", string> = {
  instagram_login_v1: "Instagram Login", facebook_login_manual: "Facebook (fluxo manual)", legacy: "Legado — produto não comprovado",
};
const credentialLabels: Record<CredentialState, string> = {
  usable: "Validade local verificada", expired: "Credencial expirada", revoked: "Credencial revogada", unverified: "Credencial não verificada",
};
function connectionTitle(connection: MetaConnection) {
  return connection.assets.map(asset => asset.name).join(" · ") || `Conexão ${connection.id}`;
}
function canSelectV2(connection: MetaConnectionV2) {
  // Legacy cannot authorize Instagram; preserve only the proven Facebook path
  // through V1. No inference from scopes, asset type, or token prefix in V2.
  return connection.state === "connected" && connection.credentialState === "usable" && connection.oauthProduct !== null;
}
function MarketingTenantV2({ organizationId, canManage, canReadAutomation, automationGrants, canReadInsights, canReadCampaigns }: MarketingPageProps) {
  const [read, setRead] = useState<MetaConnectionRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<ReturnType<typeof errorDetails> | null>(null);
  const [actionError, setActionError] = useState<ReturnType<typeof errorDetails> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ action: Action; id: string | null } | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [channel, setChannel] = useState<OAuthChannel>(null);
  const [callback, setCallback] = useState(() => new URLSearchParams(globalThis.location?.search ?? "").get("connection"));
  const origin = callback === "success" || callback === "error" ? readOAuthOrigin() : null;
  const isCallback = callback === "success" || callback === "error";
  const callbackInvalid = isCallback && (!origin || origin.expiresAt <= Date.now());
  const callbackOther = isCallback && !!origin && origin.organizationId !== organizationId;
  const callbackBlocked = callbackInvalid || callbackOther;
  const active = useRef<AbortController | null>(null);
  useLayoutEffect(() => () => { active.current?.abort(); active.current = null; }, [organizationId, canManage]);
  useLayoutEffect(() => {
    const controller = new AbortController();
    setRead(null); setSelected({}); setError(null);
    if (callbackBlocked) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    void (async () => {
      try {
        let next = await readMetaConnectionsV2(organizationId, controller.signal);
        if (controller.signal.aborted) return;
        if (isCallback && next.version === 2) {
          // Re-list in the original tenant, regardless of callback success/error.
          const { items } = await listMetaConnectionsV2(organizationId, controller.signal);
          if (controller.signal.aborted) return;
          next = { version: 2, status: { ...next.status, connections: items, mode: items.some(c => c.mode === "live") ? "live" : "test" } };
        }
        if (controller.signal.aborted) return;
        if (isCallback) {
          clearCallback();
          setNotice(callback === "success" ? "Retorno OAuth recebido. Confira as conexões; nenhum ativo foi selecionado automaticamente." : "O retorno OAuth informou erro. Confira o estado atualizado das conexões.");
          setCallback(null);
        }
        setRead(next);
        if (next.version === 2) setSelected(Object.fromEntries(next.status.connections.map(c => [c.id, c.assets.filter(a => a.selected).map(a => a.id)])));
      } catch (failure) {
        if (!controller.signal.aborted) setError(errorDetails(failure));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
    // callback is consumed by this load; do not issue a second read when cleared.
  }, [organizationId, refresh, callbackBlocked]);
  const connections = read?.version === 2 ? read.status.connections : [];
  const writable = canManage && read?.version === 2 && !loading && !busy && !actionError && !callbackBlocked;
  function reload() {
    if (active.current || callbackBlocked) return;
    setRead(null); setSelected({}); setLoading(true); setActionError(null); setNotice(null); setRefresh(n => n + 1);
  }
  function dismissInvalidCallback() {
    if (!callbackInvalid || active.current) return;
    try { clearCallback(); setCallback(null); setNotice("Retorno descartado sem associar uma conexão. Consulte o estado da organização atual."); }
    catch (failure) { setError(errorDetails(failure)); }
  }
  function changed(c: MetaConnectionV2) { return c.assets.some(a => a.selected !== (selected[c.id] ?? []).includes(a.id)); }
  async function run(action: Action, id: string | null = null) {
    if (!writable || active.current) return;
    const connection = connections.find(c => c.id === id);
    if (action !== "connect" && (!connection || ["revoked", "disconnected"].includes(connection.state))) return;
    if (action === "assets" && (!connection || !canSelectV2(connection) || !changed(connection))) return;
    if (action === "revoke" && !globalThis.confirm(`Revogar localmente ${connectionTitle(connection!)} (${id})? Somente esta conexão será desativada. A revogação remota na Meta não está confirmada; o histórico será preservado.`)) return;
    const controller = new AbortController(); active.current = controller;
    setBusy({ action, id }); setActionError(null); setNotice(null);
    try {
      if (action === "connect") {
        // The summary mode is not an OAuth permission (empty V2 always test).
        // The unchanged endpoint must enforce flags/eligibility and issue a URL.
        const pending = readOAuthOrigin();
        if (pending && pending.expiresAt > Date.now()) throw new AppApiError("Há uma autorização em andamento nesta aba. Conclua o retorno ou aguarde sua expiração.", "CONFLICT", 409);
        const result = await startMetaOAuth(organizationId, channel, controller.signal);
        if (controller.signal.aborted) return;
        const destination = authorizationDestination(result.authorizationUrl, result.expiresAt, channel);
        if (channel === null && !["https://www.facebook.com", "https://facebook.com"].includes(destination.origin)) throw new AppApiError("O servidor não retornou uma autorização Facebook válida.", "INVALID_API_RESPONSE");
        if (globalThis.location.pathname.replace(/\/+$/u, "") !== "/app/marketing") return;
        globalThis.sessionStorage.setItem(originKey, JSON.stringify({ organizationId, expiresAt: Math.min(Date.parse(result.expiresAt), Date.now() + 600_000) }));
        globalThis.location.assign(destination.href);
        return;
      }
      if (!connection) return;
      if (action === "test") await testMetaConnectionV2(organizationId, connection.id, controller.signal);
      if (action === "revoke") await revokeMetaConnectionV2(organizationId, connection.id, controller.signal);
      if (action === "assets") await selectMetaAssetsV2(organizationId, connection.id, connection.assets.filter(a => (selected[connection.id] ?? []).includes(a.id)).map(a => a.id), controller.signal);
      if (controller.signal.aborted) return;
      setNotice(action === "revoke" ? "Solicitação de revogação local recebida. Consulte o estado atualizado; a revogação remota não foi confirmada." : "Operação recebida. Consulte o estado atualizado do servidor.");
      setRead(null); setSelected({}); setLoading(true); setRefresh(n => n + 1);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setActionError(errorDetails(failure));
        setNotice("Não repita a operação sem antes atualizar o estado. Nenhuma ação foi reenviada automaticamente.");
        setRead(null); setSelected({});
      }
    } finally {
      if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setBusy(null); }
    }
  }
  const legacy = read?.version === 1 ? read.status : null;
  // V2 summary is never translated into V1 authorization. D5 remains blocked;
  // D4 may use the existing asset filter for individually eligible assets only.
  const insightAssets = connections.filter(c => canSelectV2(c)).flatMap(c => c.assets.filter(a => a.selected && a.type === "ad_account"));
  return <section className="meta-module">
    <header className="app-section-header"><div><span className="app-section-eyebrow">Marketing</span><h1>Conexões Meta</h1><p>Gerencie as conexões e os ativos desta organização individualmente. Interface V2 — liberação comercial pendente.</p></div><button type="button" className="app-secondary-button" disabled={loading || !!busy || callbackBlocked} onClick={reload}>Atualizar estado</button></header>
    {callbackBlocked && <div className="meta-panel" role="alert"><strong>Retorno OAuth não associado</strong><p>{callbackInvalid ? "Origem da autorização ausente ou expirada. Nenhuma conexão será associada ao retorno." : "Selecione a organização que iniciou a autorização para consultar suas conexões. Nenhum dado da outra organização foi consultado."}</p>{callbackInvalid && <button type="button" className="app-secondary-button" onClick={dismissInvalidCallback}>Descartar retorno</button>}</div>}
    {loading && !callbackBlocked && <div className="meta-panel" role="status">Carregando conexões…</div>}
    {(error || actionError) && <div className="meta-panel" role="alert"><strong>{(error ?? actionError)?.status === 403 ? "Acesso não autorizado" : "Operação indisponível"}</strong><p>{(error ?? actionError)?.code} — {(error ?? actionError)?.message}</p></div>}
    {notice && <p role="status">{notice}</p>}
    {legacy && !loading && <section className="meta-panel"><h2>Compatibilidade V1 — somente leitura</h2><p>O servidor retornou o contrato V1. Interface comercial indisponível; nenhuma ação foi convertida para V1.</p><p>Modo: {legacy.mode}.</p>{legacy.connection ? <><p>{connectionTitle(legacy.connection)} · {stateLabels[legacy.connection.state]}</p><CapabilityList capabilities={legacy.connection.capabilities} />{legacy.connection.assets.map(a => <article className="meta-asset" key={a.id}><strong>{a.name}</strong><p>{assetLabels[a.type]} · {a.selected ? "Selecionado" : "Não selecionado"}</p><CapabilityList capabilities={a.capabilities} /></article>)}</> : <p>Nenhuma conexão registrada.</p>}</section>}
    {read?.version === 2 && !loading && <>
      <section className="meta-panel"><div className="meta-panel-heading"><h2>Nova conexão</h2><span className="meta-state">{connections.length} conexão(ões)</span></div><p className="meta-muted">A autorização depende da configuração, elegibilidade e permissões do servidor. Não habilita mensagens ou anúncios.</p>
        {!canManage && <p>Acesso somente para leitura.</p>}
        <fieldset disabled={!writable}><legend>Produto OAuth</legend><label className="meta-select"><input type="radio" name="meta-v2-channel" checked={channel === null} onChange={() => setChannel(null)} /> Facebook (fluxo manual)</label><label className="meta-select"><input type="radio" name="meta-v2-channel" checked={channel === "instagram"} onChange={() => setChannel("instagram")} /> Instagram Login (conta profissional)</label></fieldset>
        <div className="meta-actions"><button type="button" className="app-primary-button" disabled={!writable} onClick={() => void run("connect")}>{busy?.action === "connect" ? "Iniciando…" : channel === "instagram" ? "Conectar Instagram" : "Conectar Facebook"}</button></div>
      </section>
      {!connections.length && <section className="meta-panel"><p>Nenhuma conexão registrada para esta organização.</p></section>}
      {connections.map(c => <section className="meta-panel" key={c.id} aria-label={`Conexão ${c.id}`}>
        <div className="meta-panel-heading"><h2>{productLabels[c.oauthProduct ?? "legacy"]}</h2><span className="meta-state">{stateLabels[c.state]} · {c.mode === "live" ? "Live" : "Teste"}</span></div>
        <p><strong>{connectionTitle(c)}</strong></p><p className="meta-muted">ID da conexão: {c.id}</p>
        <dl className="meta-details"><div><dt>Credencial</dt><dd>{credentialLabels[c.credentialState]}</dd></div><div><dt>Última verificação</dt><dd>{dateLabel(c.lastCheckedAt)}</dd></div><div><dt>Expiração</dt><dd>{dateLabel(c.expiresAt)}</dd></div><div><dt>Permissões concedidas</dt><dd>{c.scopes.join(", ") || "Nenhuma informada"}</dd></div>{c.errorCode && <div><dt>Código de erro</dt><dd>{c.errorCode}</dd></div>}</dl>
        {c.credentialState === "unverified" && <p>Configuração ou validade não comprovada. Nenhuma autorização Instagram inferida.</p>}
        <h3>Capacidades da conexão (informativas)</h3><CapabilityList capabilities={c.capabilities} />
        <div className="meta-actions"><button type="button" className="app-secondary-button" disabled={!writable || c.state === "revoked" || c.state === "disconnected"} onClick={() => void run("test", c.id)}>{busy?.id === c.id && busy.action === "test" ? "Verificando…" : "Testar conexão"}</button><button type="button" className="app-secondary-button" disabled={!writable || c.state === "revoked" || c.state === "disconnected"} onClick={() => void run("revoke", c.id)}>{busy?.id === c.id && busy.action === "revoke" ? "Revogando…" : "Revogar localmente"}</button></div>
        <h3>Ativos desta conexão</h3>{!c.assets.length && <p>Nenhum ativo descoberto.</p>}
        <div className="meta-asset-list">{c.assets.map(a => <article className="meta-asset" key={a.id}><div className="meta-panel-heading"><div><strong>{a.name}</strong><p className="meta-muted">{assetLabels[a.type]} · {a.selected ? "Selecionado no servidor" : "Não selecionado no servidor"}</p></div><label className="meta-select"><input type="checkbox" checked={(selected[c.id] ?? []).includes(a.id)} disabled={!writable || !canSelectV2(c)} onChange={event => { const checked = event.target.checked; setSelected(old => ({ ...old, [c.id]: checked ? [...new Set([...(old[c.id] ?? []), a.id])] : (old[c.id] ?? []).filter(id => id !== a.id) })); }} /> Selecionar <span className="meta-sr-only">{a.name}</span></label></div><CapabilityList capabilities={a.capabilities} /></article>)}</div>
        {!!c.assets.length && <div className="meta-actions"><button type="button" className="app-primary-button" disabled={!writable || !canSelectV2(c) || !changed(c)} onClick={() => void run("assets", c.id)}>{busy?.id === c.id && busy.action === "assets" ? "Salvando…" : "Salvar seleção"}</button></div>}
      </section>)}
    </>}
    {!callbackBlocked && canReadAutomation && <MetaAutomationSection org={organizationId} grants={automationGrants} />}
    {!callbackBlocked && canReadInsights && <MetaInsightsSection key={`${refresh}:${loading}:${insightAssets.map(a => a.id).join(",")}`} org={organizationId} assets={insightAssets} />}
    {!callbackBlocked && canReadCampaigns && <><p className="meta-muted">Publicação e pausa comercial permanecem bloqueadas no V2.</p><MetaCampaignSection org={organizationId} status={null} statusLoading={loading} statusBusy={!!busy} canWrite={false} /></>}
  </section>;
}
