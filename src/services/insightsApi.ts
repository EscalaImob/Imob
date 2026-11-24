import { requestMeta, type Availability } from "./metaApi";
import { record, int, iso, nullable, uuid, invalid, validation } from "./automationApi";
export type InsightFilters = { dateFrom: string; dateTo: string; timezone: string; assetId?: string };
export type Insight = Omit<InsightFilters,"assetId"> & { assetId: string|null; source: "meta"|"crm"; currency: string|null; spendMinor: number|null; leadCount: number|null; qualifiedCount: number|null; cplMinor: number|null; costPerQualifiedMinor: number|null; lastSyncAt: string|null; availability: Availability; reason: string|null; periodComplete: boolean };
export type CrmKpis = { availability: Availability; reason: string|null; leadCount: number|null; qualifiedCount: number|null; respondedCount: number|null; slaOnTimeCount: number|null; slaLateCount: number|null; slaOpenOverdueCount: number|null; opportunityCount: number|null; stages: {funnelId:string;stageId:string;label:string;count:number}[]; asOf:string; snapshotAt:string };
export type Insights = {items:Insight[];crm:CrmKpis};
const available = (v: unknown) => typeof v === "string" && ["available","pending","denied"].includes(v);
const number = (v: unknown) => v === null || int(v);
export function dayInZone(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const get = (type:string)=>parts.find(p=>p.type===type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function calendarDay(v: string) { const t = Date.parse(`${v}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(t) && new Date(t).toISOString().slice(0,10) === v ? t : NaN; }
export function validFilters(f: InsightFilters, now = new Date()) {
  try { const start=calendarDay(f.dateFrom),end=calendarDay(f.dateTo); return Number.isFinite(start) && Number.isFinite(end) && end>=start && (end-start)/86400000 < 90 && f.dateTo <= dayInZone(f.timezone,now) && (f.assetId===undefined || uuid(f.assetId)) && !!f.timezone && !/^[+-]/.test(f.timezone); } catch { return false; }
}
export function formatMetric(v: number|null) { return v === null ? "Indisponível" : new Intl.NumberFormat("pt-BR").format(v); }
export function formatMoney(v: number|null, currency: string|null) {
  if(v===null || currency===null) return "Indisponível";
  try { const formatter = new Intl.NumberFormat("pt-BR",{style:"currency",currency}); return formatter.format(v / 10**(formatter.resolvedOptions().maximumFractionDigits ?? 2)); } catch { return "Indisponível"; }
}
const metricKeys = ["spendMinor","leadCount","qualifiedCount","cplMinor","costPerQualifiedMinor"];
const crmKeys = ["leadCount","qualifiedCount","respondedCount","slaOnTimeCount","slaLateCount","slaOpenOverdueCount","opportunityCount"];
function isInsight(v: unknown, f:InsightFilters): v is Insight {
  return record(v) && (v.source==="meta" || v.source==="crm") && v.dateFrom===f.dateFrom && v.dateTo===f.dateTo && v.timezone===f.timezone && (v.assetId===null || uuid(v.assetId)) && (v.currency===null || (typeof v.currency==="string" && /^[A-Z]{3}$/.test(v.currency))) && metricKeys.every(k=>number(v[k])) && (v.lastSyncAt===null || iso(v.lastSyncAt)) && available(v.availability) && nullable(v.reason) && typeof v.periodComplete==="boolean" && (v.source==="meta" ? v.qualifiedCount===null && v.costPerQualifiedMinor===null && (v.cplMinor===null || (v.periodComplete && int(v.leadCount,1) && int(v.spendMinor) && v.cplMinor===Math.round(v.spendMinor/v.leadCount) && v.currency!==null)) && (f.assetId===undefined || v.assetId===null || v.assetId===f.assetId) : v.currency===null && v.spendMinor===null && v.cplMinor===null && v.costPerQualifiedMinor===null && v.lastSyncAt===null && (!f.assetId || (v.leadCount===null && v.qualifiedCount===null && v.availability!=="available")));
}
function isCrm(v:unknown,f:InsightFilters): v is CrmKpis {
  return record(v) && available(v.availability) && nullable(v.reason) && crmKeys.every(k=>number(v[k])) && iso(v.asOf) && iso(v.snapshotAt) && Array.isArray(v.stages) && v.stages.every(s=>record(s)&&uuid(s.funnelId)&&uuid(s.stageId)&&typeof s.label==="string"&&int(s.count)) && (!f.assetId || (crmKeys.every(k=>v[k]===null) && v.stages.length===0 && v.availability!=="available"));
}
export async function getInsights(org:string,f:InsightFilters,s?:AbortSignal):Promise<Insights> {
  if(!validFilters(f)) return validation();
  const q=new URLSearchParams({dateFrom:f.dateFrom,dateTo:f.dateTo,timezone:f.timezone}); if(f.assetId) q.set("assetId",f.assetId);
  const v=await requestMeta<unknown>(org,`/meta/insights?${q}`,s);
  if(!record(v)||!Array.isArray(v.items)||!v.items.every(i=>isInsight(i,f))||new Set(v.items.map(i=>i.source)).size!==v.items.length||!isCrm(v.crm,f)) return invalid();
  return {items:v.items,crm:v.crm};
}
