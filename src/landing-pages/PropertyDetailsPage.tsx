import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { defaultPropertySettings, type LandingPageDocument, type LandingProperty, type LandingSection } from "./model";
import { emptyPropertyInsight, mapEmbedUrl, readPropertyInsights, type PropertyInsight } from "./propertyInsights";
import { refreshLocalPreviewPropertyInsights } from "../services/landingPagesApi";

const formatPrice = (value: string | null) => value && Number.isFinite(Number(value))
  ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value))
  : "Valor sob consulta";

function parseValuationValue(value: string): number {
  const numeric = value.replace(/[^\d,.-]/g, "");
  const normalized = numeric.includes(",")
    ? numeric.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(numeric) ? numeric.replace(/\./g, "") : numeric;
  return Number(normalized);
}

type NearbyPoint = PropertyInsight["nearby"][number];
const nearbyIcon = (category?: string) => ({
  subway: "🚇", train: "🚆", bus: "🚌", shopping: "🛍️", supermarket: "🛒",
  school: "🎓", hospital: "✚", restaurant: "🍴", beach: "🏖️", attraction: "📍",
}[category || ""] || "⌖");

const MAP_TILE_SIZE = 256;
const MAP_MIN_ZOOM = 10;
const MAP_MAX_ZOOM = 17;

type MapView = { latitude: number; longitude: number; zoom: number };
type MapPixel = { x: number; y: number };

function clampLatitude(latitude: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, latitude));
}

function longitudeToWorldX(longitude: number, zoom: number) {
  return ((longitude + 180) / 360) * MAP_TILE_SIZE * 2 ** zoom;
}

function latitudeToWorldY(latitude: number, zoom: number) {
  const safeLatitude = clampLatitude(latitude);
  const sin = Math.sin((safeLatitude * Math.PI) / 180);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * MAP_TILE_SIZE * 2 ** zoom;
}

function worldPixelToCoordinate(x: number, y: number, zoom: number) {
  const worldSize = MAP_TILE_SIZE * 2 ** zoom;
  const longitude = (x / worldSize) * 360 - 180;
  const mercator = Math.PI * (1 - (2 * y) / worldSize);
  const latitude = (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
  return { latitude: clampLatitude(latitude), longitude: ((longitude + 540) % 360) - 180 };
}

function projectMapPoint(latitude: number, longitude: number, view: MapView, width: number, height: number): MapPixel {
  const centerX = longitudeToWorldX(view.longitude, view.zoom);
  const centerY = latitudeToWorldY(view.latitude, view.zoom);
  return {
    x: longitudeToWorldX(longitude, view.zoom) - centerX + width / 2,
    y: latitudeToWorldY(latitude, view.zoom) - centerY + height / 2,
  };
}

function InteractiveNearbyMap({ title, items, latitude, longitude }: { title: string; items: NearbyPoint[]; latitude: string; longitude: string }) {
  const centerLatitude = Number(latitude.replace(",", "."));
  const centerLongitude = Number(longitude.replace(",", "."));
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; centerX: number; centerY: number; zoom: number } | null>(null);
  const fittedRef = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 250 });
  const [view, setView] = useState<MapView>({ latitude: centerLatitude, longitude: centerLongitude, zoom: 13 });

  useEffect(() => {
    if (!Number.isFinite(centerLatitude) || !Number.isFinite(centerLongitude)) return;
    fittedRef.current = false;
    setView({ latitude: centerLatitude, longitude: centerLongitude, zoom: 13 });
  }, [centerLatitude, centerLongitude]);

  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateSize);
    observer?.observe(element);
    globalThis.addEventListener("resize", updateSize);
    return () => { observer?.disconnect(); globalThis.removeEventListener("resize", updateSize); };
  }, []);

  useEffect(() => {
    if (fittedRef.current || size.width <= 0 || !Number.isFinite(centerLatitude) || !Number.isFinite(centerLongitude)) return;
    fittedRef.current = true;
    setView((current) => ({ ...current, zoom: size.width < 420 ? 12 : 13 }));
  }, [size.width, centerLatitude, centerLongitude]);

  const validNearby = useMemo(() => items.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)), [items]);
  const centerWorldX = longitudeToWorldX(view.longitude, view.zoom);
  const centerWorldY = latitudeToWorldY(view.latitude, view.zoom);
  const originX = centerWorldX - size.width / 2;
  const originY = centerWorldY - size.height / 2;
  const tileCount = 2 ** view.zoom;
  const tileMinX = Math.floor(originX / MAP_TILE_SIZE);
  const tileMaxX = Math.floor((originX + size.width) / MAP_TILE_SIZE);
  const tileMinY = Math.max(0, Math.floor(originY / MAP_TILE_SIZE));
  const tileMaxY = Math.min(tileCount - 1, Math.floor((originY + size.height) / MAP_TILE_SIZE));
  const tiles: Array<{ rawX: number; x: number; y: number; left: number; top: number }> = [];
  for (let rawX = tileMinX; rawX <= tileMaxX; rawX += 1) {
    const wrappedX = ((rawX % tileCount) + tileCount) % tileCount;
    for (let y = tileMinY; y <= tileMaxY; y += 1) {
      tiles.push({ rawX, x: wrappedX, y, left: rawX * MAP_TILE_SIZE - originX, top: y * MAP_TILE_SIZE - originY });
    }
  }

  const setZoom = (nextZoom: number) => setView((current) => ({ ...current, zoom: Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, nextZoom)) }));
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, centerX: centerWorldX, centerY: centerWorldY, zoom: view.zoom };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = worldPixelToCoordinate(drag.centerX - (event.clientX - drag.x), drag.centerY - (event.clientY - drag.y), drag.zoom);
    setView((current) => ({ ...current, latitude: next.latitude, longitude: next.longitude }));
  };
  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };

  if (!Number.isFinite(centerLatitude) || !Number.isFinite(centerLongitude)) return null;
  const propertyPoint = projectMapPoint(centerLatitude, centerLongitude, view, size.width, size.height);
  return <div
    ref={mapRef}
    className="lp-detail__interactive-map"
    role="region"
    aria-label={`Mapa interativo aproximado da região de ${title}`}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={finishPointer}
    onPointerCancel={finishPointer}
  >
    <div className="lp-detail__map-tiles" aria-hidden="true">
      {tiles.map((tile) => <img key={`${view.zoom}-${tile.rawX}-${tile.y}`} src={`https://tile.openstreetmap.org/${view.zoom}/${tile.x}/${tile.y}.png`} alt="" draggable={false} style={{ left: tile.left, top: tile.top }} />)}
    </div>
    <span className="lp-detail__map-marker is-property" style={{ left: propertyPoint.x, top: propertyPoint.y }} title="Localização aproximada do imóvel" aria-label="Localização aproximada do imóvel">⌂</span>
    {validNearby.map((item, index) => {
      const point = projectMapPoint(item.latitude!, item.longitude!, view, size.width, size.height);
      if (point.x < -40 || point.x > size.width + 40 || point.y < -40 || point.y > size.height + 40) return null;
      return <span key={`${item.name}-${index}`} className="lp-detail__map-marker" style={{ left: point.x, top: point.y }} title={`${item.name} · ${item.minutes}`} aria-label={`${item.name}, ${item.minutes}`}>{nearbyIcon(item.category)}</span>;
    })}
    <div className="lp-detail__map-controls">
      <button type="button" onClick={() => setZoom(view.zoom + 1)} disabled={view.zoom >= MAP_MAX_ZOOM} aria-label="Aproximar mapa">+</button>
      <button type="button" onClick={() => setZoom(view.zoom - 1)} disabled={view.zoom <= MAP_MIN_ZOOM} aria-label="Afastar mapa">−</button>
    </div>
  </div>;
}

function ValuationChart({ insight }: { insight: PropertyInsight }) {
  const points = insight.valuations.map((point) => ({ year: point.year.trim(), value: parseValuationValue(point.value) })).filter((point) => point.year && Number.isFinite(point.value) && point.value > 0).sort((a, b) => a.year.localeCompare(b.year, "pt-BR", { numeric: true }));
  if (points.length < 2 || !insight.valuationSource.trim()) return <p className="lp-detail__empty">{insight.valuationUnavailableReason || "Histórico de valorização ainda não informado para esta região."}{insight.valuationSourceUrl && <> <a href={insight.valuationSourceUrl} target="_blank" rel="noopener noreferrer">Consultar fonte</a></>}</p>;
  const values = points.map((point) => point.value);
  const min = Math.min(...values) * .88, max = Math.max(...values) * 1.08;
  const positions = points.map((point, index) => ({ x: 38 + index * 524 / (points.length - 1), y: 170 - (point.value - min) * 125 / (max - min || 1), ...point }));
  const labelStride = Math.max(1, Math.ceil(positions.length / 5));
  const line = positions.map((point) => `${point.x},${point.y}`).join(" ");
  const growth = (values.at(-1)! / values[0] - 1) * 100;
  const currency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
  return <><div className="lp-detail__valuation-top"><strong>Valor médio por m²</strong><span className={growth < 0 ? "is-negative" : ""}>{growth >= 0 ? "+" : ""}{growth.toFixed(1).replace(".", ",")}% <small>{insight.valuationPeriod ? `em ${insight.valuationPeriod}` : "no período"}</small></span></div><svg className="lp-detail__chart" viewBox="0 0 600 220" role="img" aria-label={`Evolução do valor médio por metro quadrado: de ${currency(values[0])} em ${points[0].year} para ${currency(values.at(-1)!)} em ${points.at(-1)!.year}`}><defs><linearGradient id="lp-detail-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--lp-primary)" stopOpacity=".28"/><stop offset="1" stopColor="var(--lp-primary)" stopOpacity="0"/></linearGradient></defs><line x1="38" y1="185" x2="562" y2="185" stroke="var(--lp-border)"/><polygon points={`38,185 ${line} 562,185`} fill="url(#lp-detail-chart-fill)"/><polyline points={line} fill="none" stroke="var(--lp-primary)" strokeWidth="3" strokeLinejoin="round"/>{positions.map((point, index) => <g key={`${point.year}-${point.x}`}><circle cx={point.x} cy={point.y} r="5" fill="var(--lp-surface)" stroke="var(--lp-primary)" strokeWidth="3"/>{(index % labelStride === 0 || index === positions.length - 1) && <><text x={point.x} y={Math.max(17,point.y - 12)} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--lp-text)">{currency(point.value)}</text><text x={point.x} y="207" textAnchor="middle" fontSize="12" fill="var(--lp-muted)">{point.year}</text></>}</g>)}</svg><p className="lp-detail__source">Fonte: {insight.valuationSource} · {insight.valuationCity || "cidade monitorada"}{insight.valuationSourceUrl && <> · <a href={insight.valuationSourceUrl} target="_blank" rel="noopener noreferrer">Fipe</a></>}</p></>;
}

export function PropertyDetailsPage({ page, property, section, preview = false, favorite = false, onToggleFavorite, onBack, onSelectProperty }: {
  page: LandingPageDocument;
  property: LandingProperty;
  section?: LandingSection;
  preview?: boolean;
  favorite?: boolean;
  onToggleFavorite?: (propertyId: string) => void;
  onBack: () => void;
  onSelectProperty: (property: LandingProperty) => void;
}) {
  const [photo, setPhoto] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(favorite), [favorite]);
  const [previewInsight, setPreviewInsight] = useState<PropertyInsight | null>(null);
  const [mapLookupError, setMapLookupError] = useState("");
  const settings = { ...defaultPropertySettings, ...(page.theme.property || {}), primaryColor: page.theme.property?.primaryColor || page.theme.primaryColor, backgroundColor: page.theme.property?.backgroundColor || page.theme.backgroundColor, surfaceColor: page.theme.property?.surfaceColor || page.theme.surfaceColor, textColor: page.theme.property?.textColor || page.theme.textColor, mutedTextColor: page.theme.property?.mutedTextColor || page.theme.mutedTextColor, buttonTextColor: page.theme.property?.buttonTextColor || page.theme.buttonTextColor, borderColor: page.theme.property?.borderColor || page.theme.borderColor };
  const show = (key: string) => section?.content[key] !== false && (key !== "showLocation" || property.siteAddressVisibility !== "hidden");
  const photos = [...new Set([property.imageUrl, ...(property.imageUrls || [])].filter((url): url is string => Boolean(url)))];
  const area = property.usefulArea || property.totalArea || property.builtArea || property.landArea;
  const price = property.purpose?.toLowerCase().includes("alug") ? property.rentPrice || property.salePrice : property.salePrice || property.rentPrice;
  const purpose = property.purpose?.toLowerCase().includes("alug") ? "Aluguel" : "Venda";
  const facts = [
    show("showSuites") && property.suites != null && `${property.suites} suítes`,
    show("showBedrooms") && property.bedrooms != null && `${property.bedrooms} quartos`,
    show("showBathrooms") && property.bathrooms != null && `${property.bathrooms} banheiros`,
    show("showParkingSpaces") && property.parkingSpaces != null && `${property.parkingSpaces} vagas`,
    show("showArea") && area && `${area} ${property.areaUnit || "m²"}`,
  ].filter(Boolean);
  const amenities = show("showAmenities") ? [...new Set([...(property.amenities || []), ...(property.condominiumAmenities || [])])] : [];
  const storedInsight = readPropertyInsights(section).find((item) => item.propertyId === property.id) || emptyPropertyInsight(property.id);
  const insight = previewInsight || storedInsight;
  const automaticMapPoint = Number.isFinite(property.publicLatitude) && Number.isFinite(property.publicLongitude)
    ? { mapLatitude: String(property.publicLatitude), mapLongitude: String(property.publicLongitude) }
    : null;
  const mapPoint = { ...insight, ...(automaticMapPoint || {}) };
  const mapUrl = property.siteAddressVisibility === "hidden" ? null : mapEmbedUrl(mapPoint);
  useEffect(() => {
    if (!preview || !import.meta.env.DEV || import.meta.env.VITE_LANDING_INSIGHTS_LOCAL !== "true" || property.siteAddressVisibility === "hidden" || (storedInsight.nearby.length > 0 && storedInsight.valuations.length > 1)) return;
    let active = true;
    setMapLookupError("");
    void refreshLocalPreviewPropertyInsights(property).then((value) => { if (active) setPreviewInsight({ ...storedInsight, ...value, propertyId: property.id }); }).catch((error: unknown) => { if (active) setMapLookupError(error instanceof Error ? error.message : "Não foi possível localizar a região."); });
    return () => { active = false; };
  }, [preview, property.id, property.location, property.siteAddressVisibility, storedInsight.nearby.length, storedInsight.valuations.length]);
  const publicMapSearchUrl = property.siteAddressVisibility !== "hidden" && (mapUrl || property.location?.trim())
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapUrl ? `${mapPoint.mapLatitude},${mapPoint.mapLongitude}` : `${property.location!.trim().slice(0, 200)}, Brasil`)}`
    : null;
  const nearby = property.siteAddressVisibility === "hidden" ? [] : insight.nearby.filter((item) => item.name.trim() && item.minutes.trim());
  const similar = page.properties.filter((item) => item.id !== property.id).sort((a, b) => Number(b.type === property.type) - Number(a.type === property.type)).slice(0, 3);
  const whatsapp = page.identity.whatsapp?.replace(/\D/g, "") || "";
  const whatsappUrl = whatsapp ? `https://wa.me/${whatsapp.startsWith("55") ? whatsapp : `55${whatsapp}`}?text=${encodeURIComponent(`Olá! Tenho interesse no imóvel ${property.title}.`)}` : null;
  const landingUrl = location.pathname.startsWith("/imob/preview") ? `${location.pathname}${location.search}` : location.pathname.endsWith("/imoveis") ? `/imob/${encodeURIComponent(page.slug)}/imoveis` : `/imob/${encodeURIComponent(page.slug)}`;
  const contactUrl = `${landingUrl}#contato`;
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: property.title, url: location.href }); } catch { /* Compartilhamento cancelado. */ } }
    else if (navigator.clipboard) { await navigator.clipboard.writeText(location.href); }
  };
  const theme = { "--lp-primary": settings.primaryColor, "--lp-secondary": page.theme.secondaryColor, "--lp-bg": settings.backgroundColor, "--lp-surface": settings.surfaceColor, "--lp-text": settings.textColor, "--lp-muted": settings.mutedTextColor, "--lp-button-text": settings.buttonTextColor, "--lp-border": settings.borderColor } as CSSProperties;
  return <main className="lp lp-detail" style={theme}>
    <div className="lp-detail__bar"><div className="lp-shell"><a href={landingUrl} onClick={(event) => { event.preventDefault(); onBack(); }}>{settings.backLabel}</a></div></div>
    <div className="lp-shell lp-detail__body">
      <nav className="lp-detail__breadcrumb" aria-label="Navegação"><a href={landingUrl} onClick={(event) => { event.preventDefault(); onBack(); }}>{settings.breadcrumbHomeLabel}</a><span>/</span><a href={`${landingUrl}#imoveis`} onClick={(event) => { event.preventDefault(); onBack(); }}>Imóveis</a>{show("showType") && property.type && <><span>/</span><span>{property.type}</span></>}{show("showLocation") && property.location && <><span>/</span><span>{property.location}</span></>}</nav>
      {photos.length > 0 && <div className={`lp-detail__gallery${photos.length === 1 ? " is-single" : ""}`}><button className="lp-detail__lead-photo" type="button" onClick={() => setPhoto(0)}><img src={photos[0]} alt={`Foto principal de ${property.title}`} /><span>▣ {settings.photosLabel}</span></button>{photos.length > 1 && <div className="lp-detail__gallery-rest">{photos.slice(1, 7).map((url, index) => <button key={`${url}-${index}`} type="button" onClick={() => setPhoto(index + 1)}><img src={url} alt={`Foto ${index + 2} de ${property.title}`} /></button>)}</div>}</div>}
      <div className="lp-detail__columns"><div className="lp-detail__main"><div className="lp-detail__intro">{show("showPurpose") && <span className="lp-detail__badge">{purpose}</span>}<h1>{property.title}</h1>{show("showLocation") && property.location && <p className="lp-detail__location">⌖ {property.location}</p>}<div className="lp-detail__facts">{facts.map((fact) => <span key={String(fact)}>{fact}</span>)}</div></div>
        {show("showDescription") && property.description && <section className="lp-detail__section"><h2>{settings.aboutTitle}</h2><p className="lp-detail__description">{property.description}</p></section>}
        {(amenities.length > 0 || facts.length > 0) && <section className="lp-detail__section lp-detail__features"><h2>{settings.featuresTitle}</h2><div className="lp-detail__feature-columns"><div><h3>Ambientes</h3>{(property.amenities || []).length > 0 && show("showAmenities") ? (property.amenities || []).map((item) => <span key={item}>✓ {item}</span>) : facts.map((fact) => <span key={String(fact)}>✓ {fact}</span>)}</div><div><h3>Estrutura</h3>{(property.condominiumAmenities || []).length > 0 && show("showAmenities") ? (property.condominiumAmenities || []).map((item) => <span key={item}>✓ {item}</span>) : <p>Não informada.</p>}</div></div></section>}
      </div><aside className="lp-detail__contact"><small>{purpose}</small>{show("showPrice") && <strong>{formatPrice(price)}</strong>}<a className="lp-detail__cta" href={contactUrl}>{settings.contactButtonLabel}</a><div className="lp-detail__actions"><button type="button" onClick={() => onToggleFavorite ? onToggleFavorite(property.id) : setSaved(!saved)} aria-pressed={saved}>{saved ? settings.savedLabel : settings.saveLabel}</button><button type="button" onClick={() => void share()}>{settings.shareLabel}</button></div><div className="lp-detail__agent"><small>Atendimento</small><b>{page.identity.name}</b>{page.identity.creci && <span>{page.identity.creci}</span>}</div>{whatsappUrl && <a className="lp-detail__whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Falar pelo WhatsApp</a>}</aside></div>
      <div className="lp-detail__local-grid"><section className="lp-detail__local-card"><h2>{settings.valuationTitle}</h2><ValuationChart insight={insight}/></section><section className="lp-detail__local-card lp-detail__proximity"><div><h2>{settings.proximityTitle}</h2><p>{insight.proximityDescription.trim() || (show("showLocation") && property.location ? `Explore a região de ${property.location}. Distâncias e tempos de deslocamento não foram informados.` : "Localização pública e distâncias ainda não informadas.")}</p></div>{mapUrl ? <div className="lp-detail__map-shell"><InteractiveNearbyMap title={property.title} items={nearby} latitude={mapPoint.mapLatitude} longitude={mapPoint.mapLongitude}/><small>Mapa aproximado · © OpenStreetMap contributors</small>{publicMapSearchUrl && <a href={publicMapSearchUrl} target="_blank" rel="noopener noreferrer">Abrir no Google Maps</a>}</div> : <div className="lp-detail__map-placeholder"><span aria-hidden="true">⌖</span><p>{mapLookupError || (publicMapSearchUrl ? "Veja a região aproximada no mapa." : "Mapa da região indisponível.")}</p>{publicMapSearchUrl && <a href={publicMapSearchUrl} target="_blank" rel="noopener noreferrer">Abrir região no Google Maps</a>}</div>}</section></div>
      <section className="lp-detail__nearby"><h2>{settings.nearbyTitle}</h2>{nearby.length > 0 ? <div className="lp-detail__nearby-grid">{nearby.map((item, index) => <div key={`${item.name}-${index}`}><span className="lp-detail__nearby-icon" aria-hidden="true">{nearbyIcon(item.category)}</span><strong>{item.name}</strong><small>{item.minutes}</small></div>)}</div> : <p className="lp-detail__empty">Pontos de interesse e tempos de deslocamento ainda não informados.</p>}{nearby.length > 0 && insight.nearbySource && <p className="lp-detail__nearby-source">Tempos estimados a pé · dados de <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>{insight.nearbyUpdatedAt ? ` · consultados em ${insight.nearbyUpdatedAt}` : ""}. Confira rotas e horários antes de se deslocar.</p>}</section>
      {similar.length > 0 && <section className="lp-detail__similar"><div className="lp-detail__similar-heading"><h2>{settings.similarTitle}</h2><a href={`${landingUrl}#imoveis`} onClick={(event) => { event.preventDefault(); onBack(); }}>{settings.similarActionLabel}</a></div><div className="lp-detail__similar-grid">{similar.map((item) => <button key={item.id} type="button" onClick={() => onSelectProperty(item)}>{item.imageUrl && <img src={item.imageUrl} alt="" />}<span><b>{item.title}</b><small>{[show("showSuites") && item.suites != null && `${item.suites} suítes`, show("showArea") && (item.usefulArea || item.totalArea) && `${item.usefulArea || item.totalArea} ${item.areaUnit}`].filter(Boolean).join(" · ")}</small>{show("showPrice") && <strong>{formatPrice(item.salePrice || item.rentPrice)}</strong>}</span></button>)}</div></section>}
    </div>
    {photo !== null && <div className="lp-detail__lightbox" role="dialog" aria-modal="true" aria-label="Galeria de fotos"><button type="button" className="lp-detail__lightbox-close" onClick={() => setPhoto(null)} aria-label="Fechar galeria">×</button><button type="button" onClick={() => setPhoto((photo - 1 + photos.length) % photos.length)} aria-label="Foto anterior">‹</button><img src={photos[photo]} alt={`${property.title}, foto ${photo + 1} de ${photos.length}`} /><button type="button" onClick={() => setPhoto((photo + 1) % photos.length)} aria-label="Próxima foto">›</button><span>{photo + 1} / {photos.length}</span></div>}
  </main>;
}
