export type RegistrationStep = 1 | 2 | 3 | 4 | 5;

export interface RegistrationFormState {
  avatarFile: File | null;
  avatarPreviewUrl: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phoneCountryCode: string;
  phoneNumber: string;
  cpf: string;
  accessKey: string;
  password: string;
  companyName: string;
  marketProfile: string;
  jobRole: string;
  primaryFocus: string;
  intendedUses: string[];
  operationLogoFile: File | null;
  operationLogoPreviewUrl: string | null;
  operationName: string;
  operationDescription: string;
  teamEmails: string[];
}

export const initialRegistrationFormState: RegistrationFormState = {
  avatarFile: null,
  avatarPreviewUrl: null,
  firstName: "",
  lastName: "",
  email: "",
  phoneCountryCode: "+55",
  phoneNumber: "",
  cpf: "",
  accessKey: "",
  password: "",
  companyName: "",
  marketProfile: "",
  jobRole: "",
  primaryFocus: "",
  intendedUses: [],
  operationLogoFile: null,
  operationLogoPreviewUrl: null,
  operationName: "",
  operationDescription: "",
  teamEmails: ["", "", ""],
};
