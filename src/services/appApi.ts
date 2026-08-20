const REQUEST_TIMEOUT_MS = 15_000;

export type AccessScope = "own" | "team" | "organization";

export interface AppOrganizationSummary {
  id: string;
  membershipId: string;
  slug: string;
  name: string;
  timezone: string;
  logoStorageKey: string | null;
  memberCount: number;
}

export interface AppBootstrapResult {
  user: {
    id: string;
    email: string;
    displayName: string;
    firstName: string;
    lastName: string;
    avatarStorageKey: string | null;
    avatarUrl: string | null;
  };
  organizations: AppOrganizationSummary[];
  activeOrganization: (AppOrganizationSummary & { logoUrl: string | null }) | null;
  roles: Array<{ code: string; name: string }>;
  permissions: Array<{ permissionCode: string; scope: AccessScope }>;
  platformPermissions: string[];
}

export class AppApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = "AppApiError";
    this.code = code;
    this.status = status;
  }
}

function apiBase(): string {
  const value = import.meta.env.VITE_API_URL?.trim();

  if (!value) {
    throw new AppApiError(
      "A plataforma ainda não está conectada à API.",
      "API_NOT_CONFIGURED",
    );
  }

  return value.replace(/\/+$/u, "");
}

function isBootstrapResult(value: unknown): value is AppBootstrapResult {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AppBootstrapResult>;
  const user = data.user;

  return Boolean(
    user &&
      typeof user.id === "string" &&
      typeof user.email === "string" &&
      typeof user.displayName === "string" &&
      typeof user.firstName === "string" &&
      typeof user.lastName === "string" &&
      (user.avatarUrl === null || typeof user.avatarUrl === "string") &&
      Array.isArray(data.organizations) &&
      Array.isArray(data.roles) &&
      Array.isArray(data.permissions) &&
      Array.isArray(data.platformPermissions) &&
      data.platformPermissions.every((permission) => typeof permission === "string") &&
      (data.activeOrganization === null ||
        (typeof data.activeOrganization === "object" &&
          typeof data.activeOrganization.id === "string" &&
          typeof data.activeOrganization.name === "string")),
  );
}

export async function getAppBootstrap(
  accessToken: string,
  organizationId?: string | null,
): Promise<AppBootstrapResult> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken.trim()}`,
    };

    if (organizationId?.trim()) {
      headers["x-organization-id"] = organizationId.trim();
    }

    const response = await fetch(`${apiBase()}/app/bootstrap`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const body = payload as {
      success?: boolean;
      data?: unknown;
      error?: { code?: string; message?: string };
    } | null;

    if (!response.ok) {
      throw new AppApiError(
        body?.error?.message || "Não foi possível carregar a plataforma.",
        body?.error?.code || "API_ERROR",
        response.status,
      );
    }

    if (body?.success !== true || !isBootstrapResult(body.data)) {
      throw new AppApiError(
        "Recebemos uma resposta inesperada da plataforma.",
        "INVALID_API_RESPONSE",
        response.status,
      );
    }

    return body.data;
  } catch (error) {
    if (error instanceof AppApiError) throw error;

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppApiError(
        "A plataforma demorou mais que o esperado para responder.",
        "REQUEST_TIMEOUT",
      );
    }

    throw new AppApiError(
      "Não foi possível conectar à plataforma. Verifique sua conexão e tente novamente.",
      "NETWORK_ERROR",
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
