import { useState } from "react";
import type { RegistrationFormState } from "../types";
import { TextField } from "../components/FormControls";
import { CheckIcon, EyeIcon } from "../components/icons";
import { UploadCard } from "../components/UploadCard";


async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("invalid_image"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Props {
  value: RegistrationFormState;
  onChange: (patch: Partial<RegistrationFormState>) => void;
  onContinue: () => void;
  isSubmitting: boolean;
  errorMessage: string | null;
}

export function AccountStep({
  value,
  onChange,
  onContinue,
  isSubmitting,
  errorMessage,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const rules = [
    { label: "Use pelo menos 8 caracteres", ok: value.password.length >= 8 },
    { label: "Deve conter pelo menos 1 número", ok: /\d/.test(value.password) },
    { label: "Pelo menos 1 letra maiúscula", ok: /[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ]/.test(value.password) },
    { label: "Deve conter pelo menos 1 símbolo", ok: /[^\p{L}\p{N}\s]/u.test(value.password) },
  ];
  const normalizedPhone = value.phoneNumber.replace(/\D/g, "");
  const canContinue = Boolean(
    value.firstName.trim() &&
      value.lastName.trim() &&
      /\S+@\S+\.\S+/.test(value.email) &&
      normalizedPhone.length >= 10 &&
      normalizedPhone.length <= 11 &&
      rules.every((rule) => rule.ok),
  );

  return (
    <section className="registration-card registration-card--account">
      <header className="registration-card__header">
        <h2>Preencha suas informações</h2>
        <p>Insira seus dados pessoais — do nome ao número de telefone — e certifique-se de que tudo esteja totalmente preenchido.</p>
      </header>

      <UploadCard
        previewUrl={value.avatarPreviewUrl}
        title="Adicionar foto de perfil"
        description={<>Adicione sua foto de perfil com<br /> tamanho mínimo de 400 × 400<br /> px e tamanho máximo de<br /> arquivo de 10 MB.</>}
        accept="image/jpeg,image/png,image/webp"
        onFile={(file) => {
          void (async () => {
            setAvatarError(null);
            if (file.size > 10 * 1024 * 1024) {
              setAvatarError("A foto de perfil deve possuir no máximo 10 MB.");
              return;
            }
            if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
              setAvatarError("Use uma foto JPEG, PNG ou WebP.");
              return;
            }
            try {
              const dimensions = await imageDimensions(file);
              if (dimensions.width < 400 || dimensions.height < 400) {
                setAvatarError("A foto de perfil deve ter pelo menos 400 × 400 px.");
                return;
              }
            } catch {
              setAvatarError("Não foi possível ler esta imagem. Escolha outro arquivo.");
              return;
            }
            if (value.avatarPreviewUrl) URL.revokeObjectURL(value.avatarPreviewUrl);
            onChange({ avatarFile: file, avatarPreviewUrl: URL.createObjectURL(file) });
          })();
        }}
        onClear={() => {
          if (value.avatarPreviewUrl) URL.revokeObjectURL(value.avatarPreviewUrl);
          onChange({ avatarFile: null, avatarPreviewUrl: null });
        }}
      />
      {avatarError && <p className="registration-form-error registration-form-error--upload" role="alert">{avatarError}</p>}

      <div className="registration-fields">
        <TextField id="registration-first-name" label="Primeiro nome" placeholder="Digite seu nome" value={value.firstName} onChange={(e) => onChange({ firstName: e.target.value })} autoComplete="given-name" />
        <TextField id="registration-last-name" label="Sobrenome" placeholder="Digite seu sobrenome" value={value.lastName} onChange={(e) => onChange({ lastName: e.target.value })} autoComplete="family-name" />
        <TextField id="registration-email" label="Email" placeholder="nomeemail@gmail.com" type="email" value={value.email} onChange={(e) => onChange({ email: e.target.value })} autoComplete="email" />

        <label className="registration-field" htmlFor="registration-phone">
          <span>Número de telefone</span>
          <span className="registration-phone">
            <span className="registration-phone__country"><span aria-hidden="true">🇧🇷</span><select aria-label="Código do país" value={value.phoneCountryCode} onChange={(e) => onChange({ phoneCountryCode: e.target.value })}><option value="+55">+55</option></select><span className="registration-phone__chevron">⌄</span></span>
            <input id="registration-phone" placeholder="Insira o número" inputMode="tel" value={value.phoneNumber} onChange={(e) => onChange({ phoneNumber: e.target.value.replace(/[^\d\s()+-]/g, "") })} autoComplete="tel-national" />
          </span>
        </label>

        <label className="registration-field registration-password" htmlFor="registration-password">
          <span>Criar nova senha</span>
          <span className="registration-password__control">
            <input id="registration-password" type={showPassword ? "text" : "password"} placeholder="Criar nova senha" value={value.password} onChange={(e) => onChange({ password: e.target.value })} autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}><EyeIcon /></button>
          </span>
        </label>
      </div>

      <div className="password-rules" aria-label="Requisitos da senha">
        {rules.map((rule) => <span className={rule.ok ? "is-valid" : ""} key={rule.label}><CheckIcon />{rule.label}</span>)}
      </div>

      {errorMessage && (
        <p className="registration-form-error" role="alert">
          {errorMessage}
        </p>
      )}

      <button
        className="registration-primary"
        type="button"
        disabled={!canContinue || isSubmitting}
        onClick={onContinue}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? "Criando conta..." : "Continuar"}
      </button>
    </section>
  );
}
