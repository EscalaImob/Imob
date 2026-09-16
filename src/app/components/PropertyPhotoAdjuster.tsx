import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AppApiError } from "../../services/appApi";
import {
  PROPERTY_IMAGE_MAX_BYTES,
  PROPERTY_IMAGE_MAX_COUNT,
  confirmPropertyImage,
  createPropertyImageUpload,
  uploadPropertyImageFile,
  type PropertyImageItem,
} from "../../services/propertiesApi";
import {
  DEFAULT_LOCAL_PHOTO_ADJUSTMENTS,
  exportLocalPhoto,
  loadLocalPhotoBitmap,
  renderLocalPhoto,
  suggestedLocalPhotoAdjustments,
  type LocalPhotoAdjustments,
  type LocalPhotoCrop,
} from "../ai/photoAdjust";
import type { PropertyPhotoQuality } from "../ai/browserVision";

interface Props {
  organizationId: string;
  propertyId: string;
  images: PropertyImageItem[];
  quality: Record<string, PropertyPhotoQuality>;
  canUpdate: boolean;
  onImagesChanged(items: PropertyImageItem[]): void;
}

const cropOptions: Array<{ value: LocalPhotoCrop; label: string }> = [
  { value: "original", label: "Original" },
  { value: "square", label: "Quadrado 1:1" },
  { value: "portrait_4_5", label: "Feed 4:5" },
  { value: "story_9_16", label: "Story / Reel 9:16" },
];

function adjustedFilename(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/u, "").trim().replace(/\s+/gu, "-") || "foto-imovel";
  return `${base}-ajustada.jpg`;
}

export function PropertyPhotoAdjuster({ organizationId, propertyId, images, quality, canUpdate, onImagesChanged }: Props) {
  const [selectedId, setSelectedId] = useState<string>(images.find((image) => image.primary)?.id ?? images[0]?.id ?? "");
  const [adjustments, setAdjustments] = useState<LocalPhotoAdjustments>({ ...DEFAULT_LOCAL_PHOTO_ADJUSTMENTS });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewDimensions, setPreviewDimensions] = useState<{ width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const selected = useMemo(() => images.find((image) => image.id === selectedId) ?? null, [images, selectedId]);
  const selectedQuality = selected ? quality[selected.id] ?? null : null;

  useEffect(() => {
    if (selectedId && images.some((image) => image.id === selectedId)) return;
    setSelectedId(images.find((image) => image.primary)?.id ?? images[0]?.id ?? "");
  }, [images, selectedId]);

  useEffect(() => {
    let active = true;
    bitmapRef.current?.close();
    bitmapRef.current = null;
    setPreviewDimensions(null);
    setSuccess(null);
    if (!selected) return () => { active = false; };
    setLoading(true);
    setError(null);
    void loadLocalPhotoBitmap(selected.viewUrl)
      .then((bitmap) => {
        if (!active) {
          bitmap.close();
          return;
        }
        bitmapRef.current = bitmap;
        const canvas = canvasRef.current;
        if (canvas) setPreviewDimensions(renderLocalPhoto(bitmap, canvas, adjustments, 760));
      })
      .catch(() => { if (active) setError("Não foi possível preparar esta foto para edição local."); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  // A troca da foto precisa recarregar o bitmap; os ajustes são renderizados pelo efeito abaixo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.viewUrl]);

  useEffect(() => {
    const bitmap = bitmapRef.current;
    const canvas = canvasRef.current;
    if (!bitmap || !canvas) return;
    try {
      setPreviewDimensions(renderLocalPhoto(bitmap, canvas, adjustments, 760));
      setError(null);
    } catch {
      setError("Não foi possível atualizar a prévia desta foto.");
    }
  }, [adjustments]);

  function setAdjustment<K extends keyof LocalPhotoAdjustments>(key: K, value: LocalPhotoAdjustments[K]) {
    setAdjustments((current) => ({ ...current, [key]: value }));
    setSuccess(null);
  }

  function applySuggestion() {
    setAdjustments(suggestedLocalPhotoAdjustments(selectedQuality));
    setSuccess(null);
  }

  function reset() {
    setAdjustments({ ...DEFAULT_LOCAL_PHOTO_ADJUSTMENTS });
    setSuccess(null);
    setError(null);
  }

  async function saveCopy() {
    const bitmap = bitmapRef.current;
    if (!selected || !bitmap || saving || !canUpdate) return;
    if (images.length >= PROPERTY_IMAGE_MAX_COUNT) {
      setError(`A galeria já possui o limite de ${PROPERTY_IMAGE_MAX_COUNT} imagens.`);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const output = await exportLocalPhoto(bitmap, adjustments);
      const file = new File([output.blob], adjustedFilename(selected.originalName), { type: output.mimeType });
      if (file.size > PROPERTY_IMAGE_MAX_BYTES) throw new Error("PHOTO_TOO_LARGE");
      const upload = await createPropertyImageUpload(organizationId, propertyId, file);
      await uploadPropertyImageFile(upload, file);
      const updated = await confirmPropertyImage(organizationId, propertyId, upload, file);
      onImagesChanged(updated);
      setSelectedId(upload.imageId);
      setAdjustments({ ...DEFAULT_LOCAL_PHOTO_ADJUSTMENTS });
      setSuccess(`Cópia ajustada salva na galeria em ${output.width} × ${output.height}px. A foto original foi preservada.`);
    } catch (saveError) {
      if (saveError instanceof AppApiError) setError(saveError.message);
      else if (saveError instanceof Error && saveError.message === "PHOTO_TOO_LARGE") setError("A cópia ajustada ficou maior que 12 MB. Reduza o recorte ou tente outra foto.");
      else setError("Não foi possível salvar a cópia ajustada na galeria.");
    } finally {
      setSaving(false);
    }
  }

  if (!selected) return <div className="app-soft-empty">Adicione fotos ao imóvel para usar os ajustes locais.</div>;

  return <div className="app-ai-photo-adjuster">
    <div className="app-ai-photo-adjuster-toolbar">
      <label><span>Foto para ajustar</span><select value={selectedId} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setSelectedId(event.target.value); setAdjustments({ ...DEFAULT_LOCAL_PHOTO_ADJUSTMENTS }); }} disabled={loading || saving}>{images.map((image, index) => <option key={image.id} value={image.id}>{index + 1}. {image.primary ? "Principal · " : ""}{image.originalName}</option>)}</select></label>
      <label><span>Recorte</span><select value={adjustments.crop} onChange={(event: ChangeEvent<HTMLSelectElement>) => setAdjustment("crop", event.target.value as LocalPhotoCrop)} disabled={loading || saving}>{cropOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </div>

    <div className="app-ai-photo-adjuster-layout">
      <div className="app-ai-photo-adjuster-preview">
        <canvas ref={canvasRef} aria-label="Prévia da foto com ajustes locais" />
        {loading && <div className="app-ai-depth-loading"><span className="app-spinner"/>Preparando foto...</div>}
      </div>
      <div className="app-ai-photo-adjuster-controls">
        <label><span>Brilho <strong>{adjustments.brightness > 0 ? `+${adjustments.brightness}` : adjustments.brightness}</strong></span><input type="range" min="-30" max="30" step="1" value={adjustments.brightness} onChange={(event) => setAdjustment("brightness", Number(event.target.value))} disabled={loading || saving}/></label>
        <label><span>Contraste <strong>{adjustments.contrast > 0 ? `+${adjustments.contrast}` : adjustments.contrast}</strong></span><input type="range" min="-30" max="30" step="1" value={adjustments.contrast} onChange={(event) => setAdjustment("contrast", Number(event.target.value))} disabled={loading || saving}/></label>
        <label><span>Nitidez <strong>{adjustments.sharpness.toFixed(1)}</strong></span><input type="range" min="0" max="1.2" step="0.1" value={adjustments.sharpness} onChange={(event) => setAdjustment("sharpness", Number(event.target.value))} disabled={loading || saving}/></label>
        <div className="app-ai-photo-adjuster-info">
          {selectedQuality ? <span>Qualidade analisada: <strong>{selectedQuality.score}/100 · {selectedQuality.label}</strong></span> : <span>Analise as fotos acima para liberar uma sugestão baseada em exposição, contraste e nitidez.</span>}
          {previewDimensions && <small>Prévia {previewDimensions.width} × {previewDimensions.height}px · exportação limitada a 2200px no lado maior.</small>}
        </div>
        <div className="app-ai-photo-adjuster-actions">
          <button type="button" className="app-secondary-button" onClick={applySuggestion} disabled={loading || saving || !selectedQuality}>Aplicar sugestão</button>
          <button type="button" className="app-secondary-button" onClick={reset} disabled={loading || saving}>Restaurar ajustes</button>
          <button type="button" className="app-primary-button" onClick={() => void saveCopy()} disabled={loading || saving || !canUpdate || images.length >= PROPERTY_IMAGE_MAX_COUNT}>{saving ? "Salvando..." : "Salvar cópia na galeria"}</button>
        </div>
      </div>
    </div>
    {success && <div className="app-ai-photo-adjuster-success">{success}</div>}
    {error && <div className="app-inline-error">{error}</div>}
    {!canUpdate && <div className="app-inline-error">Você precisa de permissão para editar o imóvel antes de salvar uma cópia ajustada.</div>}
    <p className="app-ai-privacy-note">Os ajustes são feitos no navegador com Canvas. A foto original nunca é substituída; ao salvar, uma nova imagem é adicionada à galeria privada.</p>
  </div>;
}
