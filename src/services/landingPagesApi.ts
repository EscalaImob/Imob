import { ensureValidAuthSession } from "../auth/session";
import type { LandingPageDocument, LandingProperty, LandingSection, LandingTheme, LandingSeo } from "../landing-pages/model";
import type { PropertyInsight } from "../landing-pages/propertyInsights";
import { AppApiError } from "./appApi";
import { getProperty } from "./propertiesApi";

const apiBase=()=>{const value=import.meta.env.VITE_API_URL?.trim();if(!value)throw new AppApiError("A plataforma ainda não está conectada à API.","API_NOT_CONFIGURED");return value.replace(/\/+$/u,"")};
async function tenantRequest<T>(organizationId:string,path:string,init:RequestInit={}):Promise<T>{const session=await ensureValidAuthSession();if(!session)throw new AppApiError("Sua sessão expirou.","UNAUTHORIZED",401);const response=await fetch(`${apiBase()}${path}`,{...init,headers:{authorization:`Bearer ${session.accessToken}`,"x-organization-id":organizationId,...(init.body?{"content-type":"application/json"}:{}),...(init.headers||{})}});const body=await response.json().catch(()=>null) as {success?:boolean;data?:T;error?:{code?:string;message?:string}}|null;if(!response.ok||body?.success!==true||body.data===undefined)throw new AppApiError(body?.error?.message||"Não foi possível concluir a operação.",body?.error?.code||"API_ERROR",response.status);return body.data;}

export interface LandingPageSummary { id:string; name:string; slug:string; status:"draft"|"published"|"unpublished"; templateId:string; updatedAt:string; publishedAt:string|null; }
export const listLandingPages=(organizationId:string)=>tenantRequest<LandingPageSummary[]>(organizationId,"/portfolio/landing-pages");
export const createLandingPage=(organizationId:string,input:{name:string;templateId:string})=>tenantRequest<LandingPageDocument>(organizationId,"/portfolio/landing-pages",{method:"POST",body:JSON.stringify(input)});
export const getLandingPage=(organizationId:string,id:string)=>tenantRequest<LandingPageDocument>(organizationId,`/portfolio/landing-pages/${encodeURIComponent(id)}`);
export const updateLandingPage=(organizationId:string,id:string,input:{name:string;theme:LandingTheme;seo:LandingSeo;sections:LandingSection[];propertyIds:string[]})=>tenantRequest<LandingPageDocument>(organizationId,`/portfolio/landing-pages/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify(input)});
export const setLandingPageStatus=(organizationId:string,id:string,status:"published"|"unpublished")=>tenantRequest<LandingPageDocument>(organizationId,`/portfolio/landing-pages/${encodeURIComponent(id)}/${status==="published"?"publish":"unpublish"}`,{method:"POST"});
export type RefreshedPropertyInsight = Pick<PropertyInsight,"mapLatitude"|"mapLongitude"|"proximityDescription"|"nearby"|"nearbySource"|"nearbyUpdatedAt"|"valuations"|"valuationSource"|"valuationSourceUrl"|"valuationPeriod"|"valuationCity"|"valuationUpdatedAt"|"valuationUnavailableReason">;
export async function refreshLandingPropertyInsights(organizationId:string,pageId:string,propertyId:string):Promise<RefreshedPropertyInsight>{
  if(import.meta.env.DEV && import.meta.env.VITE_LANDING_INSIGHTS_LOCAL==="true"){
    const property=await getProperty(organizationId,propertyId);
    const response=await fetch("/__local/landing-property-insights",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({latitude:property.latitude,longitude:property.longitude,street:property.street,number:property.number,postalCode:property.postalCode,neighborhood:property.neighborhood,city:property.city,state:property.state,publicLocation:property.siteLocationText||property.publicLocation,siteAddressVisibility:property.siteAddressVisibility})});
    const body=await response.json().catch(()=>null) as {data?:RefreshedPropertyInsight;error?:string}|null;
    if(!response.ok||!body?.data)throw new AppApiError(body?.error||"Não foi possível consultar as proximidades.","LOCAL_INSIGHTS_ERROR",response.status);
    return body.data;
  }
  return tenantRequest<RefreshedPropertyInsight>(organizationId,`/portfolio/landing-pages/${encodeURIComponent(pageId)}/properties/${encodeURIComponent(propertyId)}/insights/refresh`,{method:"POST"});
}
async function lookupLocalPropertyMap(property:LandingProperty):Promise<Pick<PropertyInsight,"mapLatitude"|"mapLongitude">>{
  const response=await fetch("/__local/landing-property-insights",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mapOnly:true,publicLocation:property.location,latitude:property.publicLatitude?.toString()||null,longitude:property.publicLongitude?.toString()||null,siteAddressVisibility:property.siteAddressVisibility||"neighborhood"})});
  const body=await response.json().catch(()=>null) as {data?:Pick<PropertyInsight,"mapLatitude"|"mapLongitude">;error?:string}|null;
  if(!response.ok||!body?.data)throw new AppApiError(body?.error||"Não foi possível localizar a região.","LOCAL_MAP_ERROR",response.status);
  return body.data;
}
export async function refreshLocalPreviewPropertyInsights(property:LandingProperty):Promise<RefreshedPropertyInsight>{
  if(!import.meta.env.DEV||import.meta.env.VITE_LANDING_INSIGHTS_LOCAL!=="true")throw new AppApiError("Dados locais indisponíveis.","LOCAL_INSIGHTS_DISABLED");
  const response=await fetch("/__local/landing-property-insights",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({latitude:property.publicLatitude?.toString()||null,longitude:property.publicLongitude?.toString()||null,publicLocation:property.location,city:property.location,state:null,siteAddressVisibility:property.siteAddressVisibility||"neighborhood"})});
  const body=await response.json().catch(()=>null) as {data?:RefreshedPropertyInsight;error?:string}|null;
  if(!response.ok||!body?.data)throw new AppApiError(body?.error||"Não foi possível atualizar os dados locais.","LOCAL_INSIGHTS_ERROR",response.status);
  return body.data;
}
export async function lookupLocalPreviewPropertyMap(property:LandingProperty):Promise<Pick<PropertyInsight,"mapLatitude"|"mapLongitude">>{
  if(!import.meta.env.DEV||import.meta.env.VITE_LANDING_INSIGHTS_LOCAL!=="true")throw new AppApiError("Mapa local indisponível.","LOCAL_MAP_DISABLED");
  return lookupLocalPropertyMap(property);
}
export async function lookupLandingPropertyMap(organizationId:string,pageId:string,property:LandingProperty):Promise<Pick<PropertyInsight,"mapLatitude"|"mapLongitude">>{
  if(import.meta.env.DEV && import.meta.env.VITE_LANDING_INSIGHTS_LOCAL==="true")return lookupLocalPropertyMap(property);
  return tenantRequest<Pick<PropertyInsight,"mapLatitude"|"mapLongitude">>(organizationId,`/portfolio/landing-pages/${encodeURIComponent(pageId)}/properties/${encodeURIComponent(property.id)}/insights/refresh`,{method:"POST",body:JSON.stringify({mapOnly:true})});
}

interface LandingImageUploadReady { storageKey:string; uploadUrl:string; requiredHeaders:Record<string,string>; }
export interface LandingImageUploadConfirmed { storageKey:string; imageUrl:string; }
export async function uploadLandingPageImage(organizationId:string,id:string,file:File):Promise<LandingImageUploadConfirmed>{const ready=await tenantRequest<LandingImageUploadReady>(organizationId,`/portfolio/landing-pages/${encodeURIComponent(id)}/images/upload-url`,{method:"POST",body:JSON.stringify({contentType:file.type,sizeBytes:file.size})});const upload=await fetch(ready.uploadUrl,{method:"PUT",headers:ready.requiredHeaders,body:file});if(!upload.ok)throw new AppApiError("Não foi possível enviar a imagem.","IMAGE_UPLOAD_FAILED",upload.status);return tenantRequest<LandingImageUploadConfirmed>(organizationId,`/portfolio/landing-pages/${encodeURIComponent(id)}/images/confirm`,{method:"POST",body:JSON.stringify({storageKey:ready.storageKey,contentType:file.type,sizeBytes:file.size})});}

export async function getPublicLandingPage(slug:string):Promise<LandingPageDocument>{const response=await fetch(`${apiBase()}/public/imob/${encodeURIComponent(slug)}`);const body=await response.json().catch(()=>null) as {success?:boolean;data?:LandingPageDocument;error?:{message?:string}}|null;if(!response.ok||body?.success!==true||!body.data)throw new AppApiError(body?.error?.message||"Página não encontrada.","PUBLIC_LANDING_NOT_FOUND",response.status);return body.data;}
export async function getPublicLandingCatalog(slug:string):Promise<LandingPageDocument>{const response=await fetch(`${apiBase()}/public/imob/${encodeURIComponent(slug)}/properties`);const body=await response.json().catch(()=>null) as {success?:boolean;data?:LandingPageDocument;error?:{message?:string}}|null;if(!response.ok||body?.success!==true||!body.data)throw new AppApiError(body?.error?.message||"Página não encontrada.","PUBLIC_LANDING_CATALOG_NOT_FOUND",response.status);return body.data;}
export async function submitPublicLandingLead(slug:string,input:Record<string,string>):Promise<void>{const response=await fetch(`${apiBase()}/public/imob/${encodeURIComponent(slug)}/leads`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)});if(!response.ok)throw new AppApiError("Não foi possível enviar sua mensagem.","PUBLIC_LEAD_ERROR",response.status);}
export async function trackPublicLandingPropertyView(slug:string,propertyId:string):Promise<void>{await fetch(`${apiBase()}/public/imob/${encodeURIComponent(slug)}/properties/${encodeURIComponent(propertyId)}/view`,{method:"POST",keepalive:true}).catch(()=>undefined);}
export async function getPublicLandingPropertyInsights(slug:string,propertyId:string):Promise<RefreshedPropertyInsight>{
  const response=await fetch(`${apiBase()}/public/imob/${encodeURIComponent(slug)}/properties/${encodeURIComponent(propertyId)}/insights`);
  const body=await response.json().catch(()=>null) as {success?:boolean;data?:{insights?:RefreshedPropertyInsight};error?:{message?:string}}|null;
  if(!response.ok||body?.success!==true||!body.data?.insights)throw new AppApiError(body?.error?.message||"Não foi possível carregar os dados da região.","PUBLIC_PROPERTY_INSIGHTS_ERROR",response.status);
  return body.data.insights;
}
