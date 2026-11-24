import { AppApiError } from "./appApi";
import { requestMeta } from "./metaApi";
import type { Page } from "./conversationsApi";
export const triggers = ["lead.imported", "conversation.received"] as const;
export type Trigger = typeof triggers[number];
export const fields = ["intent", "channel", "hasProperty", "hasAssignee", "qualified", "optOut"] as const;
export type Field = typeof fields[number];
export type Condition = { field: Field; operator: "eq" | "exists"; value: string | boolean | null };
export type Action = { type: "assign"; params: { strategy: "existing_distribution" } } | { type: "create_task"; params: { title: string; dueInHours: number } } | { type: "notify"; params: { kind: "in_app" } } | { type: "suggest_stage"; params: { stageId: string } };
export type RuleInput = { name: string; enabled: false; trigger: Trigger; conditions: Condition[]; actions: Action[] };
export type Rule = Omit<RuleInput, "enabled"> & { id: string; enabled: boolean; version: number; updatedAt: string };
export type AutomationEvent = { id: string; trigger: Trigger; leadId: string | null; threadId: string | null; createdAt: string };
export type Execution = { id: string; ruleId: string; ruleVersion: number; eventId: string; status: "simulated" | "succeeded" | "failed" | "skipped"; reason: string | null; createdAt: string; actionResults: { type: Action["type"]; status: "planned" | "succeeded" | "skipped" | "failed"; reason: string | null }[] };
export type Answers = { intentConfirmed: boolean; contactConfirmed: boolean; needConfirmed: boolean };
export type Qualification = Answers & { leadId: string; qualified: boolean; version: number; updatedAt: string };
export type ActionGrants = { manage: boolean; task: boolean; stage: boolean };
export const actionTypes = ["assign", "create_task", "notify", "suggest_stage"] as const;
export const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const int = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const iso = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
export const nullable = (v: unknown) => v === null || typeof v === "string";
export function invalid(): never { throw new AppApiError("Resposta D4 inválida.", "INVALID_API_RESPONSE"); }
export function validation(): never { throw new AppApiError("Revise os parâmetros informados.", "VALIDATION_ERROR", 422); }
const oneOf = (v: unknown, values: readonly unknown[]) => values.includes(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v,k));
const validName = (v: unknown) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 120;
export function actionAllowed(type: Action["type"], grants: ActionGrants, trigger: Trigger) {
  return grants.manage && (type !== "assign" || trigger === "lead.imported") && (type !== "create_task" || grants.task) && (type !== "suggest_stage" || grants.stage);
}
function validCondition(v: unknown): v is Condition {
  if (!record(v) || !exact(v,["field","operator","value"]) || !oneOf(v.field, fields)) return false;
  if (v.operator === "exists") return v.value === null;
  return v.operator === "eq" && (v.value === null || (v.field === "intent" ? oneOf(v.value,["buyer","capture"]) : v.field === "channel" ? oneOf(v.value,["instagram","messenger","whatsapp"]) : typeof v.value === "boolean"));
}
function validAction(v: unknown): v is Action {
  if (!record(v) || !exact(v,["type","params"]) || !record(v.params)) return false;
  const p = v.params;
  switch(v.type) {
    case "assign": return exact(p,["strategy"]) && p.strategy === "existing_distribution";
    case "create_task": return exact(p,["title","dueInHours"]) && validName(p.title) && int(p.dueInHours,1,168);
    case "notify": return exact(p,["kind"]) && p.kind === "in_app";
    case "suggest_stage": return exact(p,["stageId"]) && uuid(p.stageId);
    default: return false;
  }
}
function validRuleBody(v: Record<string, unknown>) {
  return validName(v.name) && oneOf(v.trigger,triggers) && Array.isArray(v.conditions) && v.conditions.length <= 5 && v.conditions.every(validCondition) && Array.isArray(v.actions) && v.actions.length >= 1 && v.actions.length <= 3 && v.actions.every(validAction) && new Set(v.actions.map(a=>a.type)).size === v.actions.length && (v.trigger === "lead.imported" || !v.actions.some(a=>a.type === "assign"));
}
export function validInput(v: unknown): v is RuleInput { return record(v) && exact(v,["name","enabled","trigger","conditions","actions"]) && v.enabled === false && validRuleBody(v); }
const isRule = (v: unknown): v is Rule => record(v) && uuid(v.id) && int(v.version,1) && typeof v.enabled === "boolean" && iso(v.updatedAt) && validRuleBody(v);
const isEvent = (v: unknown): v is AutomationEvent => record(v) && uuid(v.id) && oneOf(v.trigger,triggers) && (v.leadId === null || uuid(v.leadId)) && (v.threadId === null || uuid(v.threadId)) && iso(v.createdAt);
const isExecution = (v: unknown): v is Execution => record(v) && uuid(v.id) && uuid(v.ruleId) && uuid(v.eventId) && int(v.ruleVersion,1) && oneOf(v.status,["simulated","succeeded","failed","skipped"]) && nullable(v.reason) && iso(v.createdAt) && Array.isArray(v.actionResults) && v.actionResults.every(a=>record(a) && oneOf(a.type,actionTypes) && oneOf(a.status,["planned","succeeded","skipped","failed"]) && nullable(a.reason));
const isAnswers = (v: unknown): v is Answers => record(v) && typeof v.intentConfirmed === "boolean" && typeof v.contactConfirmed === "boolean" && typeof v.needConfirmed === "boolean";
const isQualification = (v: unknown): v is Qualification => record(v) && uuid(v.leadId) && int(v.version,1) && iso(v.updatedAt) && typeof v.qualified === "boolean" && v.qualified === (v.intentConfirmed === true && v.contactConfirmed === true && v.needConfirmed === true) && isAnswers(v);
function checked<T>(v: unknown, check: (v: unknown)=>v is T): T { return check(v) ? v : invalid(); }
function paging(page: number) { if (!int(page,1)) return validation(); return `page=${page}&pageSize=20`; }
function pageOf<T>(v: unknown, p: number, check: (v: unknown)=>v is T): Page<T> {
  if (!record(v) || !Array.isArray(v.items) || !v.items.every(check) || v.page !== p || v.pageSize !== 20 || v.items.length > 20 || !int(v.totalItems) || !int(v.totalPages)) return invalid();
  return {items:v.items,page:p,pageSize:20,totalItems:v.totalItems,totalPages:v.totalPages};
}
const base = "/meta/automation";
const idPath = (id: string) => uuid(id) ? encodeURIComponent(id) : validation();
const rulePath = (id: string) => `${base}/rules/${idPath(id)}`;
export async function listRules(org: string,p: number,s?: AbortSignal) { return pageOf(await requestMeta<unknown>(org,`${base}/rules?${paging(p)}`,s),p,isRule); }
export async function listEvents(org: string,p: number,s?: AbortSignal) { return pageOf(await requestMeta<unknown>(org,`${base}/events?${paging(p)}`,s),p,isEvent); }
export async function createRule(org: string,input: RuleInput,s?: AbortSignal) {
  if (!validInput(input)) return validation();
  const body = {...input,name:input.name.trim(),actions:input.actions.map(a=>a.type === "create_task" ? {...a,params:{...a.params,title:a.params.title.trim()}} : a)};
  const v = checked(await requestMeta<unknown>(org,`${base}/rules`,s,body),isRule);
  return !v.enabled && v.version === 1 ? v : invalid();
}
export async function toggleRule(org: string,id: string,enabled: boolean,expectedVersion: number,s?: AbortSignal) {
  if (typeof enabled !== "boolean" || !int(expectedVersion,1)) return validation();
  const v = checked(await requestMeta<unknown>(org,rulePath(id),s,{enabled,expectedVersion},{method:"PATCH"}),isRule);
  return v.id === id && v.enabled === enabled && v.version === expectedVersion+1 ? v : invalid();
}
export async function simulateRule(org: string,id: string,eventId: string,s?: AbortSignal) {
  if (!uuid(eventId)) return validation();
  const v = checked(await requestMeta<unknown>(org,`${rulePath(id)}/simulate`,s,{eventId}),isExecution);
  return v.ruleId === id && v.eventId === eventId && (v.status === "simulated" || v.status === "skipped") && v.actionResults.every(a=>a.status === "planned" || a.status === "skipped") ? v : invalid();
}
export async function listExecutions(org: string,id: string,p: number,s?: AbortSignal) {
  const v = pageOf(await requestMeta<unknown>(org,`${rulePath(id)}/executions?${paging(p)}`,s),p,isExecution);
  return v.items.every(e=>e.ruleId === id) ? v : invalid();
}
export async function getQualification(org: string,id: string,s?: AbortSignal) {
  const v = await requestMeta<unknown>(org,`${base}/qualification/${idPath(id)}`,s,undefined,{allowNull:true});
  return v === null ? null : isQualification(v) && v.leadId === id ? v : invalid();
}
export async function saveQualification(org: string,id: string,answers: Answers,expectedVersion: number,s?: AbortSignal) {
  if (!isAnswers(answers) || !exact(answers as unknown as Record<string,unknown>,["intentConfirmed","contactConfirmed","needConfirmed"]) || !int(expectedVersion)) return validation();
  const v = checked(await requestMeta<unknown>(org,`${base}/qualification/${idPath(id)}`,s,{...answers,expectedVersion},{method:"PUT"}),isQualification);
  return v.leadId === id && v.version === expectedVersion+1 ? v : invalid();
}
