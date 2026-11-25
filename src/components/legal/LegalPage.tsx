import brandLogo from "../../assets/brand/escala-imob-white.png";
import { LegalContent, legalDocuments, dataDeletionPath, WHATSAPP_DISPLAY, type LegalDocument } from "./LegalContent";

export type PublicLegalDocument = LegalDocument | "deletion";

function DeletionInstructions() {
  return <>
    <p>Esta página orienta como solicitar a exclusão de dados pessoais. A solicitação não é uma exclusão automática.</p>
    <h2>Como solicitar</h2>
    <ol>
      <li>Entre em contato pelo canal de privacidade publicado na Política de Privacidade: WhatsApp <strong>{WHATSAPP_DISPLAY}</strong>.</li>
      <li>Informe que deseja solicitar a exclusão de dados e indique, de forma sucinta, se a solicitação se refere ao site, ao diagnóstico ou a uma integração com a plataforma. Não envie senhas, tokens ou documentos sensíveis nesta mensagem inicial.</li>
      <li>A solicitação deverá ser analisada pelo responsável pelo tratamento. Poderá ser necessário confirmar sua identidade e esclarecer quais dados estão envolvidos.</li>
    </ol>
    <h2>Análise da solicitação</h2>
    <p>A exclusão será avaliada conforme aplicável, considerando os direitos do titular e as hipóteses legais de conservação. Esta página não coleta dados nem executa a exclusão.</p>
    <p>Desconectar ou revogar uma integração não equivale à exclusão dos dados anteriormente tratados. Se necessário, solicite a análise desses dados pelo canal acima.</p>
    <p>Consulte a <a href={legalDocuments.privacy.path}>Política de Privacidade</a> para informações sobre o tratamento e os direitos nela descritos.</p>
  </>;
}

export function LegalPage({ document }: { document: PublicLegalDocument }) {
  const title = document === "deletion" ? "Exclusão de dados" : legalDocuments[document].title;
  return <>
    <header className="legal-page__header">
      <a href="/" aria-label="Escala IMOB — início"><img src={brandLogo} alt="Escala IMOB" /></a>
      <a href="/">Voltar ao site</a>
    </header>
    <main className="legal-page__main" aria-labelledby="legal-page-title">
      <article className="legal-page__article">
        <h1 id="legal-page-title">{title}</h1>
        {document === "deletion" ? <DeletionInstructions /> : <LegalContent document={document} heading="h2" />}
      </article>
      <nav className="legal-page__nav" aria-label="Documentos jurídicos">
        <a href={legalDocuments.privacy.path} aria-current={document === "privacy" ? "page" : undefined}>{legalDocuments.privacy.title}</a>
        <a href={legalDocuments.terms.path} aria-current={document === "terms" ? "page" : undefined}>{legalDocuments.terms.title}</a>
        <a href={dataDeletionPath} aria-current={document === "deletion" ? "page" : undefined}>Exclusão de dados</a>
      </nav>
    </main>
  </>;
}
