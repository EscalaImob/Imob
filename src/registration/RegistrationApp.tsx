import { useCallback, useState } from "react";
import { RegistrationSidebar } from "./components/RegistrationSidebar";
import { AccountStep } from "./steps/AccountStep";
import { DoneStep } from "./steps/DoneStep";
import { OperationStep } from "./steps/OperationStep";
import { PreferencesStep } from "./steps/PreferencesStep";
import { TeamStep } from "./steps/TeamStep";
import { initialRegistrationFormState, type RegistrationFormState, type RegistrationStep } from "./types";

export function RegistrationApp() {
  const [step, setStep] = useState<RegistrationStep>(1);
  const [form, setForm] = useState<RegistrationFormState>(initialRegistrationFormState);
  const patchForm = useCallback((patch: Partial<RegistrationFormState>) => setForm((current) => ({ ...current, ...patch })), []);

  return (
    <main className={`registration-shell registration-shell--step-${step}`}>
      <RegistrationSidebar currentStep={step} />
      <div className="registration-stage">
        {step === 1 && <AccountStep value={form} onChange={patchForm} onContinue={() => setStep(2)} />}
        {step === 2 && <PreferencesStep value={form} onChange={patchForm} onContinue={() => setStep(3)} onSkip={() => setStep(3)} />}
        {step === 3 && <OperationStep value={form} onChange={patchForm} onContinue={() => setStep(4)} onSkip={() => setStep(4)} />}
        {step === 4 && <TeamStep value={form} onChange={patchForm} onFinish={() => setStep(5)} />}
        {step === 5 && <DoneStep />}
      </div>
    </main>
  );
}
