import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppApiError } from "../../services/appApi";
import {
  getMetaStatus, revokeMetaConnection, selectMetaAssets, startMetaOAuth, testMetaConnection,
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
function authorizationDestination(raw: string, expiresAt: string): URL {
  const expiration = Date.parse(expiresAt);
  let url: URL;
  try { url = new URL(raw); } catch { throw new AppApiError("URL de autorização inválida.", "INVALID_API_RESPONSE"); }
  if (url.protocol !== "https:" || url.username || url.password || !Number.isFinite(expiration) || expiration <= Date.now()) {
    throw new AppApiError("Autorização inválida ou expirada. Atualize o estado e tente novamente.", "INVALID_API_RESPONSE");
  }
  return url;
}

type Action = "connect" | "test" | "revoke" | "assets";
export function MarketingPage({ organizationId, canManage, canReadAutomation, automationGrants, canReadInsights, canReadCampaigns, canWriteCampaigns }: { organizationId: string; canManage: boolean; canReadAutomation: boolean; automationGrants: ActionGrants; canReadInsights: boolean; canReadCampaigns: boolean; canWriteCampaigns: boolean }) {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<ReturnType<typeof errorDetails> | null>(null);
  const [actionError, setActionError] = useState<ReturnType<typeof errorDetails> | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
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
        const result = await startMetaOAuth(organizationId, null, controller.signal);
        if (controller.signal.aborted) return;
        const destination = authorizationDestination(result.authorizationUrl, result.expiresAt);
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
      {error && <div className="meta-panel" role="alert"><strong>{error.status === 403 ? "Acesso não autorizado" : "Não foi possível carregar a integração"}</strong><p>{error.message}</p><button type="button" className="app-secondary-button" onClick={reload}>Tentar novamente</button></div>}
      {actionError && <div className="meta-panel" role="alert"><strong>Operação não concluída</strong><p>{actionError.message}</p>{blocked && <p>Atualize o estado antes de tentar outra operação.</p>}</div>}
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
          <div className="meta-actions">
            <button type="button" className="app-primary-button" disabled={!canConnect} onClick={() => void run("connect")}>{busy === "connect" ? "Iniciando…" : "Conectar Meta"}</button>
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
