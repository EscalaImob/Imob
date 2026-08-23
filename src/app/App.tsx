import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import brandLogo from "../assets/brand/escala-imob-original.svg";
import { clearAuthSession, ensureValidAuthSession } from "../auth/session";
import {
  AppApiError,
  getAppBootstrap,
  type AccessScope,
  type AppBootstrapResult,
} from "../services/appApi";
import { applyPanelTheme, readPanelTheme } from "./panelTheme";
import {
  listAgenda,
  listTasks,
  type AgendaItem,
} from "../services/productivityApi";
import {
  getOpportunityBoard,
  type OpportunityBoardResult,
} from "../services/crmApi";
import {
  listProperties,
  type PropertyListResult,
} from "../services/propertiesApi";
import {
  listFinancialTransactions,
  type FinancialTransactionListResult,
} from "../services/financeApi";
import { listVisits, type VisitListResult } from "../services/visitsApi";
import {
  listOrganizationMembers,
  type OrganizationMember,
} from "../services/organizationSettingsApi";
import {
  BellIcon,
  BuildingIcon,
  CalendarIcon,
  ChartIcon,
  ChevronIcon,
  ClipboardIcon,
  CollapseIcon,
  ContractIcon,
  DocumentIcon,
  FunnelIcon,
  GlobeIcon,
  GridIcon,
  LogoutIcon,
  MenuIcon,
  PinIcon,
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
import { PlatformAdminPage } from "./pages/PlatformAdminPage";
import { GoalsPage } from "./pages/GoalsPage";
import { NotificationCenter } from "./components/NotificationCenter";
import {
  readActiveOrganizationId,
  readSidebarCollapsed,
  saveActiveOrganizationId,
  saveSidebarCollapsed,
} from "./preferences";

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;
type PageKey =
  | "platformAdmin"
  | "overview"
  | "goals"
  | "clients"
  | "leads"
  | "buyersFunnel"
  | "captureFunnel"
  | "opportunityDetail"
  | "properties"
  | "propertyEditor"
  | "publications"
  | "authorizations"
  | "authorizationEditor"
  | "contracts"
  | "contractEditor"
  | "inspections"
  | "inspectionEditor"
  | "finance"
  | "reports"
  | "settings"
  | "tasks"
  | "agenda"
  | "visits";

type NavItem = {
  label: string;
  path: string;
  icon: NavIcon;
  available?: boolean;
  permission?: string;
  platformPermission?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navigation: NavGroup[] = [
  {
    label: "Meu painel",
    items: [
      { label: "Visão geral", path: "/app/", icon: GridIcon, available: true },
      {
        label: "Metas de vendas",
        path: "/app/metas/",
        icon: TargetIcon,
        permission: "sales.goals.read",
      },
    ],
  },
  {
    label: "CRM & Vendas",
    items: [
      {
        label: "Funil de compradores",
        path: "/app/funis/compradores/",
        icon: FunnelIcon,
        permission: "crm.opportunities.read",
      },
      {
        label: "Funil de captação",
        path: "/app/funis/captacao/",
        icon: FunnelIcon,
        permission: "crm.opportunities.read",
      },
      {
        label: "Meus clientes",
        path: "/app/clientes/",
        icon: UsersIcon,
        permission: "crm.contacts.read",
      },
      {
        label: "Leads do site",
        path: "/app/leads/",
        icon: GlobeIcon,
        permission: "crm.leads.read",
      },
    ],
  },
  {
    label: "Portfólio",
    items: [
      {
        label: "Catálogo de imóveis",
        path: "/app/imoveis/",
        icon: BuildingIcon,
        permission: "portfolio.properties.read",
      },
      {
        label: "Publicações",
        path: "/app/publicacoes/",
        icon: ShareIcon,
        permission: "portfolio.publications.read",
      },
      {
        label: "Autorizações",
        path: "/app/autorizacoes/",
        icon: DocumentIcon,
        permission: "portfolio.authorizations.read",
      },
    ],
  },
  {
    label: "Produtividade",
    items: [
      {
        label: "Quadro de tarefas",
        path: "/app/tarefas/",
        icon: TasksIcon,
        permission: "productivity.tasks.read",
      },
      {
        label: "Agenda",
        path: "/app/agenda/",
        icon: CalendarIcon,
        permission: "productivity.calendar.read",
      },
      {
        label: "Gestão de visitas",
        path: "/app/visitas/",
        icon: PinIcon,
        permission: "productivity.visits.read",
      },
    ],
  },
  {
    label: "Gestão corporativa",
    items: [
      {
        label: "Contratos gerados",
        path: "/app/contratos/",
        icon: ContractIcon,
        permission: "corporate.contracts.read",
      },
      {
        label: "Laudos & vistorias",
        path: "/app/vistorias/",
        icon: ClipboardIcon,
        permission: "corporate.inspections.read",
      },
      {
        label: "Financeiro",
        path: "/app/financeiro/",
        icon: WalletIcon,
        permission: "corporate.finance.read",
      },
      {
        label: "Relatórios",
        path: "/app/relatorios/",
        icon: ChartIcon,
        permission: "corporate.reports.read",
      },
    ],
  },
  {
    label: "Plataforma",
    items: [
      {
        label: "Administração",
        path: "/app/admin/",
        icon: GlobeIcon,
        platformPermission: "platform.access_keys.manage",
      },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        label: "Configurações",
        path: "/app/configuracoes/",
        icon: SettingsIcon,
        permission: "organization.read",
      },
    ],
  },
];

function normalizedPath(): string {
  return `${globalThis.location.pathname.replace(/\/+$/u, "")}/`;
}

function currentPage(): {
  key: PageKey;
  group: string;
  label: string;
  title: string;
} {
  const path = normalizedPath();
  if (path === "/app/admin/")
    return {
      key: "platformAdmin",
      group: "Plataforma",
      label: "Administração",
      title: "Administração da plataforma",
    };
  if (path === "/app/metas/")
    return {
      key: "goals",
      group: "Meu painel",
      label: "Metas de vendas",
      title: "Metas de vendas",
    };
  if (path === "/app/configuracoes/")
    return {
      key: "settings",
      group: "Sistema",
      label: "Configurações",
      title: "Configurações",
    };
  if (path === "/app/relatorios/")
    return {
      key: "reports",
      group: "Gestão corporativa",
      label: "Relatórios",
      title: "Relatórios",
    };
  if (path === "/app/financeiro/")
    return {
      key: "finance",
      group: "Gestão corporativa",
      label: "Financeiro",
      title: "Financeiro",
    };
  if (path === "/app/vistoria/")
    return {
      key: "inspectionEditor",
      group: "Gestão corporativa",
      label: "Laudo / vistoria",
      title: "Laudo / vistoria",
    };
  if (path === "/app/vistorias/")
    return {
      key: "inspections",
      group: "Gestão corporativa",
      label: "Laudos & vistorias",
      title: "Laudos & vistorias",
    };
  if (path === "/app/contrato/")
    return {
      key: "contractEditor",
      group: "Gestão corporativa",
      label: "Contrato",
      title: "Contrato",
    };
  if (path === "/app/contratos/")
    return {
      key: "contracts",
      group: "Gestão corporativa",
      label: "Contratos gerados",
      title: "Contratos gerados",
    };
  if (path === "/app/publicacoes/")
    return {
      key: "publications",
      group: "Portfólio",
      label: "Publicações",
      title: "Publicações",
    };
  if (path === "/app/autorizacao/")
    return {
      key: "authorizationEditor",
      group: "Portfólio",
      label: "Autorização",
      title: "Autorização",
    };
  if (path === "/app/autorizacoes/")
    return {
      key: "authorizations",
      group: "Portfólio",
      label: "Autorizações",
      title: "Autorizações",
    };
  if (path === "/app/imovel/")
    return {
      key: "propertyEditor",
      group: "Portfólio",
      label: "Cadastro do imóvel",
      title: "Imóvel",
    };
  if (path === "/app/imoveis/")
    return {
      key: "properties",
      group: "Portfólio",
      label: "Catálogo de imóveis",
      title: "Catálogo de imóveis",
    };
  if (path === "/app/oportunidade/")
    return {
      key: "opportunityDetail",
      group: "CRM & Vendas",
      label: "Edição da oportunidade",
      title: "Oportunidade",
    };
  if (path === "/app/funis/compradores/")
    return {
      key: "buyersFunnel",
      group: "CRM & Vendas",
      label: "Funil de compradores",
      title: "Funil de compradores",
    };
  if (path === "/app/funis/captacao/")
    return {
      key: "captureFunnel",
      group: "CRM & Vendas",
      label: "Funil de captação",
      title: "Funil de captação",
    };
  if (path === "/app/clientes/")
    return {
      key: "clients",
      group: "CRM & Vendas",
      label: "Meus clientes",
      title: "Clientes",
    };
  if (path === "/app/leads/")
    return {
      key: "leads",
      group: "CRM & Vendas",
      label: "Leads do site",
      title: "Leads do site",
    };
  if (path === "/app/tarefas/")
    return {
      key: "tasks",
      group: "Produtividade",
      label: "Quadro de tarefas",
      title: "Quadro de tarefas",
    };
  if (path === "/app/agenda/")
    return {
      key: "agenda",
      group: "Produtividade",
      label: "Agenda",
      title: "Agenda",
    };
  if (path === "/app/visitas/")
    return {
      key: "visits",
      group: "Produtividade",
      label: "Gestão de visitas",
      title: "Gestão de visitas",
    };
  return {
    key: "overview",
    group: "Meu painel",
    label: "Visão geral",
    title: "Visão geral",
  };
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "EI"
  );
}

function formattedDate(timezone: string | undefined): string {
  const text = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function roleLabel(data: AppBootstrapResult): string {
  if (data.platformPermissions.includes("platform.access_keys.manage")) {
    return "Admin da plataforma";
  }
  return data.roles[0]?.name ?? "Membro da organização";
}

function hasPermission(data: AppBootstrapResult, code: string): boolean {
  return data.permissions.some(
    (permission) => permission.permissionCode === code,
  );
}

function hasPlatformPermission(
  data: AppBootstrapResult,
  code: string,
): boolean {
  return data.platformPermissions.includes(code);
}

const accessScopeRank: Record<AccessScope, number> = {
  own: 0,
  team: 1,
  organization: 2,
};

function hasPermissionAtScope(
  data: AppBootstrapResult,
  code: string,
  requiredScope: AccessScope,
): boolean {
  return data.permissions.some(
    (permission) =>
      permission.permissionCode === code &&
      accessScopeRank[permission.scope] >= accessScopeRank[requiredScope],
  );
}

function navAvailable(item: NavItem, data: AppBootstrapResult): boolean {
  return (
    item.available === true ||
    Boolean(item.permission && hasPermission(data, item.permission)) ||
    Boolean(
      item.platformPermission &&
      hasPlatformPermission(data, item.platformPermission),
    )
  );
}

function LoadingScreen() {
  return (
    <main className="app-loading" aria-live="polite">
      <img src={brandLogo} alt="Escala IMOB" />
      <span className="app-spinner" aria-hidden="true" />
      <p>Preparando sua área de trabalho...</p>
    </main>
  );
}

function AccessError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="app-access-error">
      <img src={brandLogo} alt="Escala IMOB" />
      <section>
        <h1>Não foi possível abrir sua área de trabalho.</h1>
        <p>{message}</p>
        <div className="app-access-error__actions">
          <button type="button" onClick={onRetry}>
            Tentar novamente
          </button>
          <button
            type="button"
            className="is-secondary"
            onClick={() => {
              clearAuthSession();
              globalThis.location.replace("/login/");
            }}
          >
            Voltar ao login
          </button>
        </div>
      </section>
    </main>
  );
}

function ModuleAccessDenied({ title }: { title: string }) {
  return (
    <section className="app-module-access-denied">
      <UsersIcon />
      <h1>Acesso não disponível</h1>
      <p>
        Seu perfil não possui permissão para abrir {title.toLowerCase()} nesta
        organização.
      </p>
    </section>
  );
}

function OverviewPage({ bootstrap }: { bootstrap: AppBootstrapResult }) {
  const activeOrganization = bootstrap.activeOrganization;
  const dateLabel = useMemo(
    () => formattedDate(activeOrganization?.timezone),
    [activeOrganization?.timezone],
  );
  const [weekItems, setWeekItems] = useState<AgendaItem[]>([]);
  const [weekLoading, setWeekLoading] = useState(true);
  const [weekError, setWeekError] = useState<string | null>(null);
  const [boards, setBoards] = useState<OpportunityBoardResult[]>([]);
  const [pendingTasks, setPendingTasks] = useState<number | null>(null);
  const [properties, setProperties] = useState<PropertyListResult | null>(null);
  const [finance, setFinance] = useState<FinancialTransactionListResult | null>(
    null,
  );
  const [visits, setVisits] = useState<VisitListResult | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [hiddenPipelineStages, setHiddenPipelineStages] = useState<Set<string>>(
    () => new Set(),
  );
  const [activePipelineStage, setActivePipelineStage] = useState<string | null>(
    null,
  );
  const [hoveredPipelineStage, setHoveredPipelineStage] = useState<string | null>(
    null,
  );
  const [pipelineVolumeFunnel, setPipelineVolumeFunnel] = useState<
    "all" | "buyers" | "capture"
  >("all");
  const [pipelineEvolutionRange, setPipelineEvolutionRange] = useState<
    "month" | "30days" | "90days"
  >("month");
  const [hoveredEvolutionPoint, setHoveredEvolutionPoint] = useState<
    number | null
  >(null);
  const weekDays = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, []);

  useEffect(() => {
    if (!activeOrganization) return;
    const to = new Date(weekDays[6]);
    to.setHours(23, 59, 59, 999);
    let active = true;
    setWeekLoading(true);
    setWeekError(null);
    void listAgenda(activeOrganization.id, weekDays[0], to)
      .then((result) => {
        if (active) setWeekItems(result.items);
      })
      .catch((loadError) => {
        if (active)
          setWeekError(
            loadError instanceof AppApiError
              ? loadError.message
              : "Não foi possível carregar a semana.",
          );
      })
      .finally(() => {
        if (active) setWeekLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeOrganization, weekDays]);

  useEffect(() => {
    if (!activeOrganization) return;
    let active = true;
    setDashboardLoading(true);
    setDashboardError(null);
    const organizationId = activeOrganization.id;
    void Promise.allSettled([
      getOpportunityBoard(organizationId, { funnel: "buyers", view: "all" }),
      getOpportunityBoard(organizationId, { funnel: "capture", view: "all" }),
      listTasks(organizationId, { pageSize: 100 }),
      listProperties(organizationId, { pageSize: 100 }),
      listFinancialTransactions(organizationId, { pageSize: 1 }),
      listVisits(organizationId, { from: new Date(), pageSize: 20 }),
    ])
      .then((results) => {
        if (!active) return;
        const [
          buyersResult,
          captureResult,
          tasksResult,
          propertiesResult,
          financeResult,
          visitsResult,
        ] = results;
        const loadedBoards: OpportunityBoardResult[] = [];
        if (buyersResult.status === "fulfilled")
          loadedBoards.push(buyersResult.value);
        if (captureResult.status === "fulfilled")
          loadedBoards.push(captureResult.value);
        setBoards(loadedBoards);
        if (tasksResult.status === "fulfilled")
          setPendingTasks(
            tasksResult.value.items.filter(
              (task) =>
                task.status !== "completed" && task.status !== "canceled",
            ).length,
          );
        if (propertiesResult.status === "fulfilled")
          setProperties(propertiesResult.value);
        if (financeResult.status === "fulfilled")
          setFinance(financeResult.value);
        if (visitsResult.status === "fulfilled") setVisits(visitsResult.value);
        if (results.some((result) => result.status === "rejected"))
          setDashboardError("Alguns indicadores não puderam ser atualizados.");
      })
      .finally(() => {
        if (active) setDashboardLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeOrganization]);

  const funnelTotal = boards.reduce(
    (total, board) => total + board.summary.active,
    0,
  );
  const funnelValue = boards.reduce(
    (total, board) => total + Number(board.summary.estimatedOpenValue || 0),
    0,
  );
  const pipelineStages = boards.flatMap((board) =>
    board.funnel.stages.map((stage) => ({
      ...stage,
      funnelName: board.funnel.name,
      funnelCode: board.funnel.code,
      chartKey: `${board.funnel.id}:${stage.id}`,
    })),
  );
  const pipelineVolumeSource = pipelineStages.filter(
    (stage) =>
      pipelineVolumeFunnel === "all" ||
      stage.funnelCode === pipelineVolumeFunnel,
  );
  const pipelineVolumeStages = Array.from(
    pipelineVolumeSource
      .reduce(
        (stages, stage) => {
          const key =
            pipelineVolumeFunnel === "all"
              ? stage.position
              : `${stage.funnelCode}:${stage.position}`;
          const current = stages.get(key);
          if (current) {
            current.value += stage.opportunities.length;
            current.names.push(stage.name);
          } else {
            stages.set(key, {
              chartKey: `volume:${String(key)}`,
              position: stage.position,
              name: stage.name,
              names: [stage.name],
              color: stage.color,
              value: stage.opportunities.length,
            });
          }
          return stages;
        },
        new Map<
          string | number,
          {
            chartKey: string;
            position: number;
            name: string;
            names: string[];
            color: string;
            value: number;
          }
        >(),
      )
      .values(),
  ).sort((a, b) => a.position - b.position);
  const pipelineVolumeDataMaximum = Math.max(
    1,
    ...pipelineVolumeStages.map((stage) => stage.value),
  );
  const pipelineMaximum = Math.max(
    4,
    Math.ceil(pipelineVolumeDataMaximum / 4) * 4,
  );
  const visiblePipelineStages = pipelineStages.filter(
    (stage) => !hiddenPipelineStages.has(stage.chartKey),
  );
  const visiblePipelineTotal = visiblePipelineStages.reduce(
    (total, stage) => total + stage.opportunities.length,
    0,
  );
  const pipelineSegments = visiblePipelineStages.reduce<
    Array<(typeof pipelineStages)[number] & { start: number; size: number }>
  >((segments, stage) => {
    const start = segments.reduce((total, segment) => total + segment.size, 0);
    const size = visiblePipelineTotal
      ? (stage.opportunities.length / visiblePipelineTotal) * 100
      : 0;
    segments.push({ ...stage, start, size });
    return segments;
  }, []);
  const togglePipelineStage = (chartKey: string) => {
    setHiddenPipelineStages((current) => {
      const next = new Set(current);
      if (next.has(chartKey)) next.delete(chartKey);
      else next.add(chartKey);
      return next;
    });
    if (activePipelineStage === chartKey) setActivePipelineStage(null);
    if (hoveredPipelineStage === chartKey) setHoveredPipelineStage(null);
  };
  const highlightedPipelineStage =
    hoveredPipelineStage ?? activePipelineStage;
  const pipelineOpportunities = pipelineStages.flatMap((stage) => stage.opportunities);
  const pipelineWon = boards.reduce((total, board) => total + board.summary.won, 0);
  const pipelineLost = boards.reduce((total, board) => total + board.summary.lost, 0);
  const pipelineClosed = pipelineWon + pipelineLost;
  const pipelineConversion = pipelineClosed ? Math.round((pipelineWon / pipelineClosed) * 100) : 0;
  const pipelineContacts = new Set(pipelineOpportunities.map((item) => item.contact.id)).size;
  const pipelineNegotiating = pipelineStages.filter((stage) => /negocia|proposta/iu.test(stage.name)).reduce((total, stage) => total + stage.opportunities.length, 0);
  const pipelineAverageDays = pipelineOpportunities.length ? Math.max(1, Math.round(pipelineOpportunities.reduce((total, item) => total + Math.max(0, Date.now() - new Date(item.createdAt).getTime()), 0) / pipelineOpportunities.length / 86_400_000)) : 0;
  const evolutionNow = new Date();
  const evolutionStart = (() => {
    if (pipelineEvolutionRange === "month")
      return new Date(evolutionNow.getFullYear(), evolutionNow.getMonth(), 1);
    return new Date(
      evolutionNow.getTime() -
        (pipelineEvolutionRange === "90days" ? 89 : 29) * 86_400_000,
    );
  })();
  const evolutionSpan = Math.max(
    1,
    evolutionNow.getTime() - evolutionStart.getTime(),
  );
  const pipelineEvolution = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(evolutionStart.getTime() + (evolutionSpan * index) / 6);
    return {
      date,
      value: pipelineOpportunities.filter(
        (item) => new Date(item.createdAt).getTime() <= date.getTime(),
      ).length,
    };
  });
  const pipelineEvolutionMaximum = Math.max(
    1,
    ...pipelineEvolution.map((point) => point.value),
  );
  const pipelineEvolutionCoordinates = pipelineEvolution.map((point, index) => ({
    ...point,
    x: 34 + (index * 276) / 6,
    y: 126 - (point.value / pipelineEvolutionMaximum) * 98,
  }));
  const pipelineEvolutionPoints = pipelineEvolutionCoordinates
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  const upcomingVisits = (visits?.items ?? [])
    .filter(
      (visit) => visit.status === "scheduled" || visit.status === "confirmed",
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    )
    .slice(0, 5);
  const money = (value: number | string) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: finance?.currency ?? "BRL",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);

  function urgency(item: AgendaItem) {
    const distance = new Date(item.startsAt).getTime() - Date.now();
    if (
      distance < 0 &&
      item.status !== "completed" &&
      item.status !== "canceled"
    )
      return "overdue";
    if (distance <= 86_400_000) return "soon";
    return "future";
  }

  return (
    <>
      <section className="app-page-intro">
        <h1>Olá, {bootstrap.user.firstName || bootstrap.user.displayName}!</h1>
        <p>{dateLabel}</p>
      </section>
      <section className="app-metrics" aria-label="Indicadores principais">
        <article className="app-metric-card">
          <div className="app-metric-card__header">
            <span>Negócios no funil</span>
            <FunnelIcon />
          </div>
          <strong>{dashboardLoading ? "…" : funnelTotal}</strong>
          <p>{money(funnelValue)} em oportunidades abertas</p>
        </article>
        <article className="app-metric-card">
          <div className="app-metric-card__header">
            <span>Tarefas pendentes</span>
            <TasksIcon />
          </div>
          <strong>{dashboardLoading ? "…" : (pendingTasks ?? "—")}</strong>
          <p>Próximos passos ainda não concluídos</p>
        </article>
        <article className="app-metric-card">
          <div className="app-metric-card__header">
            <span>Imóveis ativos</span>
            <BuildingIcon />
          </div>
          <strong>
            {dashboardLoading ? "…" : (properties?.active ?? "—")}
          </strong>
          <p>
            {properties?.published ?? 0} publicados · {properties?.pending ?? 0}{" "}
            pendentes
          </p>
        </article>
        <article className="app-metric-card">
          <div className="app-metric-card__header">
            <span>Saldo caixa</span>
            <WalletIcon />
          </div>
          <strong>
            {dashboardLoading
              ? "…"
              : finance
                ? money(finance.summary.balance)
                : "—"}
          </strong>
          <p>
            {finance
              ? `${money(finance.summary.inflows)} entradas · ${money(finance.summary.outflows)} saídas`
              : "Financeiro indisponível"}
          </p>
        </article>
      </section>
      {dashboardError && (
        <div className="app-inline-error">{dashboardError}</div>
      )}
      <section className="app-dashboard-grid">
        <article className="app-dashboard-panel app-dashboard-panel--wide">
          <header>
            <div>
              <FunnelIcon />
              <strong>Pipeline comercial</strong>
            </div>
            <a href="/app/funis/compradores/">Abrir funis</a>
          </header>
          {pipelineStages.length === 0 ? (
            <div className="app-dashboard-panel__empty">
              <FunnelIcon />
              <h2>Nenhuma oportunidade ativa</h2>
              <p>Crie oportunidades nos funis de compradores e captação.</p>
            </div>
          ) : (
            <div className="app-dashboard-pipeline-layout">
              <div
                className="app-dashboard-pipeline-charts"
                aria-label="Gráficos do pipeline"
              >
                <article>
                  <h3>Distribuição</h3>
                  <div
                    className={`app-pipeline-donut${highlightedPipelineStage ? " is-highlighting" : ""}`}
                    aria-label={`Distribuição de ${visiblePipelineTotal} negócios entre as etapas selecionadas`}
                  >
                    <svg viewBox="0 0 120 120" aria-hidden="true">
                      {pipelineSegments.map((segment) => (
                        <circle
                          key={segment.chartKey}
                          className={`app-pipeline-donut__segment${highlightedPipelineStage === segment.chartKey ? " is-active" : ""}`}
                          cx="60"
                          cy="60"
                          r="48"
                          pathLength="100"
                          fill="none"
                          stroke={segment.color}
                          strokeWidth="18"
                          strokeDasharray={`${segment.size} ${100 - segment.size}`}
                          strokeDashoffset={-segment.start}
                          style={{ "--segment-color": segment.color } as React.CSSProperties}
                        />
                      ))}
                    </svg>
                    <span className="app-pipeline-donut__value">
                      <strong>{visiblePipelineTotal}</strong>
                      <small>negócios</small>
                    </span>
                  </div>
                  <div className="app-pipeline-legend">
                    {pipelineStages.map((stage) => {
                      const enabled = !hiddenPipelineStages.has(stage.chartKey);
                      const active = highlightedPipelineStage === stage.chartKey;
                      return (
                        <div
                          key={stage.chartKey}
                          className={`${active ? "is-active " : ""}${enabled ? "" : "is-disabled"}`.trim()}
                          onMouseEnter={() => enabled && setHoveredPipelineStage(stage.chartKey)}
                          onMouseLeave={() => setHoveredPipelineStage(null)}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => togglePipelineStage(stage.chartKey)}
                            aria-label={`${enabled ? "Ocultar" : "Exibir"} ${stage.name} no gráfico`}
                            style={{ accentColor: stage.color }}
                          />
                          <button
                            type="button"
                            disabled={!enabled}
                            aria-pressed={active}
                            onFocus={() => setHoveredPipelineStage(stage.chartKey)}
                            onBlur={() => setHoveredPipelineStage(null)}
                            onClick={() =>
                              setActivePipelineStage((current) =>
                                current === stage.chartKey ? null : stage.chartKey,
                              )
                            }
                          >
                            <i style={{ background: stage.color }} />
                            <b>{stage.name}</b>
                            <small>
                              {enabled && visiblePipelineTotal
                                ? Math.round(
                                    (stage.opportunities.length /
                                      visiblePipelineTotal) *
                                      100,
                                  )
                                : 0}
                              %
                            </small>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </article>
                <article>
                  <header className="app-pipeline-chart-header">
                    <h3>Volume por etapa</h3>
                    <select
                      value={pipelineVolumeFunnel}
                      onChange={(event) =>
                        setPipelineVolumeFunnel(
                          event.target.value as "all" | "buyers" | "capture",
                        )
                      }
                      aria-label="Filtrar volume por funil"
                    >
                      <option value="all">Todos os funis</option>
                      <option value="buyers">Compradores</option>
                      <option value="capture">Captação</option>
                    </select>
                  </header>
                  <div className="app-pipeline-bar-chart">
                    <div className="app-pipeline-chart-y" aria-hidden="true">
                      {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
                        <span key={ratio}>{Math.ceil(pipelineMaximum * ratio)}</span>
                      ))}
                    </div>
                    <div className="app-pipeline-bars">
                      {pipelineVolumeStages.map((stage) => (
                        <div
                          className="app-pipeline-bar"
                          key={stage.chartKey}
                          title={`${stage.names.join(" + ")}: ${stage.value}`}
                        >
                          <span
                            style={{
                              height: `${Math.max(2, (stage.value / pipelineMaximum) * 100)}%`,
                              background: stage.color,
                              color: stage.color,
                            }}
                          />
                          <small>{stage.name}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                  <small className="app-pipeline-chart-caption">Etapas do funil</small>
                </article>
                <article>
                  <header className="app-pipeline-chart-header">
                    <h3>Evolução pelas etapas</h3>
                    <select
                      value={pipelineEvolutionRange}
                      onChange={(event) =>
                        setPipelineEvolutionRange(
                          event.target.value as "month" | "30days" | "90days",
                        )
                      }
                      aria-label="Período da evolução do pipeline"
                    >
                      <option value="month">Este mês</option>
                      <option value="30days">Últimos 30 dias</option>
                      <option value="90days">Últimos 90 dias</option>
                    </select>
                  </header>
                  <div className="app-pipeline-line-chart">
                    <svg
                      className="app-pipeline-line"
                      viewBox="0 0 320 150"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label="Evolução acumulada de negócios no período"
                    >
                      <defs>
                        <linearGradient id="pipelineArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="var(--app-blue)" stopOpacity=".34" />
                          <stop offset="1" stopColor="var(--app-blue)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {[28, 52.5, 77, 101.5, 126].map((y, index) => (
                        <g key={y} className="app-pipeline-line__grid">
                          <line x1="34" y1={y} x2="310" y2={y} />
                          <text x="27" y={y + 3} textAnchor="end">
                            {Math.round(
                              pipelineEvolutionMaximum * (1 - index / 4),
                            )}
                          </text>
                        </g>
                      ))}
                      <polygon
                        points={`34,126 ${pipelineEvolutionPoints} 310,126`}
                        fill="url(#pipelineArea)"
                      />
                      <polyline points={pipelineEvolutionPoints} />
                      {pipelineEvolutionCoordinates.map((point, index) => (
                        <g key={point.date.toISOString()}>
                          <circle
                            className={hoveredEvolutionPoint === index ? "is-active" : ""}
                            cx={point.x}
                            cy={point.y}
                            r={hoveredEvolutionPoint === index ? 4 : 2.5}
                            tabIndex={0}
                            onMouseEnter={() => setHoveredEvolutionPoint(index)}
                            onMouseLeave={() => setHoveredEvolutionPoint(null)}
                            onFocus={() => setHoveredEvolutionPoint(index)}
                            onBlur={() => setHoveredEvolutionPoint(null)}
                          />
                          <text
                            className="app-pipeline-line__date"
                            x={point.x}
                            y="143"
                            textAnchor={index === 0 ? "start" : index === 6 ? "end" : "middle"}
                          >
                            {point.date.toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                            })}
                          </text>
                        </g>
                      ))}
                    </svg>
                    {hoveredEvolutionPoint !== null && (
                      <div
                        className="app-pipeline-line-tooltip"
                        style={{
                          left: `${(pipelineEvolutionCoordinates[hoveredEvolutionPoint].x / 320) * 100}%`,
                          top: `${(pipelineEvolutionCoordinates[hoveredEvolutionPoint].y / 150) * 100}%`,
                        }}
                      >
                        <small>
                          {pipelineEvolutionCoordinates[
                            hoveredEvolutionPoint
                          ].date.toLocaleDateString("pt-BR")}
                        </small>
                        <strong>
                          {pipelineEvolutionCoordinates[hoveredEvolutionPoint].value}{" "}
                          negócios
                        </strong>
                      </div>
                    )}
                  </div>
                </article>
              </div>
              <section className="app-pipeline-kpis" aria-label="Indicadores do pipeline">
                <article><span>Total de negócios</span><strong>{funnelTotal}</strong><small>Pipeline ativo</small><svg viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points="0,20 12,15 24,18 36,8 48,12 60,5 72,9 84,4 100,7"/></svg></article>
                <article><span>Negócios ganhos</span><strong>{pipelineWon}</strong><small>{pipelineClosed ? `${pipelineConversion}% dos encerrados` : "Sem encerramentos"}</small><svg viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points="0,19 14,17 27,20 40,9 53,13 66,6 80,10 100,5"/></svg></article>
                <article><span>Taxa de conversão</span><strong>{pipelineConversion}%</strong><small>{pipelineWon} ganhos · {pipelineLost} perdidos</small><svg viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points="0,18 16,12 31,16 47,8 63,14 80,6 100,10"/></svg></article>
                <article><span>Tempo médio no pipeline</span><strong>{pipelineAverageDays}<em> dias</em></strong><small>Média das oportunidades ativas</small><svg viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points="0,20 14,18 28,12 42,15 57,8 72,11 86,4 100,7"/></svg></article>
              </section>
              <section className="app-pipeline-summary"><strong>Resumo do funil</strong><div><span><b>{funnelTotal}</b> negócios ativos</span><span><b>{pipelineWon}</b> negócios ganhos</span><span><b>{pipelineNegotiating}</b> em negociação</span><span><b>{pipelineContacts}</b> contatos únicos</span><span><b>{money(funnelValue)}</b> valor do pipeline</span></div></section>
            </div>
          )}
        </article>
        <article className="app-dashboard-panel app-dashboard-portfolio-panel">
          <header>
            <div>
              <BuildingIcon />
              <strong>Portfólio ativo</strong>
            </div>
            <a href="/app/imoveis/">Ver imóveis</a>
          </header>
          {properties ? (
            <div className="app-dashboard-portfolio">
              <strong>{properties.total}</strong>
              <span>imóveis cadastrados</span>
              <dl>
                <div>
                  <dt>Ativos</dt>
                  <dd>{properties.active}</dd>
                </div>
                <div>
                  <dt>Publicados</dt>
                  <dd>{properties.published}</dd>
                </div>
                <div>
                  <dt>Rascunhos</dt>
                  <dd>{properties.drafts}</dd>
                </div>
                <div>
                  <dt>Indisponíveis</dt>
                  <dd>{properties.unavailable}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="app-dashboard-panel__empty">
              <BuildingIcon />
              <p>Não foi possível carregar o portfólio.</p>
            </div>
          )}
        </article>
        <article className="app-dashboard-panel app-week-panel">
          <header>
            <div>
              <CalendarIcon />
              <strong>Calendário da semana</strong>
            </div>
            <a href="/app/agenda/">Abrir agenda</a>
          </header>
          {weekLoading ? (
            <div className="app-list-loading">Carregando semana...</div>
          ) : weekError ? (
            <div className="app-inline-error">{weekError}</div>
          ) : (
            <div className="app-week-calendar">
              {weekDays.map((day) => {
                const items = weekItems.filter(
                  (item) =>
                    new Date(item.startsAt).toDateString() ===
                    day.toDateString(),
                );
                return (
                  <section
                    key={day.toISOString()}
                    className={
                      day.toDateString() === new Date().toDateString()
                        ? "is-today"
                        : ""
                    }
                  >
                    <header>
                      <strong>
                        {new Intl.DateTimeFormat("pt-BR", {
                          weekday: "short",
                        }).format(day)}
                      </strong>
                      <span>{day.getDate()}</span>
                    </header>
                    <div>
                      {items.map((item) => (
                        <article
                          key={`${item.source}-${item.id}`}
                          className={`is-${urgency(item)}`}
                          title={item.description ?? item.title}
                        >
                          <time>
                            {new Intl.DateTimeFormat("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(item.startsAt))}
                          </time>
                          <strong>{item.title}</strong>
                        </article>
                      ))}
                      {items.length === 0 && <small>Livre</small>}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </article>
        <article className="app-dashboard-panel">
          <header>
            <div>
              <PinIcon />
              <strong>Próximas visitas</strong>
            </div>
            <a href="/app/visitas/">Ver visitas</a>
          </header>
          {upcomingVisits.length === 0 ? (
            <div className="app-dashboard-panel__empty app-dashboard-panel__empty--compact">
              <PinIcon />
              <p>Nenhuma visita futura agendada.</p>
            </div>
          ) : (
            <div className="app-dashboard-visits">
              {upcomingVisits.map((visit) => (
                <article key={visit.id}>
                  <time>
                    {new Intl.DateTimeFormat("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(visit.startsAt))}
                  </time>
                  <strong>{visit.title}</strong>
                  <span>
                    {visit.contact.name}
                    {visit.property ? ` · ${visit.property.title}` : ""}
                  </span>
                </article>
              ))}
            </div>
          )}
        </article>
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
  const [organizationMembersOpen, setOrganizationMembersOpen] = useState(false);
  const [organizationMembers, setOrganizationMembers] = useState<
    OrganizationMember[]
  >([]);
  const [organizationMembersLoading, setOrganizationMembersLoading] =
    useState(false);
  const [organizationMembersError, setOrganizationMembersError] = useState<
    string | null
  >(null);
  const [route, setRoute] = useState(
    () => `${globalThis.location.pathname}${globalThis.location.search}`,
  );
  const page = useMemo(() => currentPage(), [route]);

  const load = useCallback(async (requestedOrganizationId?: string | null) => {
    setError(null);
    const session = await ensureValidAuthSession();
    if (!session) {
      globalThis.location.replace("/login/");
      return;
    }
    const preferredOrganizationId =
      requestedOrganizationId === undefined
        ? readActiveOrganizationId()
        : requestedOrganizationId;

    try {
      const result = await getAppBootstrap(
        session.accessToken,
        preferredOrganizationId,
      );
      setBootstrap(result);
      saveActiveOrganizationId(result.activeOrganization?.id ?? null);
    } catch (loadError) {
      if (
        loadError instanceof AppApiError &&
        loadError.code === "FORBIDDEN_ORGANIZATION" &&
        preferredOrganizationId
      ) {
        saveActiveOrganizationId(null);
        try {
          const fallback = await getAppBootstrap(session.accessToken, null);
          setBootstrap(fallback);
          saveActiveOrganizationId(fallback.activeOrganization?.id ?? null);
          return;
        } catch (fallbackError) {
          loadError = fallbackError;
        }
      }
      if (loadError instanceof AppApiError && loadError.status === 401) {
        clearAuthSession();
        globalThis.location.replace("/login/");
        return;
      }
      setError(
        loadError instanceof AppApiError
          ? loadError.message
          : "Não foi possível carregar a plataforma.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const routeChanged = () => {
      setRoute(`${globalThis.location.pathname}${globalThis.location.search}`);
      setMobileMenuOpen(false);
      setUserMenuOpen(false);
      globalThis.scrollTo({ top: 0, behavior: "auto" });
    };
    const handleAppLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const element =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(element instanceof HTMLAnchorElement) ||
        element.target ||
        element.hasAttribute("download")
      )
        return;
      const destination = new URL(element.href, globalThis.location.href);
      if (
        destination.origin !== globalThis.location.origin ||
        !destination.pathname.startsWith("/app/") ||
        destination.pathname === globalThis.location.pathname
      )
        return;
      event.preventDefault();
      globalThis.history.pushState(
        {},
        "",
        `${destination.pathname}${destination.search}${destination.hash}`,
      );
      routeChanged();
    };
    globalThis.addEventListener("popstate", routeChanged);
    document.addEventListener("click", handleAppLink);
    return () => {
      globalThis.removeEventListener("popstate", routeChanged);
      document.removeEventListener("click", handleAppLink);
    };
  }, []);
  useEffect(() => {
    document.title = `Escala IMOB — ${page.title}`;
  }, [page.title]);
  useEffect(() => {
    if (bootstrap?.activeOrganization)
      applyPanelTheme(
        readPanelTheme(
          bootstrap.activeOrganization.id,
          bootstrap.activeOrganization.membershipId,
        ),
      );
  }, [bootstrap?.activeOrganization]);

  const activeOrganization = bootstrap?.activeOrganization ?? null;

  async function handleOrganizationChange(organizationId: string) {
    if (
      !organizationId ||
      organizationId === activeOrganization?.id ||
      switchingOrganization
    )
      return;
    setOrganizationMembersOpen(false);
    setOrganizationMembers([]);
    setOrganizationMembersError(null);
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

  async function toggleOrganizationMembers() {
    const next = !organizationMembersOpen;
    setOrganizationMembersOpen(next);
    const currentBootstrap = bootstrap;
    if (
      !next ||
      !activeOrganization ||
      !currentBootstrap ||
      organizationMembers.length ||
      organizationMembersLoading
    )
      return;
    setOrganizationMembersLoading(true);
    setOrganizationMembersError(null);
    try {
      setOrganizationMembers(
        await listOrganizationMembers(activeOrganization.id),
      );
    } catch {
      setOrganizationMembers([
        {
          membershipId: activeOrganization.membershipId,
          userId: currentBootstrap.user.id,
          email: currentBootstrap.user.email,
          displayName: currentBootstrap.user.displayName,
          membershipStatus: "active",
          userStatus: "active",
        },
      ]);
      setOrganizationMembersError(
        "Seu perfil permite visualizar apenas os próprios dados.",
      );
    } finally {
      setOrganizationMembersLoading(false);
    }
  }

  function handleLogout() {
    clearAuthSession();
    saveActiveOrganizationId(null);
    globalThis.location.replace("/login/");
  }

  if (loading) return <LoadingScreen />;
  if (error)
    return (
      <AccessError
        message={error}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  if (!bootstrap) return null;

  const canManagePlatform = hasPlatformPermission(
    bootstrap,
    "platform.access_keys.manage",
  );
  const canCreateContact = hasPermission(bootstrap, "crm.contacts.create");
  const canCreateOpportunity =
    hasPermission(bootstrap, "crm.opportunities.create") &&
    hasPermission(bootstrap, "crm.contacts.read");
  const canUpdateOpportunity = hasPermission(
    bootstrap,
    "crm.opportunities.update",
  );
  const canReadTask = hasPermission(bootstrap, "productivity.tasks.read");
  const canCreateTask = hasPermission(bootstrap, "productivity.tasks.create");
  const canUpdateTask = hasPermission(bootstrap, "productivity.tasks.update");
  const canCreateCalendarEvent = hasPermission(
    bootstrap,
    "productivity.calendar.create",
  );
  const canCreateVisit = hasPermission(bootstrap, "productivity.visits.create");
  const canUpdateVisit = hasPermission(bootstrap, "productivity.visits.update");
  const canReadContacts = hasPermission(bootstrap, "crm.contacts.read");
  const canReadOpportunities = hasPermission(
    bootstrap,
    "crm.opportunities.read",
  );
  const canReadProperties = hasPermission(
    bootstrap,
    "portfolio.properties.read",
  );
  const canCreateProperty = hasPermission(
    bootstrap,
    "portfolio.properties.create",
  );
  const canUpdateProperty = hasPermission(
    bootstrap,
    "portfolio.properties.update",
  );
  const canReadPublications = hasPermission(
    bootstrap,
    "portfolio.publications.read",
  );
  const canCreatePublication = hasPermission(
    bootstrap,
    "portfolio.publications.create",
  );
  const canUpdatePublication = hasPermission(
    bootstrap,
    "portfolio.publications.update",
  );
  const canReadAuthorizations = hasPermission(
    bootstrap,
    "portfolio.authorizations.read",
  );
  const canCreateAuthorization = hasPermission(
    bootstrap,
    "portfolio.authorizations.create",
  );
  const canUpdateAuthorization = hasPermission(
    bootstrap,
    "portfolio.authorizations.update",
  );
  const canReadContracts = hasPermission(bootstrap, "corporate.contracts.read");
  const canCreateContract = hasPermission(
    bootstrap,
    "corporate.contracts.create",
  );
  const canUpdateContract = hasPermission(
    bootstrap,
    "corporate.contracts.update",
  );
  const canReadInspections = hasPermission(
    bootstrap,
    "corporate.inspections.read",
  );
  const canCreateInspection = hasPermission(
    bootstrap,
    "corporate.inspections.create",
  );
  const canUpdateInspection = hasPermission(
    bootstrap,
    "corporate.inspections.update",
  );
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
  const canReadAuditLogs = hasPermissionAtScope(
    bootstrap,
    "audit_logs.read",
    "organization",
  );
  const canReadFunnels = hasPermission(bootstrap, "crm.funnels.read");
  const canManageFunnels = hasPermission(bootstrap, "crm.funnels.manage");
  const canReadLeadDistribution = hasPermissionAtScope(
    bootstrap,
    "crm.leads.read",
    "organization",
  );
  const canManageLeadDistribution = hasPermissionAtScope(
    bootstrap,
    "crm.leads.manage",
    "organization",
  );
  const canManageLeads = hasPermission(bootstrap, "crm.leads.manage");
  const canReadGoals = hasPermission(bootstrap, "sales.goals.read");
  const canManageGoals = hasPermission(bootstrap, "sales.goals.manage");

  return (
    <div
      className={`app-layout${collapsed ? " app-layout--collapsed" : ""}${mobileMenuOpen ? " app-layout--mobile-open" : ""}`}
    >
      <button
        className="app-mobile-backdrop"
        type="button"
        aria-label="Fechar menu"
        onClick={() => setMobileMenuOpen(false)}
      />
      <aside className="app-sidebar" aria-label="Navegação principal">
        <div className="app-sidebar__brand-row">
          <img
            className="app-sidebar__brand app-sidebar__brand--full"
            src="/assets/registration/logo_escala_imob.png"
            alt="Escala IMOB"
          />
          <img
            className="app-sidebar__brand app-sidebar__brand--compact"
            src="/assets/registration/logo_simples_escala_imob.png"
            alt=""
            aria-hidden="true"
          />
          <button
            className="app-sidebar__collapse"
            type="button"
            onClick={handleCollapseToggle}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <CollapseIcon />
          </button>
        </div>
        <div
          className={`app-organization-switcher${organizationMembersOpen ? " is-open" : ""}`}
        >
          <div className="app-organization-card">
            <div
              className="app-organization-card__logo"
              aria-hidden={!activeOrganization?.logoUrl}
            >
              {activeOrganization?.logoUrl ? (
                <img src={activeOrganization.logoUrl} alt="" />
              ) : (
                <span>
                  {initials(activeOrganization?.name ?? "Escala IMOB")}
                </span>
              )}
            </div>
            <div className="app-organization-card__text">
              <strong>
                {activeOrganization?.name ?? "Sem organização ativa"}
              </strong>
              <span>
                {activeOrganization
                  ? `${activeOrganization.memberCount} ${activeOrganization.memberCount === 1 ? "membro" : "membros"}`
                  : "Selecione uma organização"}
              </span>
            </div>
            <button
              className="app-organization-card__toggle"
              type="button"
              onClick={() => void toggleOrganizationMembers()}
              aria-expanded={organizationMembersOpen}
              aria-label={
                organizationMembersOpen ? "Ocultar membros" : "Mostrar membros"
              }
            >
              <ChevronIcon className="app-organization-card__chevron" />
            </button>
          </div>
          {bootstrap.organizations.length > 1 && (
            <label className="app-organization-picker">
              <span>Organização</span>
              <select
                value={activeOrganization?.id ?? ""}
                onChange={(event) =>
                  void handleOrganizationChange(event.target.value)
                }
                disabled={switchingOrganization}
              >
                {bootstrap.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {organizationMembersOpen && (
            <div className="app-organization-members" aria-live="polite">
              {organizationMembersLoading ? (
                <span>Carregando membros...</span>
              ) : (
                <>
                  {organizationMembers.map((member) => (
                    <article key={member.membershipId}>
                      <span className="app-organization-member-avatar">
                        {initials(member.displayName)}
                      </span>
                      <div>
                        <strong>{member.displayName}</strong>
                        <small>{member.email || "Contato não informado"}</small>
                      </div>
                    </article>
                  ))}
                  {organizationMembersError && (
                    <p>{organizationMembersError}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <nav className="app-nav">
          {navigation.map((group) => {
            const visibleItems = group.items.filter(
              (item) =>
                !item.platformPermission || navAvailable(item, bootstrap),
            );
            if (visibleItems.length === 0) return null;
            return (
              <div className="app-nav__group" key={group.label}>
                <p>{group.label}</p>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const available = navAvailable(item, bootstrap);
                  const active = available && normalizedPath() === item.path;
                  return available ? (
                    <a
                      key={item.path}
                      href={item.path}
                      className={`app-nav__item${active ? " is-active" : ""}`}
                      title={item.label}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </a>
                  ) : (
                    <button
                      key={item.path}
                      type="button"
                      className="app-nav__item"
                      disabled
                      aria-disabled="true"
                      title={`${item.label} — será ativado na etapa do módulo`}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar__left">
            <button
              className="app-mobile-menu"
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu"
            >
              <MenuIcon />
            </button>
            <div className="app-breadcrumb" aria-label="Breadcrumb">
              <span>{page.group}</span>
              <ChevronIcon />
              <strong>{page.label}</strong>
            </div>
          </div>
          <div className="app-topbar__actions">
            {activeOrganization ? (
              <NotificationCenter organizationId={activeOrganization.id} />
            ) : (
              <button
                className="app-icon-button"
                type="button"
                disabled
                aria-label="Notificações"
              >
                <BellIcon />
              </button>
            )}
            <div className="app-user-menu">
              <button
                className="app-user-menu__trigger"
                type="button"
                onClick={() => setUserMenuOpen((value) => !value)}
                aria-expanded={userMenuOpen}
              >
                <span className="app-avatar">
                  {bootstrap.user.avatarUrl ? (
                    <img src={bootstrap.user.avatarUrl} alt="" />
                  ) : (
                    initials(bootstrap.user.displayName)
                  )}
                </span>
                <span className="app-user-menu__name">
                  {bootstrap.user.firstName || bootstrap.user.displayName}
                </span>
                <ChevronIcon />
              </button>
              {userMenuOpen && (
                <div className="app-user-menu__panel">
                  <div className="app-user-menu__identity">
                    <strong>{bootstrap.user.displayName}</strong>
                    <span>{bootstrap.user.email}</span>
                    <small>{roleLabel(bootstrap)}</small>
                  </div>
                  <button type="button" onClick={handleLogout}>
                    <LogoutIcon /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="app-content">
          {page.key === "platformAdmin" ? (
            canManagePlatform ? (
              <PlatformAdminPage />
            ) : (
              <ModuleAccessDenied title="Administração da plataforma" />
            )
          ) : !activeOrganization ? (
            <section className="app-empty-organization">
              <BuildingIcon />
              <h1>Nenhuma organização ativa</h1>
              <p>
                Sua conta está autenticada, mas não possui uma organização ativa
                disponível.
              </p>
            </section>
          ) : page.key === "goals" ? (
            canReadGoals ? (
              <GoalsPage
                organizationId={activeOrganization.id}
                canManage={canManageGoals}
              />
            ) : (
              <ModuleAccessDenied title="Metas de vendas" />
            )
          ) : page.key === "settings" ? (
            canReadSettings ? (
              <SettingsPage
                organizationId={activeOrganization.id}
                currentMembershipId={activeOrganization.membershipId}
                currentUser={{ displayName: bootstrap.user.displayName, avatarUrl: bootstrap.user.avatarUrl }}
                canUpdate={canUpdateSettings}
                canReadUsers={canReadUsers}
                canUpdateUsers={canUpdateUsers}
                canInviteUsers={canInviteUsers}
                canReadTeams={canReadTeams}
                canManageTeams={canManageTeams}
                canReadRoles={canReadRoles}
                canManageRoles={canManageRoles}
                canReadPermissions={canReadPermissions}
                canReadAuditLogs={canReadAuditLogs}
                canReadFunnels={canReadFunnels}
                canManageFunnels={canManageFunnels}
                canReadLeadDistribution={canReadLeadDistribution}
                canManageLeadDistribution={canManageLeadDistribution}
                canReadContacts={canReadContacts}
                canCreateContact={canCreateContact}
                canReadProperties={canReadProperties}
                canCreateProperty={canCreateProperty}
                onUpdated={() => load(activeOrganization.id)}
              />
            ) : (
              <ModuleAccessDenied title="Configurações" />
            )
          ) : page.key === "reports" ? (
            canReadReports ? (
              <ReportsPage organizationId={activeOrganization.id} />
            ) : (
              <ModuleAccessDenied title="Relatórios" />
            )
          ) : page.key === "finance" ? (
            canReadFinance ? (
              <FinancePage
                organizationId={activeOrganization.id}
                canCreate={canCreateFinance}
                canUpdate={canUpdateFinance}
              />
            ) : (
              <ModuleAccessDenied title="Financeiro" />
            )
          ) : page.key === "inspectionEditor" ? (
            canReadInspections ? (
              <InspectionEditorPage
                organizationId={activeOrganization.id}
                canCreate={canCreateInspection}
                canUpdate={canUpdateInspection}
              />
            ) : (
              <ModuleAccessDenied title="Laudo / vistoria" />
            )
          ) : page.key === "inspections" ? (
            canReadInspections ? (
              <InspectionsPage
                organizationId={activeOrganization.id}
                canCreate={canCreateInspection}
                canUpdate={canUpdateInspection}
              />
            ) : (
              <ModuleAccessDenied title="Laudos & vistorias" />
            )
          ) : page.key === "contractEditor" ? (
            canReadContracts ? (
              <ContractEditorPage
                organizationId={activeOrganization.id}
                canCreate={canCreateContract}
                canUpdate={canUpdateContract}
              />
            ) : (
              <ModuleAccessDenied title="Contrato" />
            )
          ) : page.key === "contracts" ? (
            canReadContracts ? (
              <ContractsPage
                organizationId={activeOrganization.id}
                canCreate={canCreateContract}
                canUpdate={canUpdateContract}
              />
            ) : (
              <ModuleAccessDenied title="Contratos gerados" />
            )
          ) : page.key === "publications" ? (
            canReadPublications ? (
              <PublicationsPage
                organizationId={activeOrganization.id}
                canCreate={canCreatePublication}
                canUpdate={canUpdatePublication}
              />
            ) : (
              <ModuleAccessDenied title="Publicações" />
            )
          ) : page.key === "authorizationEditor" ? (
            canReadAuthorizations ? (
              <AuthorizationEditorPage
                organizationId={activeOrganization.id}
                canCreate={canCreateAuthorization}
                canUpdate={canUpdateAuthorization}
              />
            ) : (
              <ModuleAccessDenied title="Autorização" />
            )
          ) : page.key === "authorizations" ? (
            canReadAuthorizations ? (
              <AuthorizationsPage
                organizationId={activeOrganization.id}
                canCreate={canCreateAuthorization}
                canUpdate={canUpdateAuthorization}
              />
            ) : (
              <ModuleAccessDenied title="Autorizações" />
            )
          ) : page.key === "propertyEditor" ? (
            canReadProperties ? (
              <PropertyEditorPage
                organizationId={activeOrganization.id}
                canCreate={canCreateProperty}
                canUpdate={canUpdateProperty}
                canReadAuthorizations={canReadAuthorizations}
                canCreateAuthorization={canCreateAuthorization}
                canReadPublications={canReadPublications}
                canCreatePublication={canCreatePublication}
              />
            ) : (
              <ModuleAccessDenied title="Imóvel" />
            )
          ) : page.key === "properties" ? (
            canReadProperties ? (
              <PropertiesPage
                organizationId={activeOrganization.id}
                canCreate={canCreateProperty}
                canUpdate={canUpdateProperty}
              />
            ) : (
              <ModuleAccessDenied title="Catálogo de imóveis" />
            )
          ) : page.key === "opportunityDetail" ? (
            hasPermission(bootstrap, "crm.opportunities.read") ? (
              <OpportunityDetailPage
                organizationId={activeOrganization.id}
                canUpdate={canUpdateOpportunity}
                canReadTask={canReadTask}
                canCreateTask={canCreateTask}
                canUpdateTask={canUpdateTask}
                canReadVisit={hasPermission(
                  bootstrap,
                  "productivity.visits.read",
                )}
                canCreateVisit={canCreateVisit}
                canUpdateVisit={canUpdateVisit}
                canReadProperties={canReadProperties}
                canCreateProperty={canCreateProperty}
              />
            ) : (
              <ModuleAccessDenied title="Oportunidade" />
            )
          ) : page.key === "tasks" ? (
            hasPermission(bootstrap, "productivity.tasks.read") ? (
              <TasksPage
                organizationId={activeOrganization.id}
                canCreate={canCreateTask}
                canUpdate={canUpdateTask}
              />
            ) : (
              <ModuleAccessDenied title="Quadro de tarefas" />
            )
          ) : page.key === "agenda" ? (
            hasPermission(bootstrap, "productivity.calendar.read") ? (
              <AgendaPage
                organizationId={activeOrganization.id}
                canCreate={canCreateCalendarEvent}
              />
            ) : (
              <ModuleAccessDenied title="Agenda" />
            )
          ) : page.key === "visits" ? (
            hasPermission(bootstrap, "productivity.visits.read") ? (
              <VisitsPage
                organizationId={activeOrganization.id}
                canCreate={canCreateVisit}
                canUpdate={canUpdateVisit}
                canReadContacts={canReadContacts}
                canReadOpportunities={canReadOpportunities}
                canReadProperties={canReadProperties}
              />
            ) : (
              <ModuleAccessDenied title="Gestão de visitas" />
            )
          ) : page.key === "buyersFunnel" ? (
            hasPermission(bootstrap, "crm.opportunities.read") ? (
              <FunnelPage
                organizationId={activeOrganization.id}
                funnelCode="buyers"
                canCreate={canCreateOpportunity}
                canUpdate={canUpdateOpportunity}
              />
            ) : (
              <ModuleAccessDenied title="Funil de compradores" />
            )
          ) : page.key === "captureFunnel" ? (
            hasPermission(bootstrap, "crm.opportunities.read") ? (
              <FunnelPage
                organizationId={activeOrganization.id}
                funnelCode="capture"
                canCreate={canCreateOpportunity}
                canUpdate={canUpdateOpportunity}
              />
            ) : (
              <ModuleAccessDenied title="Funil de captação" />
            )
          ) : page.key === "clients" ? (
            hasPermission(bootstrap, "crm.contacts.read") ? (
              <ClientsPage
                organizationId={activeOrganization.id}
                canCreate={canCreateContact}
                canUpdate={hasPermission(bootstrap, "crm.contacts.update")}
              />
            ) : (
              <ModuleAccessDenied title="Clientes" />
            )
          ) : page.key === "leads" ? (
            hasPermission(bootstrap, "crm.leads.read") ? (
              <LeadsPage
                organizationId={activeOrganization.id}
                canManage={canManageLeads}
              />
            ) : (
              <ModuleAccessDenied title="Leads do site" />
            )
          ) : (
            <OverviewPage bootstrap={bootstrap} />
          )}
        </main>
      </div>
    </div>
  );
}
