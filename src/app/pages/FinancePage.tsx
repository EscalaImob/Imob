import { useEffect, useMemo, useState } from "react";
import { SearchIcon, WalletIcon } from "../icons";
import { FinancialTransactionModal } from "../components/FinancialTransactionModal";
import { AppApiError } from "../../services/appApi";
import {
  listFinancialTransactions,
  type FinancialDirection,
  type FinancialStatus,
  type FinancialTransactionListItem,
  type FinancialTransactionListResult,
} from "../../services/financeApi";

interface Props {
  organizationId: string;
  canCreate: boolean;
  canUpdate: boolean;
}

const statusLabels: Record<FinancialStatus, string> = {
  forecast: "Previsto",
  pending: "Pendente",
  settled: "Liquidado",
  partial: "Parcial",
  overdue: "Vencido",
  canceled: "Cancelado",
  reversed: "Estornado",
};

function money(value: string | null | undefined, currency: "BRL" | "USD" | "EUR" = "BRL") {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number.isFinite(number) ? number : 0);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

function transactionStatusLabel(item: FinancialTransactionListItem) {
  if (item.status === "settled") return item.direction === "income" ? "Recebido" : "Pago";
  return statusLabels[item.status];
}

export function FinancePage({ organizationId, canCreate, canUpdate }: Props) {
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<FinancialDirection | "">("");
  const [status, setStatus] = useState<FinancialStatus | "">("");
  const [view, setView] = useState<"all" | "mine">("all");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState<FinancialTransactionListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalTransaction, setModalTransaction] = useState<FinancialTransactionListItem | null | undefined>(undefined);

  const query = useMemo(() => ({
    search: search.trim() || undefined,
    direction: direction || undefined,
    status: status || undefined,
    view,
    page,
    pageSize: 50,
  }), [search, direction, status, view, page]);

  useEffect(() => {
    const handle = globalThis.setTimeout(() => {
      setLoading(true);
      setError(null);
      void listFinancialTransactions(organizationId, query)
        .then(setResult)
        .catch((loadError) => setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar o financeiro."))
        .finally(() => setLoading(false));
    }, 220);
    return () => globalThis.clearTimeout(handle);
  }, [organizationId, query, refreshKey]);

  const summary = result?.summary;
  const currency = result?.currency ?? "BRL";
  const metrics = [
    { label: "Saldo realizado", value: money(summary?.balance, currency), helper: "Entradas liquidadas menos saídas" },
    { label: "Entradas", value: money(summary?.inflows, currency), helper: "Recebimentos realizados" },
    { label: "Saídas", value: money(summary?.outflows, currency), helper: "Pagamentos realizados" },
    { label: "Vencidas", value: money(summary?.overdueAmount, currency), helper: `${summary?.overdueCount ?? 0} lançamento(s)` },
    { label: "A vencer (30 dias)", value: money(summary?.dueNext30Amount, currency), helper: `${summary?.dueNext30Count ?? 0} lançamento(s)` },
    { label: "Projeção", value: money(summary?.projectedBalance, currency), helper: "Saldo considerando lançamentos ativos" },
  ];

  function clearFilters() {
    setSearch("");
    setDirection("");
    setStatus("");
    setView("all");
    setPage(1);
  }

  return <>
    <section className="app-page-heading">
      <div><span className="app-section-eyebrow">Gestão corporativa</span><h1>Financeiro</h1><p>Controle entradas, saídas, vencimentos e projeção de caixa com vínculos à operação.</p></div>
      {canCreate && <button className="app-primary-button" type="button" onClick={() => setModalTransaction(null)}>+ Novo lançamento</button>}
    </section>

    {error && <div className="app-inline-error">{error}</div>}

    <section className="app-metrics app-metrics--compact app-finance-metrics">
      {metrics.map((metric) => <article className="app-metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.helper}</small></article>)}
    </section>

    <section className="app-filter-panel app-finance-filters">
      <div className="app-search-field"><SearchIcon/><input placeholder="Descrição, contato, imóvel, contrato ou favorecido..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }}/></div>
      <select aria-label="Tipo" value={direction} onChange={(event) => { setDirection(event.target.value as FinancialDirection | ""); setPage(1); }}><option value="">Entradas e saídas</option><option value="income">Receitas</option><option value="expense">Despesas</option></select>
      <select aria-label="Status" value={status} onChange={(event) => { setStatus(event.target.value as FinancialStatus | ""); setPage(1); }}><option value="">Todos os status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <div className="app-segmented"><button type="button" className={view === "all" ? "is-active" : ""} onClick={() => { setView("all"); setPage(1); }}>Todos</button><button type="button" className={view === "mine" ? "is-active" : ""} onClick={() => { setView("mine"); setPage(1); }}>Meus</button></div>
      {(search || direction || status || view === "mine") && <button className="app-secondary-button" type="button" onClick={clearFilters}>Limpar</button>}
    </section>

    <section className="app-data-card app-finance-list-card">
      {loading ? <div className="app-table-empty"><span className="app-spinner"/>Carregando lançamentos...</div> : !result?.items.length ? <div className="app-table-empty"><WalletIcon/><h2>Nenhum lançamento encontrado</h2><p>Registre a primeira entrada ou saída para começar o controle financeiro.</p>{canCreate && <button className="app-primary-button" type="button" onClick={() => setModalTransaction(null)}>Criar primeiro lançamento</button>}</div> : <>
        <div className="app-finance-table">
          <header><span>Lançamento</span><span>Tipo</span><span>Vencimento</span><span>Valor</span><span>Liquidado</span><span>Conta / categoria</span><span>Vínculo</span><span>Status</span><span>Responsável</span></header>
          {result.items.map((item) => <button type="button" key={item.id} className={canUpdate ? "" : "is-readonly"} onClick={() => { if (canUpdate) setModalTransaction(item); }} aria-disabled={!canUpdate}>
            <span><strong>{item.description}</strong><small>{item.contact?.name ?? item.supplierName ?? "Sem contraparte definida"}</small></span>
            <span><em className={`app-finance-direction ${item.direction}`}>{item.direction === "income" ? "Entrada" : "Saída"}</em></span>
            <span>{dateLabel(item.dueDate)}</span>
            <span><strong>{money(item.amount, currency)}</strong></span>
            <span>{money(item.settledAmount, currency)}</span>
            <span><strong>{item.account?.name ?? "—"}</strong><small>{item.category?.name ?? "Sem categoria"}</small></span>
            <span><strong>{item.contract?.title ?? item.opportunity?.title ?? item.property?.title ?? "—"}</strong><small>{item.property?.internalCode ?? item.costCenter?.name ?? "Sem vínculo operacional"}</small></span>
            <span><em className={`app-status-pill finance-${item.status}`}>{transactionStatusLabel(item)}</em></span>
            <span>{item.responsible?.displayName ?? "—"}</span>
          </button>)}
        </div>
        <div className="app-pagination"><span>{result.totalItems} {result.totalItems === 1 ? "lançamento" : "lançamentos"}</span><div><button type="button" disabled={result.page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button><span>{result.page} / {result.totalPages}</span><button type="button" disabled={result.page >= result.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Próxima</button></div></div>
      </>}
    </section>

    {modalTransaction !== undefined && <FinancialTransactionModal organizationId={organizationId} transaction={modalTransaction} onClose={() => setModalTransaction(undefined)} onSaved={() => { setModalTransaction(undefined); setRefreshKey((current) => current + 1); }} />}
  </>;
}
