import { useCallback, useEffect, useState } from "react";
import { AppApiError } from "../../services/appApi";
import {
  createPlatformAccessKey,
  getPlatformAiStudioTelemetry,
  getPlatformOperationsHealth,
  getPlatformOverview,
  listPlatformAccessKeys,
  listPlatformAuditLogs,
  listPlatformAiStudioOrganizations,
  listPlatformUsers,
  revokePlatformAccessKey,
  updatePlatformAiStudioOrganization,
  type PlatformAccessKey,
  type PlatformAccessKeyFilters,
  type PlatformAccessKeyStatus,
  type PlatformAuditFilters,
  type PlatformAuditLog,
  type PlatformAuditScope,
  type PlatformAiStudioOrganization,
  type PlatformAiStudioOrganizationUpdate,
  type PlatformAiStudioTelemetry,
  type PlatformOperationsHealth,
  type PlatformOverview,
  type PlatformUser,
  type PlatformUserFilters,
  type PlatformUserStatus,
} from "../../services/platformAdminApi";

const userStatusLabels: Record<PlatformUserStatus, string> = {
  active: "Ativo",
  suspended: "Suspenso",
  archived: "Arquivado",
};

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

type AiStudioCommercialPreset = {
  code: "trial" | "essencial" | "profissional" | "imobiliaria" | "enterprise";
  label: string;
  monthlyReelLimit: number | null;
  customLimit: boolean;
};

const aiStudioCommercialPresets: AiStudioCommercialPreset[] = [
  { code: "trial", label: "Trial · 1 Reel/mês", monthlyReelLimit: 1, customLimit: false },
  { code: "essencial", label: "Essencial · 3 Reels/mês", monthlyReelLimit: 3, customLimit: false },
  { code: "profissional", label: "Profissional · 10 Reels/mês", monthlyReelLimit: 10, customLimit: false },
  { code: "imobiliaria", label: "Imobiliária · 30 Reels/mês", monthlyReelLimit: 30, customLimit: false },
  { code: "enterprise", label: "Enterprise · franquia customizada", monthlyReelLimit: null, customLimit: true },
];

function aiStudioCommercialPreset(planCode: string): AiStudioCommercialPreset | undefined {
  return aiStudioCommercialPresets.find((preset) => preset.code === planCode);
}

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


const operationsStatusLabels: Record<PlatformOperationsHealth["status"], string> = {
  healthy: "Saudável",
  warning: "Atenção",
  critical: "Crítico",
};

const operationsAlarmLabels: Record<PlatformOperationsHealth["alarms"][number]["key"], string> = {
  errors: "Erros do Estúdio IA",
  throttles: "Throttling do Estúdio IA",
  duration_p90: "Duração p90 do Estúdio IA",
};

const operationsAlarmStateLabels: Record<PlatformOperationsHealth["alarms"][number]["state"], string> = {
  OK: "OK",
  ALARM: "Alarme",
  INSUFFICIENT_DATA: "Sem dados",
  MISSING: "Não encontrado",
};

const telemetryLabels: Record<string, string> = {
  chromium: "Chromium", safari: "Safari", firefox: "Firefox", other: "Outro",
  desktop: "Desktop", mobile: "Mobile", tablet: "Tablet", unknown: "Desconhecido",
  movement: "Movimento / animação", photo_selection: "Seleção ou ordem das fotos", visual_quality: "Qualidade visual",
  text_branding: "Textos ou marca", performance: "Demorou demais",
};

function aiStudioDraft(item: PlatformAiStudioOrganization): AiStudioDraft {
  return { enabled: item.enabled, planCode: item.planCode, monthlyReelLimit: item.monthlyReelLimit === null ? "" : String(item.monthlyReelLimit) };
}

export function PlatformAdminPage() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [operationsHealth, setOperationsHealth] = useState<PlatformOperationsHealth | null>(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<PlatformAuditLog[]>([]);
  const [userFilters, setUserFilters] = useState<PlatformUserFilters>({ status: "all" });
  const [usersLoading, setUsersLoading] = useState(false);
  const [auditFilters, setAuditFilters] = useState<PlatformAuditFilters>({ scope: "all" });
  const [auditLoading, setAuditLoading] = useState(false);
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

    const [overviewResult, operationsResult, usersResult, auditResult, accessKeysResult, aiStudioOrganizationsResult, telemetryResult] = await Promise.allSettled([
      getPlatformOverview(),
      getPlatformOperationsHealth(),
      listPlatformUsers(),
      listPlatformAuditLogs(),
      listPlatformAccessKeys(nextFilters),
      listPlatformAiStudioOrganizations(),
      getPlatformAiStudioTelemetry(telemetryDays),
    ]);

    const failures: string[] = [];
    const failureMessage = (label: string, reason: unknown) => {
      const detail = reason instanceof AppApiError ? reason.message : "operação indisponível";
      failures.push(`${label}: ${detail}`);
    };

    if (overviewResult.status === "fulfilled") setOverview(overviewResult.value);
    else { setOverview(null); failureMessage("Visão geral", overviewResult.reason); }

    if (operationsResult.status === "fulfilled") setOperationsHealth(operationsResult.value);
    else { setOperationsHealth(null); failureMessage("Saúde do sistema", operationsResult.reason); }

    if (usersResult.status === "fulfilled") setPlatformUsers(usersResult.value);
    else { setPlatformUsers([]); failureMessage("Usuários", usersResult.reason); }

    if (auditResult.status === "fulfilled") setAuditLogs(auditResult.value);
    else { setAuditLogs([]); failureMessage("Auditoria", auditResult.reason); }

    if (accessKeysResult.status === "fulfilled") setKeys(accessKeysResult.value);
    else { setKeys([]); failureMessage("Chaves de acesso", accessKeysResult.reason); }

    if (aiStudioOrganizationsResult.status === "fulfilled") {
      const aiStudioOrganizations = aiStudioOrganizationsResult.value;
      setAiOrganizations(aiStudioOrganizations);
      setAiDrafts(Object.fromEntries(aiStudioOrganizations.map((item) => [item.organizationId, aiStudioDraft(item)])));
    } else {
      setAiOrganizations([]);
      setAiDrafts({});
      failureMessage("Organizações e planos", aiStudioOrganizationsResult.reason);
    }

    if (telemetryResult.status === "fulfilled") setTelemetry(telemetryResult.value);
    else { setTelemetry(null); console.warn("[Admin Escala IMOB] Telemetria do Estúdio IA indisponível", telemetryResult.reason); }

    if (failures.length > 0) {
      setMessage({
        tone: "error",
        text: `Algumas áreas do console não puderam ser carregadas. ${failures.join(" · ")}`,
      });
    }
    setLoading(false);
  }, [filters, telemetryDays]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUserFilter() {
    if (usersLoading) return;
    setUsersLoading(true);
    setMessage(null);
    try {
      setPlatformUsers(await listPlatformUsers(userFilters));
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof AppApiError ? error.message : "Não foi possível carregar os usuários da plataforma." });
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleAuditFilter() {
    if (auditLoading) return;
    setAuditLoading(true);
    setMessage(null);
    try {
      setAuditLogs(await listPlatformAuditLogs(auditFilters));
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof AppApiError ? error.message : "Não foi possível carregar a auditoria da plataforma." });
    } finally {
      setAuditLoading(false);
    }
  }

  async function handleOperationsRefresh() {
    if (operationsLoading) return;
    setOperationsLoading(true);
    setMessage(null);
    try {
      setOperationsHealth(await getPlatformOperationsHealth());
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof AppApiError ? error.message : "Não foi possível atualizar a saúde do sistema." });
    } finally {
      setOperationsLoading(false);
    }
  }

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
    const preset = aiStudioCommercialPreset(planCode);
    const monthlyLimit = preset && !preset.customLimit ? preset.monthlyReelLimit : draft.monthlyReelLimit.trim() === "" ? null : Number(draft.monthlyReelLimit);
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
      <header className="platform-admin-page__intro" id="platform-overview">
        <div><span>PLATAFORMA</span><h1>Console da plataforma</h1><p>Operação global da Escala IMOB. Este contexto não representa nenhuma imobiliária e não concede acesso implícito aos dados comerciais dos tenants.</p></div>
      </header>

      {message && <div className={`platform-admin-alert is-${message.tone}`} role="status">{message.text}</div>}

      <div className="platform-admin-metrics">
        {metricItems.map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}
      </div>

      <article className="platform-admin-card platform-admin-operations" id="platform-operations">
        <header>
          <div><h2>Saúde do sistema</h2><p>Estado operacional da API, banco e guardrails CloudWatch já implantados para o Estúdio IA.</p></div>
          <div className="platform-admin-operations__actions">
            {operationsHealth && <span className={`platform-operations-overall is-${operationsHealth.status}`}>{operationsStatusLabels[operationsHealth.status]}</span>}
            <button type="button" onClick={() => void handleOperationsRefresh()} disabled={operationsLoading}>{operationsLoading ? "Atualizando..." : "Atualizar"}</button>
          </div>
        </header>
        {operationsLoading && !operationsHealth ? <div className="platform-admin-empty">Verificando operação...</div> : operationsHealth ? <>
          <div className="platform-operations-components">
            <section><span>API autenticada</span><strong>Saudável</strong><small>{operationsHealth.api.service} · v{operationsHealth.api.version}</small></section>
            <section><span>Banco de dados</span><strong>Saudável</strong><small>Resposta em {operationsHealth.database.latencyMs} ms</small></section>
            <section><span>CloudWatch</span><strong>{operationsHealth.monitoring.available ? "Disponível" : "Indisponível"}</strong><small>{operationsHealth.monitoring.message ?? `Região ${operationsHealth.region}`}</small></section>
          </div>
          <div className="platform-operations-alarms">
            {operationsHealth.alarms.map((alarm) => <section key={alarm.key}>
              <div><strong>{operationsAlarmLabels[alarm.key]}</strong><small>{alarm.name}</small></div>
              <span className={`platform-operations-alarm is-${alarm.state.toLowerCase()}`}>{operationsAlarmStateLabels[alarm.state]}</span>
              <small title={alarm.reason ?? undefined}>{alarm.updatedAt ? `Atualizado ${formatDate(alarm.updatedAt)}` : alarm.reason ?? "Sem atualização registrada"}</small>
            </section>)}
            {operationsHealth.monitoring.available && operationsHealth.alarms.length === 0 && <p className="platform-admin-muted">Nenhum alarme operacional foi retornado pelo CloudWatch.</p>}
          </div>
          <footer className="platform-operations-footer">Verificado em {formatDate(operationsHealth.checkedAt)} · {operationsHealth.region}</footer>
        </> : <div className="platform-admin-empty">Saúde operacional indisponível.</div>}
      </article>

      <article className="platform-admin-card" id="platform-users">
        <header><div><h2>Usuários da plataforma</h2><p>Visão global de contas, acesso administrativo e organizações ativas. Nenhum dado comercial dos tenants é carregado nesta listagem.</p></div></header>
        <div className="platform-admin-filters platform-admin-user-filters">
          <input aria-label="Buscar usuário" value={userFilters.q ?? ""} onChange={(event) => setUserFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Nome ou e-mail" />
          <select aria-label="Status do usuário" value={userFilters.status ?? "all"} onChange={(event) => setUserFilters((current) => ({ ...current, status: event.target.value as PlatformUserStatus | "all" }))}>
            <option value="all">Todos os status</option><option value="active">Ativos</option><option value="suspended">Suspensos</option><option value="archived">Arquivados</option>
          </select>
          <button type="button" onClick={() => void handleUserFilter()} disabled={usersLoading}>{usersLoading ? "Buscando..." : "Filtrar"}</button>
        </div>
        <div className="platform-admin-table-wrap">
          <table className="platform-admin-table platform-admin-users-table">
            <thead><tr><th>Usuário</th><th>Status</th><th>Acesso global</th><th>Organizações ativas</th><th>Criado em</th></tr></thead>
            <tbody>
              {platformUsers.map((user) => <tr key={user.id}>
                <td><strong>{user.displayName}</strong><small>{user.email}</small></td>
                <td><span className={`platform-user-status is-${user.status}`}>{userStatusLabels[user.status]}</span></td>
                <td>{user.platformRoles.includes("platform_admin") ? <span className="platform-user-role is-platform">Admin da plataforma</span> : <span className="platform-user-role">Usuário</span>}</td>
                <td>{user.activeOrganizations.length > 0 ? <div className="platform-user-organizations">{user.activeOrganizations.map((organization) => <span key={organization.organizationId}>{organization.organizationName}</span>)}</div> : <span className="platform-admin-muted">Sem tenant ativo</span>}</td>
                <td>{formatDate(user.createdAt)}</td>
              </tr>)}
              {!loading && !usersLoading && platformUsers.length === 0 && <tr><td colSpan={5} className="platform-admin-empty">Nenhum usuário encontrado.</td></tr>}
              {(loading || usersLoading) && platformUsers.length === 0 && <tr><td colSpan={5} className="platform-admin-empty">Carregando usuários...</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="platform-admin-card" id="platform-audit">
        <header><div><h2>Auditoria global</h2><p>Trilha metadata-only de operações da plataforma e dos tenants. Conteúdo comercial de before/after não é exposto neste console.</p></div></header>
        <div className="platform-admin-filters platform-admin-audit-filters">
          <input aria-label="Buscar auditoria" value={auditFilters.q ?? ""} onChange={(event) => setAuditFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Ação, ator, recurso ou organização" />
          <select aria-label="Escopo da auditoria" value={auditFilters.scope ?? "all"} onChange={(event) => setAuditFilters((current) => ({ ...current, scope: event.target.value as PlatformAuditScope | "all" }))}>
            <option value="all">Todos os escopos</option><option value="platform">Plataforma</option><option value="organization">Organizações</option>
          </select>
          <input aria-label="Auditoria desde" type="date" value={auditFilters.createdFrom ?? ""} onChange={(event) => setAuditFilters((current) => ({ ...current, createdFrom: event.target.value }))} />
          <input aria-label="Auditoria até" type="date" value={auditFilters.createdTo ?? ""} onChange={(event) => setAuditFilters((current) => ({ ...current, createdTo: event.target.value }))} />
          <button type="button" onClick={() => void handleAuditFilter()} disabled={auditLoading}>{auditLoading ? "Buscando..." : "Filtrar"}</button>
        </div>
        <div className="platform-admin-table-wrap">
          <table className="platform-admin-table platform-admin-audit-table">
            <thead><tr><th>Quando</th><th>Escopo</th><th>Ator</th><th>Ação</th><th>Recurso</th><th>Request</th></tr></thead>
            <tbody>
              {auditLogs.map((item) => <tr key={item.id}>
                <td>{formatDate(item.createdAt)}</td>
                <td>{item.scope === "platform" ? <span className="platform-audit-scope is-platform">Plataforma</span> : <span className="platform-audit-scope">{item.organizationName ?? "Organização"}</span>}</td>
                <td>{item.actorDisplayName || item.actorEmail ? <><strong>{item.actorDisplayName ?? "Usuário"}</strong><small>{item.actorEmail ?? ""}</small></> : <span className="platform-admin-muted">Sistema / automação</span>}</td>
                <td><code>{item.action}</code></td>
                <td><strong>{item.entityType}</strong><small>{item.entityId}</small></td>
                <td><small>{item.requestId ?? "—"}</small></td>
              </tr>)}
              {!loading && !auditLoading && auditLogs.length === 0 && <tr><td colSpan={6} className="platform-admin-empty">Nenhum evento de auditoria encontrado.</td></tr>}
              {(loading || auditLoading) && auditLogs.length === 0 && <tr><td colSpan={6} className="platform-admin-empty">Carregando auditoria...</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="platform-admin-card" id="platform-organizations">
        <header><div><h2>Organizações e planos do Estúdio IA</h2><p>Política do Reel Lite: Trial 1, Essencial 3, Profissional 10, Imobiliária 30 e Enterprise com franquia customizada.</p></div></header>
        <div className="platform-admin-table-wrap">
          <table className="platform-admin-table platform-admin-ai-table">
            <thead><tr><th>Organização</th><th>Ativo</th><th>Plano comercial</th><th>Uso no mês</th><th>Franquia mensal</th><th /></tr></thead>
            <tbody>
              {aiOrganizations.map((item) => {
                const draft = aiDrafts[item.organizationId] ?? aiStudioDraft(item);
                const preset = aiStudioCommercialPreset(draft.planCode.trim().toLowerCase());
                const effectiveMonthlyLimit = preset && !preset.customLimit ? preset.monthlyReelLimit : draft.monthlyReelLimit.trim() === "" ? null : Number(draft.monthlyReelLimit);
                const dirty = draft.enabled !== item.enabled || draft.planCode.trim().toLowerCase() !== item.planCode || effectiveMonthlyLimit !== item.monthlyReelLimit;
                return <tr key={item.organizationId}>
                  <td><strong>{item.organizationName}</strong><small>{item.organizationId.slice(0, 8)}</small></td>
                  <td><input type="checkbox" aria-label={`Estúdio IA ativo para ${item.organizationName}`} checked={draft.enabled} disabled={Boolean(aiSavingId)} onChange={(event) => setAiDrafts((current) => ({ ...current, [item.organizationId]: { ...draft, enabled: event.target.checked } }))}/></td>
                  <td>
                    <select aria-label={`Plano de ${item.organizationName}`} value={preset?.code ?? "__legacy__"} disabled={Boolean(aiSavingId)} onChange={(event) => {
                      const next = aiStudioCommercialPreset(event.target.value);
                      if (!next) return;
                      setAiDrafts((current) => ({ ...current, [item.organizationId]: { ...draft, planCode: next.code, monthlyReelLimit: next.customLimit ? "" : String(next.monthlyReelLimit) } }));
                    }}>
                      {!preset && <option value="__legacy__">Atual: {draft.planCode} · legado</option>}
                      {aiStudioCommercialPresets.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                    </select>
                  </td>
                  <td><strong>{item.currentMonthUsage}</strong></td>
                  <td><input aria-label={`Limite mensal de ${item.organizationName}`} value={preset && !preset.customLimit ? String(preset.monthlyReelLimit) : draft.monthlyReelLimit} inputMode="numeric" placeholder="Ilimitado" disabled={Boolean(aiSavingId) || Boolean(preset && !preset.customLimit)} onChange={(event) => setAiDrafts((current) => ({ ...current, [item.organizationId]: { ...draft, monthlyReelLimit: event.target.value.replace(/\D/g, "").slice(0, 6) } }))}/></td>
                  <td><button type="button" disabled={!dirty || Boolean(aiSavingId)} onClick={() => void handleSaveAiStudio(item)}>{aiSavingId === item.organizationId ? "Salvando..." : "Salvar"}</button></td>
                </tr>;
              })}
              {!loading && aiOrganizations.length === 0 && <tr><td colSpan={6} className="platform-admin-empty">Nenhuma organização disponível.</td></tr>}
              {loading && <tr><td colSpan={6} className="platform-admin-empty">Carregando...</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="platform-admin-card platform-admin-telemetry" id="platform-telemetry">
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
            <article><span>Avaliações</span><strong>{telemetry.feedbackCount}</strong><small>{formatRate(telemetry.feedbackCount, telemetry.succeeded)} das gerações concluídas</small></article>
            <article><span>Aprovação</span><strong>{formatRate(telemetry.likedCount, telemetry.feedbackCount)}</strong><small>{telemetry.likedCount} gostei · {telemetry.dislikedCount} não gostei</small></article>
          </div>
          <div className="platform-admin-telemetry-details">
            <section><header><strong>Navegadores</strong><span>{telemetry.webGpuCount} com WebGPU disponível · {telemetry.webGpuUsedCount} usaram WebGPU · {telemetry.wasmUsedCount} usaram WASM · média {telemetry.imageCountAverage?.toFixed(1) ?? "—"} fotos</span></header><div className="platform-admin-telemetry-list">{telemetry.browsers.length ? telemetry.browsers.map((item) => <div key={item.key}><span>{telemetryLabels[item.key] ?? item.key}</span><strong>{item.total} · {formatRate(item.succeeded, item.total)} sucesso</strong><small>p90 {formatDurationMs(item.renderMsP90)}</small></div>) : <p>Sem dados nesta janela.</p>}</div></section>
            <section><header><strong>Dispositivos</strong><span>Preparação média {formatDurationMs(telemetry.preparationMsAverage)}</span></header><div className="platform-admin-telemetry-list">{telemetry.devices.length ? telemetry.devices.map((item) => <div key={item.key}><span>{telemetryLabels[item.key] ?? item.key}</span><strong>{item.total} · {formatRate(item.succeeded, item.total)} sucesso</strong><small>p90 {formatDurationMs(item.renderMsP90)}</small></div>) : <p>Sem dados nesta janela.</p>}</div></section>
            <section><header><strong>Falhas técnicas</strong><span>{telemetry.failed} falha(s) no período</span></header><div className="platform-admin-telemetry-list">{telemetry.errors.length ? telemetry.errors.map((item) => <div key={item.code}><span>{item.code}</span><strong>{item.total}</strong><small>{formatRate(item.total, telemetry.failed)} das falhas</small></div>) : <p>Nenhuma falha registrada.</p>}</div></section>
            <section><header><strong>Feedback do beta</strong><span>{telemetry.feedbackCount} avaliação(ões) · {formatRate(telemetry.likedCount, telemetry.feedbackCount)} aprovação</span></header><div className="platform-admin-telemetry-list">{telemetry.feedbackReasons.length ? telemetry.feedbackReasons.map((item) => <div key={item.reason}><span>{item.reason === "other" ? "Outro motivo" : telemetryLabels[item.reason] ?? item.reason}</span><strong>{item.total}</strong><small>{formatRate(item.total, telemetry.dislikedCount)} das avaliações negativas</small></div>) : <p>{telemetry.dislikedCount > 0 ? "Nenhum motivo estruturado registrado." : "Nenhuma avaliação negativa registrada."}</p>}</div></section>
          </div>
        </> : <div className="platform-admin-empty">Sem telemetria disponível.</div>}
      </article>

      <article className="platform-admin-card" id="platform-access-keys">
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
