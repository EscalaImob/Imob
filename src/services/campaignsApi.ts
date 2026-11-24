import { AppApiError } from "./appApi";
import { requestMeta, type MetaStatus, type MetaAsset } from "./metaApi";
import type { Page } from "./conversationsApi";

export interface CampaignOption { propertyId: string; propertyLabel: string; creativeId: string; creativeLabel: string; destinationRef: string; destinationLabel: string }
export interface CampaignDraft { assetId: string; propertyId: string; creativeId: string; objective: "leads"; destination: "website"; destinationRef: string; budgetMinor: number; currency: "BRL"; durationDays: number; housing: true }
export interface CampaignPreview { previewId: string; draft: CampaignDraft; valid: boolean; issues: {code: string; message: string}[]; canPublish: boolean; expiresAt: string; mode: "test" | "live"; summary: {propertyLabel: string; creativeLabel: string; destinationLabel: string; totalBudgetMinor: number}; blockingReason: string | null }
export type CampaignStatus = "draft" | "pending" | "active" | "paused" | "rejected" | "error";
export interface Campaign { id: string; externalCampaignId: string | null; status: CampaignStatus; draft: CampaignDraft; updatedAt: string; mode: "test" | "live"; reason: string | null; canPause: boolean }
export interface CampaignConfirmation { previewId: string; confirmedBudgetMinor: number; idempotencyKey: string }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const key = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const nullable = (v: unknown) => v === null || text(v);
const mode = (v: unknown) => v === "live" || v === "test";
const iso = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v,k));
const draftKeys = ["assetId","propertyId","creativeId","objective","destination","destinationRef","budgetMinor","currency","durationDays","housing"] as const;
export const maxPreviewBudget = 100000000;
export function validDraft(v: unknown): v is CampaignDraft {
  return record(v) && exact(v,draftKeys) && uuid(v.assetId) && uuid(v.propertyId) && uuid(v.creativeId) && uuid(v.destinationRef) && v.objective === "leads" && v.destination === "website" && v.currency === "BRL" && v.housing === true && integer(v.budgetMinor,1,maxPreviewBudget) && integer(v.durationDays,1,30);
}
export function sameDraft(a: CampaignDraft, b: CampaignDraft) { return draftKeys.every(k => a[k] === b[k]); }
export function parseBudget(raw: string): number | null {
  const match = /^(\d{1,7})(?:[,.](\d{1,2}))?$/.exec(raw.trim());
  if (!match) return null;
  const n = Number(match[1])*100 + Number((match[2] ?? "").padEnd(2,"0"));
  return integer(n,1,maxPreviewBudget) ? n : null;
}
export function money(n: number) { return new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(n/100); }
const isOption = (v: unknown): v is CampaignOption => record(v) && uuid(v.propertyId) && uuid(v.creativeId) && uuid(v.destinationRef) && text(v.propertyLabel) && text(v.creativeLabel) && text(v.destinationLabel);
const isPreview = (v: unknown): v is CampaignPreview => record(v) && uuid(v.previewId) && validDraft(v.draft) && typeof v.valid === "boolean" && typeof v.canPublish === "boolean" && iso(v.expiresAt) && mode(v.mode) && nullable(v.blockingReason) && Array.isArray(v.issues) && v.issues.every(i => record(i) && text(i.code) && text(i.message)) && record(v.summary) && text(v.summary.propertyLabel) && text(v.summary.creativeLabel) && text(v.summary.destinationLabel) && v.summary.totalBudgetMinor === v.draft.budgetMinor && (!v.canPublish || (v.valid && v.blockingReason === null));
const isCampaign = (v: unknown): v is Campaign => record(v) && uuid(v.id) && nullable(v.externalCampaignId) && ["draft","pending","active","paused","rejected","error"].some(s=>s===v.status) && validDraft(v.draft) && iso(v.updatedAt) && mode(v.mode) && nullable(v.reason) && typeof v.canPause === "boolean" && ((v.status!=="active" && v.status!=="paused") || text(v.externalCampaignId));
function invalid(): never { throw new AppApiError("Resposta de campanhas inválida.", "INVALID_API_RESPONSE"); }
function validation(): never { throw new AppApiError("Revise os parâmetros da campanha.", "VALIDATION_ERROR",422); }
async function getPage<T>(org: string, path: string, check: (v: unknown)=>v is T, page: number, pageSize: number, signal?: AbortSignal): Promise<Page<T>> {
  if (!integer(page,1) || !integer(pageSize,1,100)) return validation();
  const v = await requestMeta<unknown>(org,`${path}?page=${page}&pageSize=${pageSize}`,signal);
  if (!record(v) || !Array.isArray(v.items) || !v.items.every(check) || v.items.length>pageSize || v.page!==page || v.pageSize!==pageSize || !integer(v.totalItems,0) || !integer(v.totalPages,0)) return invalid();
  return {items:v.items,page,pageSize,totalItems:v.totalItems,totalPages:v.totalPages};
}
const path = "/meta/campaigns";
export const listCampaignOptions = (org: string, page=1, signal?: AbortSignal, pageSize=20) => getPage(org,`${path}/options`,isOption,page,pageSize,signal);
export const listCampaigns = (org: string, page=1, signal?: AbortSignal, pageSize=20) => getPage(org,path,isCampaign,page,pageSize,signal);
export async function previewCampaign(org: string, draft: CampaignDraft, signal?: AbortSignal): Promise<CampaignPreview> {
  if (!validDraft(draft)) return validation();
  const v = await requestMeta<unknown>(org,`${path}/preview`,signal,draft);
  if (!isPreview(v) || !sameDraft(v.draft,draft)) return invalid();
  return v;
}
export async function publishCampaign(org: string, input: CampaignConfirmation, signal?: AbortSignal): Promise<Campaign> {
  if (!record(input) || !exact(input,["previewId","confirmedBudgetMinor","idempotencyKey"]) || !uuid(input.previewId) || !integer(input.confirmedBudgetMinor,1,maxPreviewBudget) || !key(input.idempotencyKey)) return validation();
  const v = await requestMeta<unknown>(org,path,signal,input);
  if (!isCampaign(v)) return invalid();
  return v;
}
export async function pauseCampaign(org: string, id: string, idempotencyKey: string, signal?: AbortSignal): Promise<Campaign> {
  if (!uuid(id) || !key(idempotencyKey)) return validation();
  const v = await requestMeta<unknown>(org,`${path}/${encodeURIComponent(id)}/pause`,signal,{idempotencyKey});
  if (!isCampaign(v) || v.id!==id) return invalid();
  return v;
}
export function selectedAdAccounts(status: MetaStatus | null): MetaAsset[] {
  return status?.connection?.assets.filter(a=>a.type==="ad_account" && a.selected && uuid(a.id)) ?? [];
}
export function canManageAds(status: MetaStatus | null, assetId: string, now=Date.now()): boolean {
  const c=status?.connection;
  const verified=(caps: MetaStatus["capabilities"])=>caps.some(a=>a.key==="adsManage" && a.availability==="available" && iso(a.verifiedAt) && Date.parse(a.verifiedAt)<=now);
  const asset=selectedAdAccounts(status).find(a=>a.id===assetId);
  return !!(status?.mode==="live" && c?.mode==="live" && c.state==="connected" && c.expiresAt && Date.parse(c.expiresAt)>now && c.scopes.includes("ads_management") && asset && verified(asset.capabilities) && verified(c.capabilities) && verified(status.capabilities));
}
export function canConfirmCampaign(status: MetaStatus | null, grants: boolean, preview: CampaignPreview | null, draft: CampaignDraft | null, confirmed: boolean, now=Date.now()) {
  return !!(grants && confirmed && preview?.valid && preview.canPublish && preview.mode==="live" && preview.blockingReason===null && Date.parse(preview.expiresAt)>now && draft && sameDraft(preview.draft,draft) && preview.summary.totalBudgetMinor===draft.budgetMinor && canManageAds(status,draft.assetId,now));
}
export function canPauseCampaign(status: MetaStatus | null, grants: boolean, campaign: Campaign, now=Date.now()) {
  return grants && campaign.mode==="live" && campaign.canPause && canManageAds(status,campaign.draft.assetId,now);
}
// Only a known rejection is definitive. Network/timeout/5xx/unexpected response: preserve command identity.
export function ambiguousCampaignError(error: unknown) {
  return !(error instanceof AppApiError && (error.status===400 || error.status===401 || error.status===403 || error.status===404 || error.status===422 || (error.status===503 && ["FEATURE_DISABLED","META_NOT_CONFIGURED","META_PERMISSION_REQUIRED"].includes(error.code))));
}
