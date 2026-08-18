import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import heroImage from "../assets/images/hero-escala-imob.png";
import whiteLogo from "../assets/brand/escala-imob-white.png";
import {
  AuthApiError,
  confirmEmailVerification,
  login,
  requestPasswordReset,
  resendEmailVerification,
  resetPassword,
} from "../services/authApi";
import { clearAuthSession, readAuthSession, saveAuthSession } from "./session";

type AuthPage = "login" | "verify" | "forgot" | "reset";

type Notice = {
  kind: "success" | "error" | "info";
  message: string;
};

const verificationRequests = new Map<string, Promise<{ verified: true }>>();

function confirmEmailVerificationOnce(token: string): Promise<{ verified: true }> {
  const existing = verificationRequests.get(token);
  if (existing) return existing;
  const request = confirmEmailVerification(token).catch((error) => {
    verificationRequests.delete(token);
    throw error;
  });
  verificationRequests.set(token, request);
  return request;
}


function currentPage(pathname = globalThis.location.pathname): AuthPage {
  if (pathname.startsWith("/verificar-email")) return "verify";
  if (pathname.startsWith("/recuperar-senha")) return "forgot";
  if (pathname.startsWith("/redefinir-senha")) return "reset";
  return "login";
}

function queryToken(): string {
  return new URLSearchParams(globalThis.location.search).get("token")?.trim() ?? "";
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.2A10.7 10.7 0 0112 4c5.5 0 9 5.3 9 5.3a15 15 0 01-2.3 2.8M6.1 6.2C4.2 7.5 3 9.3 3 9.3S6.5 14.7 12 14.7c1 0 1.9-.2 2.7-.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12s3.5-5.3 9-5.3 9 5.3 9 5.3-3.5 5.3-9 5.3S3 12 3 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell" style={{ backgroundImage: `url(${heroImage})` }}>
      <div className="auth-shell__veil" aria-hidden="true" />
      {children}
    </main>
  );
}

function AuthLogo() {
  return <img className="auth-logo" src={whiteLogo} alt="Escala IMOB" />;
}

function NoticeBox({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return <p className={`auth-notice auth-notice--${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.message}</p>;
}

function LoginPage() {
  const existingSession = useMemo(() => readAuthSession(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(existingSession?.remember ?? true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(
    existingSession
      ? { kind: "info", message: `Você já possui uma sessão salva para ${existingSession.user.email}.` }
      : null,
  );
  const [canResendVerification, setCanResendVerification] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setNotice(null);
    setCanResendVerification(false);

    try {
      const result = await login(email, password);
      saveAuthSession(result, remember);
      setPassword("");

      if (result.onboarding.completed) {
        globalThis.location.replace("/app/");
        return;
      }

      setNotice({
        kind: "info",
        message: "Acesso confirmado, mas seu onboarding ainda não está concluído.",
      });
    } catch (error) {
      if (error instanceof AuthApiError) {
        setNotice({ kind: "error", message: error.message });
        setCanResendVerification(error.code === "EMAIL_NOT_VERIFIED");
      } else {
        setNotice({ kind: "error", message: "Não foi possível entrar. Tente novamente." });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendVerification() {
    if (!email.trim() || isResending) return;
    setIsResending(true);
    try {
      await resendEmailVerification(email);
      setNotice({
        kind: "success",
        message: "Se a conta estiver pendente de confirmação, um novo e-mail foi enviado.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof AuthApiError ? error.message : "Não foi possível reenviar o e-mail agora.",
      });
    } finally {
      setIsResending(false);
    }
  }

  return (
    <AuthShell>
      <section className="auth-card auth-card--login">
        <AuthLogo />
        <header className="auth-heading auth-heading--login">
          <h1>Olá, Bem-vindo!</h1>
          <p>Primeiro acesso? <a href="/registro/">Clique aqui</a></p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nomeemail@gmail.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="auth-field">
            <span>Senha</span>
            <span className="auth-password-control">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                <EyeIcon hidden={!showPassword} />
              </button>
            </span>
          </label>

          <div className="auth-form-row">
            <label className="auth-remember">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span>Lembre de mim</span>
            </label>
            <a href="/recuperar-senha/">Esqueceu sua senha?</a>
          </div>

          <NoticeBox notice={notice} />

          {canResendVerification && (
            <button className="auth-link-button" type="button" onClick={() => void handleResendVerification()} disabled={isResending}>
              {isResending ? "Reenviando..." : "Reenviar e-mail de confirmação"}
            </button>
          )}

          <button className="auth-primary" type="submit" disabled={!email.trim() || !password || isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </AuthShell>
  );
}

function EmailVerificationPage() {
  const token = useMemo(queryToken, []);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Confirmando seu e-mail...");

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setStatus("error");
      setMessage("O link de confirmação está incompleto.");
      return;
    }

    void confirmEmailVerificationOnce(token)
      .then(() => {
        if (cancelled) return;
        clearAuthSession();
        globalThis.history.replaceState({}, "", globalThis.location.pathname);
        setStatus("success");
        setMessage("E-mail confirmado com sucesso. Agora você já pode entrar na Escala IMOB.");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(error instanceof AuthApiError ? error.message : "Não foi possível confirmar seu e-mail.");
      });

    return () => { cancelled = true; };
  }, [token]);

  return (
    <AuthShell>
      <section className="auth-card auth-card--compact">
        <AuthLogo />
        <header className="auth-heading">
          <span className={`auth-status-icon auth-status-icon--${status}`} aria-hidden="true">{status === "success" ? "✓" : status === "error" ? "!" : "…"}</span>
          <h1>Confirmação de e-mail</h1>
          <p>{message}</p>
        </header>
        {status !== "loading" && <a className="auth-primary auth-primary--link" href="/login/">Ir para o login</a>}
      </section>
    </AuthShell>
  );
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setNotice(null);
    try {
      await requestPasswordReset(email);
      setNotice({
        kind: "success",
        message: "Se existir uma conta elegível para este e-mail, enviaremos um link de redefinição. Verifique também a pasta de spam.",
      });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof AuthApiError ? error.message : "Não foi possível solicitar a redefinição agora." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <section className="auth-card auth-card--compact">
        <AuthLogo />
        <header className="auth-heading">
          <h1>Recupere sua senha</h1>
          <p>Informe o e-mail da sua conta. Se ele estiver apto, enviaremos um link seguro para criar uma nova senha.</p>
        </header>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nomeemail@gmail.com" autoComplete="email" required />
          </label>
          <NoticeBox notice={notice} />
          <button className="auth-primary" type="submit" disabled={!email.trim() || isSubmitting}>{isSubmitting ? "Enviando..." : "Enviar link"}</button>
          <a className="auth-back-link" href="/login/">Voltar para o login</a>
        </form>
      </section>
    </AuthShell>
  );
}

const passwordRules = [
  { key: "length", label: "Pelo menos 8 caracteres", valid: (value: string) => value.length >= 8 },
  { key: "uppercase", label: "Pelo menos 1 letra maiúscula", valid: (value: string) => /[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ]/u.test(value) },
  { key: "number", label: "Pelo menos 1 número", valid: (value: string) => /\d/u.test(value) },
  { key: "symbol", label: "Pelo menos 1 símbolo", valid: (value: string) => /[^\p{L}\p{N}\s]/u.test(value) },
];

function ResetPasswordPage() {
  const token = useMemo(queryToken, []);
  const isInvitation = useMemo(() => new URLSearchParams(globalThis.location.search).get("invite") === "1", []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(
    token ? null : { kind: "error", message: "O link de redefinição está incompleto." },
  );
  const [completed, setCompleted] = useState(false);
  const rules = passwordRules.map((rule) => ({ ...rule, ok: rule.valid(password) }));
  const canSubmit = Boolean(token && rules.every((rule) => rule.ok) && confirmation === password && !isSubmitting);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setNotice(null);
    try {
      await resetPassword(token, password);
      clearAuthSession();
      globalThis.history.replaceState({}, "", globalThis.location.pathname);
      setCompleted(true);
      setPassword("");
      setConfirmation("");
      setNotice({
        kind: "success",
        message: isInvitation
          ? "Senha criada com sucesso. Seu e-mail foi confirmado; entre para acessar a operação que convidou você."
          : "Senha redefinida com sucesso. Suas sessões anteriores foram encerradas.",
      });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof AuthApiError ? error.message : "Não foi possível redefinir sua senha." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <section className="auth-card auth-card--compact">
        <AuthLogo />
        <header className="auth-heading">
          <h1>{isInvitation ? "Crie sua senha" : "Crie uma nova senha"}</h1>
          <p>{isInvitation ? "Você recebeu um convite para a Escala IMOB. Defina sua senha para concluir o primeiro acesso." : "Use uma senha forte. O link é de uso único e deixa de funcionar após a redefinição."}</p>
        </header>

        {!completed ? (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Nova senha</span>
              <span className="auth-password-control">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}><EyeIcon hidden={!showPassword} /></button>
              </span>
            </label>
            <label className="auth-field">
              <span>Confirme a nova senha</span>
              <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required />
            </label>
            <div className="auth-password-rules">
              {rules.map((rule) => <span className={rule.ok ? "is-valid" : ""} key={rule.key}>✓ {rule.label}</span>)}
              <span className={confirmation && confirmation === password ? "is-valid" : ""}>✓ As senhas coincidem</span>
            </div>
            <NoticeBox notice={notice} />
            <button className="auth-primary" type="submit" disabled={!canSubmit}>{isSubmitting ? "Salvando..." : isInvitation ? "Criar minha senha" : "Salvar nova senha"}</button>
            <a className="auth-back-link" href="/login/">Voltar para o login</a>
          </form>
        ) : (
          <div className="auth-complete-action">
            <NoticeBox notice={notice} />
            <a className="auth-primary auth-primary--link" href="/login/">Entrar com a nova senha</a>
          </div>
        )}
      </section>
    </AuthShell>
  );
}

export function AuthApp() {
  switch (currentPage()) {
    case "verify": return <EmailVerificationPage />;
    case "forgot": return <ForgotPasswordPage />;
    case "reset": return <ResetPasswordPage />;
    default: return <LoginPage />;
  }
}
