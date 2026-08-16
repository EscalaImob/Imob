import { useState } from "react";
import fallbackLogo from "../../assets/brand/escala-imob-original.svg";

const registrationLogoPath = "/assets/registration/logo_escala_imob.png";

export function RegistrationLogo() {
  const [source, setSource] = useState(registrationLogoPath);

  return (
    <img
      className="registration-logo"
      src={source}
      alt="Escala IMOB"
      onError={() => setSource(fallbackLogo)}
    />
  );
}
