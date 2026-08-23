import { useEffect, useMemo, useState, type FormEvent } from "react";
import { clearAuthSession } from "../../auth/session";
import { AppApiError } from "../../services/appApi";
import {
  createContact,
  getContact,
  listContacts,
  updateContact,
  type ContactDetail,
  type ContactListResult,
  type ContactProfileCode,
} from "../../services/crmApi";
import { SearchIcon, UsersIcon } from "../icons";

const profileOptions: Array<{ value: ContactProfileCode; label: string }> = [
  { value: "interested", label: "Interessado" },
  { value: "buyer", label: "Comprador" },
  { value: "tenant", label: "Locatário" },
  { value: "owner", label: "Proprietário" },
  { value: "seller", label: "Vendedor" },
  { value: "landlord", label: "Locador" },
  { value: "investor", label: "Investidor" },
  { value: "partner", label: "Parceiro" },
];

const profileLabel = new Map(profileOptions.map((item) => [item.value, item.label]));
const statusLabels = new Map([
  ["active", "Ativo"],
  ["inactive", "Inativo"],
  ["blocked", "Bloqueado"],
  ["archived", "Arquivado"],
]);

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="app-list-empty">
      <UsersIcon />
      <strong>{filtered ? "Nenhum cliente encontrado" : "Sua base de clientes começa aqui"}</strong>
      <span>{filtered ? "Ajuste ou limpe os filtros para tentar novamente." : "Cadastre o primeiro contato para formar sua base única de relacionamento."}</span>
    </div>
  );
}

interface ClientsPageProps {
  organizationId: string;
  canCreate: boolean;
  canUpdate?: boolean;
}

export function ClientsPage({ organizationId, canCreate, canUpdate = canCreate }: ClientsPageProps) {
  const [data, setData] = useState<ContactListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [profile, setProfile] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedProfiles, setSelectedProfiles] = useState<ContactProfileCode[]>(["interested"]);
  const [selectedContact, setSelectedContact] = useState<ContactDetail | null>(null);

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => globalThis.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void listContacts(organizationId, { search: debouncedSearch, profile, status, page })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((loadError) => {
        if (!active) return;
        if (loadError instanceof AppApiError && loadError.status === 401) {
          clearAuthSession();
          globalThis.location.replace("/login/");
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os clientes.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [organizationId, debouncedSearch, profile, status, page]);

  const filtered = Boolean(debouncedSearch || profile || status);
  const summary = data?.summary ?? { total: 0, owners: 0, interested: 0, inactive: 0 };
  const metrics = useMemo(() => [
    ["Total clientes", summary.total],
    ["Proprietários", summary.owners],
    ["Leads / interessados", summary.interested],
    ["Inativos", summary.inactive],
  ] as const, [summary]);

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setProfile("");
    setStatus("");
    setPage(1);
  }

  function toggleProfile(code: ContactProfileCode) {
    setSelectedProfiles((current) => current.includes(code)
      ? current.filter((value) => value !== code)
      : [...current, code]);
  }

  async function openEdit(contactId: string) {
    setFormError(null);
    setSaving(true);
    try {
      const contact = await getContact(organizationId, contactId);
      setSelectedContact(contact);
      setSelectedProfiles(contact.profiles);
      setModalOpen(true);
    } catch (loadError) { setError(loadError instanceof AppApiError && loadError.status === 404 ? "A rota de detalhe do cliente ainda não está disponível na API publicada. Atualize o backend e tente novamente." : loadError instanceof Error ? loadError.message : "Não foi possível abrir o cliente."); }
    finally { setSaving(false); }
  }

  function openCreate() { setSelectedContact(null); setSelectedProfiles(["interested"]); setFormError(null); setModalOpen(true); }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      setFormError("Informe o nome do cliente.");
      return;
    }

    setSaving(true);
    try {
      const input = {
        kind: (form.get("kind") === "company" ? "company" : "person") as "company" | "person",
        name,
        document: String(form.get("document") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(),
        phone: String(form.get("phone") ?? "").trim(),
        whatsapp: String(form.get("whatsapp") ?? "").trim(),
        city: String(form.get("city") ?? "").trim(),
        state: String(form.get("state") ?? "").trim(),
        source: "manual",
        profiles: selectedProfiles,
      };
      const requestedStatus = String(form.get("status") ?? "active");
      const contactStatus = requestedStatus === "inactive" || requestedStatus === "blocked" || requestedStatus === "archived" ? requestedStatus : "active";
      const saved = selectedContact
        ? await updateContact(organizationId, selectedContact.id, { ...input, status: contactStatus })
        : await createContact(organizationId, input);
      setModalOpen(false);
      setSelectedContact(null);
      setSelectedProfiles(["interested"]);
      if (selectedContact) setData((current) => current ? { ...current, items: current.items.map((item) => item.id === saved.id ? { ...item, ...saved } : item) } : current);
      else { setPage(1); const refreshed = await listContacts(organizationId, { search: debouncedSearch, profile, status, page: 1 }); setData(refreshed); }
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Não foi possível cadastrar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function removeContact(contactId: string, contactName: string) {
    if (!globalThis.confirm(`Excluir o cliente "${contactName}"? O cadastro será arquivado e o histórico será preservado.`)) return;
    setSaving(true);
    setError(null);
    try {
      const contact = await getContact(organizationId, contactId);
      await updateContact(organizationId, contactId, {
        kind: contact.kind,
        name: contact.name,
        document: contact.document ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        whatsapp: contact.whatsapp ?? "",
        city: contact.city ?? "",
        state: contact.state ?? "",
        source: contact.source,
        profiles: contact.profiles,
        status: "archived",
      });
      setData((current) => current ? { ...current, items: current.items.filter((item) => item.id !== contactId), totalItems: Math.max(0, current.totalItems - 1) } : current);
    } catch (removeError) {
      setError(removeError instanceof AppApiError ? removeError.message : "Não foi possível excluir o cliente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="app-section-header">
        <div>
          <span className="app-section-eyebrow">CRM & Vendas</span>
          <h1>Gerenciar clientes</h1>
          <p>Uma base única para interessados, compradores, proprietários e demais relacionamentos.</p>
        </div>
        {canCreate && <div className="app-heading-actions"><a className="app-secondary-button" href="/app/configuracoes/?section=transfers&resource=contacts">Importar planilha</a><button className="app-primary-button" type="button" onClick={openCreate}>+ Novo cliente</button></div>}
      </section>

      <section className="app-summary-cards" aria-label="Resumo de clientes">
        {metrics.map(([label, value]) => (
          <article key={label}><strong>{value}</strong><span>{label}</span></article>
        ))}
      </section>

      <section className="app-list-card">
        <div className="app-filter-bar">
          <label className="app-filter-search"><SearchIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, documento, e-mail ou telefone..." /></label>
          <label><span>Perfil</span><select value={profile} onChange={(event) => { setProfile(event.target.value); setPage(1); }}><option value="">Todos</option>{profileOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="blocked">Bloqueados</option><option value="archived">Arquivados</option></select></label>
          <button className="app-filter-clear" type="button" onClick={clearFilters} disabled={!filtered}>Limpar</button>
        </div>

        {error ? <div className="app-inline-error">{error}</div> : loading && !data ? <div className="app-list-loading">Carregando clientes...</div> : data && data.items.length > 0 ? (
          <>
            <div className="app-table-wrap">
              <table className="app-data-table">
                <thead><tr><th>Cliente</th><th>Contato</th><th>Classificação</th><th>Localização</th><th>Cadastro</th><th>Status</th>{canUpdate && <th>Ações</th>}</tr></thead>
                <tbody>{data.items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong><small>{item.document || (item.kind === "company" ? "Pessoa jurídica" : "Pessoa física")}</small></td>
                    <td><span>{item.email || "—"}</span><small>{item.phone || "Sem telefone"}</small></td>
                    <td><div className="app-tags">{item.profiles.length ? item.profiles.map((code) => <span key={code}>{profileLabel.get(code) ?? code}</span>) : <small>Sem classificação</small>}</div></td>
                    <td><span>{[item.city, item.state].filter(Boolean).join(" / ") || "—"}</span></td>
                    <td><span>{formatDate(item.createdAt)}</span></td>
                    <td><span className={`app-status app-status--${item.status}`}>{statusLabels.get(item.status) ?? item.status}</span></td>
                    {canUpdate && <td><div className="app-row-actions"><button type="button" className="app-secondary-button" aria-label={"Editar cliente "+item.name} disabled={saving} onClick={() => void openEdit(item.id)}>Editar</button><button type="button" className="app-secondary-button is-danger" aria-label={"Excluir cliente "+item.name} disabled={saving} onClick={() => void removeContact(item.id,item.name)}>Excluir</button></div></td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="app-pagination"><span>{data.totalItems} {data.totalItems === 1 ? "registro" : "registros"}</span><div><button type="button" disabled={data.page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><span>{data.page} / {data.totalPages}</span><button type="button" disabled={data.page >= data.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button></div></div>
          </>
        ) : <EmptyState filtered={filtered} />}
      </section>

      {modalOpen && (
        <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false); }}>
          <section className="app-modal" role="dialog" aria-modal="true" aria-labelledby="new-client-title">
            <header><div><span className="app-section-eyebrow">Cadastro único</span><h2 id="new-client-title">{selectedContact ? "Editar cliente" : "Novo cliente"}</h2></div><button type="button" onClick={() => setModalOpen(false)} disabled={saving} aria-label="Fechar">×</button></header>
            <form key={selectedContact?.id ?? "new"} onSubmit={(event) => void handleSave(event)}>
              <div className="app-form-grid">
                <label><span>Tipo</span><select name="kind" defaultValue={selectedContact?.kind ?? "person"}><option value="person">Pessoa física</option><option value="company">Pessoa jurídica</option></select></label>
                {selectedContact && <label><span>Status</span><select name="status" defaultValue={selectedContact.status}><option value="active">Ativo</option><option value="inactive">Inativo</option><option value="blocked">Bloqueado</option><option value="archived">Arquivado</option></select></label>}
                <label className="is-wide"><span>Nome / razão social *</span><input name="name" defaultValue={selectedContact?.name ?? ""} maxLength={200} autoFocus /></label>
                <label><span>Documento</span><input name="document" defaultValue={selectedContact?.document ?? ""} maxLength={32} /></label>
                <label><span>E-mail</span><input name="email" defaultValue={selectedContact?.email ?? ""} type="email" maxLength={320} /></label>
                <label><span>Telefone</span><input name="phone" defaultValue={selectedContact?.phone ?? ""} maxLength={32} /></label>
                <label><span>WhatsApp</span><input name="whatsapp" defaultValue={selectedContact?.whatsapp ?? ""} maxLength={32} /></label>
                <label><span>Cidade</span><input name="city" defaultValue={selectedContact?.city ?? ""} maxLength={120} /></label>
                <label><span>UF</span><input name="state" defaultValue={selectedContact?.state ?? ""} maxLength={2} /></label>
              </div>
              <fieldset className="app-profile-fieldset"><legend>Classificações</legend><div className="app-profile-options">{profileOptions.map((item) => <button key={item.value} type="button" className={selectedProfiles.includes(item.value) ? "is-selected" : ""} onClick={() => toggleProfile(item.value)}>{item.label}</button>)}</div></fieldset>
              {formError && <div className="app-inline-error">{formError}</div>}
              <footer><button className="app-secondary-button" type="button" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</button><button className="app-primary-button" type="submit" disabled={saving}>{saving ? "Salvando..." : selectedContact ? "Salvar alterações" : "Cadastrar cliente"}</button></footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
