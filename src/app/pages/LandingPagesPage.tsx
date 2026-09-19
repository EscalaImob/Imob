import { useEffect, useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { defaultCatalogSettings, defaultPropertySettings, type LandingPageDocument, type LandingProperty, type LandingSection, type LandingTheme } from "../../landing-pages/model";
import { sectionLabels } from "../../landing-pages/model";
import { LandingPageRenderer } from "../../landing-pages/LandingPageRenderer";
import { PropertyCatalogPage } from "../../landing-pages/PropertyCatalogPage";
import { PropertyDetailsPage } from "../../landing-pages/PropertyDetailsPage";
import { emptyPropertyInsight, mapEmbedUrl, previewPublicMapPoint, readPropertyInsights } from "../../landing-pages/propertyInsights";
import { classicTemplate } from "../../landing-pages/templateRegistry";
import { createLandingPage, getLandingPage, listLandingPages, refreshLandingPropertyInsights, setLandingPageStatus, updateLandingPage, uploadLandingPageImage, type LandingPageSummary } from "../../services/landingPagesApi";
import { AppApiError } from "../../services/appApi";
import { getOrganizationIdentity } from "../../services/organizationSettingsApi";
import { getProperty, listProperties, listPropertyImages, type PropertyListItem } from "../../services/propertiesApi";
import { listAuthorizations } from "../../services/authorizationsApi";
import { PropertyInsightsEditor } from "./PropertyInsightsEditor";

type EditorPanel = "sections" | "preview" | "settings";

function SortableSection({ section, selected, onSelect, onToggle }: { section: LandingSection; selected: boolean; onSelect: () => void; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  return <div ref={setNodeRef} className={`lp-editor-section ${selected ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""}`} style={{ transform: CSS.Transform.toString(transform), transition }}><button type="button" className="lp-editor-drag" aria-label={`Reordenar ${sectionLabels[section.type]}`} {...attributes} {...listeners}>⋮⋮</button><button type="button" onClick={onSelect}><strong>{sectionLabels[section.type]}</strong><small>{section.visible ? "Visível" : "Oculta"}</small></button><button type="button" aria-label={`${section.visible ? "Ocultar" : "Mostrar"} seção`} onClick={onToggle}>{section.visible ? "◉" : "○"}</button></div>;
}

function publicUrl(slug: string) { return `${location.origin}/imob/${slug}`; }
const themeFields: Array<[Exclude<keyof LandingTheme, "catalog" | "property">, string]> = [["primaryColor", "Cor principal"], ["secondaryColor", "Cor secundária"], ["backgroundColor", "Fundo"], ["surfaceColor", "Superfícies"], ["textColor", "Texto"], ["mutedTextColor", "Texto de apoio"], ["buttonTextColor", "Texto dos botões"], ["borderColor", "Bordas"]];
const localPreviewMode = import.meta.env.DEV && import.meta.env.VITE_LANDING_PAGES_PREVIEW_MODE === "true";

function withNavigation(page: LandingPageDocument): LandingPageDocument {
  let sections = page.sections;
  if (!sections.some((section) => section.type === "navigation")) {
    const hero = sections.find((section) => section.type === "hero");
    const content = hero?.content ?? {};
    const navigation: LandingSection = { id: crypto.randomUUID(), type: "navigation", order: 0, visible: true, settings: {}, content: { propertiesLabel: content.navPropertiesLabel || "Imóveis", propertiesLink: "#imoveis", advertiseLabel: "Anunciar", advertiseLink: "#contato", aboutLabel: content.navAboutLabel || "Sobre mim", aboutLink: "#sobre", favoriteLabel: "Favoritos" } };
    sections = [navigation, ...sections.map((section, index) => ({ ...section, order: index + 1 }))];
  }
  const defaultContent = new Map(classicTemplate.createSections().map((section) => [section.type, section.content]));
  sections = sections.map((section) => {
    const enriched = { ...section, content: { ...(defaultContent.get(section.type) || {}), ...section.content } };
    if (section.type === "regions") {
      const regionItems = Array.isArray(enriched.content.items) ? enriched.content.items.map((item) => item && typeof item === "object" && !Array.isArray(item) ? { visible: true, ...item } : item) : [];
      return { ...enriched, content: { ...enriched.content, items: regionItems } };
    }
    if (section.type !== "featured-properties") return enriched;
    const content = { ...enriched.content };
    delete content.images;
    return { ...enriched, content };
  });
  return { ...page, sections };
}

function createLocalPreview(): LandingPageDocument {
  const now = new Date().toISOString();
  return { id: `local-${crypto.randomUUID()}`, name: "Minha Landing Page", slug: "minha-landing-page-preview", templateId: classicTemplate.id, templateVersion: classicTemplate.version, schemaVersion: 1, status: "draft", theme: { ...classicTemplate.defaultTheme }, seo: { title: "Minha Landing Page", description: "Uma vitrine profissional de imóveis.", openGraphTitle: "", openGraphDescription: "", openGraphImage: null }, identity: { name: "Sua Imobiliária", description: "Atendimento imobiliário profissional, próximo e transparente.", logoUrl: null, email: "contato@imobiliaria.com.br", phone: "(00) 0000-0000", whatsapp: "(00) 00000-0000", instagramUrl: null, creci: "CRECI 00000-F", address: "Sua cidade e região" }, sections: classicTemplate.createSections(), properties: [], publishedAt: null, updatedAt: now };
}

const contentLabels: Record<string, string> = { title: "Título", eyebrow: "Subtítulo", description: "Descrição", buttonLabel: "Texto do botão", buttonLink: "Destino do botão", imageUrl: "Imagem (URL)", navPropertiesLabel: "Menu: imóveis", navAboutLabel: "Menu: sobre", navContactLabel: "Menu: contato", propertiesStatLabel: "Indicador: imóveis", credentialStatLabel: "Indicador: credenciamento", locationStatLabel: "Indicador: localização", nameLabel: "Formulário: nome", whatsappLabel: "Formulário: WhatsApp", emailLabel: "Formulário: e-mail", interestLabel: "Formulário: interesse", buyerOptionLabel: "Opção: comprar ou alugar", captureOptionLabel: "Opção: anunciar imóvel", messageLabel: "Formulário: mensagem", successMessage: "Mensagem de sucesso", copyrightText: "Texto de direitos autorais" };
const identityFields: Array<[keyof LandingPageDocument["identity"], string]> = [["name", "Nome público"], ["description", "Apresentação"], ["logoUrl", "Logo (URL)"], ["email", "E-mail"], ["phone", "Telefone"], ["whatsapp", "WhatsApp"], ["instagramUrl", "Instagram (URL)"], ["creci", "CRECI"], ["address", "Localização/endereço"]];
Object.assign(contentLabels,{propertiesLabel:"Menu: imóveis",propertiesLink:"Link: imóveis",advertiseLabel:"Menu: anunciar",advertiseLink:"Link: anunciar",aboutLabel:"Menu: sobre mim",aboutLink:"Link: sobre mim",favoriteLabel:"Acessibilidade: favoritos",marketYearsValue:"Indicador: experiência",marketYearsLabel:"Legenda: experiência",images:"Imagens dos nove destaques",visible:"Exibir este item",officeLabel:"Contato: escritório",whatsappInfoLabel:"Contato: WhatsApp",emailInfoLabel:"Contato: e-mail",websiteLabel:"Contato: website",websiteValue:"Website",creciLabel:"Contato: CRECI",navigationTitle:"Rodapé: título da navegação",navigationItems:"Links de navegação",regionsTitle:"Rodapé: título das regiões",regionItems:"Links de regiões",instagramUrl:"Instagram (URL)",tiktokUrl:"TikTok (URL)",youtubeUrl:"YouTube (URL)",privacyLabel:"Texto da política de privacidade",privacyLink:"Link da política de privacidade",developerLabel:"Crédito de desenvolvimento"});
Object.assign(contentLabels,{showDescription:"Mostrar descrição",showLocation:"Mostrar localização pública",showType:"Mostrar tipo do imóvel",showPurpose:"Mostrar finalidade",showPrice:"Mostrar preço",showArea:"Mostrar área",showBedrooms:"Mostrar quartos",showSuites:"Mostrar suítes",showBathrooms:"Mostrar banheiros",showParkingSpaces:"Mostrar vagas",showAmenities:"Mostrar comodidades"});

async function loadLandingProperty(organizationId: string, propertyId: string): Promise<LandingProperty> {
  const [detail, images] = await Promise.all([getProperty(organizationId, propertyId), listPropertyImages(organizationId, propertyId)]);
  const primary = images.find((image) => image.primary) || images[0];
  return { id: detail.id, title: detail.siteTitle || detail.title, description: detail.siteDescription, location: detail.siteLocationText || detail.publicLocation, type: detail.type, purpose: detail.purpose, salePrice: detail.salePrice, rentPrice: detail.rentPrice, totalArea: detail.totalArea, usefulArea: detail.usefulArea, landArea: detail.landArea, builtArea: detail.builtArea, areaUnit: detail.areaUnit, bedrooms: detail.bedrooms, suites: detail.suites, bathrooms: detail.bathrooms, parkingSpaces: detail.parkingSpaces, amenities: detail.amenities, condominiumAmenities: detail.condominiumAmenities, viewCount: 0, imageUrl: primary?.viewUrl || null, imageUrls: images.map((image) => image.viewUrl), ...previewPublicMapPoint(detail.siteAddressVisibility, detail.latitude, detail.longitude), siteAddressVisibility: detail.siteAddressVisibility };
}

function isPublicAuthorization(item: { status: string; startsAt: string | null; endsAt: string | null }): boolean {
  if (item.status !== "active" && item.status !== "expiring" && item.status !== "signed") return false;
  const today = new Date().toISOString().slice(0, 10);
  const startsAt = item.startsAt?.slice(0, 10);
  const endsAt = item.endsAt?.slice(0, 10);
  return (!startsAt || startsAt <= today) && (!endsAt || endsAt >= today);
}

function landingPropertyFromListItem(item: PropertyListItem): LandingProperty {
  return {
    id: item.id,
    title: item.title,
    description: null,
    location: [item.city, item.state].filter(Boolean).join(" / ") || null,
    type: item.type,
    purpose: item.purpose,
    salePrice: item.salePrice,
    rentPrice: item.rentPrice,
    totalArea: null,
    usefulArea: null,
    landArea: null,
    builtArea: null,
    areaUnit: "m2",
    bedrooms: null,
    suites: null,
    bathrooms: null,
    parkingSpaces: null,
    amenities: [],
    condominiumAmenities: [],
    viewCount: 0,
    imageUrl: null,
    imageUrls: [],
  };
}

function editorControl(key: string, value: string, onChange: (value: string) => void) {
  const multiline = key === "description" || key === "successMessage";
  return <label key={key}>{contentLabels[key] || key}{multiline ? <textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} /> : <input value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function ImageUploadControl({ value, disabled, onChange, onUpload }: { value: string; disabled: boolean; onChange: (value: string) => void; onUpload: (file: File) => Promise<void> }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  async function select(file: File | undefined) { if (!file) return; if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size<=0||file.size>12*1024*1024){setUploadError("Selecione uma imagem JPG, PNG ou WEBP de até 12 MB.");return;} setUploading(true); setUploadError(""); try { await onUpload(file); } catch (cause) { setUploadError(cause instanceof AppApiError ? cause.message : "Não foi possível anexar a imagem."); } finally { setUploading(false); } }
  return <div className="lp-editor-image-field"><label>Imagem (URL)<input value={value} disabled={disabled || uploading} onChange={(event) => onChange(event.target.value)} /></label><label className="lp-editor-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading} onChange={(event) => { void select(event.target.files?.[0]); event.currentTarget.value = ""; }} /><span>{uploading ? "Enviando..." : "Anexar imagem"}</span></label><small>JPG, PNG ou WEBP — máximo de 12 MB.</small>{uploadError && <small className="lp-editor-upload-error">{uploadError}</small>}</div>;
}

function ContentFields({ content, disabled, onChange, onImageUpload }: { content: Record<string, unknown>; disabled: boolean; onChange: (content: Record<string, unknown>) => void; onImageUpload: (file: File) => Promise<{ imageUrl: string; storageKey: string }> }) {
  const isRegions = content.allowAdditionalItems === true;
  const imageControl=(value:string,record:Record<string,unknown>,commit:(next:Record<string,unknown>)=>void)=><ImageUploadControl value={value} disabled={disabled} onChange={(next)=>commit({...record,imageUrl:next,imageStorageKey:""})} onUpload={async(file)=>{const uploaded=await onImageUpload(file);commit({...record,imageUrl:uploaded.imageUrl,imageStorageKey:uploaded.storageKey});}}/>;
  return <>{Object.entries(content).map(([key, value]) => {
    if(key==="imageStorageKey" || key==="propertyInsights")return null;
    if(key==="imageUrl"&&typeof value==="string")return <div key={key}>{imageControl(value,content,onChange)}</div>;
    if (typeof value === "boolean") return key === "allowAdditionalItems" ? null : <label className="lp-editor-visibility" key={key}><input type="checkbox" checked={value} disabled={disabled} onChange={(event)=>onChange({...content,[key]:event.target.checked})}/>{contentLabels[key] || key}</label>;
    if (typeof value === "string") return editorControl(key, value, (next) => onChange({ ...content, [key]: next }));
    if (!Array.isArray(value)) return null;
    return <fieldset className="lp-editor-fieldset" key={key}><legend>{contentLabels[key] || "Itens"}</legend>{value.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const commit=(next:Record<string,unknown>)=>{const items=[...value];items[index]=next;onChange({...content,[key]:items});};
      return <div className="lp-editor-nested" key={index}><strong>Item {index + 1}</strong>{Object.entries(record).map(([itemKey, itemValue]) => {if(itemKey==="imageStorageKey")return null;if(itemKey==="visible"&&typeof itemValue==="boolean")return <label className="lp-editor-visibility" key={itemKey}><input type="checkbox" checked={itemValue} disabled={disabled} onChange={(event)=>commit({...record,visible:event.target.checked})}/>{contentLabels.visible}</label>;if(itemKey==="imageUrl"&&typeof itemValue==="string")return <div key={itemKey}>{imageControl(itemValue,record,commit)}</div>;return typeof itemValue === "string" ? editorControl(itemKey, itemValue, (next) => commit({ ...record, [itemKey]: next })) : null;})}{isRegions&&<button type="button" className="app-secondary-button" disabled={disabled} onClick={()=>onChange({...content,[key]:value.filter((_,itemIndex)=>itemIndex!==index)})}>Remover cidade</button>}</div>;
    })}{isRegions&&<button type="button" className="app-secondary-button" disabled={disabled} onClick={()=>onChange({...content,[key]:[...value,{visible:true,title:"Nova cidade",imageUrl:"",imageStorageKey:""}]})}>+ Adicionar cidade</button>}</fieldset>;
  })}</>;
}

function PropertyPicker({items,selectedIds,disabled,onToggle}:{items:PropertyListItem[];selectedIds:Set<string>;disabled:boolean;onToggle:(item:PropertyListItem)=>void}) {
  return <fieldset className="lp-editor-fieldset lp-property-picker"><legend>Imóveis do catálogo</legend><p>Selecione até 9 imóveis ativos. As imagens e somente os dados públicos serão carregados automaticamente.</p>{items.length===0?<small>Nenhum imóvel ativo disponível.</small>:items.map((item)=><label key={item.id}><input type="checkbox" checked={selectedIds.has(item.id)} disabled={disabled} onChange={()=>onToggle(item)}/><span><strong>{item.title}</strong><small>{[item.city,item.state].filter(Boolean).join(" / ")||item.internalCode}</small></span></label>)}</fieldset>;
}

const catalogPageText: Array<[keyof typeof defaultCatalogSettings, string]> = [["title", "Título"], ["description", "Descrição"], ["backLabel", "Texto para voltar"], ["breadcrumbHomeLabel", "Breadcrumb: início"], ["searchLabel", "Botão de busca"], ["favoritesLabel", "Botão de favoritos"]];
const propertyPageText: Array<[keyof typeof defaultPropertySettings, string]> = [["backLabel", "Texto para voltar"], ["breadcrumbHomeLabel", "Breadcrumb: início"], ["photosLabel", "Botão de fotos"], ["contactButtonLabel", "Botão de contato"], ["saveLabel", "Salvar favorito"], ["savedLabel", "Favorito salvo"], ["shareLabel", "Compartilhar"], ["aboutTitle", "Título: sobre o imóvel"], ["featuresTitle", "Título: características"], ["valuationTitle", "Título: valorização"], ["proximityTitle", "Título: proximidades"], ["nearbyTitle", "Título: pontos próximos"], ["similarTitle", "Título: imóveis semelhantes"], ["similarActionLabel", "Link: ver todos"]];
const subpageColors: Array<["primaryColor" | "backgroundColor" | "surfaceColor" | "textColor" | "mutedTextColor" | "buttonTextColor" | "borderColor", string]> = [["primaryColor", "Cor principal"], ["backgroundColor", "Fundo"], ["surfaceColor", "Superfícies"], ["textColor", "Texto"], ["mutedTextColor", "Texto de apoio"], ["buttonTextColor", "Texto dos botões"], ["borderColor", "Bordas"]];

function SubpageSettingsEditor({ theme, disabled, onChange }: { theme: LandingTheme; disabled: boolean; onChange: (theme: LandingTheme) => void }) {
  const catalog = { ...defaultCatalogSettings, ...(theme.catalog || {}) };
  const property = { ...defaultPropertySettings, ...(theme.property || {}) };
  const updateCatalog = (key: keyof typeof catalog, value: string) => onChange({ ...theme, catalog: { ...catalog, [key]: value } });
  const updateProperty = (key: keyof typeof property, value: string) => onChange({ ...theme, property: { ...property, [key]: value } });
  return <details open><summary>Páginas públicas</summary><fieldset className="lp-editor-fieldset"><legend>Catálogo de imóveis</legend><p>Personalize a página que lista todos os imóveis publicados.</p>{catalogPageText.map(([key, label]) => <label key={key}>{label}{key === "description" ? <textarea rows={3} value={catalog[key]} disabled={disabled} onChange={(event) => updateCatalog(key, event.target.value)} /> : <input value={catalog[key]} disabled={disabled} onChange={(event) => updateCatalog(key, event.target.value)} />}</label>)}<div className="lp-editor-subpage-colors"><strong>Cores do catálogo</strong>{subpageColors.map(([key, label]) => <label key={key}>{label}<span className="lp-color"><input type="color" value={catalog[key]} disabled={disabled} onChange={(event) => updateCatalog(key, event.target.value)} /><input value={catalog[key]} disabled={disabled} maxLength={7} onChange={(event) => updateCatalog(key, event.target.value)} /></span></label>)}</div></fieldset><fieldset className="lp-editor-fieldset"><legend>Página do imóvel</legend><p>Personalize detalhes, galeria, contato e informações locais.</p>{propertyPageText.map(([key, label]) => <label key={key}>{label}{key === "nearbyTitle" || key === "aboutTitle" ? <textarea rows={2} value={property[key]} disabled={disabled} onChange={(event) => updateProperty(key, event.target.value)} /> : <input value={property[key]} disabled={disabled} onChange={(event) => updateProperty(key, event.target.value)} />}</label>)}<div className="lp-editor-subpage-colors"><strong>Cores da página do imóvel</strong>{subpageColors.map(([key, label]) => <label key={key}>{label}<span className="lp-color"><input type="color" value={property[key]} disabled={disabled} onChange={(event) => updateProperty(key, event.target.value)} /><input value={property[key]} disabled={disabled} maxLength={7} onChange={(event) => updateProperty(key, event.target.value)} /></span></label>)}</div></fieldset></details>;
}

export function LandingPagesPage({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const [list, setList] = useState<LandingPageSummary[]>([]);
  const [page, setPage] = useState<LandingPageDocument | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewPage, setPreviewPage] = useState<"landing" | "catalog" | "property">("landing");
  const [previewPropertyId, setPreviewPropertyId] = useState<string | null>(null);
  const [previewSelectedProperty, setPreviewSelectedProperty] = useState<LandingProperty | null>(null);
  const [editorPanel, setEditorPanel] = useState<EditorPanel>("preview");
  const [catalogProperties, setCatalogProperties] = useState<PropertyListItem[]>([]);
  const [previewCatalogProperties, setPreviewCatalogProperties] = useState<LandingProperty[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    if (localPreviewMode) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    void listLandingPages(organizationId).then((items) => { if (active) { setList(items); if (items[0]) void open(items[0].id); } }).catch((cause) => active && setError(cause instanceof AppApiError ? cause.message : "Não foi possível carregar as landing pages.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [organizationId]);

  useEffect(()=>{if(localPreviewMode)return;let active=true;void listProperties(organizationId,{status:"active",view:"all",pageSize:100}).then(result=>{if(active)setCatalogProperties(result.items.filter(item=>!item.archivedAt));}).catch(cause=>{if(active){setCatalogProperties([]);setError(cause instanceof AppApiError?cause.message:"Não foi possível carregar os imóveis do catálogo.");}});return()=>{active=false;};},[organizationId]);

  // Retry after a landing page is opened. A transient auth/network failure on
  // the first dashboard request must not permanently leave the editor with
  // only the highlighted properties.
  useEffect(() => {
    if (localPreviewMode || !page?.id || catalogProperties.length > 0) return;
    let active = true;
    void listProperties(organizationId, { status: "active", view: "all", pageSize: 100 }).then((result) => {
      if (active) setCatalogProperties(result.items.filter((item) => !item.archivedAt));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [organizationId, page?.id, catalogProperties.length]);

  async function open(id: string) { setBusy(true); setError(""); try { const value = withNavigation(await getLandingPage(organizationId, id)); setPage(value); setSelectedId(value.sections[0]?.id || null); } catch (cause) { setError(cause instanceof AppApiError ? cause.message : "Não foi possível abrir a página."); } finally { setBusy(false); } }
  async function create() { setBusy(true); setError(""); try { if (localPreviewMode) { const value = createLocalPreview(); setPage(value); setSelectedId(value.sections[0]?.id || null); setMessage("Prévia local criada — nada será salvo"); return; } const identity = await getOrganizationIdentity(organizationId); const value = await createLandingPage(organizationId, { name: identity.brandName || identity.organizationName, templateId: classicTemplate.id }); setList((current) => [{ id: value.id, name: value.name, slug: value.slug, status: value.status, templateId: value.templateId, updatedAt: value.updatedAt, publishedAt: value.publishedAt }, ...current]); setPage(value); setSelectedId(value.sections[0]?.id || null); } catch (cause) { setError(cause instanceof AppApiError ? cause.message : "Não foi possível criar a landing page."); } finally { setBusy(false); } }
  const pagePropertyIds = page?.properties.map((property) => property.id).join(",") || "";
  useEffect(() => {
    if (localPreviewMode || !catalogProperties.length) return;
    let active = true;
    void (async () => {
      try {
        const first = await listAuthorizations(organizationId, { view: "all", page: 1, pageSize: 100 });
        const authorizations = [...first.items];
        for (let pageNumber = 2; pageNumber <= first.totalPages; pageNumber += 1) {
          const next = await listAuthorizations(organizationId, { view: "all", page: pageNumber, pageSize: 100 });
          authorizations.push(...next.items);
        }
        // Several authorization records may point to the same property. Use
        // a Set so the catalog always contains one card per authorized imóvel.
        const authorizedIds = new Set(authorizations.filter(isPublicAuthorization).map((item) => item.property.id));
        const existingById = new Map((page?.properties || []).map((property) => [property.id, property]));
        const values = await Promise.all(catalogProperties.filter((item) => authorizedIds.has(item.id)).map((item) => existingById.get(item.id) || loadLandingProperty(organizationId, item.id)));
        if (active) {
          setPreviewCatalogProperties(values);
          setPage((current) => current ? { ...current, catalogProperties: values } : current);
        }
      } catch {
        if (active) {
          // Keep the editor usable if the authorization request briefly fails.
          // The public endpoint still enforces authorization server-side; this
          // fallback only prevents an unrelated session/network hiccup from
          // hiding active properties in the editor preview.
          const existingById = new Map((page?.properties || []).map((property) => [property.id, property]));
          const fallback = catalogProperties.map((item) => existingById.get(item.id) || landingPropertyFromListItem(item));
          setPreviewCatalogProperties(fallback);
          setPage((current) => current ? { ...current, catalogProperties: fallback } : current);
        }
      }
    })();
    return () => { active = false; };
  }, [organizationId, catalogProperties, pagePropertyIds]);

  function updateSection(id: string, recipe: (section: LandingSection) => LandingSection) { setPage((current) => current ? { ...current, sections: current.sections.map((section) => section.id === id ? recipe(section) : section) } : current); }
  function dragEnd(event: DragEndEvent) { if (!page || event.over === null || event.active.id === event.over.id) return; const oldIndex = page.sections.findIndex((section) => section.id === event.active.id); const newIndex = page.sections.findIndex((section) => section.id === event.over!.id); setPage({ ...page, sections: arrayMove(page.sections, oldIndex, newIndex).map((section, order) => ({ ...section, order })) }); }
  async function save() {
    if (!page) return;
    if (localPreviewMode) { setMessage("Alterações aplicadas somente nesta prévia local"); return; }
    setBusy(true);
    setMessage("Salvando...");
    try {
      let sections = page.sections;
      let mapFailures = 0;
      const featured = sections.find((section) => section.type === "featured-properties");
      if (featured) {
        const existing = readPropertyInsights(featured);
        const missing = page.properties.filter((property) => {
          if (property.siteAddressVisibility === "hidden" || !property.location?.trim()) return false;
          const insight = existing.find((item) => item.propertyId === property.id) || emptyPropertyInsight(property.id);
          const automaticPoint = Number.isFinite(property.publicLatitude) && Number.isFinite(property.publicLongitude)
            ? { mapLatitude: String(property.publicLatitude), mapLongitude: String(property.publicLongitude) } : {};
          return !mapEmbedUrl({ ...insight, ...automaticPoint }) || !insight.nearbySource || (!insight.valuationUpdatedAt && !insight.valuationUnavailableReason);
        });
        if (missing.length) {
          setMessage("Atualizando mapa, proximidades e valorização das regiões...");
          const enriched = [...existing];
          for (let index = 0; index < missing.length; index += 2) {
            const batch = await Promise.allSettled(missing.slice(index, index + 2).map((property) => refreshLandingPropertyInsights(organizationId, page.id, property.id)));
            batch.forEach((result, offset) => {
              if (result.status === "rejected") { mapFailures += 1; return; }
              const propertyId = missing[index + offset]!.id;
              const current = enriched.find((item) => item.propertyId === propertyId) || emptyPropertyInsight(propertyId);
              const existingIndex = enriched.findIndex((item) => item.propertyId === propertyId);
              if (existingIndex >= 0) enriched[existingIndex] = { ...current, ...result.value, propertyId };
              else enriched.push({ ...current, ...result.value, propertyId });
            });
          }
          sections = sections.map((section) => section.id === featured.id ? { ...section, content: { ...section.content, propertyInsights: enriched } } : section);
        }
      }
      const value = await updateLandingPage(organizationId, page.id, { name: page.name, theme: page.theme, seo: page.seo, sections, propertyIds: page.properties.map((property) => property.id) });
      setPage(value);
      setMessage(mapFailures ? `Alterações salvas. Não foi possível localizar ${mapFailures} imóvel(is).` : "Alterações salvas");
    } catch (cause) {
      setMessage("");
      setError(cause instanceof AppApiError ? cause.message : "Não foi possível salvar.");
    } finally { setBusy(false); }
  }
  async function publish() { if (!page) return; if (localPreviewMode) { const status = page.status === "published" ? "draft" : "published"; setPage({ ...page, status, publishedAt: status === "published" ? new Date().toISOString() : null }); setMessage(status === "published" ? "Publicação simulada localmente" : "Prévia voltou para rascunho"); return; } setBusy(true); try { const value = await setLandingPageStatus(organizationId, page.id, page.status === "published" ? "unpublished" : "published"); setPage(value); setMessage(value.status === "published" ? "Página publicada" : "Página despublicada"); } catch (cause) { setError(cause instanceof AppApiError ? cause.message : "Não foi possível alterar a publicação."); } finally { setBusy(false); } }
  async function copy() { if (!page) return; await navigator.clipboard.writeText(publicUrl(page.slug)); setMessage("Link copiado"); }
  function openPreview() { if (!page) return; const key = crypto.randomUUID(); localStorage.setItem(`imob:landing-preview:${key}`, JSON.stringify({ createdAt: Date.now(), page })); const previewWindow = window.open(`/imob/preview/?previewKey=${encodeURIComponent(key)}`, "_blank"); if (previewWindow) previewWindow.opener = null; else setError("O navegador bloqueou a nova guia. Libere pop-ups para visualizar a landing page."); }
  async function toggleCatalogProperty(item:PropertyListItem){if(!page)return;if(page.properties.some(property=>property.id===item.id)){setPage({...page,properties:page.properties.filter(property=>property.id!==item.id)});return;}if(page.properties.length>=9){setError("Você pode destacar no máximo 9 imóveis.");return;}setBusy(true);setError("");try{const [detail,images]=await Promise.all([getProperty(organizationId,item.id),listPropertyImages(organizationId,item.id)]);const primary=images.find(image=>image.primary)||images[0];setPage(current=>current?{...current,properties:[...current.properties,{id:detail.id,title:detail.siteTitle||detail.title,description:detail.siteDescription,location:detail.siteLocationText||detail.publicLocation,type:detail.type,purpose:detail.purpose,salePrice:detail.salePrice,rentPrice:detail.rentPrice,totalArea:detail.totalArea,usefulArea:detail.usefulArea,landArea:detail.landArea,builtArea:detail.builtArea,areaUnit:detail.areaUnit,bedrooms:detail.bedrooms,suites:detail.suites,bathrooms:detail.bathrooms,parkingSpaces:detail.parkingSpaces,amenities:detail.amenities,condominiumAmenities:detail.condominiumAmenities,viewCount:0,imageUrl:primary?.viewUrl||null,imageUrls:images.map(image=>image.viewUrl),...previewPublicMapPoint(detail.siteAddressVisibility,detail.latitude,detail.longitude),siteAddressVisibility:detail.siteAddressVisibility}]}:current);}catch(cause){setError(cause instanceof AppApiError?cause.message:"Não foi possível carregar o imóvel selecionado.");}finally{setBusy(false);}}

  const selected = useMemo(() => page?.sections.find((section) => section.id === selectedId) || null, [page, selectedId]);
  const previewCatalog = previewCatalogProperties.length > 0 ? previewCatalogProperties : (page?.catalogProperties || []);
  const previewProperty = previewSelectedProperty || [...previewCatalog, ...(page?.properties || [])].find((property) => property.id === previewPropertyId) || page?.properties[0] || previewCatalog[0] || null;
  if (loading) return <section className="app-data-card lp-editor-state">Carregando Meu Site...</section>;
  if (!page) return <section className="app-page lp-manager-empty"><div><small>MARKETING & SITE</small><h1>Meu Site</h1><p>{localPreviewMode ? "Modo de prévia local: crie e edite livremente. Nada será enviado para a API ou salvo no banco." : "Crie uma vitrine pública profissional, conectada ao seu catálogo e aos Leads do Site."}</p>{error && <div className="app-inline-error">{error}</div>}<button type="button" className="app-primary-button" disabled={(!canManage && !localPreviewMode) || busy} onClick={() => void create()}>+ Criar site</button></div>{list.length > 0 && <div>{list.map((item) => <button key={item.id} onClick={() => void open(item.id)}>{item.name}</button>)}</div>}</section>;
  const selectPreviewProperty = (property: LandingProperty) => { setPreviewSelectedProperty(property); setPreviewPropertyId(property.id); setPreviewPage("property"); };
  const previewView = previewPage === "landing" ? <LandingPageRenderer page={page} preview /> : previewPage === "catalog" ? <PropertyCatalogPage page={page} catalogProperties={previewCatalog} onBack={() => setPreviewPage("landing")} onSelectProperty={selectPreviewProperty} /> : previewProperty ? <PropertyDetailsPage page={{ ...page, properties: previewCatalog.length > 0 ? previewCatalog : page.properties }} property={previewProperty} section={page.sections.find((section) => section.type === "featured-properties")} preview onBack={() => setPreviewPage("catalog")} onSelectProperty={selectPreviewProperty} /> : <div className="lp-editor-preview-empty"><h2>Nenhum imóvel selecionado</h2><p>Selecione imóveis em destaque para visualizar a página do imóvel.</p></div>;

  return <section className={`lp-editor is-mobile-${editorPanel}`}>
    <header className="lp-editor-top"><div><small>{localPreviewMode ? "LANDING PAGE BUILDER · PRÉVIA LOCAL" : "LANDING PAGE BUILDER"}</small><input aria-label="Nome da landing page" value={page.name} disabled={!canManage && !localPreviewMode} onChange={(event) => setPage({ ...page, name: event.target.value })} /><span className={`lp-status lp-status--${page.status}`}>{page.status === "published" ? "Publicada" : page.status === "draft" ? "Rascunho" : "Despublicada"}</span></div><div className="lp-editor-top-actions"><div className="lp-editor-top-actions-main">{message && <span role="status">{message}</span>}<button type="button" className="app-secondary-button" onClick={openPreview}>Ver em nova guia</button>{!localPreviewMode && <><button type="button" className="app-secondary-button" onClick={() => void copy()}>Copiar link</button><a className="app-secondary-button" href={publicUrl(page.slug)} target="_blank" rel="noreferrer">Abrir página publicada</a></>}{(canManage || localPreviewMode) && <button type="button" className="app-secondary-button" disabled={busy} onClick={() => void publish()}>{page.status === "published" ? "Voltar para rascunho" : localPreviewMode ? "Simular publicação" : "Publicar"}</button>}</div><div className="lp-editor-top-actions-secondary">{(canManage || localPreviewMode) && <button type="button" className="app-primary-button" disabled={busy} onClick={() => void save()}>{localPreviewMode ? "Aplicar na prévia" : "Salvar"}</button>}<div className="lp-editor-preview-tabs lp-editor-header-preview-tabs"><button className={previewPage === "landing" ? "is-active" : ""} type="button" onClick={() => setPreviewPage("landing")}>Landing</button><button className={previewPage === "catalog" ? "is-active" : ""} type="button" onClick={() => setPreviewPage("catalog")}>Catálogo</button><button className={previewPage === "property" ? "is-active" : ""} type="button" onClick={() => setPreviewPage("property")} disabled={!previewProperty}>Página do imóvel</button></div></div></div></header>
    {error && <div className="app-inline-error">{error}</div>}
    <div className="lp-editor-mobile-tabs" role="tablist" aria-label="Painéis do editor"><button type="button" className={editorPanel === "sections" ? "is-active" : ""} onClick={() => setEditorPanel("sections")}>Seções</button><button type="button" className={editorPanel === "preview" ? "is-active" : ""} onClick={() => setEditorPanel("preview")}>Preview</button><button type="button" className={editorPanel === "settings" ? "is-active" : ""} onClick={() => setEditorPanel("settings")}>Editar</button></div>
    <div className="lp-editor-layout">
      <aside><h2>Seções</h2><p>Arraste para reorganizar.</p><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={page.sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>{page.sections.map((section) => <SortableSection key={section.id} section={section} selected={section.id === selectedId} onSelect={() => { setSelectedId(section.id); setEditorPanel("settings"); }} onToggle={() => updateSection(section.id, (current) => ({ ...current, visible: !current.visible }))} />)}</SortableContext></DndContext></aside>
      <div className="lp-editor-center"><div className="lp-editor-viewport"><button className={viewport === "desktop" ? "is-active" : ""} onClick={() => setViewport("desktop")}>Desktop</button><button className={viewport === "tablet" ? "is-active" : ""} onClick={() => setViewport("tablet")}>Tablet</button><button className={viewport === "mobile" ? "is-active" : ""} onClick={() => setViewport("mobile")}>Mobile</button></div><div className={`lp-editor-preview is-${viewport}`}>{previewView}</div></div>
      <aside className="lp-editor-settings"><h2>{selected ? sectionLabels[selected.type] : "Aparência"}</h2>{selected?.type==="featured-properties"&&<PropertyPicker items={catalogProperties} selectedIds={new Set(page.properties.map(property=>property.id))} disabled={busy||(!canManage&&!localPreviewMode)} onToggle={(item)=>void toggleCatalogProperty(item)}/>} {selected?.type==="featured-properties"&&<PropertyInsightsEditor properties={page.properties} section={selected} disabled={busy||(!canManage&&!localPreviewMode)} onChange={(content)=>updateSection(selected.id,(section)=>({...section,content}))} onRefresh={!localPreviewMode&&canManage?async(propertyId)=>{const enriched=await refreshLandingPropertyInsights(organizationId,page.id,propertyId);updateSection(selected.id,(section)=>{const list=readPropertyInsights(section);const current=list.find((item)=>item.propertyId===propertyId)||emptyPropertyInsight(propertyId);return{...section,content:{...section.content,propertyInsights:[...list.filter((item)=>item.propertyId!==propertyId),{...current,...enriched,propertyId}]}};});}:undefined}/>} {selected && <ContentFields content={selected.content} disabled={!canManage && !localPreviewMode} onChange={(content) => updateSection(selected.id, (section) => ({ ...section, content }))} onImageUpload={async(file)=>{if(localPreviewMode){const imageUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});return{imageUrl,storageKey:""};}return uploadLandingPageImage(organizationId,page.id,file);}} />}<details><summary>Identidade e contato</summary>{identityFields.map(([key, label]) => <label key={key}>{label}{key === "description" ? <textarea rows={4} value={page.identity[key] || ""} onChange={(event) => setPage({ ...page, identity: { ...page.identity, [key]: event.target.value || "" } })} /> : <input value={page.identity[key] || ""} onChange={(event) => setPage({ ...page, identity: { ...page.identity, [key]: event.target.value || "" } })} />}</label>)}</details><details open><summary>Cores da página</summary>{themeFields.map(([key, label]) => <label key={key}>{label}<span className="lp-color"><input type="color" value={page.theme[key]} onChange={(event) => setPage({ ...page, theme: { ...page.theme, [key]: event.target.value } })} /><input value={page.theme[key]} maxLength={7} onChange={(event) => setPage({ ...page, theme: { ...page.theme, [key]: event.target.value } })} /></span></label>)}</details><SubpageSettingsEditor theme={page.theme} disabled={!canManage && !localPreviewMode} onChange={(theme) => setPage({ ...page, theme })}/><details><summary>SEO</summary><label>Título da página<input value={page.seo.title} onChange={(event) => setPage({ ...page, seo: { ...page.seo, title: event.target.value } })} /></label><label>Descrição para busca<textarea value={page.seo.description} onChange={(event) => setPage({ ...page, seo: { ...page.seo, description: event.target.value } })} /></label></details></aside>
    </div>
  </section>;
}
