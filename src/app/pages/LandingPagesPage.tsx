import { useEffect, useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LandingPageDocument, LandingSection, LandingTheme } from "../../landing-pages/model";
import { sectionLabels } from "../../landing-pages/model";
import { LandingPageRenderer } from "../../landing-pages/LandingPageRenderer";
import { classicTemplate } from "../../landing-pages/templateRegistry";
import { createLandingPage, getLandingPage, listLandingPages, setLandingPageStatus, updateLandingPage, uploadLandingPageImage, type LandingPageSummary } from "../../services/landingPagesApi";
import { AppApiError } from "../../services/appApi";
import { getOrganizationIdentity } from "../../services/organizationSettingsApi";
import { getProperty, listProperties, listPropertyImages, type PropertyListItem } from "../../services/propertiesApi";

type EditorPanel = "sections" | "preview" | "settings";

function SortableSection({ section, selected, onSelect, onToggle }: { section: LandingSection; selected: boolean; onSelect: () => void; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  return <div ref={setNodeRef} className={`lp-editor-section ${selected ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""}`} style={{ transform: CSS.Transform.toString(transform), transition }}><button type="button" className="lp-editor-drag" aria-label={`Reordenar ${sectionLabels[section.type]}`} {...attributes} {...listeners}>⋮⋮</button><button type="button" onClick={onSelect}><strong>{sectionLabels[section.type]}</strong><small>{section.visible ? "Visível" : "Oculta"}</small></button><button type="button" aria-label={`${section.visible ? "Ocultar" : "Mostrar"} seção`} onClick={onToggle}>{section.visible ? "◉" : "○"}</button></div>;
}

function publicUrl(slug: string) { return `${location.origin}/imob/${slug}`; }
const themeFields: Array<[keyof LandingTheme, string]> = [["primaryColor", "Cor principal"], ["secondaryColor", "Cor secundária"], ["backgroundColor", "Fundo"], ["surfaceColor", "Superfícies"], ["textColor", "Texto"], ["mutedTextColor", "Texto de apoio"], ["buttonTextColor", "Texto dos botões"], ["borderColor", "Bordas"]];
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
    if(key==="imageStorageKey")return null;
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
  return <fieldset className="lp-editor-fieldset lp-property-picker"><legend>Imóveis do catálogo</legend><p>Selecione até 9 imóveis ativos e publicados. As imagens e os dados públicos serão carregados automaticamente.</p>{items.length===0?<small>Nenhum imóvel ativo e publicado disponível.</small>:items.map((item)=><label key={item.id}><input type="checkbox" checked={selectedIds.has(item.id)} disabled={disabled} onChange={()=>onToggle(item)}/><span><strong>{item.title}</strong><small>{[item.city,item.state].filter(Boolean).join(" / ")||item.internalCode}</small></span></label>)}</fieldset>;
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
  const [editorPanel, setEditorPanel] = useState<EditorPanel>("preview");
  const [catalogProperties, setCatalogProperties] = useState<PropertyListItem[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    if (localPreviewMode) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    void listLandingPages(organizationId).then((items) => { if (active) { setList(items); if (items[0]) void open(items[0].id); } }).catch((cause) => active && setError(cause instanceof AppApiError ? cause.message : "Não foi possível carregar as landing pages.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [organizationId]);

  useEffect(()=>{if(localPreviewMode)return;let active=true;void listProperties(organizationId,{status:"active",pageSize:100}).then(result=>{if(active)setCatalogProperties(result.items.filter(item=>item.published&&!item.archivedAt));}).catch(()=>{if(active)setCatalogProperties([]);});return()=>{active=false;};},[organizationId]);

  async function open(id: string) { setBusy(true); setError(""); try { const value = withNavigation(await getLandingPage(organizationId, id)); setPage(value); setSelectedId(value.sections[0]?.id || null); } catch (cause) { setError(cause instanceof AppApiError ? cause.message : "Não foi possível abrir a página."); } finally { setBusy(false); } }
  async function create() { setBusy(true); setError(""); try { if (localPreviewMode) { const value = createLocalPreview(); setPage(value); setSelectedId(value.sections[0]?.id || null); setMessage("Prévia local criada — nada será salvo"); return; } const identity = await getOrganizationIdentity(organizationId); const value = await createLandingPage(organizationId, { name: identity.brandName || identity.organizationName, templateId: classicTemplate.id }); setList((current) => [{ id: value.id, name: value.name, slug: value.slug, status: value.status, templateId: value.templateId, updatedAt: value.updatedAt, publishedAt: value.publishedAt }, ...current]); setPage(value); setSelectedId(value.sections[0]?.id || null); } catch (cause) { setError(cause instanceof AppApiError ? cause.message : "Não foi possível criar a landing page."); } finally { setBusy(false); } }
  function updateSection(id: string, recipe: (section: LandingSection) => LandingSection) { setPage((current) => current ? { ...current, sections: current.sections.map((section) => section.id === id ? recipe(section) : section) } : current); }
  function dragEnd(event: DragEndEvent) { if (!page || event.over === null || event.active.id === event.over.id) return; const oldIndex = page.sections.findIndex((section) => section.id === event.active.id); const newIndex = page.sections.findIndex((section) => section.id === event.over!.id); setPage({ ...page, sections: arrayMove(page.sections, oldIndex, newIndex).map((section, order) => ({ ...section, order })) }); }
  async function save() { if (!page) return; if (localPreviewMode) { setMessage("Alterações aplicadas somente nesta prévia local"); return; } setBusy(true); setMessage("Salvando..."); try { const value = await updateLandingPage(organizationId, page.id, { name: page.name, theme: page.theme, seo: page.seo, sections: page.sections, propertyIds: page.properties.map((property) => property.id) }); setPage(value); setMessage("Alterações salvas"); } catch (cause) { setMessage(""); setError(cause instanceof AppApiError ? cause.message : "Não foi possível salvar."); } finally { setBusy(false); } }
  async function publish() { if (!page) return; if (localPreviewMode) { const status = page.status === "published" ? "draft" : "published"; setPage({ ...page, status, publishedAt: status === "published" ? new Date().toISOString() : null }); setMessage(status === "published" ? "Publicação simulada localmente" : "Prévia voltou para rascunho"); return; } setBusy(true); try { const value = await setLandingPageStatus(organizationId, page.id, page.status === "published" ? "unpublished" : "published"); setPage(value); setMessage(value.status === "published" ? "Página publicada" : "Página despublicada"); } catch (cause) { setError(cause instanceof AppApiError ? cause.message : "Não foi possível alterar a publicação."); } finally { setBusy(false); } }
  async function copy() { if (!page) return; await navigator.clipboard.writeText(publicUrl(page.slug)); setMessage("Link copiado"); }
  function openPreview() { if (!page) return; const key = crypto.randomUUID(); localStorage.setItem(`imob:landing-preview:${key}`, JSON.stringify({ createdAt: Date.now(), page })); const previewWindow = window.open(`/imob/preview/?previewKey=${encodeURIComponent(key)}`, "_blank"); if (previewWindow) previewWindow.opener = null; else setError("O navegador bloqueou a nova guia. Libere pop-ups para visualizar a landing page."); }
  async function toggleCatalogProperty(item:PropertyListItem){if(!page)return;if(page.properties.some(property=>property.id===item.id)){setPage({...page,properties:page.properties.filter(property=>property.id!==item.id)});return;}if(page.properties.length>=9){setError("Você pode destacar no máximo 9 imóveis.");return;}setBusy(true);setError("");try{const [detail,images]=await Promise.all([getProperty(organizationId,item.id),listPropertyImages(organizationId,item.id)]);const primary=images.find(image=>image.primary)||images[0];setPage(current=>current?{...current,properties:[...current.properties,{id:detail.id,title:detail.siteTitle||detail.title,description:detail.siteDescription,location:detail.siteLocationText||detail.publicLocation,type:detail.type,purpose:detail.purpose,salePrice:detail.salePrice,rentPrice:detail.rentPrice,totalArea:detail.totalArea,usefulArea:detail.usefulArea,landArea:detail.landArea,builtArea:detail.builtArea,areaUnit:detail.areaUnit,bedrooms:detail.bedrooms,suites:detail.suites,bathrooms:detail.bathrooms,parkingSpaces:detail.parkingSpaces,amenities:detail.amenities,condominiumAmenities:detail.condominiumAmenities,viewCount:0,imageUrl:primary?.viewUrl||null,imageUrls:images.map(image=>image.viewUrl)}]}:current);}catch(cause){setError(cause instanceof AppApiError?cause.message:"Não foi possível carregar o imóvel selecionado.");}finally{setBusy(false);}}

  const selected = useMemo(() => page?.sections.find((section) => section.id === selectedId) || null, [page, selectedId]);
  if (loading) return <section className="app-data-card lp-editor-state">Carregando landing pages...</section>;
  if (!page) return <section className="app-page lp-manager-empty"><div><small>MARKETING & SITE</small><h1>Landing Pages</h1><p>{localPreviewMode ? "Modo de prévia local: crie e edite livremente. Nada será enviado para a API ou salvo no banco." : "Crie uma vitrine pública profissional, conectada ao seu catálogo e aos Leads do Site."}</p>{error && <div className="app-inline-error">{error}</div>}<button type="button" className="app-primary-button" disabled={(!canManage && !localPreviewMode) || busy} onClick={() => void create()}>+ Criar Landing Page</button></div>{list.length > 0 && <div>{list.map((item) => <button key={item.id} onClick={() => void open(item.id)}>{item.name}</button>)}</div>}</section>;

  return <section className={`lp-editor is-mobile-${editorPanel}`}>
    <header className="lp-editor-top"><div><small>{localPreviewMode ? "LANDING PAGE BUILDER · PRÉVIA LOCAL" : "LANDING PAGE BUILDER"}</small><input aria-label="Nome da landing page" value={page.name} disabled={!canManage && !localPreviewMode} onChange={(event) => setPage({ ...page, name: event.target.value })} /><span className={`lp-status lp-status--${page.status}`}>{page.status === "published" ? "Publicada" : page.status === "draft" ? "Rascunho" : "Despublicada"}</span></div><div>{message && <span role="status">{message}</span>}<button type="button" className="app-secondary-button" onClick={openPreview}>Ver em nova guia</button>{!localPreviewMode && <><button type="button" className="app-secondary-button" onClick={() => void copy()}>Copiar link</button><a className="app-secondary-button" href={publicUrl(page.slug)} target="_blank" rel="noreferrer">Abrir página publicada</a></>}{(canManage || localPreviewMode) && <><button type="button" className="app-secondary-button" disabled={busy} onClick={() => void publish()}>{page.status === "published" ? "Voltar para rascunho" : localPreviewMode ? "Simular publicação" : "Publicar"}</button><button type="button" className="app-primary-button" disabled={busy} onClick={() => void save()}>{localPreviewMode ? "Aplicar na prévia" : "Salvar"}</button></>}</div></header>
    {error && <div className="app-inline-error">{error}</div>}
    <div className="lp-editor-mobile-tabs" role="tablist" aria-label="Painéis do editor"><button type="button" className={editorPanel === "sections" ? "is-active" : ""} onClick={() => setEditorPanel("sections")}>Seções</button><button type="button" className={editorPanel === "preview" ? "is-active" : ""} onClick={() => setEditorPanel("preview")}>Preview</button><button type="button" className={editorPanel === "settings" ? "is-active" : ""} onClick={() => setEditorPanel("settings")}>Editar</button></div>
    <div className="lp-editor-layout">
      <aside><h2>Seções</h2><p>Arraste para reorganizar.</p><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={page.sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>{page.sections.map((section) => <SortableSection key={section.id} section={section} selected={section.id === selectedId} onSelect={() => { setSelectedId(section.id); setEditorPanel("settings"); }} onToggle={() => updateSection(section.id, (current) => ({ ...current, visible: !current.visible }))} />)}</SortableContext></DndContext></aside>
      <div className="lp-editor-center"><div className="lp-editor-viewport"><button className={viewport === "desktop" ? "is-active" : ""} onClick={() => setViewport("desktop")}>Desktop</button><button className={viewport === "tablet" ? "is-active" : ""} onClick={() => setViewport("tablet")}>Tablet</button><button className={viewport === "mobile" ? "is-active" : ""} onClick={() => setViewport("mobile")}>Mobile</button></div><div className={`lp-editor-preview is-${viewport}`}><LandingPageRenderer page={page} preview /></div></div>
      <aside className="lp-editor-settings"><h2>{selected ? sectionLabels[selected.type] : "Aparência"}</h2>{selected?.type==="featured-properties"&&<PropertyPicker items={catalogProperties} selectedIds={new Set(page.properties.map(property=>property.id))} disabled={busy||(!canManage&&!localPreviewMode)} onToggle={(item)=>void toggleCatalogProperty(item)}/>} {selected && <ContentFields content={selected.content} disabled={!canManage && !localPreviewMode} onChange={(content) => updateSection(selected.id, (section) => ({ ...section, content }))} onImageUpload={async(file)=>{if(localPreviewMode){const imageUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});return{imageUrl,storageKey:""};}return uploadLandingPageImage(organizationId,page.id,file);}} />}<details><summary>Identidade e contato</summary>{identityFields.map(([key, label]) => <label key={key}>{label}{key === "description" ? <textarea rows={4} value={page.identity[key] || ""} onChange={(event) => setPage({ ...page, identity: { ...page.identity, [key]: event.target.value || null } })} /> : <input value={page.identity[key] || ""} onChange={(event) => setPage({ ...page, identity: { ...page.identity, [key]: event.target.value || null } })} />}</label>)}</details><details open><summary>Cores da página</summary>{themeFields.map(([key, label]) => <label key={key}>{label}<span className="lp-color"><input type="color" value={page.theme[key]} onChange={(event) => setPage({ ...page, theme: { ...page.theme, [key]: event.target.value } })} /><input value={page.theme[key]} maxLength={7} onChange={(event) => setPage({ ...page, theme: { ...page.theme, [key]: event.target.value } })} /></span></label>)}</details><details><summary>SEO</summary><label>Título da página<input value={page.seo.title} onChange={(event) => setPage({ ...page, seo: { ...page.seo, title: event.target.value } })} /></label><label>Descrição para busca<textarea value={page.seo.description} onChange={(event) => setPage({ ...page, seo: { ...page.seo, description: event.target.value } })} /></label></details></aside>
    </div>
  </section>;
}
