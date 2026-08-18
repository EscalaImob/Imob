import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DocumentIcon } from "../icons";
import { AppApiError } from "../../services/appApi";
import {
  CORPORATE_INSPECTION_EVIDENCE_DOCUMENT_MAX_BYTES,
  CORPORATE_INSPECTION_EVIDENCE_IMAGE_MAX_BYTES,
  CORPORATE_INSPECTION_EVIDENCE_MAX_COUNT,
  CORPORATE_INSPECTION_EVIDENCE_VIDEO_MAX_BYTES,
  confirmCorporateInspectionEvidence,
  createCorporateInspectionEvidenceUpload,
  deleteCorporateInspectionEvidence,
  listCorporateInspectionEvidences,
  uploadCorporateInspectionEvidenceFile,
  type CorporateInspectionEnvironment,
  type CorporateInspectionEvidenceContentType,
  type CorporateInspectionEvidenceItem,
  type CorporateInspectionStatus,
} from "../../services/inspectionsApi";

interface Props {
  organizationId: string;
  inspectionId: string;
  status: CorporateInspectionStatus;
  checklist: CorporateInspectionEnvironment[];
  canUpdate: boolean;
  onChanged?: () => void | Promise<void>;
}

const allowedTypes = new Set<CorporateInspectionEvidenceContentType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "application/pdf",
]);

function maxBytes(contentType: CorporateInspectionEvidenceContentType) {
  if (contentType.startsWith("image/")) return CORPORATE_INSPECTION_EVIDENCE_IMAGE_MAX_BYTES;
  if (contentType.startsWith("video/")) return CORPORATE_INSPECTION_EVIDENCE_VIDEO_MAX_BYTES;
  return CORPORATE_INSPECTION_EVIDENCE_DOCUMENT_MAX_BYTES;
}

function sizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(item: CorporateInspectionEvidenceItem) {
  if (item.kind === "photo") return "Foto";
  if (item.kind === "video") return "Vídeo";
  return "Documento";
}

function targetValue(environmentId: string | null, itemId: string | null) {
  if (itemId && environmentId) return `item|${environmentId}|${itemId}`;
  if (environmentId) return `env|${environmentId}`;
  return "general";
}

function decodeTarget(value: string) {
  if (value.startsWith("item|")) {
    const [, environmentId = "", itemId = ""] = value.split("|");
    return { environmentId: environmentId || null, itemId: itemId || null };
  }
  if (value.startsWith("env|")) return { environmentId: value.slice(4) || null, itemId: null };
  return { environmentId: null, itemId: null };
}

export function InspectionEvidencesPanel({ organizationId, inspectionId, status, checklist, canUpdate, onChanged }: Props) {
  const [items, setItems] = useState<CorporateInspectionEvidenceItem[]>([]);
  const [target, setTarget] = useState("general");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const immutable = status === "completed";
  const canManage = canUpdate && !immutable;

  const targetOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [{ value: "general", label: "Laudo geral" }];
    for (const environment of checklist) {
      options.push({ value: `env|${environment.id}`, label: `Ambiente · ${environment.name}` });
      for (const item of environment.items) {
        options.push({ value: `item|${environment.id}|${item.id}`, label: `${environment.name} · ${item.name}` });
      }
    }
    return options;
  }, [checklist]);

  useEffect(() => {
    if (!targetOptions.some((option) => option.value === target)) setTarget("general");
  }, [target, targetOptions]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listCorporateInspectionEvidences(organizationId, inspectionId));
    } catch (loadError) {
      setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as evidências.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, inspectionId]);

  useEffect(() => { void load(); }, [load]);

  function targetLabel(item: CorporateInspectionEvidenceItem) {
    const option = targetOptions.find((candidate) => candidate.value === targetValue(item.environmentId, item.itemId));
    return option?.label ?? "Vínculo anterior";
  }

  async function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || busy || !canManage) return;
    const available = CORPORATE_INSPECTION_EVIDENCE_MAX_COUNT - items.length;
    if (available <= 0) {
      setError(`Este laudo já possui o limite de ${CORPORATE_INSPECTION_EVIDENCE_MAX_COUNT} evidências.`);
      return;
    }
    const selected = files.slice(0, available);
    for (const file of selected) {
      if (!allowedTypes.has(file.type as CorporateInspectionEvidenceContentType)) {
        setError(`${file.name}: use JPG, PNG, WEBP, MP4, WEBM ou PDF.`);
        return;
      }
      const type = file.type as CorporateInspectionEvidenceContentType;
      if (file.size <= 0 || file.size > maxBytes(type)) {
        setError(`${file.name}: o arquivo excede o limite permitido para este tipo.`);
        return;
      }
    }

    setBusy(true);
    setError(null);
    const selectedTarget = decodeTarget(target);
    try {
      let latest = items;
      for (const [index, file] of selected.entries()) {
        setProgress(`Enviando ${index + 1} de ${selected.length}: ${file.name}`);
        const ready = await createCorporateInspectionEvidenceUpload(organizationId, inspectionId, file);
        await uploadCorporateInspectionEvidenceFile(ready, file);
        latest = await confirmCorporateInspectionEvidence(organizationId, inspectionId, ready, file, selectedTarget);
        setItems(latest);
      }
      await onChanged?.();
    } catch (uploadError) {
      setError(uploadError instanceof AppApiError ? uploadError.message : "Não foi possível enviar uma das evidências.");
      await load();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function remove(item: CorporateInspectionEvidenceItem) {
    if (!canManage || busy || !globalThis.confirm(`Remover a evidência “${item.originalName}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      setItems(await deleteCorporateInspectionEvidence(organizationId, inspectionId, item.id));
      await onChanged?.();
    } catch (removeError) {
      setError(removeError instanceof AppApiError ? removeError.message : "Não foi possível remover a evidência.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="app-data-card app-inspection-evidences-card">
      <header className="app-card-header">
        <div>
          <DocumentIcon />
          <strong>Evidências</strong>
          <small>{items.length} de {CORPORATE_INSPECTION_EVIDENCE_MAX_COUNT} arquivo(s) · fotos, vídeos e PDF privados</small>
        </div>
        {canManage && (
          <div className="app-inspection-evidence-upload-actions">
            <label>
              <span>Vincular novos arquivos a</span>
              <select value={target} onChange={(event) => setTarget(event.target.value)} disabled={busy}>
                {targetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <input ref={inputRef} className="app-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf" multiple onChange={(event) => void chooseFiles(event)} />
            <button type="button" className="app-primary-button" disabled={busy || items.length >= CORPORATE_INSPECTION_EVIDENCE_MAX_COUNT} onClick={() => inputRef.current?.click()}>+ Adicionar evidências</button>
          </div>
        )}
      </header>
      <div className="app-inspection-evidences-body">
        {immutable && <div className="app-inline-success">As evidências deste laudo concluído estão preservadas e não podem mais ser alteradas.</div>}
        {error && <div className="app-inline-error">{error}</div>}
        {progress && <div className="app-property-uploading"><span className="app-spinner" />{progress}</div>}
        {loading ? (
          <div className="app-table-empty"><span className="app-spinner" />Carregando evidências...</div>
        ) : !items.length ? (
          <button type="button" className="app-inspection-evidence-empty" disabled={!canManage || busy} onClick={() => inputRef.current?.click()}>
            <DocumentIcon />
            <strong>Nenhuma evidência adicionada</strong>
            <span>Adicione fotos, vídeos ou PDF e vincule ao laudo, a um ambiente ou a um item do checklist.</span>
          </button>
        ) : (
          <div className="app-inspection-evidence-grid">
            {items.map((item) => (
              <article key={item.id}>
                <div className={`app-inspection-evidence-preview is-${item.kind}`}>
                  {item.kind === "photo" ? (
                    <a href={item.viewUrl} target="_blank" rel="noreferrer"><img src={item.viewUrl} alt={item.caption || item.originalName} /></a>
                  ) : item.kind === "video" ? (
                    <video controls preload="metadata" src={item.viewUrl} />
                  ) : (
                    <a href={item.viewUrl} target="_blank" rel="noreferrer"><DocumentIcon /><span>Abrir PDF</span></a>
                  )}
                  <span className="app-inspection-evidence-kind">{kindLabel(item)}</span>
                </div>
                <div className="app-inspection-evidence-meta">
                  <strong title={item.originalName}>{item.originalName}</strong>
                  <span>{targetLabel(item)}</span>
                  <small>{sizeLabel(item.sizeBytes)} · V{String(item.inspectionVersion).padStart(2, "0")} · {item.createdBy?.displayName ?? "Sistema"}</small>
                </div>
                <div className="app-inspection-evidence-actions">
                  <a href={item.viewUrl} target="_blank" rel="noreferrer">Visualizar</a>
                  <a href={item.downloadUrl}>Baixar</a>
                  {canManage && <button type="button" className="is-danger" disabled={busy} onClick={() => void remove(item)}>Remover</button>}
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="app-inspection-evidences-help">Cada evidência registra a versão do laudo existente no momento do envio. Esses metadados serão reutilizados no documento final e no ciclo de assinatura.</p>
      </div>
    </section>
  );
}
