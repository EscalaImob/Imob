import { useCallback, useEffect, useMemo, useState, type ComponentType, type SVGProps } from "react";
import brandLogo from "../assets/brand/escala-imob-original.svg";
import { clearAuthSession, ensureValidAuthSession } from "../auth/session";
import { AppApiError, getAppBootstrap, type AccessScope, type AppBootstrapResult } from "../services/appApi";
import {
  BellIcon,
  BuildingIcon,
  CalendarIcon,
  CardIcon,
  ChartIcon,
  ChevronIcon,
  ClipboardIcon,
  CollapseIcon,
  ContractIcon,
  DocumentIcon,
  FunnelIcon,
  GlobeIcon,
  GridIcon,
  LifeBuoyIcon,
  LogoutIcon,
  MenuIcon,
  PinIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  TargetIcon,
  TasksIcon,
  UsersIcon,
  WalletIcon,
} from "./icons";
import { ClientsPage } from "./pages/ClientsPage";
import { LeadsPage } from "./pages/LeadsPage";
import { FunnelPage } from "./pages/FunnelPage";
import { OpportunityDetailPage } from "./pages/OpportunityDetailPage";
import { TasksPage } from "./pages/TasksPage";
import { AgendaPage } from "./pages/AgendaPage";
import { VisitsPage } from "./pages/VisitsPage";
import { PropertiesPage } from "./pages/PropertiesPage";
import { PropertyEditorPage } from "./pages/PropertyEditorPage";
import { PublicationsPage } from "./pages/PublicationsPage";
import { AuthorizationsPage } from "./pages/AuthorizationsPage";
import { AuthorizationEditorPage } from "./pages/AuthorizationEditorPage";
import { ContractsPage } from "./pages/ContractsPage";
import { ContractEditorPage } from "./pages/ContractEditorPage";
import { InspectionsPage } from "./pages/InspectionsPage";
import { InspectionEditorPage } from "./pages/InspectionEditorPage";
import { FinancePage } from "./pages/FinancePage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import {
  readActiveOrganizationId,
  readSidebarCollapsed,
  saveActiveOrganizationId,
  saveSidebarCollapsed,
} from "./preferences";

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;
type PageKey = "overview" | "clients" | "leads" | "buyersFunnel" | "captureFunnel" | "opportunityDetail" | "properties" | "propertyEditor" | "publications" | "authorizations" | "authorizationEditor" | "contracts" | "contractEditor" | "inspections" | "inspectionEditor" | "finance" | "reports" | "settings" | "tasks" | "agenda" | "visits";

type NavItem = {
  label: string;
  path: string;
  icon: NavIcon;
  available?: boolean;
  permission?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navigation: NavGroup[] = [
  { label: "Meu painel", items: [
    { label: "Visão geral", path: "/app/", icon: GridIcon, available: true },
    { label: "Metas de vendas", path: "/app/metas/", icon: TargetIcon },
  ] },
  { label: "CRM & Vendas", items: [
    { label: "Funil de compradores", path: "/app/funis/compradores/", icon: FunnelIcon, permission: "crm.opportunities.read" },
    { label: "Funil de captação", path: "/app/funis/captacao/", icon: FunnelIcon, permission: "crm.opportunities.read" },
    { label: "Meus clientes", path: "/app/clientes/", icon: UsersIcon, permission: "crm.contacts.read" },
    { label: "Leads do site", path: "/app/leads/", icon: GlobeIcon, permission: "crm.leads.read" },
  ] },
  { label: "Portfólio", items: [
    { label: "Catálogo de imóveis", path: "/app/imoveis/", icon: BuildingIcon, permission: "portfolio.properties.read" },
    { label: "Publicações", path: "/app/publicacoes/", icon: ShareIcon, permission: "portfolio.publications.read" },
    { label: "Autorizações", path: "/app/autorizacoes/", icon: DocumentIcon, permission: "portfolio.authorizations.read" },
  ] },
  { label: "Produtividade", items: [
    { label: "Quadro de tarefas", path: "/app/tarefas/", icon: TasksIcon, permission: "productivity.tasks.read" },
    { label: "Agenda", path: "/app/agenda/", icon: CalendarIcon, permission: "productivity.calendar.read" },
    { label: "Gestão de visitas", path: "/app/visitas/", icon: PinIcon, permission: "productivity.visits.read" },
  ] },
  { label: "Gestão corporativa", items: [
    { label: "Contratos gerados", path: "/app/contratos/", icon: ContractIcon, permission: "corporate.contracts.read" },
    { label: "Laudos & vistorias", path: "/app/vistorias/", icon: ClipboardIcon, permission: "corporate.inspections.read" },
    { label: "Financeiro", path: "/app/financeiro/", icon: WalletIcon, permission: "corporate.finance.read" },
    { label: "Relatórios", path: "/app/relatorios/", icon: ChartIcon, permission: "corporate.reports.read" },
  ] },
  { label: "Sistema", items: [
    { label: "Configurações", path: "/app/configuracoes/", icon: SettingsIcon, permission: "organization.read" },
    { label: "Meu plano e faturas", path: "/app/plano/", icon: CardIcon },
    { label: "Suporte técnico", path: "/app/suporte/", icon: LifeBuoyIcon },
  ] },
];

const metricCards = [
  { label: "Negócios no funil", icon: FunnelIcon },
  { label: "Tarefas pendentes", icon: TasksIcon },
  { label: "Imóveis ativos", icon: BuildingIcon },
  { label: "Saldo caixa", icon: WalletIcon },
];

function normalizedPath(): string {
  return `${globalThis.location.pathname.replace(/\/+$/u, "")}/`;
}

function currentPage(): { key: PageKey; group: string; label: string; title: string } {
  const path = normalizedPath();
  if (path === "/app/configuracoes/") return { key: "settings", group: "Sistema", label: "Configurações", title: "Configurações" };
  if (path === "/app/relatorios/") return { key: "reports", group: "Gestão corporativa", label: "Relatórios", title: "Relatórios" };
  if (path === "/app/financeiro/") return { key: "finance", group: "Gestão corporativa", label: "Financeiro", title: "Financeiro" };
  if (path === "/app/vistoria/") return { key: "inspectionEditor", group: "Gestão corporativa", label: "Laudo / vistoria", title: "Laudo / vistoria" };
  if (path === "/app/vistorias/") return { key: "inspections", group: "Gestão corporativa", label: "Laudos & vistorias", title: "Laudos & vistorias" };
  if (path === "/app/contrato/") return { key: "contractEditor", group: "Gestão corporativa", label: "Contrato", title: "Contrato" };
  if (path === "/app/contratos/") return { key: "contracts", group: "Gestão corporativa", label: "Contratos gerados", title: "Contratos gerados" };
  if (path === "/app/publicacoes/") return { key: "publications", group: "Portfólio", label: "Publicações", title: "Publicações" };
  if (path === "/app/autorizacao/") return { key: "authorizationEditor", group: "Portfólio", label: "Autorização", title: "Autorização" };
  if (path === "/app/autorizacoes/") return { key: "authorizations", group: "Portfólio", label: "Autorizações", title: "Autorizações" };
  if (path === "/app/imovel/") return { key: "propertyEditor", group: "Portfólio", label: "Cadastro do imóvel", title: "Imóvel" };
  if (path === "/app/imoveis/") return { key: "properties", group: "Portfólio", label: "Catálogo de imóveis", title: "Catálogo de imóveis" };
  if (path === "/app/oportunidade/") return { key: "opportunityDetail", group: "CRM & Vendas", label: "Edição da oportunidade", title: "Oportunidade" };
  if (path === "/app/funis/compradores/") return { key: "buyersFunnel", group: "CRM & Vendas", label: "Funil de compradores", title: "Funil de compradores" };
  if (path === "/app/funis/captacao/") return { key: "captureFunnel", group: "CRM & Vendas", label: "Funil de captação", title: "Funil de captação" };
  if (path === "/app/clientes/") return { key: "clients", group: "CRM & Vendas", label: "Meus clientes", title: "Clientes" };
  if (path === "/app/leads/") return { key: "leads", group: "CRM & Vendas", label: "Leads do site", title: "Leads do site" };
  if (path === "/app/tarefas/") return { key: "tasks", group: "Produtividade", label: "Quadro de tarefas", title: "Quadro de tarefas" };
  if (path === "/app/agenda/") return { key: "agenda", group: "Produtividade", label: "Agenda", title: "Agenda" };
  if (path === "/app/visitas/") return { key: "visits", group: "Produtividade", label: "Gestão de visitas", title: "Gestão de visitas" };
  return { key: "overview", group: "Meu painel", label: "Visão geral", title: "Visão geral" };
}

function initials(name: string): string {
  return name.trim().split(/\s+/u).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "EI";
}

function formattedDate(timezone: string | undefined): string {
  const text = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", ...(timezone ? { timeZone: timezone } : {}) }).format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function roleLabel(data: AppBootstrapResult): string {
  return data.roles[0]?.name ?? "Membro da organização";
}

function hasPermission(data: AppBootstrapResult, code: string): boolean {
  return data.permissions.some((permission) => permission.permissionCode === code);
}

const accessScopeRank: Record<AccessScope, number> = { own: 0, team: 1, organization: 2 };

function hasPermissionAtScope(data: AppBootstrapResult, code: string, requiredScope: AccessScope): boolean {
  return data.permissions.some((permission) =>
    permission.permissionCode === code && accessScopeRank[permission.scope] >= accessScopeRank[requiredScope]
  );
}

function navAvailable(item: NavItem, data: AppBootstrapResult): boolean {
  return item.available === true || Boolean(item.permission && hasPermission(data, item.permission));
}

function LoadingScreen() {
  return <main className="app-loading" aria-live="polite"><img src={brandLogo} alt="Escala IMOB" /><span className="app-spinner" aria-hidden="true" /><p>Preparando sua área de trabalho...</p></main>;
}

function AccessError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <main className="app-access-error"><img src={brandLogo} alt="Escala IMOB" /><section><h1>Não foi possível abrir sua área de trabalho.</h1><p>{message}</p><div className="app-access-error__actions"><button type="button" onClick={onRetry}>Tentar novamente</button><button type="button" className="is-secondary" onClick={() => { clearAuthSession(); globalThis.location.replace("/login/"); }}>Voltar ao login</button></div></section></main>;
}

function ModuleAccessDenied({ title }: { title: string }) {
  return (
    <section className="app-module-access-denied">
      <UsersIcon />
      <h1>Acesso não disponível</h1>
      <p>Seu perfil não possui permissão para abrir {title.toLowerCase()} nesta organização.</p>
    </section>
  );
}

function OverviewPage({ bootstrap }: { bootstrap: AppBootstrapResult }) {
  const activeOrganization = bootstrap.activeOrganization;
  const dateLabel = useMemo(() => formattedDate(activeOrganization?.timezone), [activeOrganization?.timezone]);

  return (
    <>
      <section className="app-page-intro"><h1>Olá, {bootstrap.user.firstName || bootstrap.user.displayName}!</h1><p>{dateLabel}</p></section>
      <section className="app-metrics" aria-label="Indicadores principais">
        {metricCards.map(({ label, icon: Icon }) => <article className="app-metric-card" key={label}><div className="app-metric-card__header"><span>{label}</span><Icon /></div><strong aria-label={`${label}: sem dados disponíveis ainda`}>—</strong><p>Será preenchido com dados reais do módulo.</p></article>)}
      </section>
      <section className="app-dashboard-grid">
        <article className="app-dashboard-panel app-dashboard-panel--wide"><header><div><FunnelIcon /><strong>Pipeline comercial</strong></div></header><div className="app-dashboard-panel__empty"><FunnelIcon /><h2>Sua operação comercial aparecerá aqui</h2><p>Os indicadores consolidados dos dois funis serão conectados aqui à medida que o dashboard operacional for ativado.</p></div></article>
        <article className="app-dashboard-panel"><header><div><BuildingIcon /><strong>Portfólio ativo</strong></div></header><div className="app-dashboard-panel__empty"><BuildingIcon /><h2>Portfólio ainda sem indicadores</h2><p>Imóveis cadastrados alimentarão este painel automaticamente.</p></div></article>
        <article className="app-dashboard-panel app-dashboard-panel--wide"><header><div><TasksIcon /><strong>Tarefas do dia</strong></div></header><div className="app-dashboard-panel__empty app-dashboard-panel__empty--compact"><TasksIcon /><p>As tarefas do dia aparecerão aqui.</p></div></article>
        <article className="app-dashboard-panel"><header><div><PinIcon /><strong>Próximas visitas</strong></div></header><div className="app-dashboard-panel__empty app-dashboard-panel__empty--compact"><PinIcon /><p>As próximas visitas aparecerão aqui.</p></div></article>
      </section>
    </>
  );
}

export function App() {
  const [bootstrap, setBootstrap] = useState<AppBootstrapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingOrganization, setSwitchingOrganization] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const page = currentPage();

  const load = useCallback(async (requestedOrganizationId?: string | null) => {
    setError(null);
    const session = await ensureValidAuthSession();
    if (!session) { globalThis.location.replace("/login/"); return; }
    const preferredOrganizationId = requestedOrganizationId === undefined ? readActiveOrganizationId() : requestedOrganizationId;

    try {
      const result = await getAppBootstrap(session.accessToken, preferredOrganizationId);
      setBootstrap(result);
      saveActiveOrganizationId(result.activeOrganization?.id ?? null);
    } catch (loadError) {
      if (loadError instanceof AppApiError && loadError.code === "FORBIDDEN_ORGANIZATION" && preferredOrganizationId) {
        saveActiveOrganizationId(null);
        try {
          const fallback = await getAppBootstrap(session.accessToken, null);
          setBootstrap(fallback);
          saveActiveOrganizationId(fallback.activeOrganization?.id ?? null);
          return;
        } catch (fallbackError) { loadError = fallbackError; }
      }
      if (loadError instanceof AppApiError && loadError.status === 401) { clearAuthSession(); globalThis.location.replace("/login/"); return; }
      setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar a plataforma.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { document.title = `Escala IMOB — ${page.title}`; }, [page.title]);

  const activeOrganization = bootstrap?.activeOrganization ?? null;

  async function handleOrganizationChange(organizationId: string) {
    if (!organizationId || organizationId === activeOrganization?.id || switchingOrganization) return;
    setSwitchingOrganization(true);
    await load(organizationId);
    setSwitchingOrganization(false);
    setMobileMenuOpen(false);
  }

  function handleCollapseToggle() {
    const next = !collapsed;
    setCollapsed(next);
    saveSidebarCollapsed(next);
  }

  function handleLogout() {
    clearAuthSession();
    saveActiveOrganizationId(null);
    globalThis.location.replace("/login/");
  }

  if (loading) return <LoadingScreen />;
  if (error) return <AccessError message={error} onRetry={() => { setLoading(true); void load(); }} />;
  if (!bootstrap) return null;

  const canCreateContact = hasPermission(bootstrap, "crm.contacts.create");
  const canCreateOpportunity = hasPermission(bootstrap, "crm.opportunities.create") && hasPermission(bootstrap, "crm.contacts.read");
  const canUpdateOpportunity = hasPermission(bootstrap, "crm.opportunities.update");
  const canReadTask = hasPermission(bootstrap, "productivity.tasks.read");
  const canCreateTask = hasPermission(bootstrap, "productivity.tasks.create");
  const canUpdateTask = hasPermission(bootstrap, "productivity.tasks.update");
  const canCreateCalendarEvent = hasPermission(bootstrap, "productivity.calendar.create");
  const canCreateVisit = hasPermission(bootstrap, "productivity.visits.create");
  const canUpdateVisit = hasPermission(bootstrap, "productivity.visits.update");
  const canReadContacts = hasPermission(bootstrap, "crm.contacts.read");
  const canReadOpportunities = hasPermission(bootstrap, "crm.opportunities.read");
  const canReadProperties = hasPermission(bootstrap, "portfolio.properties.read");
  const canCreateProperty = hasPermission(bootstrap, "portfolio.properties.create");
  const canUpdateProperty = hasPermission(bootstrap, "portfolio.properties.update");
  const canReadPublications = hasPermission(bootstrap, "portfolio.publications.read");
  const canCreatePublication = hasPermission(bootstrap, "portfolio.publications.create");
  const canUpdatePublication = hasPermission(bootstrap, "portfolio.publications.update");
  const canReadAuthorizations = hasPermission(bootstrap, "portfolio.authorizations.read");
  const canCreateAuthorization = hasPermission(bootstrap, "portfolio.authorizations.create");
  const canUpdateAuthorization = hasPermission(bootstrap, "portfolio.authorizations.update");
  const canReadContracts = hasPermission(bootstrap, "corporate.contracts.read");
  const canCreateContract = hasPermission(bootstrap, "corporate.contracts.create");
  const canUpdateContract = hasPermission(bootstrap, "corporate.contracts.update");
  const canReadInspections = hasPermission(bootstrap, "corporate.inspections.read");
  const canCreateInspection = hasPermission(bootstrap, "corporate.inspections.create");
  const canUpdateInspection = hasPermission(bootstrap, "corporate.inspections.update");
  const canReadReports = hasPermission(bootstrap, "corporate.reports.read");
  const canReadFinance = hasPermission(bootstrap, "corporate.finance.read");
  const canCreateFinance = hasPermission(bootstrap, "corporate.finance.create");
  const canUpdateFinance = hasPermission(bootstrap, "corporate.finance.update");
  const canReadSettings = hasPermission(bootstrap, "organization.read");
  const canUpdateSettings = hasPermission(bootstrap, "organization.update");
  const canReadUsers = hasPermission(bootstrap, "users.read");
  const canUpdateUsers = hasPermission(bootstrap, "users.update");
  const canInviteUsers = hasPermission(bootstrap, "users.invite");
  const canReadTeams = hasPermission(bootstrap, "teams.read");
  const canManageTeams = hasPermission(bootstrap, "teams.manage");
  const canReadRoles = hasPermission(bootstrap, "roles.read");
  const canManageRoles = hasPermission(bootstrap, "roles.manage");
  const canReadPermissions = hasPermission(bootstrap, "permissions.read");
  const canReadFunnels = hasPermission(bootstrap, "crm.funnels.read");
  const canManageFunnels = hasPermission(bootstrap, "crm.funnels.manage");
  const canReadLeadDistribution = hasPermissionAtScope(bootstrap, "crm.leads.read", "organization");
  const canManageLeadDistribution = hasPermissionAtScope(bootstrap, "crm.leads.manage", "organization");
  const canManageLeads = hasPermission(bootstrap, "crm.leads.manage");

  return (
    <div className={`app-layout${collapsed ? " app-layout--collapsed" : ""}${mobileMenuOpen ? " app-layout--mobile-open" : ""}`}>
      <button className="app-mobile-backdrop" type="button" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />
      <aside className="app-sidebar" aria-label="Navegação principal">
        <div className="app-sidebar__brand-row">
          <img className="app-sidebar__brand app-sidebar__brand--full" src="/assets/registration/logo_escala_imob.png" alt="Escala IMOB" />
          <img className="app-sidebar__brand app-sidebar__brand--compact" src="/assets/registration/logo_simples_escala_imob.png" alt="" aria-hidden="true" />
          <button className="app-sidebar__collapse" type="button" onClick={handleCollapseToggle} aria-label={collapsed ? "Expandir menu" : "Recolher menu"} title={collapsed ? "Expandir menu" : "Recolher menu"}><CollapseIcon /></button>
        </div>
        <div className="app-sidebar__search" title="A busca global será ativada junto aos módulos de negócio"><SearchIcon /><input aria-label="Pesquisar" placeholder="Pesquisar" disabled /></div>
        <div className="app-organization-card">
          <div className="app-organization-card__logo" aria-hidden={!activeOrganization?.logoUrl}>{activeOrganization?.logoUrl ? <img src={activeOrganization.logoUrl} alt="" /> : <span>{initials(activeOrganization?.name ?? "Escala IMOB")}</span>}</div>
          <div className="app-organization-card__text"><strong>{activeOrganization?.name ?? "Sem organização ativa"}</strong><span>{activeOrganization ? `${activeOrganization.memberCount} ${activeOrganization.memberCount === 1 ? "membro" : "membros"}` : "Selecione uma organização"}</span></div>
          {bootstrap.organizations.length > 1 ? <select className="app-organization-card__select" value={activeOrganization?.id ?? ""} onChange={(event) => void handleOrganizationChange(event.target.value)} disabled={switchingOrganization} aria-label="Trocar organização">{bootstrap.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select> : <ChevronIcon className="app-organization-card__chevron" />}
        </div>
        <nav className="app-nav">
          {navigation.map((group) => <div className="app-nav__group" key={group.label}><p>{group.label}</p>{group.items.map((item) => {
            const Icon = item.icon;
            const available = navAvailable(item, bootstrap);
            const active = available && normalizedPath() === item.path;
            return available ? <a key={item.path} href={item.path} className={`app-nav__item${active ? " is-active" : ""}`} title={item.label} onClick={() => setMobileMenuOpen(false)}><Icon /><span>{item.label}</span></a> : <button key={item.path} type="button" className="app-nav__item" disabled aria-disabled="true" title={`${item.label} — será ativado na etapa do módulo`}><Icon /><span>{item.label}</span></button>;
          })}</div>)}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar__left"><button className="app-mobile-menu" type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menu"><MenuIcon /></button><div className="app-breadcrumb" aria-label="Breadcrumb"><span>{page.group}</span><ChevronIcon /><strong>{page.label}</strong></div></div>
          <div className="app-topbar__actions"><button className="app-icon-button" type="button" disabled title="Central de notificações será ativada com os módulos" aria-label="Notificações"><BellIcon /></button><div className="app-user-menu"><button className="app-user-menu__trigger" type="button" onClick={() => setUserMenuOpen((value) => !value)} aria-expanded={userMenuOpen}><span className="app-avatar">{bootstrap.user.avatarUrl ? <img src={bootstrap.user.avatarUrl} alt="" /> : initials(bootstrap.user.displayName)}</span><span className="app-user-menu__name">{bootstrap.user.firstName || bootstrap.user.displayName}</span><ChevronIcon /></button>{userMenuOpen && <div className="app-user-menu__panel"><div className="app-user-menu__identity"><strong>{bootstrap.user.displayName}</strong><span>{bootstrap.user.email}</span><small>{roleLabel(bootstrap)}</small></div><button type="button" onClick={handleLogout}><LogoutIcon /> Sair</button></div>}</div></div>
        </header>

        <main className="app-content">
          {!activeOrganization ? <section className="app-empty-organization"><BuildingIcon /><h1>Nenhuma organização ativa</h1><p>Sua conta está autenticada, mas não possui uma organização ativa disponível.</p></section> : page.key === "settings" ? (canReadSettings ? <SettingsPage organizationId={activeOrganization.id} currentMembershipId={activeOrganization.membershipId} canUpdate={canUpdateSettings} canReadUsers={canReadUsers} canUpdateUsers={canUpdateUsers} canInviteUsers={canInviteUsers} canReadTeams={canReadTeams} canManageTeams={canManageTeams} canReadRoles={canReadRoles} canManageRoles={canManageRoles} canReadPermissions={canReadPermissions} canReadFunnels={canReadFunnels} canManageFunnels={canManageFunnels} canReadLeadDistribution={canReadLeadDistribution} canManageLeadDistribution={canManageLeadDistribution} onUpdated={() => load(activeOrganization.id)} /> : <ModuleAccessDenied title="Configurações" />) : page.key === "reports" ? (canReadReports ? <ReportsPage organizationId={activeOrganization.id} /> : <ModuleAccessDenied title="Relatórios" />) : page.key === "finance" ? (canReadFinance ? <FinancePage organizationId={activeOrganization.id} canCreate={canCreateFinance} canUpdate={canUpdateFinance} /> : <ModuleAccessDenied title="Financeiro" />) : page.key === "inspectionEditor" ? (canReadInspections ? <InspectionEditorPage organizationId={activeOrganization.id} canCreate={canCreateInspection} canUpdate={canUpdateInspection} /> : <ModuleAccessDenied title="Laudo / vistoria" />) : page.key === "inspections" ? (canReadInspections ? <InspectionsPage organizationId={activeOrganization.id} canCreate={canCreateInspection} /> : <ModuleAccessDenied title="Laudos & vistorias" />) : page.key === "contractEditor" ? (canReadContracts ? <ContractEditorPage organizationId={activeOrganization.id} canCreate={canCreateContract} canUpdate={canUpdateContract} /> : <ModuleAccessDenied title="Contrato" />) : page.key === "contracts" ? (canReadContracts ? <ContractsPage organizationId={activeOrganization.id} canCreate={canCreateContract} /> : <ModuleAccessDenied title="Contratos gerados" />) : page.key === "publications" ? (canReadPublications ? <PublicationsPage organizationId={activeOrganization.id} canCreate={canCreatePublication} canUpdate={canUpdatePublication} /> : <ModuleAccessDenied title="Publicações" />) : page.key === "authorizationEditor" ? (canReadAuthorizations ? <AuthorizationEditorPage organizationId={activeOrganization.id} canCreate={canCreateAuthorization} canUpdate={canUpdateAuthorization} /> : <ModuleAccessDenied title="Autorização" />) : page.key === "authorizations" ? (canReadAuthorizations ? <AuthorizationsPage organizationId={activeOrganization.id} canCreate={canCreateAuthorization} /> : <ModuleAccessDenied title="Autorizações" />) : page.key === "propertyEditor" ? (canReadProperties ? <PropertyEditorPage organizationId={activeOrganization.id} canCreate={canCreateProperty} canUpdate={canUpdateProperty} canReadAuthorizations={canReadAuthorizations} canCreateAuthorization={canCreateAuthorization} canReadPublications={canReadPublications} canCreatePublication={canCreatePublication} /> : <ModuleAccessDenied title="Imóvel" />) : page.key === "properties" ? (canReadProperties ? <PropertiesPage organizationId={activeOrganization.id} canCreate={canCreateProperty} /> : <ModuleAccessDenied title="Catálogo de imóveis" />) : page.key === "opportunityDetail" ? (hasPermission(bootstrap, "crm.opportunities.read") ? <OpportunityDetailPage organizationId={activeOrganization.id} canUpdate={canUpdateOpportunity} canReadTask={canReadTask} canCreateTask={canCreateTask} canUpdateTask={canUpdateTask} canReadVisit={hasPermission(bootstrap, "productivity.visits.read")} canCreateVisit={canCreateVisit} canUpdateVisit={canUpdateVisit} canReadProperties={canReadProperties} canCreateProperty={canCreateProperty} /> : <ModuleAccessDenied title="Oportunidade" />) : page.key === "tasks" ? (hasPermission(bootstrap, "productivity.tasks.read") ? <TasksPage organizationId={activeOrganization.id} canCreate={canCreateTask} canUpdate={canUpdateTask} /> : <ModuleAccessDenied title="Quadro de tarefas" />) : page.key === "agenda" ? (hasPermission(bootstrap, "productivity.calendar.read") ? <AgendaPage organizationId={activeOrganization.id} canCreate={canCreateCalendarEvent} /> : <ModuleAccessDenied title="Agenda" />) : page.key === "visits" ? (hasPermission(bootstrap, "productivity.visits.read") ? <VisitsPage organizationId={activeOrganization.id} canCreate={canCreateVisit} canUpdate={canUpdateVisit} canReadContacts={canReadContacts} canReadOpportunities={canReadOpportunities} canReadProperties={canReadProperties} /> : <ModuleAccessDenied title="Gestão de visitas" />) : page.key === "buyersFunnel" ? (hasPermission(bootstrap, "crm.opportunities.read") ? <FunnelPage organizationId={activeOrganization.id} funnelCode="buyers" canCreate={canCreateOpportunity} canUpdate={canUpdateOpportunity} /> : <ModuleAccessDenied title="Funil de compradores" />) : page.key === "captureFunnel" ? (hasPermission(bootstrap, "crm.opportunities.read") ? <FunnelPage organizationId={activeOrganization.id} funnelCode="capture" canCreate={canCreateOpportunity} canUpdate={canUpdateOpportunity} /> : <ModuleAccessDenied title="Funil de captação" />) : page.key === "clients" ? (hasPermission(bootstrap, "crm.contacts.read") ? <ClientsPage organizationId={activeOrganization.id} canCreate={canCreateContact} /> : <ModuleAccessDenied title="Clientes" />) : page.key === "leads" ? (hasPermission(bootstrap, "crm.leads.read") ? <LeadsPage organizationId={activeOrganization.id} canManage={canManageLeads} /> : <ModuleAccessDenied title="Leads do site" />) : <OverviewPage bootstrap={bootstrap} />}
        </main>
      </div>
    </div>
  );
}
