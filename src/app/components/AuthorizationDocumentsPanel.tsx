import { useCallback, useEffect, useMemo, useState } from "react";
import { DocumentIcon } from "../icons";
import { AppApiError } from "../../services/appApi";
import {
  cancelAuthorizationSignaturePreparation,
  generateAuthorizationDocument,
  listAuthorizationDocuments,
  listAuthorizationSignatureRequests,
  prepareAuthorizationSignature,
  type AuthorizationDocumentItem,
  type AuthorizationSignatureRequestItem,
  type PortfolioAuthorizationEditableStatus,
} from "../../services/authorizationsApi";

interface Props {
  organizationId: string;
  authorizationId: string;
  canGenerate: boolean;
  dirty: boolean;
  authorizationStatus: PortfolioAuthorizationEditableStatus;
  onGenerated: () => void | Promise<void>;
}

function bytesLabel(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
function dateTimeLabel(value: string): string { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function signatureLabel(status: AuthorizationDocumentItem["signature"]["status"]): string {
  return ({ not_requested: "Não solicitada", pending: "Pendente", signed: "Assinado eletronicamente", failed: "Falhou", canceled: "Cancelada" } as const)[status];
}
function requestStatusLabel(status: AuthorizationSignatureRequestItem["status"]): string {
  return ({ prepared: "Preparada", pending: "Enviada ao provedor", signed: "Concluída", failed: "Falhou", canceled: "Cancelada" } as const)[status];
}

export function AuthorizationDocumentsPanel({ organizationId, authorizationId, canGenerate, dirty, authorizationStatus, onGenerated }: Props) {
  const [items, setItems] = useState<AuthorizationDocumentItem[]>([]);
  const [requests, setRequests] = useState<AuthorizationSignatureRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [signatureBusyId, setSignatureBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [documents, signatureRequests] = await Promise.all([
        listAuthorizationDocuments(organizationId, authorizationId),
        listAuthorizationSignatureRequests(organizationId, authorizationId),
      ]);
      setItems(documents); setRequests(signatureRequests);
    } catch (loadError) { setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as versões e preparações de assinatura."); }
    finally { setLoading(false); }
  }, [organizationId, authorizationId]);
  useEffect(() => { void load(); }, [load]);

  const requestsByDocument = useMemo(() => {
    const result = new Map<string, AuthorizationSignatureRequestItem[]>();
    for (const request of requests) result.set(request.document.id, [...(result.get(request.document.id) ?? []), request]);
    return result;
  }, [requests]);
  const hasActiveRequest = requests.some((request) => request.status === "prepared" || request.status === "pending");

  async function generate() {
    if (dirty) { setError("Salve as alterações da autorização antes de gerar uma nova versão do PDF."); return; }
    if (hasActiveRequest) { setError("Cancele a preparação de assinatura ativa antes de gerar uma nova versão do documento."); return; }
    if (generating) return;
    setGenerating(true); setError(null); setSuccess(null);
    try {
      const created = await generateAuthorizationDocument(organizationId, authorizationId);
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSuccess(`Versão ${created.version} gerada e armazenada com hash SHA-256.`);
      await onGenerated();
    } catch (generateError) { setError(generateError instanceof AppApiError ? generateError.message : "Não foi possível gerar o PDF agora."); }
    finally { setGenerating(false); }
  }

  async function prepare(document: AuthorizationDocumentItem) {
    if (dirty) { setError("Salve as alterações da autorização antes de preparar a assinatura."); return; }
    if (signatureBusyId) return;
    setSignatureBusyId(document.id); setError(null); setSuccess(null);
    try {
      const created = await prepareAuthorizationSignature(organizationId, authorizationId, document.id);
      setRequests((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSuccess(`Assinatura preparada para ${created.signers.length} signatário(s). O envio será habilitado quando o provedor for configurado.`);
      await onGenerated();
    } catch (prepareError) { setError(prepareError instanceof AppApiError ? prepareError.message : "Não foi possível preparar a assinatura eletrônica."); }
    finally { setSignatureBusyId(null); }
  }

  async function cancel(request: AuthorizationSignatureRequestItem) {
    if (signatureBusyId) return;
    setSignatureBusyId(request.id); setError(null); setSuccess(null);
    try {
      const canceled = await cancelAuthorizationSignaturePreparation(organizationId, authorizationId, request.id);
      setRequests((current) => current.map((item) => item.id === canceled.id ? canceled : item));
      setSuccess("Preparação de assinatura cancelada. A versão PDF continua preservada.");
      await onGenerated();
    } catch (cancelError) { setError(cancelError instanceof AppApiError ? cancelError.message : "Não foi possível cancelar a preparação de assinatura."); }
    finally { setSignatureBusyId(null); }
  }

  return <section className="app-data-card app-authorization-documents">
    <header className="app-card-header"><div><DocumentIcon/><strong>Documento e assinatura</strong></div>{canGenerate && <button type="button" className="app-primary-button app-primary-button--compact" onClick={() => void generate()} disabled={generating || hasActiveRequest}>{generating ? "Gerando PDF..." : "+ Gerar nova versão PDF"}</button>}</header>
    <div className="app-authorization-document-intro"><p>Cada geração cria um PDF imutável com identificador, data/hora, responsável e hash SHA-256. Uma nova geração nunca sobrescreve versões anteriores.</p><span>Assinatura eletrônica: preparação e snapshot de signatários ativos. O envio externo permanece bloqueado até a escolha/configuração do provedor.</span></div>
    {(authorizationStatus === "signed" || authorizationStatus === "active") && <div className="app-document-warning">O status operacional da autorização não equivale a uma assinatura eletrônica. A evidência digital será vinculada à versão assinada quando um provedor for conectado.</div>}
    {error && <div className="app-inline-error">{error}</div>}{success && <div className="app-inline-success">{success}</div>}
    {loading ? <div className="app-soft-empty"><span className="app-spinner"/>Carregando versões...</div> : !items.length ? <div className="app-soft-empty">Nenhum PDF gerado ainda. Salve as condições atuais e gere a primeira versão quando estiver pronta para revisão.</div> : <div className="app-authorization-document-list">{items.map((item, index) => {
      const documentRequests = requestsByDocument.get(item.id) ?? [];
      const activeForDocument = documentRequests.find((request) => request.status === "prepared" || request.status === "pending");
      const latestRequest = documentRequests[0];
      const canPrepare = canGenerate && index === 0 && !hasActiveRequest && item.signature.status !== "pending" && item.signature.status !== "signed";
      return <article key={item.id} className="app-document-with-signature">
        <div className="app-document-version"><strong>V{String(item.version).padStart(2, "0")}</strong><span>{item.identifier}</span></div>
        <div><span>Gerado em</span><strong>{dateTimeLabel(item.generatedAt)}</strong><small>{item.generatedBy?.displayName ?? "Sistema"} · {bytesLabel(item.sizeBytes)}</small></div>
        <div><span>Integridade SHA-256</span><code title={item.sha256}>{item.sha256.slice(0, 20)}…</code><small>Hash do PDF armazenado</small></div>
        <div><span>Assinatura</span><strong>{activeForDocument ? requestStatusLabel(activeForDocument.status) : latestRequest ? requestStatusLabel(latestRequest.status) : signatureLabel(item.signature.status)}</strong><small>{activeForDocument?.provider ?? item.signature.provider ?? "Sem provedor conectado"}</small></div>
        <div className="app-document-actions"><a className="app-secondary-button" href={item.viewUrl} target="_blank" rel="noreferrer">Visualizar</a><a className="app-secondary-button" href={item.downloadUrl}>Baixar PDF</a>{canPrepare && <button type="button" className="app-secondary-button" onClick={() => void prepare(item)} disabled={signatureBusyId === item.id}>{signatureBusyId === item.id ? "Preparando..." : "Preparar assinatura"}</button>}</div>
        {latestRequest && <div className="app-signature-preparation"><div className="app-signature-preparation-heading"><div><strong>Solicitação {requestStatusLabel(latestRequest.status).toLowerCase()}</strong><span>Preparada em {dateTimeLabel(latestRequest.createdAt)} por {latestRequest.createdBy?.displayName ?? "Sistema"}</span></div>{latestRequest.status === "prepared" && canGenerate && <button type="button" className="app-text-danger-button" onClick={() => void cancel(latestRequest)} disabled={signatureBusyId === latestRequest.id}>{signatureBusyId === latestRequest.id ? "Cancelando..." : "Cancelar preparação"}</button>}</div><div className="app-signature-signers">{latestRequest.signers.map((signer) => <div key={signer.id}><span>{signer.signingOrder}</span><div><strong>{signer.name}</strong><small>{signer.email}</small></div><em>{signer.status === "pending" ? "Aguardando" : signer.status}</em></div>)}</div>{latestRequest.status === "prepared" && <p className="app-signature-provider-note">Nenhum documento foi enviado para terceiros. Esta preparação apenas congela a versão e os signatários que serão usados pela futura integração.</p>}{latestRequest.failure?.message && <p className="app-signature-failure">{latestRequest.failure.message}</p>}</div>}
      </article>;
    })}</div>}
  </section>;
}
