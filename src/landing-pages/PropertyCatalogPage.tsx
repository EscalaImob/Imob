import { useMemo, useState, type CSSProperties } from "react";
import { defaultCatalogSettings, type LandingPageDocument, type LandingProperty } from "./model";
import "./propertyCatalog.css";

const money = (value: string | null) => value && Number.isFinite(Number(value))
  ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(value))
  : "Valor sob consulta";

const purposeLabel = (value: string) => value.toLowerCase().includes("alug") ? "Aluguel" : "Venda";
const propertyValue = (property: LandingProperty) => Number(property.salePrice || property.rentPrice || 0);
const propertyFacts = (property: LandingProperty) => [
  property.suites != null && `${property.suites} suítes`,
  property.bedrooms != null && `${property.bedrooms} quartos`,
  property.bathrooms != null && `${property.bathrooms} banheiros`,
  property.parkingSpaces != null && `${property.parkingSpaces} vagas`,
  (property.usefulArea || property.totalArea || property.builtArea || property.landArea) && `${property.usefulArea || property.totalArea || property.builtArea || property.landArea} ${property.areaUnit || "m²"}`,
].filter(Boolean).slice(0, 3) as string[];

export function PropertyCatalogPage({ page, catalogProperties, onBack, onSelectProperty, favoriteIds = [], onToggleFavorite, favoritesOnly = false, onToggleFavoritesOnly }: { page: LandingPageDocument; catalogProperties?: LandingProperty[]; onBack: () => void; onSelectProperty: (property: LandingProperty) => void; favoriteIds?: string[]; onToggleFavorite?: (propertyId: string) => void; favoritesOnly?: boolean; onToggleFavoritesOnly?: () => void }) {
  const properties = catalogProperties ?? page.catalogProperties ?? page.properties;
  const locations = useMemo(() => [...new Set(properties.map((property) => property.location).filter((value): value is string => Boolean(value?.trim())))].sort((a, b) => a.localeCompare(b, "pt-BR")), [properties]);
  const types = useMemo(() => [...new Set(properties.map((property) => property.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [properties]);
  const maxAvailable = Math.max(1, ...properties.map(propertyValue));
  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftPurpose, setDraftPurpose] = useState("");
  const [draftType, setDraftType] = useState("");
  const [draftMaxPrice, setDraftMaxPrice] = useState(maxAvailable);
  const [filters, setFilters] = useState({ query: "", location: "", purpose: "", type: "", maxPrice: maxAvailable });
  const filtered = useMemo(() => properties.filter((property) => {
    if (favoritesOnly && !favoriteIds.includes(property.id)) return false;
    const searchable = `${property.title} ${property.location || ""} ${property.type} ${property.purpose}`.toLocaleLowerCase("pt-BR");
    return (!filters.query || searchable.includes(filters.query.toLocaleLowerCase("pt-BR")))
      && (!filters.location || property.location === filters.location)
      && (!filters.purpose || purposeLabel(property.purpose) === filters.purpose)
      && (!filters.type || property.type === filters.type)
      && (!propertyValue(property) || propertyValue(property) <= filters.maxPrice);
  }), [favoritesOnly, favoriteIds, filters, properties]);
  const applyFilters = () => setFilters({ query: draftQuery.trim(), location: draftLocation, purpose: draftPurpose, type: draftType, maxPrice: draftMaxPrice });
  const resetFilters = () => { setDraftQuery(""); setDraftLocation(""); setDraftPurpose(""); setDraftType(""); setDraftMaxPrice(maxAvailable); setFilters({ query: "", location: "", purpose: "", type: "", maxPrice: maxAvailable }); };
  const settings = { ...defaultCatalogSettings, ...(page.theme.catalog || {}), primaryColor: page.theme.catalog?.primaryColor || page.theme.primaryColor, backgroundColor: page.theme.catalog?.backgroundColor || page.theme.backgroundColor, surfaceColor: page.theme.catalog?.surfaceColor || page.theme.surfaceColor, textColor: page.theme.catalog?.textColor || page.theme.textColor, mutedTextColor: page.theme.catalog?.mutedTextColor || page.theme.mutedTextColor, buttonTextColor: page.theme.catalog?.buttonTextColor || page.theme.buttonTextColor, borderColor: page.theme.catalog?.borderColor || page.theme.borderColor };
  const theme = { "--lp-primary": settings.primaryColor, "--lp-bg": settings.backgroundColor, "--lp-surface": settings.surfaceColor, "--lp-text": settings.textColor, "--lp-muted": settings.mutedTextColor, "--lp-button-text": settings.buttonTextColor, "--lp-border": settings.borderColor } as CSSProperties;
  return <main className="lp lp-catalog" style={theme}>
    <header className="lp-catalog__bar"><div className="lp-shell"><a href={`/imob/${encodeURIComponent(page.slug)}`} onClick={(event) => { event.preventDefault(); onBack(); }}>{settings.backLabel}</a></div></header>
    <div className="lp-shell lp-catalog__body">
      <nav className="lp-catalog__breadcrumb" aria-label="Navegação"><a href={`/imob/${encodeURIComponent(page.slug)}`} onClick={(event) => { event.preventDefault(); onBack(); }}>{settings.breadcrumbHomeLabel}</a><span>/</span><span>{settings.title}</span></nav>
      <header className="lp-catalog__heading"><div><h1>{settings.title}</h1><p>{settings.description.replace("nossa região", page.identity.address || "nossa região")}</p></div>{onToggleFavoritesOnly&&<button type="button" className={`lp-catalog__favorites${favoritesOnly?" is-active":""}`} onClick={onToggleFavoritesOnly} aria-pressed={favoritesOnly}>♥ {settings.favoritesLabel}{favoriteIds.length>0&&<span> ({favoriteIds.length})</span>}</button>}</header>
      <form className="lp-catalog__filters" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
        <label><span>Localização</span><select value={draftLocation} onChange={(event) => setDraftLocation(event.target.value)}><option value="">Qualquer</option>{locations.map((location) => <option key={location} value={location}>{location}</option>)}</select></label>
        <label><span>Finalidade</span><select value={draftPurpose} onChange={(event) => setDraftPurpose(event.target.value)}><option value="">Qualquer</option><option value="Venda">Venda</option><option value="Aluguel">Aluguel</option></select></label>
        <label><span>Tipo</span><select value={draftType} onChange={(event) => setDraftType(event.target.value)}><option value="">Todos</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label className="lp-catalog__price"><span>Valor até {money(String(draftMaxPrice))}</span><input type="range" min="0" max={maxAvailable} step="1000" value={draftMaxPrice} onChange={(event) => setDraftMaxPrice(Number(event.target.value))}/><small><span>R$ 0</span><span>{money(String(maxAvailable))}</span></small></label>
        <label className="lp-catalog__query"><span>Buscar</span><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Título, cidade ou tipo"/></label>
        <button className="lp-catalog__search" type="submit" aria-label={settings.searchLabel}>⌕ <span>{settings.searchLabel}</span></button>
        {(filters.query || filters.location || filters.purpose || filters.type || filters.maxPrice < maxAvailable) && <button className="lp-catalog__clear" type="button" onClick={resetFilters}>Limpar</button>}
      </form>
      <div className="lp-catalog__summary"><strong>{filtered.length} {filtered.length === 1 ? "imóvel encontrado" : "imóveis encontrados"}</strong>{filtered.length !== properties.length && <span>de {properties.length} ativos no catálogo</span>}</div>
      {filtered.length > 0 ? <div className={`lp-catalog__grid ${filtered.length > 2 ? "has-featured" : ""}`}>{filtered.map((property, index) => <article key={property.id} className={index === 0 && filtered.length > 2 ? "is-featured" : ""} role="button" tabIndex={0} onClick={() => onSelectProperty(property)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectProperty(property); } }}>
        {property.imageUrl ? <img src={property.imageUrl} alt={property.title} loading="lazy"/> : <div className="lp-catalog__placeholder"/>}
        <button type="button" className={`lp-catalog__favorite${favoriteIds.includes(property.id)?" is-active":""}`} onClick={(event) => { event.stopPropagation(); onToggleFavorite?.(property.id); }} aria-label={favoriteIds.includes(property.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"} aria-pressed={favoriteIds.includes(property.id)}>{favoriteIds.includes(property.id) ? "♥" : "♡"}</button>
        <div className="lp-catalog__overlay"><small>{property.location || "Localização sob consulta"}</small><h2>{property.title}</h2><p>{propertyFacts(property).join("  ·  ")}</p><footer><span>{purposeLabel(property.purpose)}</span><strong>{money(property.salePrice || property.rentPrice)}</strong></footer></div>
      </article>)}</div> : <div className="lp-catalog__empty"><h2>Nenhum imóvel encontrado</h2><p>Ajuste os filtros para consultar outros imóveis ativos.</p><button type="button" onClick={resetFilters}>Limpar filtros</button></div>}
    </div>
  </main>;
}
