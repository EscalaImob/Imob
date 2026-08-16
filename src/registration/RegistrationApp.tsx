import { useCallback, useState } from "react";
import { RegistrationSidebar } from "./components/RegistrationSidebar";
import { readOnboardingSession, saveOnboardingSession } from "./session";
import { AccountStep } from "./steps/AccountStep";
import { DoneStep } from "./steps/DoneStep";
import { OperationStep } from "./steps/OperationStep";
import { PreferencesStep } from "./steps/PreferencesStep";
import { TeamStep } from "./steps/TeamStep";
import {
  RegistrationApiError,
  registerAccount,
  saveOnboardingPreferences,
} from "../services/registrationApi";
import {
  initialRegistrationFormState,
  type RegistrationFormState,
  type RegistrationStep,
} from "./types";

export function RegistrationApp() {
  const [step, setStep] = useState<RegistrationStep>(1);
  const [form, setForm] = useState<RegistrationFormState>(initialRegistrationFormState);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);

  const patchForm = useCallback((patch: Partial<RegistrationFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setAccountError(null);
    setPreferencesError(null);
  }, []);

  const handleAccountContinue = useCallback(async () => {
    if (isCreatingAccount) return;

    setIsCreatingAccount(true);
    setAccountError(null);

    try {
      const result = await registerAccount({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phoneCountryCode: form.phoneCountryCode,
        phoneNumber: form.phoneNumber,
        password: form.password,
      });

      saveOnboardingSession(result);
      setForm((current) => ({
        ...current,
        email: result.user.email,
        password: "",
      }));
      setStep(2);
    } catch (error) {
      setAccountError(
        error instanceof RegistrationApiError
          ? error.message
          : "Não foi possível criar sua conta. Tente novamente.",
      );
    } finally {
      setIsCreatingAccount(false);
    }
  }, [form, isCreatingAccount]);

  const handlePreferencesContinue = useCallback(
    async (skip: boolean) => {
      if (isSavingPreferences) return;

      const session = readOnboardingSession();

      if (!session || session.expiresAt <= Date.now()) {
        setPreferencesError(
          "Sua sessão de cadastro expirou. Recarregue a página e faça o cadastro novamente.",
        );
        return;
      }

      setIsSavingPreferences(true);
      setPreferencesError(null);

      try {
        const result = await saveOnboardingPreferences(
          skip
            ? { skip: true }
            : {
                companyName: form.companyName,
                marketProfile: form.marketProfile,
                jobRole: form.jobRole,
                primaryFocus: form.primaryFocus,
                intendedUses: form.intendedUses,
              },
          session.accessToken,
        );

        if (!skip) {
          setForm((current) => ({
            ...current,
            companyName: result.preferences.companyName ?? "",
            marketProfile: result.preferences.marketProfile ?? "",
            jobRole: result.preferences.jobRole ?? "",
            primaryFocus: result.preferences.primaryFocus ?? "",
            intendedUses: result.preferences.intendedUses,
          }));
        }

        setStep(3);
      } catch (error) {
        setPreferencesError(
          error instanceof RegistrationApiError
            ? error.message
            : "Não foi possível salvar suas preferências. Tente novamente.",
        );
      } finally {
        setIsSavingPreferences(false);
      }
    },
    [form, isSavingPreferences],
  );

  return (
    <main className={`registration-shell registration-shell--step-${step}`}>
      <RegistrationSidebar currentStep={step} />
      <div className="registration-stage">
        {step === 1 && (
          <AccountStep
            value={form}
            onChange={patchForm}
            onContinue={handleAccountContinue}
            isSubmitting={isCreatingAccount}
            errorMessage={accountError}
          />
        )}
        {step === 2 && (
          <PreferencesStep
            value={form}
            onChange={patchForm}
            onContinue={() => void handlePreferencesContinue(false)}
            onSkip={() => void handlePreferencesContinue(true)}
            isSubmitting={isSavingPreferences}
            errorMessage={preferencesError}
          />
        )}
        {step === 3 && (
          <OperationStep
            value={form}
            onChange={patchForm}
            onContinue={() => setStep(4)}
            onSkip={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <TeamStep
            value={form}
            onChange={patchForm}
            onFinish={() => setStep(5)}
          />
        )}
        {step === 5 && <DoneStep />}
      </div>
    </main>
  );
}
