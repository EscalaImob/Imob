import type { RegistrationFormState } from "../types";
import { intendedUseOptions, jobRoleOptions, marketProfileOptions, primaryFocusOptions } from "../options";
import { SelectField, TextField } from "../components/FormControls";

interface Props {
  value: RegistrationFormState;
  onChange: (patch: Partial<RegistrationFormState>) => void;
  onContinue: () => void;
  onSkip: () => void;
}

export function PreferencesStep({ value, onChange, onContinue, onSkip }: Props) {
  const toggleUse = (option: string) => onChange({ intendedUses: value.intendedUses.includes(option) ? value.intendedUses.filter((item) => item !== option) : [...value.intendedUses, option] });

  return (
    <section className="registration-card registration-card--preferences">
      <header className="registration-card__header">
        <h2>Conte um pouco sobre sua atuação</h2>
        <p>Essas informações nos ajudam a personalizar sua experiência na Escala IMOB de acordo com o seu perfil e sua atuação no mercado imobiliário.</p>
      </header>

      <div className="registration-fields registration-fields--compact">
        <TextField id="registration-company" label="Empresa/organização" placeholder="Insira o nome" value={value.companyName} onChange={(e) => onChange({ companyName: e.target.value })} />
        <SelectField id="registration-market-profile" label="Como você atua no mercado imobiliário?" placeholder="Selecione seu perfil" options={marketProfileOptions} value={value.marketProfile} onChange={(e) => onChange({ marketProfile: e.target.value })} />
        <SelectField id="registration-job-role" label="Qual é a sua função?" placeholder="Qual é a sua função?" options={jobRoleOptions} value={value.jobRole} onChange={(e) => onChange({ jobRole: e.target.value })} />
        <SelectField id="registration-primary-focus" label="Qual é o seu principal foco de atuação?" placeholder="Selecione uma opção" options={primaryFocusOptions} value={value.primaryFocus} onChange={(e) => onChange({ primaryFocus: e.target.value })} />
      </div>

      <fieldset className="registration-chips">
        <legend>Como você pretende usar a Escala IMOB?</legend>
        <div>
          {intendedUseOptions.map((option) => (
            <button key={option} type="button" className={value.intendedUses.includes(option) ? "is-selected" : ""} aria-pressed={value.intendedUses.includes(option)} onClick={() => toggleUse(option)}>{option}</button>
          ))}
        </div>
      </fieldset>

      <div className="registration-card__actions registration-card__actions--stacked">
        <button className="registration-primary" type="button" onClick={onContinue}>Continuar</button>
        <button className="registration-secondary" type="button" onClick={onSkip}>Pular por enquanto</button>
      </div>
    </section>
  );
}
