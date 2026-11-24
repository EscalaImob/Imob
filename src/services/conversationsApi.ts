import { AppApiError } from "./appApi";
import { requestMeta, type Channel } from "./metaApi";

export type ThreadStatus = "open" | "closed";
export type SendBlockedReason = "FORBIDDEN" | "CONVERSATION_CLOSED" | "OPT_OUT" | "WINDOW_CLOSED" | "CONNECTION_REVOKED" | "META_PERMISSION_REQUIRED" | "META_NOT_CONFIGURED" | "FEATURE_DISABLED" | "HANDOFF_REQUIRED" | "META_UNAVAILABLE";
export interface Thread {
  id: string;
  channel: Channel;
  assetId: string;
  externalThreadId: string;
  contactId: string | null;
  leadId: string | null;
  opportunityId: string | null;
  propertyId: string | null;
  assigneeMembershipId: string | null;
  status: ThreadStatus;
  participantName: string | null;
  lastMessageAt: string | null;
  windowEndsAt: string | null;
  optOut: boolean;
  canSend: boolean;
  sendBlockedReason: string | null;
}
export interface Message {
  id: string;
  threadId: string;
  externalMessageId: string | null;
  direction: "inbound" | "outbound";
  text: string | null;
  status: "received" | "pending" | "sent" | "delivered" | "read" | "failed";
  createdAt: string;
}
export interface Page<T> { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number }
export interface ConversationFilters { channel?: Channel; status?: ThreadStatus; assigneeMembershipId?: string; page?: number; pageSize?: number }
export interface SendInput { text: string; idempotencyKey: string }
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nullableString = (v: unknown) => v === null || typeof v === "string";
const nullableUuid = (v: unknown) => v === null || isUuid(v);
const iso = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
const nullableIso = (v: unknown) => v === null || iso(v);
const channels = ["instagram", "messenger", "whatsapp"];
const statuses = ["open", "closed"];
const isThread = (v: unknown): v is Thread => record(v) && isUuid(v.id) && isUuid(v.assetId)
  && channels.some(c => c === v.channel) && statuses.some(s => s === v.status)
  && typeof v.externalThreadId === "string" && nullableUuid(v.contactId) && nullableUuid(v.leadId)
  && nullableUuid(v.opportunityId) && nullableUuid(v.propertyId) && nullableUuid(v.assigneeMembershipId)
  && nullableString(v.participantName) && nullableIso(v.lastMessageAt) && nullableIso(v.windowEndsAt)
  && typeof v.optOut === "boolean" && typeof v.canSend === "boolean" && nullableString(v.sendBlockedReason)
  && (v.canSend ? v.sendBlockedReason === null : typeof v.sendBlockedReason === "string");
const isMessage = (v: unknown): v is Message => record(v) && isUuid(v.id) && isUuid(v.threadId)
  && nullableString(v.externalMessageId) && nullableString(v.text) && iso(v.createdAt)
  && (v.direction === "inbound" || v.direction === "outbound")
  && ["received", "pending", "sent", "delivered", "read", "failed"].some(s => s === v.status);
function invalid(): never { throw new AppApiError("Resposta de conversas inválida.", "INVALID_API_RESPONSE"); }
function validation(): never { throw new AppApiError("Parâmetros de conversa inválidos.", "VALIDATION_ERROR", 422); }
const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
function checkedPage<T>(value: unknown, check: (v: unknown) => v is T, page: number, pageSize: number): Page<T> {
  if (!record(value) || !Array.isArray(value.items) || !value.items.every(check)
    || value.page !== page || value.pageSize !== pageSize || !integer(value.totalItems, 0) || !integer(value.totalPages, 0)
    || value.items.length > pageSize) return invalid();
  return { items: value.items, page, pageSize, totalItems: value.totalItems, totalPages: value.totalPages };
}
function paging(page = 1, pageSize = 20) {
  if (!integer(page, 1) || !integer(pageSize, 1, 100)) return validation();
  return new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
}
function path(id: string) {
  if (!isUuid(id)) return validation();
  return `/meta/conversations/${encodeURIComponent(id)}`;
}
export async function listConversations(org: string, filters: ConversationFilters = {}, signal?: AbortSignal): Promise<Page<Thread>> {
  const { page = 1, pageSize = 20, channel, status, assigneeMembershipId } = filters;
  const q = paging(page, pageSize);
  if (channel !== undefined) { if (!channels.includes(channel)) return validation(); q.set("channel", channel); }
  if (status !== undefined) { if (!statuses.includes(status)) return validation(); q.set("status", status); }
  if (assigneeMembershipId !== undefined) { if (!isUuid(assigneeMembershipId)) return validation(); q.set("assigneeMembershipId", assigneeMembershipId); }
  return checkedPage(await requestMeta<unknown>(org, `/meta/conversations?${q}`, signal), isThread, page, pageSize);
}
export async function listMessages(org: string, id: string, page = 1, pageSize = 20, signal?: AbortSignal): Promise<Page<Message>> {
  const value = checkedPage(await requestMeta<unknown>(org, `${path(id)}/messages?${paging(page, pageSize)}`, signal), isMessage, page, pageSize);
  if (value.items.some(m => m.threadId !== id)) return invalid();
  return value;
}
export async function sendMessage(org: string, id: string, input: SendInput, signal?: AbortSignal): Promise<Message> {
  const text = input.text.trim();
  if (!text || text.length > 1000 || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.idempotencyKey)) return validation();
  const value = await requestMeta<unknown>(org, `${path(id)}/messages`, signal, { text, idempotencyKey: input.idempotencyKey });
  if (!isMessage(value) || value.threadId !== id || value.direction !== "outbound") return invalid();
  return value;
}
async function changeThread(org: string, id: string, action: "assign" | "close", body: object, signal?: AbortSignal): Promise<Thread> {
  const value = await requestMeta<unknown>(org, `${path(id)}/${action}`, signal, body);
  if (!isThread(value) || value.id !== id || (action === "close" && value.status !== "closed")
    || (action === "assign" && value.assigneeMembershipId !== (body as { membershipId: string | null }).membershipId)) return invalid();
  return value;
}
export function assignConversation(org: string, id: string, membershipId: string | null, signal?: AbortSignal) {
  if (!nullableUuid(membershipId)) return Promise.reject(new AppApiError("Responsável inválido.", "VALIDATION_ERROR", 422));
  return changeThread(org, id, "assign", { membershipId }, signal);
}
export const closeConversation = (org: string, id: string, signal?: AbortSignal) => changeThread(org, id, "close", {}, signal);
