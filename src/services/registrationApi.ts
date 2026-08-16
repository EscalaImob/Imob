const REQUEST_TIMEOUT_MS = 15_000;

export interface RegistrationPayload {
  firstName: string;
  lastName: string;
  email: string;
  phoneCountryCode: string;
  phoneNumber: string;
  password: string;
}

export interface RegistrationSession {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
}

export interface RegistrationResult {
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  onboarding: {
    step: number;
    next: string;
  };
  session: RegistrationSession;
}

interface ApiValidationIssue {
  field?: string;
  message?: string;
}

interface ApiErrorPayload {
  success?: false;
  error?: {
    code?: string;
    message?: string;
    issues?: ApiValidationIssue[];
  };
}

interface RegistrationSuccessResponse {
  success: true;
  data: RegistrationResult;
}

export class RegistrationApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly issues: ApiValidationIssue[];

  constructor(
    message: string,
    code: string,
    status?: number,
    issues: ApiValidationIssue[] = [],
  ) {
    super(message);
    this.name = "RegistrationApiError";
    this.code = code;
    this.status = status;
    this.issues = issues;
  }
}

function getApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();

  if (!configuredUrl) {
    throw new RegistrationApiError(
      "O cadastro ainda não está disponível. Tente novamente em alguns instantes.",
      "API_NOT_CONFIGURED",
    );
  }

  return configuredUrl.replace(/\/+$/, "");
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isRegistrationResult(value: unknown): value is RegistrationResult {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Partial<RegistrationResult>;
  const session = data.session;

  return Boolean(
    data.user &&
      typeof data.user.id === "string" &&
      typeof data.user.email === "string" &&
      typeof data.user.displayName === "string" &&
      data.onboarding &&
      typeof data.onboarding.step === "number" &&
      typeof data.onboarding.next === "string" &&
      session &&
      typeof session.accessToken === "string" &&
      typeof session.idToken === "string" &&
      typeof session.expiresIn === "number" &&
      typeof session.tokenType === "string",
  );
}

function messageForError(status: number, payload: ApiErrorPayload | null): string {
  if (status === 409 || payload?.error?.code === "EMAIL_ALREADY_REGISTERED") {
    return "Já existe uma conta associada a este e-mail.";
  }

  if (status === 422) {
    const firstIssue = payload?.error?.issues?.find(
      (issue) => typeof issue.message === "string" && issue.message.trim(),
    );
    return firstIssue?.message || "Revise os dados informados e tente novamente.";
  }

  if (status === 429) {
    return "Recebemos muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.";
  }

  if (status >= 500) {
    return "Não foi possível criar sua conta agora. Tente novamente em instantes.";
  }

  return payload?.error?.message || "Não foi possível criar sua conta. Tente novamente.";
}

export async function registerAccount(
  payload: RegistrationPayload,
): Promise<RegistrationResult> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBaseUrl()}/registration`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responsePayload = await readJson(response);

    if (!response.ok) {
      const apiPayload = responsePayload as ApiErrorPayload | null;
      throw new RegistrationApiError(
        messageForError(response.status, apiPayload),
        apiPayload?.error?.code || "API_ERROR",
        response.status,
        apiPayload?.error?.issues || [],
      );
    }

    const successPayload = responsePayload as RegistrationSuccessResponse | null;

    if (successPayload?.success !== true || !isRegistrationResult(successPayload.data)) {
      throw new RegistrationApiError(
        "Recebemos uma resposta inesperada do servidor. Tente novamente.",
        "INVALID_API_RESPONSE",
        response.status,
      );
    }

    return successPayload.data;
  } catch (error) {
    if (error instanceof RegistrationApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new RegistrationApiError(
        "O cadastro demorou mais que o esperado. Tente novamente.",
        "REQUEST_TIMEOUT",
      );
    }

    throw new RegistrationApiError(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
      "NETWORK_ERROR",
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
}


export interface OnboardingPreferencesPayload {
  skip?: boolean;
  companyName?: string;
  marketProfile?: string;
  jobRole?: string;
  primaryFocus?: string;
  intendedUses?: string[];
}

export interface OnboardingPreferencesResult {
  preferences: {
    companyName: string | null;
    marketProfile: string | null;
    jobRole: string | null;
    primaryFocus: string | null;
    intendedUses: string[];
  };
  onboarding: {
    step: number;
    next: string;
  };
}

interface OnboardingPreferencesSuccessResponse {
  success: true;
  data: OnboardingPreferencesResult;
}

function isOnboardingPreferencesResult(
  value: unknown,
): value is OnboardingPreferencesResult {
  if (typeof value !== "object" || value === null) return false;

  const data = value as Partial<OnboardingPreferencesResult>;
  const preferences = data.preferences;
  const onboarding = data.onboarding;

  return Boolean(
    preferences &&
      (preferences.companyName === null ||
        typeof preferences.companyName === "string") &&
      (preferences.marketProfile === null ||
        typeof preferences.marketProfile === "string") &&
      (preferences.jobRole === null ||
        typeof preferences.jobRole === "string") &&
      (preferences.primaryFocus === null ||
        typeof preferences.primaryFocus === "string") &&
      Array.isArray(preferences.intendedUses) &&
      preferences.intendedUses.every((item) => typeof item === "string") &&
      onboarding &&
      typeof onboarding.step === "number" &&
      typeof onboarding.next === "string",
  );
}

function messageForPreferencesError(
  status: number,
  payload: ApiErrorPayload | null,
): string {
  if (status === 401 || status === 403) {
    return "Sua sessão de cadastro expirou. Recarregue a página e faça o cadastro novamente.";
  }

  if (status === 422) {
    const firstIssue = payload?.error?.issues?.find(
      (issue) => typeof issue.message === "string" && issue.message.trim(),
    );

    return firstIssue?.message || "Revise as preferências informadas.";
  }

  if (status >= 500) {
    return "Não foi possível salvar suas preferências agora. Tente novamente em instantes.";
  }

  return (
    payload?.error?.message ||
    "Não foi possível salvar suas preferências. Tente novamente."
  );
}

export async function saveOnboardingPreferences(
  payload: OnboardingPreferencesPayload,
  accessToken: string,
): Promise<OnboardingPreferencesResult> {
  const normalizedToken = accessToken.trim();

  if (!normalizedToken) {
    throw new RegistrationApiError(
      "Sua sessão de cadastro não está disponível.",
      "ONBOARDING_SESSION_MISSING",
    );
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${getApiBaseUrl()}/onboarding/preferences`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${normalizedToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responsePayload = await readJson(response);

    if (!response.ok) {
      const apiPayload = responsePayload as ApiErrorPayload | null;

      throw new RegistrationApiError(
        messageForPreferencesError(response.status, apiPayload),
        apiPayload?.error?.code || "API_ERROR",
        response.status,
        apiPayload?.error?.issues || [],
      );
    }

    const successPayload =
      responsePayload as OnboardingPreferencesSuccessResponse | null;

    if (
      successPayload?.success !== true ||
      !isOnboardingPreferencesResult(successPayload.data)
    ) {
      throw new RegistrationApiError(
        "Recebemos uma resposta inesperada do servidor. Tente novamente.",
        "INVALID_API_RESPONSE",
        response.status,
      );
    }

    return successPayload.data;
  } catch (error) {
    if (error instanceof RegistrationApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new RegistrationApiError(
        "O salvamento demorou mais que o esperado. Tente novamente.",
        "REQUEST_TIMEOUT",
      );
    }

    throw new RegistrationApiError(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
      "NETWORK_ERROR",
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
