import { useCallback, useEffect, useState } from "react";
import { AppApiError } from "../../services/appApi";
import {
  createPlatformAccessKey,
  getPlatformAiStudioTelemetry,
  getPlatformOverview,
  listPlatformAccessKeys,
  listPlatformAiStudioOrganizations,
  revokePlatformAccessKey,
  updatePlatformAiStudioOrganization,
  type PlatformAccessKey,
  type PlatformAccessKeyFilters,
  type PlatformAccessKeyStatus,
  type PlatformAiStudioOrganization,
  type PlatformAiStudioOrganizationUpdate,
  type PlatformAiStudioTelemetry,
  type PlatformOverview,
} from "../../services/platformAdminApi";

const statusLabels: Record<PlatformAccessKeyStatus, string> = {
  active: "Disponível",
  redeemed: "Utilizada",
  revoked: "Revogada",
  expired: "Expirada",
};

function formatDate(value: string | null): string {
  if (!value) return "Sem expiração";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

type AiStudioDraft = { enabled: boolean; planCode: string; monthlyReelLimit: string };

function formatDurationMs(value: number | null): string {
  if (value === null) return "—";
  return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s`;
}

function formatMegabytes(value: number | null): string {
  if (value === null) return "—";
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function formatRate(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

const telemetryLabels: Record<string, string> = {
  chromium: "Chromium", safari: "Safari", firefox: "Firefox", other: "Outro",
  desktop: "Desktop", mobile: "Mobile", tablet: "Tablet", unknown: "Desconhecido",
};

function aiStudioDraft(item: PlatformAiStudioOrganization): AiStudioDraft {
  return { enabled: item.enabled, planCode: item.planCode, monthlyReelLimit: item.monthlyReelLimit === null ? "" : String(item.monthlyReelLimit) };
}

export function PlatformAdminPage() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [keys, setKeys] = useState<PlatformAccessKey[]>([]);
  const [aiOrganizations, setAiOrganizations] = useState<PlatformAiStudioOrganization[]>([]);
  const [aiDrafts, setAiDrafts] = useState<Record<string, AiStudioDraft>>({});
  const [telemetry, setTelemetry] = useState<PlatformAiStudioTelemetry | null>(null);
  const [telemetryDays, setTelemetryDays] = useState(30);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [aiSavingId, setAiSavingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<PlatformAccessKeyFilters>({ status: "all" });
  const [cpf, setCpf] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async (nextFilters: PlatformAccessKeyFilters = filters) => {
    setLoading(true);
    setMessage(null);
    try {
      const [summary, accessKeys, aiStudioOrganizations] = await Promise.all([
        getPlatformOverview(),
        listPlatformAccessKeys(nextFilters),
        listPlatformAiStudioOrganizations(),
      ]);
      setOverview(summary);
      setKeys(accessKeys);
      setAiOrganizations(aiStudioOrganizations);
      setAiDrafts(Object.fromEntries(aiStudioOrganizations.map((item) => [item.organizationId, aiStudioDraft(item)])));
      try {
        setTelemetry(await getPlatformAiStudioTelemetry(telemetryDays));
      } catch (telemetryError) {
        console.warn("[Admin Escala IMOB] Telemetria do Estúdio IA indisponível", telemetryError);
        setTelemetry(null);
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof AppApiError ? error.message : "Não foi possível carregar a administração da plataforma.",
      });
    } finally {
      setLoading(false);
    }
  }, [filters, telemetryDays]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    setIssuedKey(null);

    try {
      const created = await createPlatformAccessKey({
        cpf,
        expiresInDays: expiresInDays.trim() ? Number(expiresInDays) : null,
      });
      setIssuedKey(created.accessKey);
      setCpf("");
      setExpiresInDays("");
      setMessage({ tone: "success", text: "Chave emitida. Copie o valor agora: ele não será exibido novamente." });
      await load(filters);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof AppApiError ? error.message : "Não foi possível emitir a chave." });
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id: string) {
    if (saving || !globalThis.confirm("Revogar esta chave de acesso?")) return;
    setSaving(true);
    setMessage(null);
    try {
      await revokePlatformAccessKey(id);
      setMessage({ tone: "success", text: "Chave revogada." });
      await load(filters);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof AppApiError ? error.message : "Não foi possível revogar a chave." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTelemetryDays(nextDays: number) {
    if (telemetryLoading || nextDays === telemetryDays) return;
    setTelemetryDays(nextDays);
    setTelemetryLoading(true);
    setMessage(null);
    try {
      setTelemetry(await getPlatformAiStudioTelemetry(nextDays));
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof AppApiError ? error.message : "Não foi possível carregar a telemetria do Estúdio IA." });
    } finally {
      setTelemetryLoading(false);
    }
  }

  async function handleSaveAiStudio(item: PlatformAiStudioOrganization) {
    if (aiSavingId || saving) return;
    const draft = aiDrafts[item.organizationId];
    if (!draft) return;
    const planCode = draft.planCode.trim().toLowerCase();
    const monthlyLimit = draft.monthlyReelLimit.trim() === "" ? null : Number(draft.monthlyReelLimit);
    if (!planCode) { setMessage({ tone: "error", text: "Informe o código do plano do Estúdio IA." }); return; }
    if (monthlyLimit !== null && (!Number.isInteger(monthlyLimit) || monthlyLimit < 0)) { setMessage({ tone: "error", text: "O limite mensal de Reels deve ser um inteiro maior ou igual a zero." }); return; }
    const input: PlatformAiStudioOrganizationUpdate = { enabled: draft.enabled, planCode, monthlyReelLimit: monthlyLimit };
    setAiSavingId(item.organizationId);
    setMessage(null);
    try {
      const updated = await updatePlatformAiStudioOrganization(item.organizationId, input);
      setAiOrganizations((current) => current.map((entry) => entry.organizationId === updated.organizationId ? updated : entry));
      setAiDrafts((current) => ({ ...current, [updated.organizationId]: aiStudioDraft(updated) }));
      setMessage({ tone: "success", text: `Plano do Estúdio IA atualizado para ${updated.organizationName}.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof AppApiError ? error.message : "Não foi possível atualizar o plano do Estúdio IA." });
    } finally {
      setAiSavingId(null);
    }
  }

  const metricItems = [
    ["Organizações", overview?.organizations ?? 0],
    ["Organizações ativas", overview?.activeOrganizations ?? 0],
    ["Usuários", overview?.users ?? 0],
    ["Usuários ativos", overview?.activeUsers ?? 0],
    ["Chaves disponíveis", overview?.activeAccessKeys ?? 0],
  ];

  return (
    <section className="platform-admin-page">
      <header className="platform-admin-page__intro">
        <div><span>PLATAFORMA</span><h1>Administração comercial</h1><p>Autorize novos cadastros por CPF sem misturar o controle global com a administração das imobiliárias.</p></div>
      </header>

      {message && <div className={`platform-admin-alert is-${message.tone}`} role="status">{message.text}</div>}

      <div className="platform-admin-metrics">
        {metricItems.map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}
      </div>

      <article className="platform-admin-card">
        <header><div><h2>Estúdio IA por organização</h2><p>Habilite o recurso, defina o plano comercial e limite mensal de Reels. Deixe o limite vazio para uso ilimitado.</p></div></header>
        <div className="platform-admin-table-wrap">
          <table className="platform-admin-table platform-admin-ai-table">
            <thead><tr><th>Organização</th><th>Ativo</th><th>Plano</th><th>Uso no mês</th><th>Limite mensal</th><th /></tr></thead>
            <tbody>
              {aiOrganizations.map((item) => {
                const draft = aiDrafts[item.organizationId] ?? aiStudioDraft(item);
                const dirty = draft.enabled !== item.enabled || draft.planCode.trim().toLowerCase() !== item.planCode || (draft.monthlyReelLimit.trim() === "" ? null : Number(draft.monthlyReelLimit)) !== item.monthlyReelLimit;
                return <tr key={item.organizationId}>
                  <td><strong>{item.organizationName}</strong><small>{item.organizationId.slice(0, 8)}</small></td>
                  <td><input type="checkbox" aria-label={`Estúdio IA ativo para ${item.organizationName}`} checked={draft.enabled} disabled={Boolean(aiSavingId)} onChange={(event) => setAiDrafts((current) => ({ ...current, [item.organizationId]: { ...draft, enabled: event.target.checked } }))}/></td>
                  <td><input aria-label={`Plano de ${item.organizationName}`} value={draft.planCode} maxLength={32} disabled={Boolean(aiSavingId)} onChange={(event) => setAiDrafts((current) => ({ ...current, [item.organizationId]: { ...draft, planCode: event.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) } }))}/></td>
                  <td><strong>{item.currentMonthUsage}</strong></td>
                  <td><input aria-label={`Limite mensal de ${item.organizationName}`} value={draft.monthlyReelLimit} inputMode="numeric" placeholder="Ilimitado" disabled={Boolean(aiSavingId)} onChange={(event) => setAiDrafts((current) => ({ ...current, [item.organizationId]: { ...draft, monthlyReelLimit: event.target.value.replace(/\D/g, "").slice(0, 6) } }))}/></td>
                  <td><button type="button" disabled={!dirty || Boolean(aiSavingId)} onClick={() => void handleSaveAiStudio(item)}>{aiSavingId === item.organizationId ? "Salvando..." : "Salvar"}</button></td>
                </tr>;
              })}
              {!loading && aiOrganizations.length === 0 && <tr><td colSpan={6} className="platform-admin-empty">Nenhuma organização disponível.</td></tr>}
              {loading && <tr><td colSpan={6} className="platform-admin-empty">Carregando...</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="platform-admin-card platform-admin-telemetry">
        <header>
          <div><h2>Telemetria do Reel Lite</h2><p>Desempenho real da geração local para decidir compatibilidade, limites e próximos investimentos do MVP.</p></div>
          <label className="platform-admin-telemetry-range"><span>Janela</span><select value={telemetryDays} disabled={telemetryLoading} onChange={(event) => void handleTelemetryDays(Number(event.target.value))}><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option></select></label>
        </header>
        {telemetryLoading ? <div className="platform-admin-empty">Atualizando telemetria...</div> : telemetry ? <>
          <div className="platform-admin-telemetry-metrics">
            <article><span>Gerações</span><strong>{telemetry.totalGenerations}</strong></article>
            <article><span>Taxa de sucesso</span><strong>{formatRate(telemetry.succeeded, telemetry.totalGenerations)}</strong></article>
            <article><span>Render p50</span><strong>{formatDurationMs(telemetry.renderMsP50)}</strong></article>
            <article><span>Render p90</span><strong>{formatDurationMs(telemetry.renderMsP90)}</strong></article>
            <article><span>Regerações</span><strong>{formatRate(telemetry.regenerationCount, telemetry.totalGenerations)}</strong></article>
            <article><span>Saída média</span><strong>{formatMegabytes(telemetry.outputBytesAverage)}</strong></article>
          </div>
          <div className="platform-admin-telemetry-details">
            <section><header><strong>Navegadores</strong><span>{telemetry.webGpuCount} com WebGPU disponível · {telemetry.webGpuUsedCount} usaram WebGPU · {telemetry.wasmUsedCount} usaram WASM · média {telemetry.imageCountAverage?.toFixed(1) ?? "—"} fotos</span></header><div className="platform-admin-telemetry-list">{telemetry.browsers.length ? telemetry.browsers.map((item) => <div key={item.key}><span>{telemetryLabels[item.key] ?? item.key}</span><strong>{item.total} · {formatRate(item.succeeded, item.total)} sucesso</strong><small>p90 {formatDurationMs(item.renderMsP90)}</small></div>) : <p>Sem dados nesta janela.</p>}</div></section>
            <section><header><strong>Dispositivos</strong><span>Preparação média {formatDurationMs(telemetry.preparationMsAverage)}</span></header><div className="platform-admin-telemetry-list">{telemetry.devices.length ? telemetry.devices.map((item) => <div key={item.key}><span>{telemetryLabels[item.key] ?? item.key}</span><strong>{item.total} · {formatRate(item.succeeded, item.total)} sucesso</strong><small>p90 {formatDurationMs(item.renderMsP90)}</small></div>) : <p>Sem dados nesta janela.</p>}</div></section>
            <section><header><strong>Falhas técnicas</strong><span>{telemetry.failed} falha(s) no período</span></header><div className="platform-admin-telemetry-list">{telemetry.errors.length ? telemetry.errors.map((item) => <div key={item.code}><span>{item.code}</span><strong>{item.total}</strong><small>{formatRate(item.total, telemetry.failed)} das falhas</small></div>) : <p>Nenhuma falha registrada.</p>}</div></section>
          </div>
        </> : <div className="platform-admin-empty">Sem telemetria disponível.</div>}
      </article>

      <article className="platform-admin-card">
        <header><div><h2>Emitir chave de acesso</h2><p>O valor completo aparece somente nesta emissão. O backend armazena apenas o hash.</p></div></header>
        <div className="platform-admin-form">
          <label><span>CPF *</span><input value={cpf} onChange={(event) => setCpf(event.target.value.replace(/[^\d.-]/g, "").slice(0, 14))} placeholder="000.000.000-00" inputMode="numeric" /></label>
          <label><span>Validade em dias</span><input value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Sem expiração" inputMode="numeric" /></label>
          <button type="button" onClick={() => void handleCreate()} disabled={saving || cpf.replace(/\D/g, "").length !== 11}>{saving ? "Processando..." : "Gerar chave"}</button>
        </div>
        {issuedKey && <div className="platform-admin-secret"><div><strong>Chave emitida</strong><code>{issuedKey}</code></div><button type="button" onClick={() => void navigator.clipboard.writeText(issuedKey)}>Copiar</button></div>}
      </article>

      <article className="platform-admin-card">
        <header><div><h2>Chaves emitidas</h2><p>Consulte por CPF, status e período de emissão.</p></div></header>
        <div className="platform-admin-filters">
          <input aria-label="CPF para consulta" value={filters.cpf ?? ""} onChange={(event) => setFilters((current) => ({ ...current, cpf: event.target.value }))} placeholder="CPF exato" />
          <select aria-label="Status" value={filters.status ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as PlatformAccessKeyStatus | "all" }))}>
            <option value="all">Todos os status</option><option value="active">Disponíveis</option><option value="redeemed">Utilizadas</option><option value="revoked">Revogadas</option><option value="expired">Expiradas</option>
          </select>
          <input aria-label="Data inicial" type="date" value={filters.createdFrom ?? ""} onChange={(event) => setFilters((current) => ({ ...current, createdFrom: event.target.value }))} />
          <input aria-label="Data final" type="date" value={filters.createdTo ?? ""} onChange={(event) => setFilters((current) => ({ ...current, createdTo: event.target.value }))} />
          <button type="button" onClick={() => void load(filters)} disabled={loading}>Filtrar</button>
        </div>

        <div className="platform-admin-table-wrap">
          <table className="platform-admin-table">
            <thead><tr><th>CPF</th><th>Chave</th><th>Status</th><th>Emitida em</th><th>Expira em</th><th>Uso / revogação</th><th /></tr></thead>
            <tbody>
              {keys.map((item) => <tr key={item.id}><td>{item.cpfMasked}</td><td>•••• {item.secretLast4}</td><td><span className={`platform-key-status is-${item.status}`}>{statusLabels[item.status]}</span></td><td>{formatDate(item.createdAt)}</td><td>{formatDate(item.expiresAt)}</td><td>{item.redeemedAt ? `Usada ${formatDate(item.redeemedAt)}` : item.revokedAt ? `Revogada ${formatDate(item.revokedAt)}` : "—"}</td><td>{item.status === "active" && <button className="platform-admin-link-danger" type="button" onClick={() => void handleRevoke(item.id)} disabled={saving}>Revogar</button>}</td></tr>)}
              {!loading && keys.length === 0 && <tr><td colSpan={7} className="platform-admin-empty">Nenhuma chave encontrada.</td></tr>}
              {loading && <tr><td colSpan={7} className="platform-admin-empty">Carregando...</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
