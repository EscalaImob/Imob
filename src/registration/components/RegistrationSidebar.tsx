import type { RegistrationStep } from "../types";
import { RegistrationLogo } from "./RegistrationLogo";
import { BriefcaseIcon, CardIcon, DocumentIcon, TeamIcon } from "./icons";

const steps = [
  { number: 1, eyebrow: "Passo 1", label: "Crie uma conta", Icon: DocumentIcon },
  { number: 2, eyebrow: "Passo 2", label: "Definir preferências", Icon: BriefcaseIcon },
  { number: 3, eyebrow: "Passo 3", label: "Configurar sua operação", Icon: CardIcon },
  { number: 4, eyebrow: "Passo 4", label: "Adicionar equipe", Icon: TeamIcon },
] as const;

export function RegistrationSidebar({ currentStep }: { currentStep: RegistrationStep }) {
  const visibleStep = Math.min(currentStep, 4);

  return (
    <aside className="registration-sidebar">
      <div className="registration-sidebar__intro">
        <RegistrationLogo />
        <h1>Criar conta</h1>
        <p>Por favor, preencha cada etapa de forma adequada e correta; certifique-se de que não faltam dados.</p>
      </div>

      <nav className="registration-stepper" aria-label="Etapas do cadastro">
        {steps.map(({ number, eyebrow, label, Icon }, index) => {
          const completed = number < visibleStep || currentStep === 5;
          const active = number === visibleStep && currentStep !== 5;
          return (
            <div className={`registration-step ${completed ? "is-completed" : ""} ${active ? "is-active" : ""}`} key={number}>
              {index < steps.length - 1 && <span className="registration-step__line" aria-hidden="true" />}
              <span className="registration-step__icon"><Icon /></span>
              <span className="registration-step__copy">
                <small>{eyebrow}</small>
                <strong>{label}</strong>
              </span>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
