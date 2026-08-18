import type { RegistrationFormState } from "../types";

interface Props {
  value: RegistrationFormState;
  onChange: (patch: Partial<RegistrationFormState>) => void;
  onInvite: () => void;
  onSkip: () => void;
  isSubmitting: boolean;
  errorMessage: string | null;
}

export function TeamStep({
  value,
  onChange,
  onInvite,
  onSkip,
  isSubmitting,
  errorMessage,
}: Props) {
  const updateEmail = (index: number, email: string) =>
    onChange({
      teamEmails: value.teamEmails.map((current, currentIndex) =>
        currentIndex === index ? email : current,
      ),
    });

  const hasInvitationEmail = value.teamEmails.some(
    (email) => email.trim().length > 0,
  );

  return (
    <section className="registration-card registration-card--team">
      <header className="registration-card__header">
        <h2>Adicionar equipe</h2>
        <p>
          Convide as pessoas que fazem parte da sua operação para trabalhar com
          você na Escala IMOB. Você também poderá fazer isso depois.
        </p>
      </header>

      <div className="team-email-list">
        {value.teamEmails.map((email, index) => (
          <input
            key={index}
            type="email"
            placeholder="E-mail do membro da equipe"
            value={email}
            onChange={(event) => updateEmail(index, event.target.value)}
            aria-label={`E-mail do membro ${index + 1}`}
            disabled={isSubmitting}
          />
        ))}
      </div>

      <button
        className="team-add-button"
        type="button"
        onClick={() => onChange({ teamEmails: [...value.teamEmails, ""] })}
        disabled={isSubmitting}
      >
        + Adicionar outra pessoa
      </button>

      {errorMessage && (
        <p className="registration-form-error" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="registration-card__actions registration-card__actions--stacked">
        <button
          className="registration-primary"
          type="button"
          onClick={onInvite}
          disabled={isSubmitting || !hasInvitationEmail}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? "Enviando..." : "Enviar convites"}
        </button>
        <button
          className="registration-secondary"
          type="button"
          onClick={onSkip}
          disabled={isSubmitting}
        >
          Fazer isso depois
        </button>
      </div>
    </section>
  );
}
