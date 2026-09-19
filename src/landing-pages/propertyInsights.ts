import type { LandingSection } from "./model";

export interface PropertyInsight {
  propertyId: string;
  valuationSource: string;
  valuationSourceUrl?: string;
  valuationPeriod?: string;
  valuationCity?: string;
  valuationUpdatedAt?: string;
  valuationUnavailableReason?: string;
  valuations: Array<{ year: string; value: string }>;
  proximityDescription: string;
  mapLatitude: string;
  mapLongitude: string;
  nearby: Array<{ name: string; minutes: string; category?: string; latitude?: number; longitude?: number }>;
  nearbySource?: string;
  nearbyUpdatedAt?: string;
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value : "";
const coordinate = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && Number.isFinite(Number(value)) ? Number(value) : undefined;

export function readPropertyInsights(section: LandingSection | undefined): PropertyInsight[] {
  const source = section?.content.propertyInsights;
  if (!Array.isArray(source)) return [];
  return source.map((value) => {
    const item = object(value);
    return {
      propertyId: string(item.propertyId),
      valuationSource: string(item.valuationSource),
      valuationSourceUrl: string(item.valuationSourceUrl),
      valuationPeriod: string(item.valuationPeriod),
      valuationCity: string(item.valuationCity),
      valuationUpdatedAt: string(item.valuationUpdatedAt),
      valuationUnavailableReason: string(item.valuationUnavailableReason),
      valuations: Array.isArray(item.valuations) ? item.valuations.map((entry) => ({ year: string(object(entry).year), value: string(object(entry).value) })).slice(0, 12) : [],
      proximityDescription: string(item.proximityDescription),
      mapLatitude: string(item.mapLatitude),
      mapLongitude: string(item.mapLongitude),
      nearby: Array.isArray(item.nearby) ? item.nearby.map((entry) => { const value = object(entry); const latitude = coordinate(value.latitude); const longitude = coordinate(value.longitude); return { name: string(value.name), minutes: string(value.minutes), category: string(value.category), ...(latitude === undefined ? {} : { latitude }), ...(longitude === undefined ? {} : { longitude }) }; }).slice(0, 12) : [],
      nearbySource: string(item.nearbySource),
      nearbyUpdatedAt: string(item.nearbyUpdatedAt),
    };
  }).filter((item) => item.propertyId);
}

export function emptyPropertyInsight(propertyId: string): PropertyInsight {
  return { propertyId, valuationSource: "", valuations: [], proximityDescription: "", mapLatitude: "", mapLongitude: "", nearby: [] };
}

export function previewPublicMapPoint(visibility: string, latitude: string | null, longitude: string | null) {
  if (visibility === "hidden" || !latitude?.trim() || !longitude?.trim()) return { publicLatitude: null, publicLongitude: null };
  const lat = Number(latitude), lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return { publicLatitude: null, publicLongitude: null };
  const decimals = visibility === "full" ? 5 : visibility === "street" ? 3 : 2;
  return { publicLatitude: Number(lat.toFixed(decimals)), publicLongitude: Number(lon.toFixed(decimals)) };
}

export function mapEmbedUrl(insight: PropertyInsight): string | null {
  const latitude = Number(insight.mapLatitude.replace(",", "."));
  const longitude = Number(insight.mapLongitude.replace(",", "."));
  if (!insight.mapLatitude.trim() || !insight.mapLongitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) return null;
  const bbox = [longitude - 0.03, latitude - 0.02, longitude + 0.03, latitude + 0.02].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`;
}
