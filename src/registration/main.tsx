import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RegistrationApp } from "./RegistrationApp";
import "./registration.css";

createRoot(document.getElementById("registration-root")!).render(
  <StrictMode>
    <RegistrationApp />
  </StrictMode>,
);
