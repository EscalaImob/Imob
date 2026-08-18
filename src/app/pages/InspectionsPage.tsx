import { useEffect, useMemo, useState } from "react";
import { ClipboardIcon, SearchIcon } from "../icons";
import { AppApiError } from "../../services/appApi";
import {
  listCorporateInspections,
  type CorporateInspectionListResult,
  type CorporateInspectionStatus,
  type CorporateInspectionType,
} from "../../services/inspectionsApi";

interface Props {
  organizationId: string;
  canCreate: boolean;
}

export const inspectionStatusLabels: Record<CorporateInspectionStatus, string> = {
  draft: "Rascunho",
  in_progress: "Em execução",
  review: "Em revisão",
  completed: "Concluído",
  canceled: "Cancelado",
};

export const inspectionTypeLabels: Record<CorporateInspectionType, string> = {
  entry: "Entrada",
  exit: "Saída",
  valuation: "Avaliação",
  technical: "Inspeção técnica",
  handover: "Entrega",
  custom: "Personalizado",
};

function dateTimeLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function InspectionsPage({ organizationId, canCreate }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CorporateInspectionStatus | "">("");
  const [type, setType] = useState<CorporateInspectionType | "">("");
  const [view, setView] = useState<"all" | "mine">("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<CorporateInspectionListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status || undefined,
      type: type || undefined,
      view,
      page,
      pageSize: 50,
    }),
    [search, status, type, view, page],
  );

  useEffect(() => {
    const handle = globalThis.setTimeout(() => {
      setLoading(true);
      setError(null);
      void listCorporateInspections(organizationId, query)
        .then(setResult)
        .catch((loadError) => {
          setError(
            loadError instanceof AppApiError
              ? loadError.message
              : "Não foi possível carregar os laudos e vistorias.",
          );
        })
        .finally(() => setLoading(false));
    }, 220);
    return () => globalThis.clearTimeout(handle);
  }, [organizationId, query]);

  return (
    <>
      <section className="app-page-heading">
        <div>
          <span className="app-section-eyebrow">Gestão corporativa</span>
          <h1>Laudos & vistorias</h1>
          <p>Registre a condição do imóvel com ambientes, itens, medições, histórico e versionamento do laudo.</p>
        </div>
        {canCreate && <a className="app-primary-button" href="/app/vistoria/">+ Nova vistoria</a>}
      </section>

      {error && <div className="app-inline-error">{error}</div>}

      <section className="app-metrics app-metrics--compact app-inspection-metrics">
        {[
          ["Total", result?.total ?? 0],
          ["Rascunhos", result?.drafts ?? 0],
          ["Em execução", result?.inProgress ?? 0],
          ["Em revisão", result?.review ?? 0],
          ["Concluídos", result?.completed ?? 0],
        ].map(([label, value]) => (
          <article className="app-metric-card" key={String(label)}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="app-filter-panel app-inspection-filters">
        <div className="app-search-field">
          <SearchIcon />
          <input
            placeholder="Laudo, imóvel ou código..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as CorporateInspectionStatus | "");
            setPage(1);
          }}
        >
          <option value="">Todos os status</option>
          {Object.entries(inspectionStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          aria-label="Tipo"
          value={type}
          onChange={(event) => {
            setType(event.target.value as CorporateInspectionType | "");
            setPage(1);
          }}
        >
          <option value="">Todos os tipos</option>
          {Object.entries(inspectionTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <div className="app-segmented">
          <button
            type="button"
            className={view === "all" ? "is-active" : ""}
            onClick={() => {
              setView("all");
              setPage(1);
            }}
          >
            Todos
          </button>
          <button
            type="button"
            className={view === "mine" ? "is-active" : ""}
            onClick={() => {
              setView("mine");
              setPage(1);
            }}
          >
            Meus
          </button>
        </div>
        {(search || status || type || view === "mine") && (
          <button
            className="app-secondary-button"
            type="button"
            onClick={() => {
              setSearch("");
              setStatus("");
              setType("");
              setView("all");
              setPage(1);
            }}
          >
            Limpar
          </button>
        )}
      </section>

      <section className="app-data-card app-inspection-list-card">
        {loading ? (
          <div className="app-table-empty">
            <span className="app-spinner" />
            Carregando laudos e vistorias...
          </div>
        ) : !result?.items.length ? (
          <div className="app-table-empty">
            <ClipboardIcon />
            <h2>Nenhum laudo ou vistoria encontrado</h2>
            <p>Crie a primeira vistoria ou ajuste os filtros selecionados.</p>
            {canCreate && <a className="app-primary-button" href="/app/vistoria/">Criar primeira vistoria</a>}
          </div>
        ) : (
          <>
            <div className="app-inspection-table">
              <header>
                <span>Laudo / vistoria</span>
                <span>Imóvel</span>
                <span>Tipo</span>
                <span>Estrutura</span>
                <span>Agendamento</span>
                <span>Versão</span>
                <span>Status</span>
                <span>Responsável</span>
              </header>
              {result.items.map((item) => (
                <a key={item.id} href={`/app/vistoria/?id=${encodeURIComponent(item.id)}`}>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.contract?.title ?? item.visit?.title ?? "Sem vínculo complementar"}</small>
                  </span>
                  <span>
                    <strong>{item.property.title}</strong>
                    <small>{item.property.internalCode}</small>
                  </span>
                  <span>{inspectionTypeLabels[item.type]}</span>
                  <span>{item.environmentCount} amb. · {item.itemCount} itens</span>
                  <span>{dateTimeLabel(item.scheduledAt)}</span>
                  <span>V{String(item.currentVersion).padStart(2, "0")}</span>
                  <span>
                    <em className={`app-status-pill inspection-${item.status}`}>
                      {inspectionStatusLabels[item.status]}
                    </em>
                  </span>
                  <span>{item.responsible?.displayName ?? "—"}</span>
                </a>
              ))}
            </div>
            <div className="app-pagination">
              <span>{result.totalItems} {result.totalItems === 1 ? "registro" : "registros"}</span>
              <div>
                <button
                  type="button"
                  disabled={result.page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Anterior
                </button>
                <span>{result.page} / {result.totalPages}</span>
                <button
                  type="button"
                  disabled={result.page >= result.totalPages || loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
