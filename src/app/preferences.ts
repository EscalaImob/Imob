const ACTIVE_ORGANIZATION_KEY = "escala-imob:active-organization";
const SIDEBAR_COLLAPSED_KEY = "escala-imob:app-sidebar-collapsed";

export function readActiveOrganizationId(): string | null {
  try {
    return globalThis.localStorage.getItem(ACTIVE_ORGANIZATION_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function saveActiveOrganizationId(organizationId: string | null): void {
  try {
    if (organizationId) {
      globalThis.localStorage.setItem(ACTIVE_ORGANIZATION_KEY, organizationId);
    } else {
      globalThis.localStorage.removeItem(ACTIVE_ORGANIZATION_KEY);
    }
  } catch {
    // A seleção continua válida durante a navegação atual mesmo sem persistência local.
  }
}

export function readSidebarCollapsed(): boolean {
  try {
    return globalThis.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    globalThis.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Preferência visual não é crítica para o funcionamento da aplicação.
  }
}
