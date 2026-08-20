const REQUEST_TIMEOUT_MS = 15_000;

export interface RegistrationPayload {
  firstName: string;
  lastName: string;
  email: string;
  phoneCountryCode: string;
  phoneNumber: string;
  cpf: string;
  accessKey: string;
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
  if (payload?.error?.code === "EMAIL_ALREADY_REGISTERED") {
    return "Já existe uma conta associada a este e-mail.";
  }

  if (
    status === 403 ||
    payload?.error?.code === "REGISTRATION_AUTHORIZATION_INVALID"
  ) {
    return "Não foi possível validar sua autorização de cadastro. Confira o CPF e a chave recebida.";
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


export interface OnboardingOperationPayload {
  skip?: boolean;
  name?: string;
  description?: string;
  logo?: {
    originalName: string;
    contentType: string;
    size: number;
  };
}

export interface OnboardingOperationResult {
  operation: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    logoStorageKey: string | null;
  };
  logoUpload: {
    storageKey: string;
    uploadUrl: string;
    expiresInSeconds: number;
    requiredHeaders: {
      "content-type": string;
    };
  } | null;
  onboarding: {
    step: number;
    next: string;
  };
}

interface OnboardingOperationSuccessResponse {
  success: true;
  data: OnboardingOperationResult;
}

function isOnboardingOperationResult(value: unknown): value is OnboardingOperationResult {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Partial<OnboardingOperationResult>;
  const operation = data.operation;
  const onboarding = data.onboarding;
  const logoUpload = data.logoUpload;

  return Boolean(
    operation &&
      typeof operation.id === "string" &&
      typeof operation.slug === "string" &&
      typeof operation.name === "string" &&
      (operation.description === null || typeof operation.description === "string") &&
      (operation.logoStorageKey === null || typeof operation.logoStorageKey === "string") &&
      (logoUpload === null ||
        (typeof logoUpload === "object" &&
          typeof logoUpload.uploadUrl === "string" &&
          typeof logoUpload.storageKey === "string" &&
          typeof logoUpload.expiresInSeconds === "number" &&
          typeof logoUpload.requiredHeaders?.["content-type"] === "string")) &&
      onboarding &&
      typeof onboarding.step === "number" &&
      typeof onboarding.next === "string",
  );
}

function messageForOperationError(status: number, payload: ApiErrorPayload | null): string {
  if (status === 401 || status === 403) {
    return "Sua sessão de cadastro expirou. Recarregue a página e faça o cadastro novamente.";
  }
  if (status === 422) {
    const firstIssue = payload?.error?.issues?.find(
      (issue) => typeof issue.message === "string" && issue.message.trim(),
    );
    return firstIssue?.message || "Revise os dados da operação.";
  }
  if (status >= 500) {
    return "Não foi possível configurar sua operação agora. Tente novamente em instantes.";
  }
  return payload?.error?.message || "Não foi possível configurar sua operação.";
}

export async function saveOnboardingOperation(
  payload: OnboardingOperationPayload,
  accessToken: string,
): Promise<OnboardingOperationResult> {
  const normalizedToken = accessToken.trim();
  if (!normalizedToken) {
    throw new RegistrationApiError(
      "Sua sessão de cadastro não está disponível.",
      "ONBOARDING_SESSION_MISSING",
    );
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBaseUrl()}/onboarding/operation`, {
      method: "POST",
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
        messageForOperationError(response.status, apiPayload),
        apiPayload?.error?.code || "API_ERROR",
        response.status,
        apiPayload?.error?.issues || [],
      );
    }

    const successPayload = responsePayload as OnboardingOperationSuccessResponse | null;
    if (successPayload?.success !== true || !isOnboardingOperationResult(successPayload.data)) {
      throw new RegistrationApiError(
        "Recebemos uma resposta inesperada do servidor. Tente novamente.",
        "INVALID_API_RESPONSE",
        response.status,
      );
    }

    return successPayload.data;
  } catch (error) {
    if (error instanceof RegistrationApiError) throw error;
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

export async function uploadOnboardingLogo(
  upload: NonNullable<OnboardingOperationResult["logoUpload"]>,
  file: File,
): Promise<void> {
  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.requiredHeaders,
    body: file,
  });

  if (!response.ok) {
    throw new RegistrationApiError(
      "Não foi possível enviar o logo. Tente novamente.",
      "LOGO_UPLOAD_FAILED",
      response.status,
    );
  }
}

export interface OnboardingInvitationsPayload {
  skip?: boolean;
  emails?: string[];
}

export interface OnboardingInvitationsResult {
  invitations: Array<{
    email: string;
    status: "invited" | "already_member";
  }>;
  onboarding: {
    step: number;
    next: string;
    completedAt: string;
  };
}

interface OnboardingInvitationsSuccessResponse {
  success: true;
  data: OnboardingInvitationsResult;
}

function isOnboardingInvitationsResult(
  value: unknown,
): value is OnboardingInvitationsResult {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Partial<OnboardingInvitationsResult>;
  const onboarding = data.onboarding;

  return Boolean(
    Array.isArray(data.invitations) &&
      data.invitations.every(
        (invitation) =>
          typeof invitation === "object" &&
          invitation !== null &&
          typeof invitation.email === "string" &&
          (invitation.status === "invited" ||
            invitation.status === "already_member"),
      ) &&
      onboarding &&
      typeof onboarding.step === "number" &&
      typeof onboarding.next === "string" &&
      typeof onboarding.completedAt === "string",
  );
}

function messageForInvitationsError(
  status: number,
  payload: ApiErrorPayload | null,
): string {
  if (status === 401 || status === 403) {
    return status === 401
      ? "Sua sessão de cadastro expirou. Recarregue a página e faça o cadastro novamente."
      : "Você não possui permissão para convidar usuários.";
  }

  if (status === 409) {
    return payload?.error?.message || "Conclua a configuração da operação antes de adicionar a equipe.";
  }

  if (status === 422) {
    const firstIssue = payload?.error?.issues?.find(
      (issue) => typeof issue.message === "string" && issue.message.trim(),
    );
    return firstIssue?.message || "Revise os e-mails informados.";
  }

  if (status >= 500) {
    return "Não foi possível concluir o cadastro agora. Tente novamente em instantes.";
  }

  return payload?.error?.message || "Não foi possível concluir o cadastro.";
}

export async function saveOnboardingInvitations(
  payload: OnboardingInvitationsPayload,
  accessToken: string,
): Promise<OnboardingInvitationsResult> {
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
    const response = await fetch(`${getApiBaseUrl()}/onboarding/invitations`, {
      method: "POST",
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
        messageForInvitationsError(response.status, apiPayload),
        apiPayload?.error?.code || "API_ERROR",
        response.status,
        apiPayload?.error?.issues || [],
      );
    }

    const successPayload =
      responsePayload as OnboardingInvitationsSuccessResponse | null;

    if (
      successPayload?.success !== true ||
      !isOnboardingInvitationsResult(successPayload.data)
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
        "O envio demorou mais que o esperado. Tente novamente.",
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


export interface OnboardingAvatarUploadResult {
  kind: "ready";
  storageKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
  requiredHeaders: {
    "content-type": string;
  };
}

interface OnboardingAvatarUploadSuccessResponse {
  success: true;
  data: OnboardingAvatarUploadResult;
}

function messageForAvatarError(status: number, payload: ApiErrorPayload | null): string {
  if (status === 401 || status === 403) {
    return "Sua sessão de cadastro expirou antes de salvar a foto.";
  }

  if (status === 422) {
    const firstIssue = payload?.error?.issues?.find(
      (issue) => typeof issue.message === "string" && issue.message.trim(),
    );
    return firstIssue?.message || "Use uma foto JPEG, PNG ou WebP de até 10 MB.";
  }

  return payload?.error?.message || "Não foi possível salvar sua foto de perfil.";
}

export async function createOnboardingAvatarUpload(
  file: File,
  accessToken: string,
): Promise<OnboardingAvatarUploadResult> {
  const normalizedToken = accessToken.trim();
  if (!normalizedToken) {
    throw new RegistrationApiError(
      "Sua sessão de cadastro não está disponível.",
      "ONBOARDING_SESSION_MISSING",
    );
  }

  const response = await fetch(`${getApiBaseUrl()}/onboarding/avatar/upload-url`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${normalizedToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      originalName: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });
  const responsePayload = await readJson(response);

  if (!response.ok) {
    const apiPayload = responsePayload as ApiErrorPayload | null;
    throw new RegistrationApiError(
      messageForAvatarError(response.status, apiPayload),
      apiPayload?.error?.code || "AVATAR_UPLOAD_URL_FAILED",
      response.status,
      apiPayload?.error?.issues || [],
    );
  }

  const successPayload = responsePayload as OnboardingAvatarUploadSuccessResponse | null;
  const data = successPayload?.data;
  if (
    successPayload?.success !== true ||
    data?.kind !== "ready" ||
    typeof data.storageKey !== "string" ||
    typeof data.uploadUrl !== "string" ||
    typeof data.requiredHeaders?.["content-type"] !== "string"
  ) {
    throw new RegistrationApiError(
      "Recebemos uma resposta inesperada ao preparar o envio da foto.",
      "INVALID_API_RESPONSE",
      response.status,
    );
  }

  return data;
}

export async function uploadOnboardingAvatar(
  upload: OnboardingAvatarUploadResult,
  file: File,
): Promise<void> {
  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.requiredHeaders,
    body: file,
  });

  if (!response.ok) {
    throw new RegistrationApiError(
      "Não foi possível enviar sua foto de perfil. Tente novamente depois.",
      "AVATAR_UPLOAD_FAILED",
      response.status,
    );
  }
}

export async function confirmOnboardingAvatar(
  storageKey: string,
  accessToken: string,
): Promise<{ avatarStorageKey: string }> {
  const response = await fetch(`${getApiBaseUrl()}/onboarding/avatar`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${accessToken.trim()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ storageKey }),
  });
  const responsePayload = await readJson(response);

  if (!response.ok) {
    const apiPayload = responsePayload as ApiErrorPayload | null;
    throw new RegistrationApiError(
      messageForAvatarError(response.status, apiPayload),
      apiPayload?.error?.code || "AVATAR_CONFIRM_FAILED",
      response.status,
    );
  }

  const data = (responsePayload as { success?: boolean; data?: { avatarStorageKey?: unknown } } | null)?.data;
  if (typeof data?.avatarStorageKey !== "string") {
    throw new RegistrationApiError(
      "Recebemos uma resposta inesperada ao salvar a foto.",
      "INVALID_API_RESPONSE",
      response.status,
    );
  }

  return { avatarStorageKey: data.avatarStorageKey };
}
