import { useState } from "react";
import { LegalModal, type LegalDocument } from "./LegalModal";
import { legalDocuments, dataDeletionPath } from "./LegalContent";

export function LegalNotice() {
  const [openDocument, setOpenDocument] = useState<LegalDocument | null>(null);

  return (
    <>
      <p className="legal">
        Ao clicar em Prosseguir você concorda com os{" "}
        <button type="button" className="legal__link" onClick={() => setOpenDocument("terms")}>Termos de Uso</button>
        {" "}e a{" "}
        <button type="button" className="legal__link" onClick={() => setOpenDocument("privacy")}>Política de Privacidade</button>.
        <br />
        <a className="legal__link" href={legalDocuments.terms.path} target="_blank" rel="noopener noreferrer">Termos em página própria</a>{" · "}
        <a className="legal__link" href={legalDocuments.privacy.path} target="_blank" rel="noopener noreferrer">Política em página própria</a>{" · "}
        <a className="legal__link" href={dataDeletionPath} target="_blank" rel="noopener noreferrer">Exclusão de dados</a>{" (links abrem em nova aba)"}
      </p>
      {openDocument && <LegalModal document={openDocument} onClose={() => setOpenDocument(null)} />}
    </>
  );
}
