import { useCallback, useEffect, useState } from "react";
import { AppApiError } from "../../services/appApi";
import { listGeneralNotifications, markGeneralNotificationRead, type GeneralNotificationItem } from "../../services/notificationsApi";
import { BellIcon } from "../icons";

function relativeDate(value: string): string {
  const date = new Date(value); const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} min`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} h`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

export function NotificationCenter({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false); const [items, setItems] = useState<GeneralNotificationItem[]>([]); const [unreadCount, setUnreadCount] = useState(0); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const result = await listGeneralNotifications(organizationId); setItems(result.items); setUnreadCount(result.unreadCount); }
    catch (loadError) { setError(loadError instanceof AppApiError ? loadError.message : "Não foi possível carregar as notificações."); }
    finally { setLoading(false); }
  }, [organizationId]);
  useEffect(() => { setOpen(false); void load(); }, [load]);

  async function openItem(item: GeneralNotificationItem) {
    if (!item.readAt) {
      try { await markGeneralNotificationRead(organizationId, item.id); setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)); setUnreadCount((count) => Math.max(0, count - 1)); } catch { /* leitura continua disponível mesmo se marcação falhar */ }
    }
    if (item.targetPath) globalThis.location.href = item.targetPath;
  }

  return <div className="app-notification-center">
    <button className="app-icon-button app-notification-center__trigger" type="button" title="Notificações" aria-label="Notificações" aria-expanded={open} onClick={() => { const next = !open; setOpen(next); if (next) void load(); }}><BellIcon/>{unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}</button>
    {open && <div className="app-notification-center__panel">
      <header><strong>Notificações</strong><button type="button" onClick={() => void load()} disabled={loading}>Atualizar</button></header>
      {loading && items.length === 0 ? <p className="app-notification-center__state">Carregando...</p> : error ? <p className="app-notification-center__state is-error">{error}</p> : items.length === 0 ? <p className="app-notification-center__state">Nenhuma notificação por enquanto.</p> : <div className="app-notification-center__list">{items.map((item) => <button type="button" key={item.id} className={item.readAt ? "" : "is-unread"} onClick={() => void openItem(item)}><span className="app-notification-center__dot"/><span><strong>{item.title}</strong><small>{item.body}</small><em>{relativeDate(item.createdAt)}</em></span></button>)}</div>}
    </div>}
  </div>;
}
