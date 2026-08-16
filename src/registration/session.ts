import type { RegistrationResult } from "../services/registrationApi";

const SESSION_STORAGE_KEY = "escala-imob:onboarding-session";
let memorySession: StoredOnboardingSession | null = null;

export interface StoredOnboardingSession {
  userId: string;
  email: string;
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: string;
}

export function saveOnboardingSession(result: RegistrationResult): void {
  const session: StoredOnboardingSession = {
    userId: result.user.id,
    email: result.user.email,
    accessToken: result.session.accessToken,
    idToken: result.session.idToken,
    ...(result.session.refreshToken
      ? { refreshToken: result.session.refreshToken }
      : {}),
    expiresAt: Date.now() + result.session.expiresIn * 1000,
    tokenType: result.session.tokenType,
  };

  memorySession = session;

  try {
    globalThis.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // O fallback em memória mantém o onboarding funcional nesta navegação.
  }
}

export function readOnboardingSession(): StoredOnboardingSession | null {
  try {
    const raw = globalThis.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return memorySession;

    const parsed = JSON.parse(raw) as Partial<StoredOnboardingSession>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.idToken !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.tokenType !== "string"
    ) {
      return null;
    }

    memorySession = parsed as StoredOnboardingSession;
    return memorySession;
  } catch {
    return memorySession;
  }
}
