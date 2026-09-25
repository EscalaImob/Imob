import type { PropertyDetail, PropertyImageItem } from "../services/propertiesApi";
import type { PortfolioPublicationObjective } from "../services/publicationsApi";

const ARTWORK_WIDTH = 1080;
const ARTWORK_HEIGHT = 1350;
const BRAND_BLUE = "#241cff";
const WHITE = "#ffffff";
const DARK_OVERLAY = "rgba(0, 0, 0, 0.58)";

const propertyTypeLabels: Record<PropertyDetail["type"], string> = {
  apartment: "Apartamento",
  house: "Casa",
  commercial: "Comercial",
  land: "Terreno",
  rural: "Imóvel rural",
  warehouse: "Galpão",
  building: "Prédio",
  room: "Sala comercial",
  other: "Imóvel",
};

function roundRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawCoverImage(context: CanvasRenderingContext2D, image: HTMLImageElement) {
  const scale = Math.max(ARTWORK_WIDTH / image.naturalWidth, ARTWORK_HEIGHT / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const x = (ARTWORK_WIDTH - width) / 2;
  const y = (ARTWORK_HEIGHT - height) / 2;
  context.drawImage(image, x, y, width, height);
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível carregar a foto principal do imóvel.");
  const blob = await response.blob();
  const localUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Não foi possível processar a foto principal do imóvel."));
      image.src = localUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(localUrl);
  }
}

function fitFontSize(context: CanvasRenderingContext2D, text: string, maxWidth: number, preferred: number, minimum: number, weight = 800) {
  let size = preferred;
  while (size > minimum) {
    context.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function formatMoney(value: string | null) {
  if (!value) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function areaLabel(property: PropertyDetail) {
  const raw = property.usefulArea || property.totalArea || property.builtArea || property.landArea;
  if (!raw) return null;
  const numeric = Number(raw);
  const value = Number.isFinite(numeric)
    ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(numeric)
    : raw.replace(".", ",");
  return `${value}${property.areaUnit === "ha" ? " ha" : "m²"}`;
}

function plural(count: number, singular: string, pluralLabel: string) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function titleCase(value: string) {
  return value
    .trim()
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
}

function buildChips(property: PropertyDetail) {
  const chips: string[] = [];
  const area = areaLabel(property);
  if (area) chips.push(area);
  if (property.parkingSpaces) chips.push(plural(property.parkingSpaces, "Vaga de garagem", "Vagas de garagem"));
  if (property.bathrooms) chips.push(plural(property.bathrooms, "Banheiro", "Banheiros"));
  if (property.bedrooms) chips.push(plural(property.bedrooms, "Dormitório", "Dormitórios"));
  for (const amenity of property.amenities) {
    const label = titleCase(amenity);
    if (label && !chips.some((chip) => chip.toLocaleLowerCase("pt-BR") === label.toLocaleLowerCase("pt-BR"))) chips.push(label);
    if (chips.length >= 7) break;
  }
  return chips;
}

function drawPin(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.translate(x, y);
  context.strokeStyle = WHITE;
  context.lineWidth = 4;
  context.beginPath();
  context.arc(0, -7, 15, Math.PI, 0);
  context.quadraticCurveTo(15, 12, 0, 29);
  context.quadraticCurveTo(-15, 12, -15, -7);
  context.stroke();
  context.beginPath();
  context.arc(0, -7, 5, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawChip(context: CanvasRenderingContext2D, text: string, x: number, y: number) {
  context.font = "700 27px Arial, Helvetica, sans-serif";
  const width = Math.ceil(context.measureText(text).width) + 34;
  roundRectPath(context, x, y, width, 50, 12);
  context.fillStyle = "rgba(255,255,255,0.96)";
  context.fill();
  context.fillStyle = BRAND_BLUE;
  context.textBaseline = "middle";
  context.fillText(text, x + 17, y + 26);
  return width;
}

function locationTitle(property: PropertyDetail) {
  if (property.city && property.state) return `${property.city} (${property.state.toUpperCase()})`;
  return property.city || property.state || property.siteLocationText || property.publicLocation || property.neighborhood || "Localização não informada";
}

function locationDetail(property: PropertyDetail) {
  const values = [property.neighborhood, property.siteLocationText, property.publicLocation]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const title = locationTitle(property).toLocaleLowerCase("pt-BR");
  return values.find((value) => !title.includes(value.toLocaleLowerCase("pt-BR"))) || "Consulte a localização";
}

function selectPrice(property: PropertyDetail, objective: PortfolioPublicationObjective) {
  if (objective === "rent") return { value: formatMoney(property.rentPrice), label: "por mês" };
  if (objective === "sell") return { value: formatMoney(property.salePrice), label: "por apenas" };
  const sale = formatMoney(property.salePrice);
  if (sale) return { value: sale, label: "por apenas" };
  const rent = formatMoney(property.rentPrice);
  return { value: rent, label: rent ? "por mês" : "valor sob consulta" };
}

export interface InstagramOpportunityArtworkInput {
  property: PropertyDetail;
  images: PropertyImageItem[];
  objective: PortfolioPublicationObjective;
}

export async function generateInstagramOpportunityArtwork({ property, images, objective }: InstagramOpportunityArtworkInput): Promise<Blob> {
  const primary = images.find((image) => image.primary) ?? images[0];
  if (!primary) throw new Error("Adicione ao menos uma foto ao imóvel antes de gerar a arte.");
  const price = selectPrice(property, objective);
  if (!price.value) throw new Error("Informe o preço do imóvel antes de gerar a arte.");

  const background = await loadImageFromUrl(primary.viewUrl);
  const canvas = document.createElement("canvas");
  canvas.width = ARTWORK_WIDTH;
  canvas.height = ARTWORK_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador não conseguiu preparar a arte.");

  drawCoverImage(context, background);

  const gradient = context.createLinearGradient(0, 720, 0, ARTWORK_HEIGHT);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, DARK_OVERLAY);
  context.fillStyle = gradient;
  context.fillRect(0, 620, ARTWORK_WIDTH, ARTWORK_HEIGHT - 620);

  roundRectPath(context, -18, 190, 800, 365, 42);
  context.fillStyle = "rgba(36, 28, 255, 0.93)";
  context.fill();

  context.textBaseline = "alphabetic";
  context.fillStyle = WHITE;
  context.font = "900 76px Arial, Helvetica, sans-serif";
  context.fillText("OPORTUNIDADE!", 44, 280);

  const typeLabel = propertyTypeLabels[property.type] || "Imóvel";
  const typeSize = fitFontSize(context, typeLabel, 660, 58, 42, 800);
  context.font = `800 ${typeSize}px Arial, Helvetica, sans-serif`;
  context.fillText(typeLabel, 44, 370);

  const place = locationTitle(property);
  const placeSize = fitFontSize(context, place, 670, 48, 34, 400);
  context.font = `italic 400 ${placeSize}px Arial, Helvetica, sans-serif`;
  context.fillText(place, 44, 432);

  drawPin(context, 68, 490);
  const detail = locationDetail(property);
  const detailSize = fitFontSize(context, detail, 620, 39, 28, 700);
  context.font = `700 ${detailSize}px Arial, Helvetica, sans-serif`;
  context.fillText(detail, 98, 507);

  context.shadowColor = "rgba(0,0,0,0.52)";
  context.shadowBlur = 12;
  context.shadowOffsetY = 5;
  context.fillStyle = WHITE;
  context.font = "800 48px Arial, Helvetica, sans-serif";
  context.fillText(price.label, 78, 975);

  const priceSize = fitFontSize(context, price.value, 930, 135, 82, 900);
  context.font = `900 ${priceSize}px Arial, Helvetica, sans-serif`;
  context.shadowColor = "rgba(31, 23, 255, 0.82)";
  context.shadowBlur = 0;
  context.shadowOffsetX = 6;
  context.shadowOffsetY = 6;
  context.fillText(price.value, 76, 1115);
  context.shadowColor = "transparent";
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;

  const chips = buildChips(property);
  let chipX = 28;
  let chipY = 1185;
  for (const chip of chips) {
    context.font = "700 27px Arial, Helvetica, sans-serif";
    const candidateWidth = Math.ceil(context.measureText(chip).width) + 34;
    if (chipX + candidateWidth > ARTWORK_WIDTH - 28) {
      chipX = 28;
      chipY += 65;
    }
    if (chipY + 50 > ARTWORK_HEIGHT - 20) break;
    chipX += drawChip(context, chip, chipX, chipY) + 12;
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível finalizar a arte em PNG."));
    }, "image/png");
  });
}
