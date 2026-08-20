export interface PanelTheme {
  primary: string;
  accent: string;
  sidebar: string;
  background: string;
  heading: string;
  subtitle: string;
  content: string;
  muted: string;
  sidebarText: string;
}

export const defaultPanelTheme: PanelTheme = {
  primary: "#0106FE",
  accent: "#8B5CF6",
  sidebar: "#F7F7F8",
  background: "#FAFAFA",
  heading: "#151923",
  subtitle: "#667085",
  content: "#273142",
  muted: "#777B87",
  sidebarText: "#292C34",
};

const colorPattern = /^#[0-9A-F]{6}$/i;
const storageKey = (organizationId: string, membershipId: string) => `escala-imob:panel-theme:${organizationId}:${membershipId}`;

const colorLuminance = (hex: string) => { const rgb = hex.slice(1).match(/.{2}/g)?.map((part) => Number.parseInt(part, 16) / 255) ?? [1, 1, 1]; return rgb.map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0); };

export function readPanelTheme(organizationId: string, membershipId: string): PanelTheme {
  try {
    const stored = JSON.parse(globalThis.localStorage.getItem(storageKey(organizationId, membershipId)) ?? "null") as Partial<PanelTheme> | null;
    if (!stored) return defaultPanelTheme;
    const resolved = Object.fromEntries(Object.entries(defaultPanelTheme).map(([name, fallback]) => {
      const value = stored[name as keyof PanelTheme];
      return [name, typeof value === "string" && colorPattern.test(value) ? value : fallback];
    })) as unknown as PanelTheme;
    if (!stored.heading && colorLuminance(resolved.background) < .22) resolved.heading = "#F4F6FA";
    if (!stored.subtitle && colorLuminance(resolved.background) < .22) resolved.subtitle = "#C4CAD4";
    if (!stored.content && colorLuminance(resolved.background) < .22) resolved.content = "#F4F6FA";
    if (!stored.muted && colorLuminance(resolved.background) < .22) resolved.muted = "#A8B0BF";
    if (!stored.sidebarText && colorLuminance(resolved.sidebar) < .22) resolved.sidebarText = "#F5F7FB";
    return resolved;
  } catch { return defaultPanelTheme; }
}

export function applyPanelTheme(theme: PanelTheme) {
  const root = document.documentElement;
  const darkContent = colorLuminance(theme.background) < .22;
  const darkSidebar = colorLuminance(theme.sidebar) < .22;
  root.style.setProperty("--app-blue", theme.primary);
  root.style.setProperty("--app-accent", theme.accent);
  root.style.setProperty("--app-sidebar-bg", theme.sidebar);
  root.style.setProperty("--app-page-bg", theme.background);
  root.style.setProperty("--app-surface", darkContent ? "#17181B" : "#FFFFFF");
  root.style.setProperty("--app-surface-soft", darkContent ? "#202226" : "#F8F9FB");
  root.style.setProperty("--app-heading-text", theme.heading);
  root.style.setProperty("--app-subtitle-text", theme.subtitle);
  root.style.setProperty("--app-content-text", theme.content);
  root.style.setProperty("--app-muted-text", theme.muted);
  root.style.setProperty("--app-text", theme.content);
  root.style.setProperty("--app-muted", theme.muted);
  root.style.setProperty("--app-border", darkContent ? "#393C43" : "#E6E7EC");
  root.style.setProperty("--app-border-strong", darkContent ? "#50545D" : "#D9DBE3");
  root.style.setProperty("--app-sidebar-text", theme.sidebarText);
  root.style.setProperty("--app-sidebar-muted", theme.sidebarText);
  root.dataset.appContentTheme = darkContent ? "dark" : "light";
  root.dataset.appSidebarTheme = darkSidebar ? "dark" : "light";
}

export function savePanelTheme(organizationId: string, membershipId: string, theme: PanelTheme) {
  globalThis.localStorage.setItem(storageKey(organizationId, membershipId), JSON.stringify(theme));
  applyPanelTheme(theme);
}

export function resetPanelTheme(organizationId: string, membershipId: string) {
  globalThis.localStorage.removeItem(storageKey(organizationId, membershipId));
  applyPanelTheme(defaultPanelTheme);
}
