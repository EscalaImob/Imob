import { useEffect } from "react";

import { LegalContent, legalDocuments, dataDeletionPath, type LegalDocument } from "./LegalContent";
export type { LegalDocument } from "./LegalContent";

interface LegalModalProps {
  document: LegalDocument;
  onClose: () => void;
}

export function LegalModal({ document: legalDocument, onClose }: LegalModalProps) {
  const title = legalDocuments[legalDocument].title;
  const titleId = `legal-modal-title-${legalDocument}`;

  useEffect(() => {
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="legal-modal" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="legal-modal__panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="legal-modal__header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="legal-modal__close" onClick={onClose} aria-label={`Fechar ${title}`}>×</button>
        </header>
        <div className="legal-modal__content">
          <LegalContent document={legalDocument} />
          <p><a className="legal__link" href={legalDocuments[legalDocument].path} target="_blank" rel="noopener noreferrer">Abrir documento em página própria (nova aba)</a></p>
          {legalDocument === "privacy" && <p><a className="legal__link" href={dataDeletionPath} target="_blank" rel="noopener noreferrer">Solicitar exclusão de dados (nova aba)</a></p>}
        </div>
      </section>
    </div>
  );
}
