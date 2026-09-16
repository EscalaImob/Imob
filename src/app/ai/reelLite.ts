import type { PropertyDepthMap } from "./browserVision";

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;
const MIN_REEL_SECONDS = 30;
const MAX_REEL_SECONDS = 42;
const CTA_SECONDS = 3;
const MAX_IMAGES = 8;
const VIDEO_BITRATE = 5_000_000;
const AUDIO_BITRATE = 128_000;
const TRANSITION_FRACTION = 0.20;

const MP4_VIDEO_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc3.42E01E",
  "video/mp4",
] as const;

const MP4_AUDIO_MIME_TYPES = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4;codecs="avc3.42E01E,mp4a.40.2"',
] as const;

export type ReelLiteTemplate = "editorial" | "impact";

export interface ReelLiteFacts {
  purpose?: "sale" | "rent" | "sale_rent" | string | null;
  salePrice?: string | null;
  rentPrice?: string | null;
  locationText?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parkingSpaces?: number | null;
  usefulArea?: string | null;
  totalArea?: string | null;
  areaUnit?: string | null;
}

export interface ReelLiteBranding {
  brandName?: string | null;
  logoUrl?: string | null;
  agentName?: string | null;
  useOrganizationBrand?: boolean;
}

export interface ReelLiteOptions {
  title: string;
  template: ReelLiteTemplate;
  soundtrack: boolean;
  facts?: ReelLiteFacts;
  branding?: ReelLiteBranding;
  headline?: string | null;
  ctaText?: string | null;
  supportText?: string | null;
  showPrice?: boolean;
  showLocation?: boolean;
  showSpecs?: boolean;
}

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
  audioIncluded: boolean;
  template: ReelLiteTemplate;
  renderMs: number;
}

export interface ReelLiteSupport {
  supported: boolean;
  mimeType: string | null;
  audioSupported: boolean;
  audioMimeType: string | null;
  reason: string | null;
}

interface PreparedSource extends ReelLiteSource {
  bitmap: ImageBitmap;
  columnDepth: Float32Array | null;
}

interface PreparedBranding {
  brandName: string;
  agentName: string | null;
  logo: ImageBitmap | null;
  poweredByEscala: boolean;
}

interface TemplatePalette {
  accent: string;
  accentSoft: string;
  headline: string;
  eyebrow: string;
}

interface SoundtrackRuntime {
  context: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  start: (durationSeconds: number) => void;
}

const TEMPLATE_PALETTES: Record<ReelLiteTemplate, TemplatePalette> = {
  editorial: {
    accent: "#7c3aed",
    accentSoft: "rgba(124,58,237,0.28)",
    headline: "Seu próximo imóvel começa aqui",
    eyebrow: "ESCALA IMOB · SELEÇÃO",
  },
  impact: {
    accent: "#2f36ff",
    accentSoft: "rgba(47,54,255,0.30)",
    headline: "Descubra um novo jeito de morar",
    eyebrow: "IMÓVEL EM DESTAQUE",
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeInOut(value: number): number {
  const t = clamp(value, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function easeOut(value: number): number {
  const t = clamp(value, 0, 1);
  return 1 - (1 - t) ** 3;
}

function supportedMimeType(candidates: readonly string[]): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(() => reject(new Error(code)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
}

export function reelLiteSupport(): ReelLiteSupport {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    return {
      supported: false,
      mimeType: null,
      audioSupported: false,
      audioMimeType: null,
      reason: "Este navegador não oferece gravação local de vídeo.",
    };
  }
  const canvas = document.createElement("canvas");
  if (typeof canvas.captureStream !== "function") {
    return {
      supported: false,
      mimeType: null,
      audioSupported: false,
      audioMimeType: null,
      reason: "Este navegador não permite exportar vídeo a partir do canvas.",
    };
  }
  const mimeType = supportedMimeType(MP4_VIDEO_MIME_TYPES);
  if (!mimeType) {
    return {
      supported: false,
      mimeType: null,
      audioSupported: false,
      audioMimeType: null,
      reason: "A exportação MP4 do MVP requer Chrome, Edge ou Safari atualizado.",
    };
  }
  const audioMimeType = supportedMimeType(MP4_AUDIO_MIME_TYPES);
  return {
    supported: true,
    mimeType,
    audioSupported: Boolean(audioMimeType && typeof AudioContext !== "undefined"),
    audioMimeType,
    reason: null,
  };
}

export function reelLiteEstimatedDuration(imageCount: number): number {
  const count = Math.max(0, Math.min(MAX_IMAGES, imageCount));
  if (count === 0) return 0;
  return clamp(28 + count * 1.75, MIN_REEL_SECONDS, MAX_REEL_SECONDS);
}

function sceneDurationSeconds(imageCount: number): number {
  const count = Math.max(1, Math.min(MAX_IMAGES, imageCount));
  return Math.max(2.5, (reelLiteEstimatedDuration(count) - CTA_SECONDS) / count);
}

async function releaseEncoderTurn(): Promise<void> {
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 250));
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

async function loadOptionalBitmap(imageUrl: string | null | undefined): Promise<ImageBitmap | null> {
  if (!imageUrl?.trim()) return null;
  try {
    return await loadBitmap(imageUrl.trim());
  } catch {
    return null;
  }
}

function cleanReelText(value: string | null | undefined, fallback: string, maxLength: number): string {
  const normalized = value?.replace(/\s+/gu, " ").trim();
  return (normalized || fallback).slice(0, maxLength);
}

async function prepareBranding(options: ReelLiteOptions): Promise<PreparedBranding> {
  const requestedOrganizationBrand = options.branding?.useOrganizationBrand !== false;
  const organizationName = cleanReelText(options.branding?.brandName, "", 48);
  const brandName = requestedOrganizationBrand && organizationName ? organizationName : "Escala IMOB";
  const agentName = requestedOrganizationBrand
    ? cleanReelText(options.branding?.agentName, "", 44) || null
    : null;
  const logo = requestedOrganizationBrand ? await loadOptionalBitmap(options.branding?.logoUrl) : null;
  return {
    brandName,
    agentName,
    logo,
    poweredByEscala: brandName.toLocaleLowerCase("pt-BR") !== "escala imob",
  };
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

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number, initialSize: number, minimumSize: number): number {
  for (let size = initialSize; size >= minimumSize; size -= 2) {
    context.font = `800 ${size}px Montserrat, Arial, sans-serif`;
    if (context.measureText(text).width <= maxWidth) return size;
  }
  return minimumSize;
}

function formatCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(number);
}

function reelPrice(facts: ReelLiteFacts | undefined): string | null {
  if (!facts) return null;
  const sale = formatCurrency(facts.salePrice);
  const rent = formatCurrency(facts.rentPrice);
  if (facts.purpose === "sale_rent") {
    if (sale && rent) return `Venda ${sale} · Aluguel ${rent}`;
    return sale ?? rent;
  }
  if (facts.purpose === "rent") return rent;
  return sale ?? rent;
}

function reelLocation(facts: ReelLiteFacts | undefined): string | null {
  if (!facts) return null;
  if (facts.locationText?.trim()) return facts.locationText.trim();
  const cityState = [facts.city?.trim(), facts.state?.trim()].filter(Boolean).join("/");
  return [facts.neighborhood?.trim(), cityState].filter(Boolean).join(" · ") || null;
}

function reelSpecs(facts: ReelLiteFacts | undefined): string[] {
  if (!facts) return [];
  const values: string[] = [];
  const area = facts.usefulArea ?? facts.totalArea;
  if (area) values.push(`${area} ${facts.areaUnit === "ha" ? "ha" : "m²"}`);
  if (facts.bedrooms !== null && facts.bedrooms !== undefined) values.push(`${facts.bedrooms} quarto${facts.bedrooms === 1 ? "" : "s"}`);
  if (facts.bathrooms !== null && facts.bathrooms !== undefined) values.push(`${facts.bathrooms} banheiro${facts.bathrooms === 1 ? "" : "s"}`);
  if (facts.parkingSpaces !== null && facts.parkingSpaces !== undefined) values.push(`${facts.parkingSpaces} vaga${facts.parkingSpaces === 1 ? "" : "s"}`);
  return values.slice(0, 3);
}

function drawPill(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  palette: TemplatePalette,
  alpha = 1,
): number {
  context.save();
  context.globalAlpha *= alpha;
  context.font = "800 18px Montserrat, Arial, sans-serif";
  const width = Math.ceil(context.measureText(text).width) + 32;
  roundRectPath(context, x, y, width, 42, 21);
  context.fillStyle = palette.accentSoft;
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.24)";
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = "#ffffff";
  context.textBaseline = "middle";
  context.fillText(text, x + 16, y + 21);
  context.restore();
  return width;
}

function drawBitmapContain(
  context: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  context.drawImage(
    bitmap,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawBrandSignature(
  context: CanvasRenderingContext2D,
  branding: PreparedBranding,
  right: number,
  y: number,
): void {
  context.save();
  context.textAlign = "right";
  context.textBaseline = "middle";
  if (branding.logo) {
    drawBitmapContain(context, branding.logo, right - 136, y - 20, 136, 40);
  } else {
    context.font = "800 20px Montserrat, Arial, sans-serif";
    context.fillStyle = "#ffffff";
    context.fillText(branding.brandName, right, y);
  }
  context.restore();
}

function drawForeground(
  context: CanvasRenderingContext2D,
  source: PreparedSource,
  progress: number,
  template: ReelLiteTemplate,
): void {
  const { bitmap, columnDepth } = source;
  const frameX = template === "impact" ? 24 : 32;
  const frameY = template === "impact" ? 118 : 136;
  const frameWidth = WIDTH - frameX * 2;
  const frameHeight = template === "impact" ? 980 : 940;
  const zoom = 1 + (template === "impact" ? 0.052 : 0.038) * easeInOut(progress);
  const baseScale = Math.min(frameWidth / bitmap.width, frameHeight / bitmap.height) * zoom;
  const drawnWidth = bitmap.width * baseScale;
  const drawnHeight = bitmap.height * baseScale;
  const baseX = frameX + (frameWidth - drawnWidth) / 2;
  const baseY = frameY + (frameHeight - drawnHeight) / 2;
  const movement = (easeInOut(progress) - 0.5) * 2;

  context.save();
  roundRectPath(context, frameX, frameY, frameWidth, frameHeight, template === "impact" ? 10 : 22);
  context.clip();

  context.save();
  context.filter = "blur(24px) brightness(0.52) saturate(0.9)";
  drawCover(context, bitmap, frameX - 28, frameY - 28, frameWidth + 56, frameHeight + 56, 1.08, movement * 0.4);
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
      const shift = (depth - 0.5) * (template === "impact" ? 42 : 34) * movement;
      context.drawImage(bitmap, sx, 0, sw, bitmap.height, dx + shift, baseY, dw, drawnHeight);
    }
  }
  context.restore();

  context.save();
  roundRectPath(context, frameX, frameY, frameWidth, frameHeight, template === "impact" ? 10 : 22);
  context.strokeStyle = "rgba(255,255,255,0.22)";
  context.lineWidth = template === "impact" ? 3 : 2;
  context.stroke();
  context.restore();
}

function drawSceneOverlay(
  context: CanvasRenderingContext2D,
  options: ReelLiteOptions,
  branding: PreparedBranding,
  source: PreparedSource,
  progress: number,
  imageIndex: number,
  imageCount: number,
): void {
  const palette = TEMPLATE_PALETTES[options.template];
  const gradient = context.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, options.template === "impact" ? "rgba(5,8,16,0.86)" : "rgba(5,8,16,0.76)");
  gradient.addColorStop(0.18, "rgba(5,8,16,0.02)");
  gradient.addColorStop(0.72, "rgba(5,8,16,0.04)");
  gradient.addColorStop(1, "rgba(5,8,16,0.90)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const entrance = easeOut(Math.min(1, progress / 0.22));
  const translateY = (1 - entrance) * 22;
  const alpha = entrance;
  const safeTitle = cleanReelText(options.title, "Imóvel em destaque", 70);
  const eyebrow = imageIndex === 0
    ? cleanReelText(branding.brandName, palette.eyebrow, 48).toLocaleUpperCase("pt-BR")
    : `CENA ${imageIndex + 1} · ${source.label.toUpperCase()}`;

  context.save();
  context.globalAlpha = alpha;
  context.translate(0, translateY);
  context.fillStyle = palette.accent;
  context.font = "800 16px Montserrat, Arial, sans-serif";
  context.textBaseline = "top";
  context.fillText(eyebrow, 44, 34);

  context.fillStyle = "#ffffff";
  const size = fitText(context, safeTitle, WIDTH - 88, options.template === "impact" ? 46 : 42, 28);
  context.font = `800 ${size}px Montserrat, Arial, sans-serif`;
  context.fillText(safeTitle, 44, 62);
  context.restore();

  const labelEntrance = easeOut(clamp((progress - 0.08) / 0.25, 0, 1));
  context.save();
  context.globalAlpha = labelEntrance;
  context.translate((1 - labelEntrance) * -18, 0);
  context.fillStyle = "#ffffff";
  context.font = "800 31px Montserrat, Arial, sans-serif";
  context.textBaseline = "top";
  context.fillText(source.label || "Imóvel", 44, 1101);
  context.restore();

  const specs = options.showSpecs === false ? [] : reelSpecs(options.facts);
  if (specs.length) {
    let x = 44;
    for (const spec of specs) {
      const width = drawPill(context, spec, x, 1146, palette, clamp((progress - 0.16) / 0.24, 0, 1));
      x += width + 8;
      if (x > WIDTH - 150) break;
    }
  } else {
    context.font = "600 19px Montserrat, Arial, sans-serif";
    context.fillStyle = "rgba(255,255,255,0.76)";
    context.fillText(`${imageIndex + 1}/${imageCount} · Reel Lite`, 44, 1154);
  }

  drawBrandSignature(context, branding, WIDTH - 44, 1204);

  context.fillStyle = palette.accent;
  const progressWidth = (WIDTH - 88) * ((imageIndex + clamp(progress, 0, 1)) / imageCount);
  context.fillRect(44, 1244, progressWidth, 5);
  context.fillStyle = "rgba(255,255,255,0.22)";
  context.fillRect(44 + progressWidth, 1244, WIDTH - 88 - progressWidth, 5);
}

function drawScene(
  context: CanvasRenderingContext2D,
  source: PreparedSource,
  progress: number,
  options: ReelLiteOptions,
  branding: PreparedBranding,
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

  drawForeground(context, source, progress, options.template);
  drawSceneOverlay(context, options, branding, source, progress, imageIndex, imageCount);
  context.restore();
}

function drawWrappedCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.trim().split(/\s+/u);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((value, index) => context.fillText(value, centerX, y + index * lineHeight));
  return Math.min(lines.length, 3) * lineHeight;
}

function drawCtaScene(
  context: CanvasRenderingContext2D,
  source: PreparedSource,
  options: ReelLiteOptions,
  branding: PreparedBranding,
  progress: number,
): void {
  const palette = TEMPLATE_PALETTES[options.template];
  const entrance = easeOut(Math.min(1, progress / 0.34));
  const pulse = 1 + Math.sin(progress * Math.PI * 5) * 0.012;

  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#070912";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.save();
  context.filter = "blur(28px) brightness(0.34) saturate(0.82)";
  drawCover(context, source.bitmap, -60, -60, WIDTH + 120, HEIGHT + 120, 1.12 + progress * 0.02, 0);
  context.restore();
  context.fillStyle = "rgba(4,6,14,0.68)";
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.save();
  context.globalAlpha = entrance;
  context.translate(0, (1 - entrance) * 36);
  context.textAlign = "center";

  if (branding.logo) {
    drawBitmapContain(context, branding.logo, WIDTH / 2 - 110, 118, 220, 74);
  } else {
    context.fillStyle = palette.accent;
    context.font = "800 18px Montserrat, Arial, sans-serif";
    context.fillText(branding.brandName.toLocaleUpperCase("pt-BR"), WIDTH / 2, 164);
  }

  const headline = cleanReelText(options.headline, palette.headline, 72);
  context.fillStyle = "#ffffff";
  const headlineSize = fitText(context, headline, WIDTH - 112, options.template === "impact" ? 56 : 50, 36);
  context.font = `800 ${headlineSize}px Montserrat, Arial, sans-serif`;
  context.textBaseline = "top";
  drawWrappedCenteredText(context, headline, WIDTH / 2, 236, WIDTH - 112, Math.round(headlineSize * 1.17));

  const safeTitle = cleanReelText(options.title, "Imóvel em destaque", 70);
  context.font = "700 26px Montserrat, Arial, sans-serif";
  context.fillStyle = "rgba(255,255,255,0.84)";
  drawWrappedCenteredText(context, safeTitle, WIDTH / 2, 430, WIDTH - 130, 38);

  const location = options.showLocation === false ? null : reelLocation(options.facts);
  const price = options.showPrice === false ? null : reelPrice(options.facts);
  let infoY = 570;
  if (location) {
    context.font = "600 23px Montserrat, Arial, sans-serif";
    context.fillStyle = "rgba(255,255,255,0.72)";
    context.fillText(location, WIDTH / 2, infoY);
    infoY += 46;
  }
  if (price) {
    context.font = "800 34px Montserrat, Arial, sans-serif";
    context.fillStyle = "#ffffff";
    context.fillText(price, WIDTH / 2, infoY);
  }

  context.save();
  context.translate(WIDTH / 2, 790);
  context.scale(pulse, pulse);
  roundRectPath(context, -235, -42, 470, 84, 42);
  context.fillStyle = palette.accent;
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "800 26px Montserrat, Arial, sans-serif";
  context.textBaseline = "middle";
  context.fillText(cleanReelText(options.ctaText, "Agende uma visita", 40), 0, 0);
  context.restore();

  const defaultSupport = branding.agentName
    ? `Fale com ${branding.agentName} e saiba mais.`
    : `Fale com ${branding.brandName} e saiba mais.`;
  context.font = "600 20px Montserrat, Arial, sans-serif";
  context.fillStyle = "rgba(255,255,255,0.66)";
  drawWrappedCenteredText(
    context,
    cleanReelText(options.supportText, defaultSupport, 74),
    WIDTH / 2,
    866,
    WIDTH - 150,
    30,
  );

  context.fillStyle = palette.accent;
  context.fillRect(WIDTH / 2 - 48, 1030, 96, 5);
  if (branding.logo) {
    drawBitmapContain(context, branding.logo, WIDTH / 2 - 110, 1050, 220, 62);
  } else {
    context.font = "800 27px Montserrat, Arial, sans-serif";
    context.fillStyle = "#ffffff";
    context.fillText(branding.brandName, WIDTH / 2, 1082);
  }

  context.font = "600 16px Montserrat, Arial, sans-serif";
  context.fillStyle = "rgba(255,255,255,0.54)";
  context.fillText(
    branding.poweredByEscala ? "Criado com Estúdio IMOB · powered by Escala IMOB" : "Reel criado localmente · API visual R$ 0",
    WIDTH / 2,
    1132,
  );
  context.restore();
  context.textAlign = "left";
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

async function createSoundtrackRuntime(): Promise<SoundtrackRuntime> {
  const context = new AudioContext({ sampleRate: 48_000 });
  try {
    if (context.state !== "running") {
      await withTimeout(context.resume(), 3_000, "REEL_AUDIO_RESUME_TIMEOUT");
    }
  } catch (error) {
    await withTimeout(context.close(), 1_500, "REEL_AUDIO_CLOSE_TIMEOUT").catch(() => undefined);
    throw error;
  }
  const destination = context.createMediaStreamDestination();
  const master = context.createGain();
  master.gain.value = 0.22;
  master.connect(destination);

  const start = (durationSeconds: number) => {
    const startAt = context.currentTime + 0.045;
    const endAt = startAt + durationSeconds;
    master.gain.cancelScheduledValues(startAt);
    master.gain.setValueAtTime(0.0001, startAt);
    master.gain.exponentialRampToValueAtTime(0.22, startAt + 0.18);
    master.gain.setValueAtTime(0.22, Math.max(startAt + 0.2, endAt - 0.35));
    master.gain.exponentialRampToValueAtTime(0.0001, endAt);

    const padFrequencies = [130.81, 164.81, 196.0];
    for (const frequency of padFrequencies) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.055;
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.08);
    }

    for (let beat = 0; beat < durationSeconds; beat += 0.5) {
      const when = startAt + beat;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(92, when);
      oscillator.frequency.exponentialRampToValueAtTime(54, when + 0.12);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.34, when + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(when);
      oscillator.stop(when + 0.2);
    }

    for (let beat = 0.25; beat < durationSeconds; beat += 1) {
      const when = startAt + beat;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = beat % 2 < 1 ? 523.25 : 659.25;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.065, when + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(when);
      oscillator.stop(when + 0.24);
    }
  };

  return { context, destination, start };
}

export async function createReelLiteMp4(
  sources: ReelLiteSource[],
  options: ReelLiteOptions,
  onProgress?: (progress: ReelLiteProgress) => void,
): Promise<ReelLiteResult> {
  const support = reelLiteSupport();
  if (!support.supported || !support.mimeType) throw new Error("REEL_MP4_UNSUPPORTED");
  if (sources.length === 0) throw new Error("REEL_NO_IMAGES");

  const prepared = await prepareSources(sources, onProgress);
  const branding = await prepareBranding(options);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    for (const source of prepared) source.bitmap.close();
    branding.logo?.close();
    throw new Error("REEL_CANVAS_UNAVAILABLE");
  }

  const videoStream = canvas.captureStream(FPS);
  let soundtrack: SoundtrackRuntime | null = null;
  let audioIncluded = false;
  const recorderStream = new MediaStream(videoStream.getVideoTracks());
  let recorderMimeType = support.mimeType;

  if (options.soundtrack && support.audioSupported && support.audioMimeType) {
    try {
      soundtrack = await createSoundtrackRuntime();
      const audioTrack = soundtrack.destination.stream.getAudioTracks()[0];
      if (audioTrack) {
        recorderStream.addTrack(audioTrack);
        recorderMimeType = support.audioMimeType;
        audioIncluded = true;
      }
    } catch (error) {
      console.warn("[Estúdio IMOB] Trilha local indisponível nesta geração; exportando sem áudio.", error);
      soundtrack = null;
    }
  }

  const chunks: BlobPart[] = [];
  let recorderError: Error | null = null;
  const recorder = new MediaRecorder(recorderStream, {
    mimeType: recorderMimeType,
    videoBitsPerSecond: VIDEO_BITRATE,
    ...(audioIncluded ? { audioBitsPerSecond: AUDIO_BITRATE } : {}),
  });
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener("error", (event) => {
    const candidate = event as Event & { error?: DOMException };
    recorderError = candidate.error ?? new Error("REEL_RECORDER_ERROR");
  });

  const secondsPerImage = sceneDurationSeconds(prepared.length);
  const scenesDuration = prepared.length * secondsPerImage;
  const durationSeconds = scenesDuration + CTA_SECONDS;
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
  let lastReported = -1;

  try {
    drawScene(context, prepared[0]!, 0, options, branding, 0, prepared.length);
    recorder.start(750);
    soundtrack?.start(durationSeconds);
    const startedAt = performance.now();

    await new Promise<void>((resolve, reject) => {
      let frameTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
      let settled = false;
      const frameIntervalMs = 1000 / FPS;
      const timeoutId = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        if (frameTimer !== undefined) globalThis.clearTimeout(frameTimer);
        reject(new Error("REEL_RENDER_TIMEOUT"));
      }, Math.ceil((durationSeconds + 15) * 1000));

      const finish = () => {
        if (settled) return;
        settled = true;
        if (frameTimer !== undefined) globalThis.clearTimeout(frameTimer);
        globalThis.clearTimeout(timeoutId);
        resolve();
      };

      const render = () => {
        if (settled) return;
        const elapsed = Math.min(durationSeconds, (performance.now() - startedAt) / 1000);

        if (elapsed < scenesDuration) {
          const rawIndex = Math.min(prepared.length - 1, Math.floor(elapsed / secondsPerImage));
          const sceneStart = rawIndex * secondsPerImage;
          const sceneProgress = clamp((elapsed - sceneStart) / secondsPerImage, 0, 1);
          drawScene(context, prepared[rawIndex]!, sceneProgress, options, branding, rawIndex, prepared.length);

          if (rawIndex < prepared.length - 1 && sceneProgress > 1 - TRANSITION_FRACTION) {
            const transitionProgress = easeInOut((sceneProgress - (1 - TRANSITION_FRACTION)) / TRANSITION_FRACTION);
            context.save();
            context.globalAlpha = transitionProgress;
            drawScene(
              context,
              prepared[rawIndex + 1]!,
              transitionProgress * 0.14,
              options,
              branding,
              rawIndex + 1,
              prepared.length,
              false,
            );
            context.restore();
          }
        } else {
          drawCtaScene(context, prepared[prepared.length - 1]!, options, branding, (elapsed - scenesDuration) / CTA_SECONDS);
        }

        const percent = Math.min(100, Math.floor((elapsed / durationSeconds) * 100));
        if (percent !== lastReported) {
          lastReported = percent;
          onProgress?.({ phase: "rendering", progress: percent / 100, message: `Renderizando Reel Lite · ${percent}%` });
        }
        if (elapsed >= durationSeconds) {
          finish();
          return;
        }
        frameTimer = globalThis.setTimeout(render, frameIntervalMs);
      };
      frameTimer = globalThis.setTimeout(render, 0);
    });

    onProgress?.({ phase: "finalizing", progress: 1, message: "Finalizando MP4..." });
    if (recorder.state === "recording") {
      try { recorder.requestData(); } catch { /* alguns navegadores não aceitam flush explícito */ }
    }
    recorder.stop();
    await withTimeout(stopped, 12_000, "REEL_RECORDER_STOP_TIMEOUT");
    if (recorderError) throw recorderError;
    const renderMs = Math.max(0, Math.round(performance.now() - startedAt));
    const blob = new Blob(chunks, { type: recorderMimeType });
    if (blob.size === 0) throw new Error("REEL_EMPTY_OUTPUT");
    return {
      blob,
      filename: safeFilename(options.title),
      mimeType: recorderMimeType,
      durationSeconds,
      width: WIDTH,
      height: HEIGHT,
      imageCount: prepared.length,
      audioIncluded,
      template: options.template,
      renderMs,
    };
  } finally {
    if (recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* recorder já encerrado pelo navegador */ }
    }
    for (const track of recorderStream.getTracks()) track.stop();
    for (const track of videoStream.getTracks()) track.stop();
    for (const source of prepared) source.bitmap.close();
    branding.logo?.close();
    if (soundtrack) {
      await withTimeout(soundtrack.context.close(), 2_000, "REEL_AUDIO_CLOSE_TIMEOUT").catch(() => undefined);
    }
    await releaseEncoderTurn();
  }
}
