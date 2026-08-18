import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AppApiError } from "../../services/appApi";
import {
  createFinancialTransaction,
  getFinancialOptions,
  getFinancialTransaction,
  updateFinancialTransaction,
  type FinancialDirection,
  type FinancialOptions,
  type FinancialStatus,
  type FinancialTransactionDetail,
  type FinancialTransactionFields,
  type FinancialTransactionListItem,
} from "../../services/financeApi";

interface Props {
  organizationId: string;
  transaction?: FinancialTransactionListItem | null;
  onClose: () => void;
  onSaved: (transaction: FinancialTransactionDetail) => void;
}
function today() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function statusLabel(status: FinancialStatus, direction: FinancialDirection) {
  if (status === "forecast") return "Previsto";
  if (status === "pending") return "Pendente";
  if (status === "settled") return direction === "income" ? "Recebido" : "Pago";
  if (status === "partial") return "Parcial";
  if (status === "overdue") return "Vencido";
  if (status === "canceled") return "Cancelado";
  return "Estornado";
}
function emptyOptions(): FinancialOptions { return { accounts: [], categories: [], costCenters: [], assignees: [], contacts: [], properties: [], opportunities: [], contracts: [] }; }
const statusTransitions: Record<FinancialStatus, readonly FinancialStatus[]> = {
  forecast: ["forecast", "pending", "settled", "partial", "canceled"],
  pending: ["pending", "forecast", "settled", "partial", "overdue", "canceled"],
  partial: ["partial", "settled", "overdue", "canceled", "reversed"],
  overdue: ["overdue", "pending", "settled", "partial", "canceled"],
  settled: ["settled", "reversed"],
  canceled: ["canceled"],
  reversed: ["reversed"],
};
function fieldState(detail?: FinancialTransactionDetail | null): FinancialTransactionFields {
  const date = today();
  return detail ? {
    direction: detail.direction, status: detail.status, description: detail.description, amount: detail.amount, settledAmount: detail.settledAmount,
    competenceDate: detail.competenceDate, dueDate: detail.dueDate, settlementDate: detail.settlementDate, categoryId: detail.categoryId, accountId: detail.accountId,
    costCenterId: detail.costCenterId, contractId: detail.contractId, opportunityId: detail.opportunityId, propertyId: detail.propertyId, contactId: detail.contactId,
    responsibleMembershipId: detail.responsibleMembershipId, supplierName: detail.supplierName, notes: detail.notes,
  } : { direction: "income", status: "pending", description: "", amount: "", settledAmount: "0", competenceDate: date, dueDate: date, settlementDate: null, categoryId: null, accountId: null, costCenterId: null, contractId: null, opportunityId: null, propertyId: null, contactId: null, responsibleMembershipId: null, supplierName: null, notes: null };
}

export function FinancialTransactionModal({ organizationId, transaction, onClose, onSaved }: Props) {
  const [options, setOptions] = useState<FinancialOptions>(emptyOptions());
  const [detail, setDetail] = useState<FinancialTransactionDetail | null>(null);
  const [fields, setFields] = useState<FinancialTransactionFields>(fieldState());
  const [changeReason, setChangeReason] = useState("");
  const [loading, setLoading] = useState(Boolean(transaction));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true; setError(null);
    void Promise.all([getFinancialOptions(organizationId), transaction ? getFinancialTransaction(organizationId, transaction.id) : Promise.resolve(null)])
      .then(([loadedOptions, loadedDetail]) => { if (!active) return; setOptions(loadedOptions); setDetail(loadedDetail); const next = fieldState(loadedDetail); if (!loadedDetail) { next.accountId = loadedOptions.accounts[0]?.id ?? null; next.costCenterId = loadedOptions.costCenters[0]?.id ?? null; next.categoryId = loadedOptions.categories.find((item) => item.direction === "income" || item.direction === "both")?.id ?? null; } setFields(next); })
      .catch((loadError) => { if (active) setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível preparar o lançamento financeiro."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, transaction?.id]);

  const categories = useMemo(() => options.categories.filter((item) => item.direction === "both" || item.direction === fields.direction), [options.categories, fields.direction]);
  const allowedStatuses = detail ? statusTransitions[detail.status] : (["forecast", "pending", "settled", "partial", "overdue", "canceled"] as const);
  const sensitiveChange = Boolean(detail && (Number(detail.amount) !== Number(fields.amount.replace(",", ".")) || (detail.status !== fields.status && (fields.status === "canceled" || fields.status === "reversed"))));
  function set<K extends keyof FinancialTransactionFields>(key: K, value: FinancialTransactionFields[K]) { setFields((current) => ({ ...current, [key]: value })); }
  function applyStatus(next: FinancialStatus) {
    setFields((current) => {
      if (next === "settled") return { ...current, status: next, settledAmount: current.amount || current.settledAmount, settlementDate: current.settlementDate ?? today() };
      if (next === "canceled" || next === "reversed") return { ...current, status: next, settledAmount: "0", settlementDate: null };
      return { ...current, status: next };
    });
  }
  function applyContract(contractId: string) {
    const contract = options.contracts.find((item) => item.id === contractId);
    setFields((current) => ({ ...current, contractId: contractId || null, propertyId: contract?.propertyId ?? current.propertyId, contactId: contract?.counterpartyContactId ?? current.contactId }));
  }
  function applyOpportunity(opportunityId: string) {
    const opportunity = options.opportunities.find((item) => item.id === opportunityId);
    setFields((current) => ({ ...current, opportunityId: opportunityId || null, propertyId: opportunity?.propertyId ?? current.propertyId, contactId: opportunity?.contactId ?? current.contactId }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fields.description.trim() || !fields.amount || !fields.competenceDate || !fields.dueDate || saving) return;
    if (sensitiveChange && !changeReason.trim()) { setError("Informe o motivo da alteração de valor, cancelamento ou estorno."); return; }
    setSaving(true); setError(null);
    const input: FinancialTransactionFields = {
      ...fields, description: fields.description.trim(), amount: fields.amount.replace(",", "."), settledAmount: (fields.settledAmount || "0").replace(",", "."),
      supplierName: fields.supplierName?.trim() || null, notes: fields.notes?.trim() || null,
    };
    try {
      const saved = detail ? await updateFinancialTransaction(organizationId, detail.id, { ...input, changeReason: changeReason.trim() || null }) : await createFinancialTransaction(organizationId, input);
      onSaved(saved);
    } catch (saveError) {
      setError(saveError instanceof AppApiError ? saveError.message : "Não foi possível salvar o lançamento financeiro.");
    } finally { setSaving(false); }
  }

  return <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="app-modal app-finance-modal" role="dialog" aria-modal="true" aria-labelledby="finance-modal-title">
      <header className="app-modal__header"><div><span className="app-section-eyebrow">Gestão corporativa · Financeiro</span><h2 id="finance-modal-title">{transaction ? "Editar lançamento" : "Novo lançamento"}</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Fechar">×</button></header>
      <form onSubmit={submit}>
        <div className="app-modal__body app-form-grid app-finance-form">
          {error && <div className="app-inline-error is-wide">{error}</div>}
          {loading ? <div className="app-table-empty is-wide"><span className="app-spinner"/>Carregando lançamento...</div> : <>
            <label className="is-wide"><span>Descrição *</span><input value={fields.description} onChange={(event) => set("description", event.target.value)} maxLength={220} autoFocus required /></label>
            <label><span>Tipo *</span><select value={fields.direction} onChange={(event) => { const direction=event.target.value as FinancialDirection; setFields((current) => ({ ...current, direction, categoryId: options.categories.some((category) => category.id === current.categoryId && (category.direction === "both" || category.direction === direction)) ? current.categoryId : null })); }}><option value="income">Receita</option><option value="expense">Despesa</option></select></label>
            <label><span>Status *</span><select value={fields.status} onChange={(event) => applyStatus(event.target.value as FinancialStatus)}>{allowedStatuses.map((item) => <option key={item} value={item}>{statusLabel(item, fields.direction)}</option>)}</select></label>
            <label><span>Valor *</span><input inputMode="decimal" placeholder="0,00" value={fields.amount} onChange={(event) => set("amount", event.target.value)} required /></label>
            <label><span>Valor baixado</span><input inputMode="decimal" placeholder="0,00" value={fields.settledAmount} onChange={(event) => set("settledAmount", event.target.value)} /></label>
            <label><span>Competência *</span><input type="date" value={fields.competenceDate} onChange={(event) => set("competenceDate", event.target.value)} required /></label>
            <label><span>Vencimento *</span><input type="date" value={fields.dueDate} onChange={(event) => set("dueDate", event.target.value)} required /></label>
            <label><span>Pagamento / recebimento</span><input type="date" value={fields.settlementDate ?? ""} onChange={(event) => set("settlementDate", event.target.value || null)} /></label>
            <label><span>Conta</span><select value={fields.accountId ?? ""} onChange={(event) => set("accountId", event.target.value || null)}><option value="">Sem conta definida</option>{options.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>Categoria</span><select value={fields.categoryId ?? ""} onChange={(event) => set("categoryId", event.target.value || null)}><option value="">Sem categoria</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>Centro de custo</span><select value={fields.costCenterId ?? ""} onChange={(event) => set("costCenterId", event.target.value || null)}><option value="">Sem centro de custo</option>{options.costCenters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>Responsável</span><select value={fields.responsibleMembershipId ?? ""} onChange={(event) => set("responsibleMembershipId", event.target.value || null)}><option value="">Eu (padrão)</option>{options.assignees.map((item) => <option key={item.membershipId} value={item.membershipId}>{item.displayName}</option>)}</select></label>
            <label><span>Contrato</span><select value={fields.contractId ?? ""} onChange={(event) => applyContract(event.target.value)}><option value="">Sem contrato vinculado</option>{options.contracts.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label><span>Oportunidade</span><select value={fields.opportunityId ?? ""} onChange={(event) => applyOpportunity(event.target.value)}><option value="">Sem oportunidade vinculada</option>{options.opportunities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label><span>Imóvel</span><select value={fields.propertyId ?? ""} onChange={(event) => set("propertyId", event.target.value || null)}><option value="">Sem imóvel vinculado</option>{options.properties.map((item) => <option key={item.id} value={item.id}>{item.internalCode} · {item.title}</option>)}</select></label>
            <label><span>Cliente / proprietário / parte</span><select value={fields.contactId ?? ""} onChange={(event) => set("contactId", event.target.value || null)}><option value="">Sem contato vinculado</option>{options.contacts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="is-wide"><span>Fornecedor / favorecido avulso</span><input value={fields.supplierName ?? ""} onChange={(event) => set("supplierName", event.target.value || null)} maxLength={220} placeholder="Use quando não houver contato cadastrado" /></label>
            <label className="is-wide"><span>Observações</span><textarea value={fields.notes ?? ""} onChange={(event) => set("notes", event.target.value || null)} rows={4} maxLength={5000} /></label>
            {detail && <label className="is-wide"><span>Motivo da alteração{sensitiveChange ? " *" : ""}</span><textarea value={changeReason} onChange={(event) => setChangeReason(event.target.value)} rows={2} maxLength={1000} placeholder={sensitiveChange ? "Obrigatório para alteração de valor, cancelamento ou estorno." : "Opcional para registrar o contexto desta alteração."} /></label>}
            {detail && detail.timeline.length > 0 && <section className="app-finance-timeline is-wide"><strong>Histórico do lançamento</strong>{detail.timeline.slice(0, 8).map((item) => <article key={item.id}><span>{item.eventType === "financial.transaction.created" ? "Lançamento criado" : item.eventType === "financial.transaction.reversed" ? "Lançamento estornado" : item.eventType === "financial.transaction.status_changed" ? "Status alterado" : "Lançamento atualizado"}</span><small>{item.actor?.displayName ?? "Sistema"} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</small></article>)}</section>}
            <div className="app-finance-status-note is-wide">Status atual: <strong>{statusLabel(fields.status, fields.direction)}</strong>. Alterações de valor, cancelamentos e estornos exigem motivo e ficam registradas na auditoria.</div>
          </>}
        </div>
        <footer className="app-modal__footer"><button type="button" className="app-secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="app-primary-button" disabled={saving || loading || !fields.description.trim() || !fields.amount || !fields.competenceDate || !fields.dueDate}>{saving ? "Salvando..." : transaction ? "Salvar lançamento" : "Criar lançamento"}</button></footer>
      </form>
    </section>
  </div>;
}
