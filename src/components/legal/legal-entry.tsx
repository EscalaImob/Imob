import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LegalPage } from "./LegalPage";
import "./legal-page.css";

const root = document.getElementById("root");
const legalDocument = root?.dataset.legalDocument;
if (!root || (legalDocument !== "terms" && legalDocument !== "privacy" && legalDocument !== "deletion")) {
  throw new Error("Entrada jurídica inválida.");
}
createRoot(root).render(<StrictMode><LegalPage document={legalDocument} /></StrictMode>);
