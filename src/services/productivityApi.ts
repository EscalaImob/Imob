import { ensureValidAuthSession } from "../auth/session";
import { AppApiError } from "./appApi";

const REQUEST_TIMEOUT_MS = 15_000;

function apiBase(): string {
  const value = import.meta.env.VITE_API_URL?.trim();
  if (!value) throw new AppApiError("A plataforma ainda não está conectada à API.", "API_NOT_CONFIGURED");
  return value.replace(/\/+$/u, "");
}

async function tenantRequest<T>(organizationId: string, path: string, init: RequestInit = {}): Promise<T> {
  const session = await ensureValidAuthSession();
  if (!session) throw new AppApiError("Sua sessão expirou. Entre novamente.", "UNAUTHORIZED", 401);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "x-organization-id": organizationId,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    let payload: unknown = null;
    try { payload = await response.json(); } catch { payload = null; }
    const body = payload as { success?: boolean; data?: T; error?: { code?: string; message?: string } } | null;
    if (!response.ok) throw new AppApiError(body?.error?.message || "Não foi possível concluir a operação.", body?.error?.code || "API_ERROR", response.status);
    if (body?.success !== true || body.data === undefined) throw new AppApiError("Recebemos uma resposta inesperada da plataforma.", "INVALID_API_RESPONSE", response.status);
    return body.data;
  } catch (error) {
    if (error instanceof AppApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new AppApiError("A plataforma demorou mais que o esperado para responder.", "REQUEST_TIMEOUT");
    throw new AppApiError("Não foi possível conectar à plataforma. Verifique sua conexão e tente novamente.", "NETWORK_ERROR");
  } finally { globalThis.clearTimeout(timeout); }
}

export type TaskStatus = "todo" | "in_progress" | "waiting" | "completed" | "canceled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskView = "all" | "mine";
export type CalendarEventType = "meeting" | "evaluation" | "signature" | "inspection" | "custom";

export interface ProductivityAssignee { membershipId: string; userId: string; displayName: string; email: string; }
export interface TaskListItem {
  id: string; title: string; description: string | null; status: TaskStatus; priority: TaskPriority;
  dueAt: string | null; scheduledStartAt: string | null; scheduledEndAt: string | null; origin: string;
  responsible: { membershipId: string; displayName: string } | null;
  contact: { id: string; name: string } | null;
  opportunity: { id: string; title: string } | null;
  createdAt: string; updatedAt: string; completedAt: string | null;
}
export interface TaskListResult {
  summary: { pending: number; overdue: number; dueToday: number; completed: number };
  items: TaskListItem[]; page: number; pageSize: number; totalItems: number; totalPages: number;
}
export interface TaskInput {
  title: string; description?: string; status: TaskStatus; priority: TaskPriority; dueAt: string;
  scheduledStartAt?: string; scheduledEndAt?: string; responsibleMembershipId?: string;
  contactId?: string; opportunityId?: string; origin?: string;
}
export interface AgendaItem {
  id: string; source: "task" | "event" | "visit"; type: "task" | CalendarEventType | "visit"; title: string; description: string | null;
  startsAt: string; endsAt: string; allDay: boolean; status: TaskStatus | "scheduled" | "confirmed" | "completed" | "canceled"; private: boolean;
  responsible: { membershipId: string; displayName: string } | null;
  contact: { id: string; name: string } | null;
  opportunity: { id: string; title: string } | null;
}
export interface CalendarEventInput {
  type: CalendarEventType; title: string; description?: string; startsAt: string; endsAt: string; status?: "scheduled" | "completed" | "canceled";
  private?: boolean; responsibleMembershipId?: string; contactId?: string; opportunityId?: string;
}

export async function listTaskAssignees(organizationId: string): Promise<ProductivityAssignee[]> {
  return tenantRequest<ProductivityAssignee[]>(organizationId, "/productivity/tasks/assignees");
}
export async function listTasks(organizationId: string, filters: { search?: string; status?: TaskStatus; priority?: TaskPriority; view?: TaskView; opportunityId?: string; page?: number; pageSize?: number } = {}): Promise<TaskListResult> {
  const query = new URLSearchParams();
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  if (filters.status) query.set("status", filters.status);
  if (filters.priority) query.set("priority", filters.priority);
  if (filters.view) query.set("view", filters.view);
  if (filters.opportunityId) query.set("opportunityId", filters.opportunityId);
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  if (filters.pageSize) query.set("pageSize", String(filters.pageSize));
  return tenantRequest<TaskListResult>(organizationId, `/productivity/tasks${query.size ? `?${query.toString()}` : ""}`);
}
export async function createTask(organizationId: string, input: TaskInput): Promise<TaskListItem> {
  return tenantRequest<TaskListItem>(organizationId, "/productivity/tasks", { method: "POST", body: JSON.stringify(input) });
}
export async function updateTask(organizationId: string, taskId: string, input: TaskInput): Promise<TaskListItem> {
  return tenantRequest<TaskListItem>(organizationId, `/productivity/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", body: JSON.stringify(input) });
}
export async function listAgenda(organizationId: string, from: Date, to: Date): Promise<{ items: AgendaItem[] }> {
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return tenantRequest<{ items: AgendaItem[] }>(organizationId, `/productivity/calendar?${query.toString()}`);
}
export async function createCalendarEvent(organizationId: string, input: CalendarEventInput): Promise<AgendaItem> {
  return tenantRequest<AgendaItem>(organizationId, "/productivity/calendar", { method: "POST", body: JSON.stringify(input) });
}
export async function getCalendarEvent(organizationId: string, eventId: string): Promise<AgendaItem> {
  return tenantRequest<AgendaItem>(organizationId, `/productivity/calendar/${encodeURIComponent(eventId)}`);
}
export async function updateCalendarEvent(organizationId: string, eventId: string, input: CalendarEventInput): Promise<AgendaItem> {
  return tenantRequest<AgendaItem>(organizationId, `/productivity/calendar/${encodeURIComponent(eventId)}`, { method: "PATCH", body: JSON.stringify(input) });
}
