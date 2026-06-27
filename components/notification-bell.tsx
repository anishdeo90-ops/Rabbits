"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X, Check, CheckCheck, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  type: string;
  candidate_id: string | null;
  forward_id: string | null;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

interface Props {
  onOpenCandidate?: (candidateId: string) => void;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell({ onOpenCandidate }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?unread_only=true");
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(Array.isArray(data) ? data.length : 0);
    } catch {}
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
      setUnreadCount(data.filter((n: Notification) => !n.is_read).length);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  // Poll unread count every 30 seconds
  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 30000);
    return () => clearInterval(id);
  }, [fetchUnread]);

  // Load all when panel opens
  useEffect(() => {
    if (open) fetchAll();
  }, [open, fetchAll]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH" });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  async function deleteNotification(id: string, wasUnread: boolean) {
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function handleNotificationClick(n: Notification) {
    if (!n.is_read) await markRead(n.id);
    if (n.candidate_id) {
      setOpen(false);
      if (onOpenCandidate) {
        onOpenCandidate(n.candidate_id);
      } else {
        router.push(`/candidates?open=${n.candidate_id}`);
      }
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative p-1.5 text-gray-500 hover:text-gray-800 transition-colors"
        title="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700">Notifications</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-indigo-50"
                >
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 p-0.5">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No notifications yet</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`group relative flex gap-2.5 px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${!n.is_read ? "bg-indigo-50/50" : ""}`}
                  onClick={() => handleNotificationClick(n)}
                >
                  {/* icon */}
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs mt-0.5 ${n.type === "candidate_forwarded" ? "bg-indigo-500" : "bg-green-500"}`}>
                    {n.type === "candidate_forwarded" ? "→" : <Check size={12} />}
                  </div>
                  {/* content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 leading-snug">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {/* unread dot */}
                  {!n.is_read && (
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-indigo-500 mt-1.5" />
                  )}
                  {/* delete button */}
                  <button
                    onClick={e => { e.stopPropagation(); deleteNotification(n.id, !n.is_read); }}
                    className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-center">
              <span className="text-xs text-gray-400">{notifications.length} notification{notifications.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
