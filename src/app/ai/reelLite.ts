import type { PropertyDepthMap } from "./browserVision";

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;
const SECONDS_PER_IMAGE = 2.7;
const MAX_IMAGES = 6;
const VIDEO_BITRATE = 5_000_000;
const TRANSITION_FRACTION = 0.18;
const MP4_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc3.42E01E",
  "video/mp4",
] as const;

export interface ReelLiteSource {
  id: string;
  imageUrl: string;
  label: string;
  depth: PropertyDepthMap | null;
}

export interface ReelLiteProgress {
  phase: "loading" | "rendering" | "finalizing";
  progress: number;
  message: string;
}

export interface ReelLiteResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  durationSeconds: number;
  width: number;
  height: number;
  imageCount: number;
}

interface PreparedSource extends ReelLiteSource {
  bitmap: ImageBitmap;
  columnDepth: Float32Array | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeInOut(value: number): number {
  const t = clamp(value, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function mp4MimeType(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
  return MP4_MIME_TYPES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

export function reelLiteSupport(): { supported: boolean; mimeType: string | null; reason: string | null } {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    return { supported: false, mimeType: null, reason: "Este navegador não oferece gravação local de vídeo." };
  }
  const canvas = document.createElement("canvas");
  if (typeof canvas.captureStream !== "function") {
    return { supported: false, mimeType: null, reason: "Este navegador não permite exportar vídeo a partir do canvas." };
  }
  const mimeType = mp4MimeType();
  if (!mimeType) {
    return { supported: false, mimeType: null, reason: "A exportação MP4 do MVP requer Chrome, Edge ou Safari atualizado." };
  }
  return { supported: true, mimeType, reason: null };
}

async function loadBitmap(imageUrl: string): Promise<ImageBitmap> {
  let response: Response;
  try {
    response = await fetch(imageUrl, { cache: "no-store" });
  } catch {
    throw new Error("REEL_IMAGE_FETCH_NETWORK_ERROR");
  }
  if (!response.ok) throw new Error(`REEL_IMAGE_FETCH_FAILED_${response.status}`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("REEL_IMAGE_EMPTY");
  return createImageBitmap(blob);
}

function depthColumns(depth: PropertyDepthMap | null, columnCount = 30): Float32Array | null {
  if (!depth || depth.width < 1 || depth.height < 1 || depth.data.length === 0) return null;
  const values = new Float32Array(columnCount);
  const samplesY = 12;
  for (let column = 0; column < columnCount; column += 1) {
    const depthX = Math.min(depth.width - 1, Math.floor(((column + 0.5) / columnCount) * depth.width));
    let sum = 0;
    for (let sample = 0; sample < samplesY; sample += 1) {
      const depthY = Math.min(depth.height - 1, Math.floor(((sample + 0.5) / samplesY) * depth.height));
      sum += depth.data[depthY * depth.width + depthX] ?? 128;
    }
    values[column] = (sum / samplesY) / 255;
  }
  return values;
}

function drawCover(
  context: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
  zoom: number,
  panX: number,
): void {
  const baseScale = Math.max(width / bitmap.width, height / bitmap.height) * zoom;
  const sourceWidth = width / baseScale;
  const sourceHeight = height / baseScale;
  const travel = Math.max(0, bitmap.width - sourceWidth);
  const sourceX = clamp((bitmap.width - sourceWidth) / 2 + panX * travel * 0.24, 0, Math.max(0, bitmap.width - sourceWidth));
  const sourceY = Math.max(0, (bitmap.height - sourceHeight) / 2);
  context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function roundRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawForeground(
  context: CanvasRenderingContext2D,
  source: PreparedSource,
  progress: number,
): void {
  const { bitmap, columnDepth } = source;
  const frameX = 32;
  const frameY = 136;
  const frameWidth = WIDTH - 64;
  const frameHeight = 940;
  const zoom = 1 + 0.035 * easeInOut(progress);
  const baseScale = Math.min(frameWidth / bitmap.width, frameHeight / bitmap.height) * zoom;
  const drawnWidth = bitmap.width * baseScale;
  const drawnHeight = bitmap.height * baseScale;
  const baseX = frameX + (frameWidth - drawnWidth) / 2;
  const baseY = frameY + (frameHeight - drawnHeight) / 2;
  const movement = (easeInOut(progress) - 0.5) * 2;

  context.save();
  roundRectPath(context, frameX, frameY, frameWidth, frameHeight, 22);
  context.clip();

  // Preenche a área vertical com a própria foto desfocada, evitando faixas pretas
  // quando a imagem original é horizontal, sem sacrificar o enquadramento principal.
  context.save();
  context.filter = "blur(24px) brightness(0.52) saturate(0.9)";
  drawCover(
    context,
    bitmap,
    frameX - 28,
    frameY - 28,
    frameWidth + 56,
    frameHeight + 56,
    1.08,
    movement * 0.4,
  );
  context.restore();
  context.fillStyle = "rgba(5, 8, 16, 0.20)";
  context.fillRect(frameX, frameY, frameWidth, frameHeight);

  if (!columnDepth) {
    context.drawImage(bitmap, baseX + movement * 12, baseY, drawnWidth, drawnHeight);
  } else {
    const columns = columnDepth.length;
    for (let column = 0; column < columns; column += 1) {
      const sx = (column / columns) * bitmap.width;
      const sw = bitmap.width / columns + 1;
      const dx = baseX + (column / columns) * drawnWidth;
      const dw = drawnWidth / columns + 2;
      const depth = columnDepth[column] ?? 0.5;
      const shift = (depth - 0.5) * 34 * movement;
      context.drawImage(bitmap, sx, 0, sw, bitmap.height, dx + shift, baseY, dw, drawnHeight);
    }
  }
  context.restore();

  context.save();
  roundRectPath(context, frameX, frameY, frameWidth, frameHeight, 22);
  context.strokeStyle = "rgba(255,255,255,0.22)";
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number, initialSize: number, minimumSize: number): number {
  for (let size = initialSize; size >= minimumSize; size -= 2) {
    context.font = `800 ${size}px Montserrat, Arial, sans-serif`;
    if (context.measureText(text).width <= maxWidth) return size;
  }
  return minimumSize;
}

function drawOverlay(
  context: CanvasRenderingContext2D,
  title: string,
  source: PreparedSource,
  imageIndex: number,
  imageCount: number,
): void {
  const gradient = context.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "rgba(5,8,16,0.78)");
  gradient.addColorStop(0.18, "rgba(5,8,16,0.02)");
  gradient.addColorStop(0.75, "rgba(5,8,16,0.05)");
  gradient.addColorStop(1, "rgba(5,8,16,0.88)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.fillStyle = "#ffffff";
  const safeTitle = title.trim() || "Imóvel em destaque";
  const size = fitText(context, safeTitle, WIDTH - 88, 42, 28);
  context.font = `800 ${size}px Montserrat, Arial, sans-serif`;
  context.textBaseline = "top";
  context.fillText(safeTitle, 44, 42);

  context.font = "800 31px Montserrat, Arial, sans-serif";
  context.fillText(source.label || "Imóvel", 44, 1110);
  context.font = "600 20px Montserrat, Arial, sans-serif";
  context.fillStyle = "rgba(255,255,255,0.78)";
  context.fillText(`${imageIndex + 1}/${imageCount} · Reel Lite`, 44, 1154);

  context.font = "800 24px Montserrat, Arial, sans-serif";
  context.fillStyle = "#ffffff";
  context.textAlign = "right";
  context.fillText("escala imob", WIDTH - 44, 1198);
  context.textAlign = "left";
}

function drawScene(
  context: CanvasRenderingContext2D,
  source: PreparedSource,
  progress: number,
  title: string,
  imageIndex: number,
  imageCount: number,
  clearFirst = true,
): void {
  context.save();
  if (clearFirst) {
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#090b12";
    context.fillRect(0, 0, WIDTH, HEIGHT);
  }

  context.save();
  context.filter = "blur(34px) brightness(0.58) saturate(0.88)";
  drawCover(context, source.bitmap, -60, -60, WIDTH + 120, HEIGHT + 120, 1.08, (progress - 0.5) * 2);
  context.restore();

  drawForeground(context, source, progress);
  drawOverlay(context, title, source, imageIndex, imageCount);
  context.restore();
}

function safeFilename(title: string): string {
  const value = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase()
    .slice(0, 54);
  return `${value || "imovel"}-reel-lite.mp4`;
}

async function prepareSources(
  sources: ReelLiteSource[],
  onProgress?: (progress: ReelLiteProgress) => void,
): Promise<PreparedSource[]> {
  const selected = sources.slice(0, MAX_IMAGES);
  const prepared: PreparedSource[] = [];
  try {
    for (let index = 0; index < selected.length; index += 1) {
      onProgress?.({
        phase: "loading",
        progress: selected.length ? index / selected.length : 0,
        message: `Preparando foto ${index + 1} de ${selected.length}...`,
      });
      const source = selected[index]!;
      prepared.push({
        ...source,
        bitmap: await loadBitmap(source.imageUrl),
        columnDepth: depthColumns(source.depth),
      });
    }
    return prepared;
  } catch (error) {
    for (const source of prepared) source.bitmap.close();
    throw error;
  }
}

export async function createReelLiteMp4(
  sources: ReelLiteSource[],
  title: string,
  onProgress?: (progress: ReelLiteProgress) => void,
): Promise<ReelLiteResult> {
  const support = reelLiteSupport();
  if (!support.supported || !support.mimeType) throw new Error("REEL_MP4_UNSUPPORTED");
  if (sources.length === 0) throw new Error("REEL_NO_IMAGES");

  const prepared = await prepareSources(sources, onProgress);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    for (const source of prepared) source.bitmap.close();
    throw new Error("REEL_CANVAS_UNAVAILABLE");
  }

  const stream = canvas.captureStream(FPS);
  const chunks: BlobPart[] = [];
  let recorderError: Error | null = null;
  const recorder = new MediaRecorder(stream, {
    mimeType: support.mimeType,
    videoBitsPerSecond: VIDEO_BITRATE,
  });
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener("error", (event) => {
    const candidate = event as Event & { error?: DOMException };
    recorderError = candidate.error ?? new Error("REEL_RECORDER_ERROR");
  });

  const durationSeconds = prepared.length * SECONDS_PER_IMAGE;
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
  let lastReported = -1;

  try {
    drawScene(context, prepared[0]!, 0, title, 0, prepared.length);
    recorder.start(750);
    const startedAt = performance.now();

    await new Promise<void>((resolve) => {
      const render = (now: number) => {
        const elapsed = Math.min(durationSeconds, (now - startedAt) / 1000);
        const rawIndex = Math.min(prepared.length - 1, Math.floor(elapsed / SECONDS_PER_IMAGE));
        const sceneStart = rawIndex * SECONDS_PER_IMAGE;
        const sceneProgress = clamp((elapsed - sceneStart) / SECONDS_PER_IMAGE, 0, 1);
        drawScene(context, prepared[rawIndex]!, sceneProgress, title, rawIndex, prepared.length);

        // Faz crossfade direto entre cenas. Além de ficar mais fluido, isso evita
        // quadros totalmente pretos no início e nas trocas de foto.
        if (rawIndex < prepared.length - 1 && sceneProgress > 1 - TRANSITION_FRACTION) {
          const transitionProgress = easeInOut(
            (sceneProgress - (1 - TRANSITION_FRACTION)) / TRANSITION_FRACTION,
          );
          context.save();
          context.globalAlpha = transitionProgress;
          drawScene(
            context,
            prepared[rawIndex + 1]!,
            transitionProgress * 0.12,
            title,
            rawIndex + 1,
            prepared.length,
            false,
          );
          context.restore();
        }

        const percent = Math.min(100, Math.floor((elapsed / durationSeconds) * 100));
        if (percent !== lastReported) {
          lastReported = percent;
          onProgress?.({ phase: "rendering", progress: percent / 100, message: `Renderizando Reel Lite · ${percent}%` });
        }
        if (elapsed >= durationSeconds) {
          resolve();
          return;
        }
        requestAnimationFrame(render);
      };
      requestAnimationFrame(render);
    });

    onProgress?.({ phase: "finalizing", progress: 1, message: "Finalizando MP4..." });
    recorder.stop();
    await stopped;
    if (recorderError) throw recorderError;
    const blob = new Blob(chunks, { type: support.mimeType });
    if (blob.size === 0) throw new Error("REEL_EMPTY_OUTPUT");
    return {
      blob,
      filename: safeFilename(title),
      mimeType: support.mimeType,
      durationSeconds,
      width: WIDTH,
      height: HEIGHT,
      imageCount: prepared.length,
    };
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
    for (const track of stream.getTracks()) track.stop();
    for (const source of prepared) source.bitmap.close();
  }
}
