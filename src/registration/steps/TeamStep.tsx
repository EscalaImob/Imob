import type { RegistrationFormState } from "../types";

interface Props {
  value: RegistrationFormState;
  onChange: (patch: Partial<RegistrationFormState>) => void;
  onFinish: () => void;
}

export function TeamStep({ value, onChange, onFinish }: Props) {
  const updateEmail = (index: number, email: string) => onChange({ teamEmails: value.teamEmails.map((current, currentIndex) => currentIndex === index ? email : current) });

  return (
    <section className="registration-card registration-card--team">
      <header className="registration-card__header">
        <h2>Adicionar equipe</h2>
        <p>Convide as pessoas que fazem parte da sua operação para trabalhar com você na Escala IMOB. Você também poderá fazer isso depois.</p>
      </header>
      <div className="team-email-list">
        {value.teamEmails.map((email, index) => <input key={index} type="email" placeholder="E-mail do membro da equipe" value={email} onChange={(e) => updateEmail(index, e.target.value)} aria-label={`E-mail do membro ${index + 1}`} />)}
      </div>
      <button className="team-add-button" type="button" onClick={() => onChange({ teamEmails: [...value.teamEmails, ""] })}>+ Adicionar outra pessoa</button>
      <div className="registration-card__actions registration-card__actions--stacked">
        <button className="registration-primary" type="button" onClick={onFinish}>Enviar convites</button>
        <button className="registration-secondary" type="button" onClick={onFinish}>Fazer isso depois</button>
      </div>
    </section>
  );
}
