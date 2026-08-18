import { useEffect, useMemo, useState } from "react";
import { DocumentIcon, SearchIcon } from "../icons";
import { AppApiError } from "../../services/appApi";
import { listAuthorizations, type AuthorizationListResult, type PortfolioAuthorizationStatus, type PortfolioAuthorizationType } from "../../services/authorizationsApi";

interface Props { organizationId: string; canCreate: boolean; }
const statusLabels: Record<PortfolioAuthorizationStatus, string> = { draft: "Rascunho", awaiting_data: "Aguardando dados", sent: "Enviado", signed: "Assinado", active: "Vigente", expiring: "Vencendo", expired: "Vencido", canceled: "Cancelado" };
const typeLabels: Record<PortfolioAuthorizationType, string> = { sale: "Venda", rent: "Locação", sale_rent: "Venda ou locação", capture: "Captação" };
function dateLabel(value: string | null) { if (!value) return "—"; return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`)); }
function percent(value: string | null) { if (!value) return "—"; return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value))}%`; }

export function AuthorizationsPage({ organizationId, canCreate }: Props) {
  const params = new URLSearchParams(globalThis.location.search);
  const propertyId = params.get("propertyId")?.trim() || "";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PortfolioAuthorizationStatus | "">("");
  const [type, setType] = useState<PortfolioAuthorizationType | "">("");
  const [expiresFrom, setExpiresFrom] = useState("");
  const [expiresTo, setExpiresTo] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuthorizationListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => ({ search: search.trim() || undefined, status: status || undefined, type: type || undefined, expiresFrom: expiresFrom || undefined, expiresTo: expiresTo || undefined, propertyId: propertyId || undefined, page, pageSize: 50 }), [search, status, type, expiresFrom, expiresTo, propertyId, page]);
  useEffect(() => { const handle = globalThis.setTimeout(() => { setLoading(true); setError(null); void listAuthorizations(organizationId, query).then(setResult).catch((loadError) => setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as autorizações.")).finally(() => setLoading(false)); }, 250); return () => globalThis.clearTimeout(handle); }, [organizationId, query]);
  const newHref = `/app/autorizacao/${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ""}`;
  return <>
    <section className="app-page-heading"><div><span className="app-section-eyebrow">Portfólio</span><h1>Autorizações</h1><p>Controle condições de comercialização, vigência, responsáveis e vencimentos.</p></div>{canCreate && <a className="app-primary-button" href={newHref}>+ Nova autorização</a>}</section>
    {propertyId && <div className="app-context-banner"><DocumentIcon/><div><strong>Filtro por imóvel ativo</strong><p>A listagem mostra somente autorizações do imóvel aberto anteriormente.</p></div><a href="/app/autorizacoes/">Ver todas</a></div>}
    {error && <div className="app-inline-error">{error}</div>}
    <section className="app-metrics app-metrics--compact">{[["Total autorizações", result?.total ?? 0], ["Vigentes", result?.active ?? 0], ["A vencer (30 dias)", result?.expiring ?? 0], ["Vencidas", result?.expired ?? 0]].map(([label, value]) => <article className="app-metric-card" key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="app-filter-panel app-authorization-filters"><div className="app-search-field"><SearchIcon/><input placeholder="Imóvel, código ou proprietário..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }}/></div><label><span>Vencimento de</span><input type="date" value={expiresFrom} onChange={(event) => { setExpiresFrom(event.target.value); setPage(1); }}/></label><label><span>até</span><input type="date" value={expiresTo} onChange={(event) => { setExpiresTo(event.target.value); setPage(1); }}/></label><select aria-label="Status" value={status} onChange={(event) => { setStatus(event.target.value as PortfolioAuthorizationStatus | ""); setPage(1); }}><option value="">Todos os status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Tipo" value={type} onChange={(event) => { setType(event.target.value as PortfolioAuthorizationType | ""); setPage(1); }}><option value="">Todos os tipos</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{(search || status || type || expiresFrom || expiresTo) && <button className="app-secondary-button" type="button" onClick={() => { setSearch(""); setStatus(""); setType(""); setExpiresFrom(""); setExpiresTo(""); setPage(1); }}>Limpar</button>}</section>
    <section className="app-data-card">{loading ? <div className="app-table-empty"><span className="app-spinner"/>Carregando autorizações...</div> : !result?.items.length ? <div className="app-table-empty"><DocumentIcon/><h2>Nenhuma autorização encontrada</h2><p>Crie uma autorização ou ajuste os filtros selecionados.</p>{canCreate && <a className="app-primary-button" href={newHref}>Criar primeira autorização</a>}</div> : <><div className="app-authorization-table"><header><span>Imóvel</span><span>Proprietário</span><span>Tipo</span><span>Exclusividade</span><span>Comissão</span><span>Início</span><span>Fim</span><span>Status</span><span>Responsável</span></header>{result.items.map((item) => <a key={item.id} href={`/app/autorizacao/?id=${encodeURIComponent(item.id)}`}><span><strong>{item.property.title}</strong><small>{item.property.internalCode}</small></span><span>{item.primaryOwner?.name ?? "—"}</span><span>{typeLabels[item.type]}</span><span>{item.exclusive ? "Sim" : "Não"}</span><span>{percent(item.commissionPercent)}</span><span>{dateLabel(item.startsAt)}</span><span>{dateLabel(item.endsAt)}</span><span><em className={`app-status-pill authorization-${item.status}`}>{statusLabels[item.status]}</em></span><span>{item.responsible?.displayName ?? "—"}</span></a>)}</div><div className="app-pagination"><span>{result.totalItems} {result.totalItems === 1 ? "autorização" : "autorizações"}</span><div><button type="button" disabled={result.page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button><span>{result.page} / {result.totalPages}</span><button type="button" disabled={result.page >= result.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Próxima</button></div></div></>}</section>
  </>;
}
