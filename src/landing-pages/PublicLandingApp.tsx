import { useEffect, useState } from "react";
import { getPublicLandingCatalog, getPublicLandingPage, getPublicLandingPropertyInsights, refreshLocalPreviewPropertyInsights, submitPublicLandingLead, trackPublicLandingPropertyView } from "../services/landingPagesApi";
import type { LandingPageDocument, LandingProperty } from "./model";
import { emptyPropertyInsight, readPropertyInsights, type PropertyInsight } from "./propertyInsights";
import { LandingPageRenderer } from "./LandingPageRenderer";
import { PropertyCatalogPage } from "./PropertyCatalogPage";
import { PropertyDetailsPage } from "./PropertyDetailsPage";

interface StoredPreview { createdAt: number; page: LandingPageDocument }

function readPreview(): LandingPageDocument | null {
  const key = new URLSearchParams(location.search).get("previewKey");
  if (!key) return null;
  const storageKey = `imob:landing-preview:${key}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredPreview;
    if (!stored.page || Date.now() - stored.createdAt > 24 * 60 * 60 * 1000) { localStorage.removeItem(storageKey); return null; }
    return stored.page;
  } catch { localStorage.removeItem(storageKey); return null; }
}

function successMessage(page: LandingPageDocument): string {
  const value = page.sections.find((section) => section.type === "contact")?.content.successMessage;
  return typeof value === "string" && value.trim() ? value : "Mensagem enviada. Em breve entraremos em contato.";
}

function favoriteStorageKey(slug: string): string { return `imob:landing-favorites:${slug}`; }
function readFavoriteIds(slug: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(favoriteStorageKey(slug)) || "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}
function writeFavoriteIds(key: string, ids: string[]): void {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* Armazenamento local indisponível. */ }
}

export function PublicLandingApp() {
  const preview = location.pathname.startsWith("/imob/preview");
  const [route, setRoute] = useState(() => `${location.pathname}${location.search}`);
  const path = route.split("?")[0].replace(/\/+$/u, "");
  const slug = decodeURIComponent(path.split("/")[2] || "");
  const routeParams = new URLSearchParams(route.split("?")[1] || "");
  // GitHub Pages and other static hosts do not rewrite /imoveis to the
  // preview index.html. Keep the preview on the real file path and encode the
  // view in the query string so opening the catalog never returns a server 404.
  const catalog = path.endsWith("/imoveis") || (preview && routeParams.get("view") === "imoveis");
  const previewKey = preview ? new URLSearchParams(route.split("?")[1] || "").get("previewKey") : null;
  const propertyId = new URLSearchParams(route.split("?")[1] || "").get("imovel");
  const favoritesOnly = new URLSearchParams(route.split("?")[1] || "").get("favoritos") === "1";
  const [page, setPage] = useState<LandingPageDocument | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoritesLoadedKey, setFavoritesLoadedKey] = useState("");
  const [selectedCatalogPropertyId, setSelectedCatalogPropertyId] = useState<string | null>(null);
  const [selectedCatalogProperty, setSelectedCatalogProperty] = useState<LandingProperty | null>(null);
  const [selectedCatalogInsight, setSelectedCatalogInsight] = useState<PropertyInsight | null>(null);

  useEffect(() => { const sync = () => setRoute(`${location.pathname}${location.search}`); window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync); }, []);
  useEffect(() => {
    setError(""); setPage(null); setSent(false);
    if (preview) {
      const stored = readPreview();
      if (!stored) { setError("A prévia expirou ou não está mais disponível."); return; }
      setPage(stored); document.title = `Prévia — ${stored.seo.title || stored.name}`; return;
    }
    const request = catalog ? getPublicLandingCatalog(slug) : getPublicLandingPage(slug);
    void request.then((value) => {
      setPage(value); document.title = value.seo.title || value.name;
      let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!description) { description = document.createElement("meta"); description.name = "description"; document.head.appendChild(description); }
      description.content = value.seo.description || "";
    }).catch(() => setError("Esta página não existe ou ainda não foi publicada."));
  }, [preview, slug, catalog]);

  useEffect(() => {
    if (!page) return;
    const key = favoriteStorageKey(page.slug);
    const availableIds = new Set(page.properties.map((property) => property.id));
    setFavoriteIds(readFavoriteIds(page.slug).filter((id) => availableIds.has(id)));
    setFavoritesLoadedKey(key);
  }, [page?.slug]);
  useEffect(() => {
    if (favoritesLoadedKey) writeFavoriteIds(favoritesLoadedKey, favoriteIds);
  }, [favoriteIds, favoritesLoadedKey]);

  const insightPropertyId = propertyId || selectedCatalogProperty?.id || selectedCatalogPropertyId;
  useEffect(() => {
    if (preview || !catalog || !page || !insightPropertyId) { setSelectedCatalogInsight(null); return; }
    let active = true;
    setSelectedCatalogInsight(null);
    const selectedForInsights = page.properties.find((item) => item.id === insightPropertyId);
    const request = getPublicLandingPropertyInsights(slug, insightPropertyId).catch((error) => {
      // When the public page is being tested from the Vite preview, use the
      // same local Geoapify adapter as the editor if the deployed endpoint is
      // not available yet.
      if (import.meta.env.DEV && import.meta.env.VITE_LANDING_INSIGHTS_LOCAL === "true" && selectedForInsights) return refreshLocalPreviewPropertyInsights(selectedForInsights);
      throw error;
    });
    void request.then((value) => {
      if (active) setSelectedCatalogInsight({ ...emptyPropertyInsight(insightPropertyId), ...value, propertyId: insightPropertyId });
    }).catch(() => { /* A página continua disponível mesmo sem o provedor local. */ });
    return () => { active = false; };
  }, [preview, catalog, page?.id, slug, insightPropertyId]);

  const navigate = (destination: string) => {
    history.pushState(null, "", destination);
    setRoute(`${location.pathname}${location.search}`);
    if (!new URLSearchParams(destination.split("?")[1] || "").get("imovel")) {
      setSelectedCatalogPropertyId(null);
      setSelectedCatalogProperty(null);
      setSelectedCatalogInsight(null);
    }
    window.scrollTo(0, 0);
  };
  const catalogPath = preview
    ? `/imob/preview/${previewKey ? `?previewKey=${encodeURIComponent(previewKey)}&view=imoveis` : "?view=imoveis"}`
    : `/imob/${encodeURIComponent(slug)}/imoveis`;
  const landingPath = preview
    ? `/imob/preview/${previewKey ? `?previewKey=${encodeURIComponent(previewKey)}` : ""}`
    : `/imob/${encodeURIComponent(slug)}`;
  const withQuery = (path: string, key: string, value: string) => `${path}${path.includes("?") ? "&" : "?"}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  const toggleFavorite = (id: string) => setFavoriteIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const openFavorites = () => navigate(withQuery(catalogPath, "favoritos", "1"));
  const toggleFavoritesOnly = () => navigate(favoritesOnly ? catalogPath : withQuery(catalogPath, "favoritos", "1"));
  if (error) return <main className="lp-public-state"><h1>Página indisponível</h1><p>{error}</p></main>;
  if (!page) return <main className="lp-public-state"><span>Carregando...</span></main>;
  if (catalog) {
    const selected = selectedCatalogProperty || ((propertyId || selectedCatalogPropertyId) ? page.properties.find((property) => property.id === (propertyId || selectedCatalogPropertyId)) : null);
    const selectCatalogProperty = (property: LandingProperty) => { setSelectedCatalogPropertyId(property.id); setSelectedCatalogProperty(property); if (!preview) void trackPublicLandingPropertyView(slug, property.id); navigate(`${catalogPath}${catalogPath.includes("?") ? "&" : "?"}imovel=${encodeURIComponent(property.id)}`); };
    if (selected) {
      const baseSection = page.sections.find((section) => section.type === "featured-properties");
      const detailSection = selectedCatalogInsight ? { ...(baseSection || { id: "property-insights", type: "featured-properties" as const, order: 0, visible: true, settings: {}, content: {} }), content: { ...(baseSection?.content || {}), propertyInsights: [...readPropertyInsights(baseSection).filter((item) => item.propertyId !== selected.id), selectedCatalogInsight] } } : baseSection;
      return <PropertyDetailsPage key={selected.id} page={page} property={selected} section={detailSection} preview={preview} favorite={favoriteIds.includes(selected.id)} onToggleFavorite={toggleFavorite} onBack={() => navigate(catalogPath)} onSelectProperty={selectCatalogProperty} />;
    }
    return <PropertyCatalogPage page={page} onBack={() => navigate(landingPath)} onSelectProperty={selectCatalogProperty} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} favoritesOnly={favoritesOnly} onToggleFavoritesOnly={toggleFavoritesOnly} />;
  }
  return <><LandingPageRenderer page={page} preview={preview} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} onOpenFavorites={openFavorites} onPropertyView={(id) => preview ? undefined : trackPublicLandingPropertyView(slug, id)} onSubmit={async (data) => { if (!preview) await submitPublicLandingLead(slug, data); setSent(true); }} />{sent && <div className="lp-toast" role="status">{successMessage(page)}</div>}</>;
}
