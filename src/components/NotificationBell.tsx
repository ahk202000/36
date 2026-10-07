"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { UserInfo } from "@/app/page";
import DocNo from "@/components/DocNo";
import { WORKFLOW_ACTION_ICONS, workflowActionLabel } from "@/lib/workflow-actions";
import { formatJalaliDateTime } from "@/lib/datetime";

interface Notification {
  id: number;
  letterId: number | null;
  proformaId: number | null;
  toDepartment: string | null;
  action: string;
  comment: string | null;
  isRead: boolean;
  createdAt: string;
  letterNumber: string | null;
  proformaNumber: string | null;
}

interface Props {
  user: UserInfo;
  onViewLetter: (id: number) => void;
  onViewProforma: (id: number) => void;
}

interface Toast {
  key: number;
  notif: Notification;
}

export default function NotificationBell({ user, onViewLetter, onViewProforma }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  // اعلان‌های روی صفحه (توست) — علاوه بر زنگوله
  const [toasts, setToasts] = useState<Toast[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const toastKeyRef = useRef(0);
  // واترمارک آخرین اعلان دیده‌شده — از localStorage تا بین نشست‌ها حفظ شود
  const watermarkKey = `notif_watermark_${user.id}`;
  const watermarkRef = useRef<number>(-1); // -1 یعنی هنوز مقداردهی نشده

  const removeToast = useCallback((key: number) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  const pushToast = useCallback((notif: Notification) => {
    const key = ++toastKeyRef.current;
    setToasts((prev) => [...prev.slice(-3), { key, notif }]); // حداکثر ۴ توست همزمان
    setTimeout(() => removeToast(key), 9000);
  }, [removeToast]);

  const fetchNotifications = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (user.departmentName) params.set("department", user.departmentName);
      params.set("userId", user.id.toString());

      const res = await fetch(`/api/notifications?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const items: Notification[] = data.items || [];
        setNotifications(items);
        setUnreadCount(data.unreadCount || 0);

        const maxId = items.reduce((m, n) => Math.max(m, n.id || 0), 0);

        if (watermarkRef.current === -1) {
          // اولین بار در این نشست: واترمارک ذخیره‌شده را می‌خوانیم؛ اگر نبود از بزرگ‌ترین id فعلی شروع می‌کنیم
          const stored = parseInt(localStorage.getItem(watermarkKey) || "");
          watermarkRef.current = Number.isFinite(stored) ? stored : maxId;
          if (!Number.isFinite(stored)) {
            localStorage.setItem(watermarkKey, String(maxId));
          }
          return;
        }

        // اعلان‌های تازه (id بزرگ‌تر از واترمارک) → نمایش روی صفحه
        const fresh = items
          .filter((n) => n.id > watermarkRef.current)
          .sort((a, b) => a.id - b.id);
        if (fresh.length > 0) {
          watermarkRef.current = Math.max(watermarkRef.current, maxId);
          localStorage.setItem(watermarkKey, String(watermarkRef.current));
          setHasNew(true);
          setTimeout(() => setHasNew(false), 3000);
          // توست روی صفحه برای هر فعالیت جدید
          fresh.slice(-4).forEach((n) => pushToast(n));
          // اعلان مرورگر (اختیاری، در صورت داشتن مجوز)
          if ("Notification" in window && Notification.permission === "granted") {
            const first = fresh[0];
            new Notification(workflowActionLabel(first.action), {
              body: first.comment || `${fresh.length} مورد جدید در کارتابل شما`,
            });
          }
        }
      }
    } catch {}
  }, [user, watermarkKey, pushToast]);

  useEffect(() => {
    watermarkRef.current = -1;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000); // Poll every 15s

    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      clearInterval(interval);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [user, fetchNotifications]);

  const markAsRead = async (id: number) => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotifications(notifications.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch {}
  };

  const markAllAsRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true, department: user.departmentName }),
      });
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleClick = (notif: Notification) => {
    markAsRead(notif.id);
    setIsOpen(false);
    if (notif.letterId) onViewLetter(notif.letterId);
    else if (notif.proformaId) onViewProforma(notif.proformaId);
  };

  return (
    <>
      {/* ── توست‌های روی صفحه — نمایش لحظه‌ای فعالیت‌های جدید ── */}
      <div className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-3 w-[92vw] max-w-sm pointer-events-none">
        {toasts.map((t) => {
          const label = workflowActionLabel(t.notif.action);
          const docLabel = t.notif.letterNumber || t.notif.proformaNumber || (t.notif.letterId || t.notif.proformaId ? `#${t.notif.letterId || t.notif.proformaId}` : "");
          return (
            <div
              key={t.key}
              className="pointer-events-auto bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 overflow-hidden animate-[toast-in_0.3s_ease-out]"
            >
              <div className="flex items-center gap-2 px-4 pt-3">
                <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-lg shrink-0">
                  {WORKFLOW_ACTION_ICONS[t.notif.action] || "📄"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{label}</div>
                  <div className="text-[10px] text-slate-400">{formatJalaliDateTime(t.notif.createdAt)}</div>
                </div>
                <button
                  onClick={() => removeToast(t.key)}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-sm shrink-0"
                  title="بستن"
                >
                  ✕
                </button>
              </div>
              {docLabel && (
                <div className="px-4 pt-1.5 text-sm font-bold text-indigo-300">
                  <DocNo v={docLabel} />
                </div>
              )}
              {t.notif.comment && (
                <p className="px-4 pt-1 text-xs text-slate-300 leading-5 line-clamp-2">{t.notif.comment}</p>
              )}
              <div className="px-4 py-3">
                <button
                  onClick={() => { removeToast(t.key); handleClick(t.notif); }}
                  className="w-full bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold py-2 rounded-xl transition"
                >
                  👁️ مشاهده در کارتابل
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div ref={wrapperRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`relative p-2.5 rounded-xl transition-all duration-200 ${
            hasNew ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white animate-pulse" : "bg-white hover:bg-gray-50 text-gray-700 shadow-sm border border-gray-200"
          }`}
        >
          <span className="text-lg">🔔</span>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5 shadow-lg animate-bounce">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          {hasNew && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full animate-ping opacity-75"></span>
          )}
        </button>

        {isOpen && (
          <div className="absolute left-0 top-full mt-3 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden slide-in max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold">اعلانات</h3>
                  <p className="text-xs text-white/80 mt-1">
                    {unreadCount > 0 ? `${unreadCount} اعلان خوانده نشده` : "همه اعلانات خوانده شده"}
                  </p>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition"
                  >
                    خواندن همه
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="overflow-auto flex-1 max-h-[400px] scrollbar-thin">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">📭</span>
                  </div>
                  <p className="text-gray-500 text-sm">اعلانی وجود ندارد</p>
                  <p className="text-xs text-gray-400 mt-1">ارجاعات جدید اینجا نمایش داده می‌شوند</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleClick(notif)}
                      className={`p-4 hover:bg-gray-50 cursor-pointer transition flex gap-3 ${!notif.isRead ? "bg-blue-50/50 border-r-4 border-blue-500" : ""}`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        notif.action === "approved" ? "bg-green-100" :
                        notif.action === "rejected" ? "bg-red-100" :
                        notif.action === "revised" ? "bg-orange-100" :
                        notif.action === "submit" ? "bg-purple-100" : "bg-blue-100"
                      }`}>
                        <span>{WORKFLOW_ACTION_ICONS[notif.action] || "📄"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">
                            {workflowActionLabel(notif.action)}
                          </span>
                          {!notif.isRead && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0"></span>
                          )}
                          <span className="text-xs text-gray-400 mr-auto whitespace-nowrap">
                            {formatJalaliDateTime(notif.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 truncate">
                          <DocNo v={notif.letterNumber || notif.proformaNumber || `#${notif.letterId || notif.proformaId}`} persian={false} />
                        </p>
                        {notif.comment && (
                          <p className="text-xs text-gray-500 mt-1 truncate">{notif.comment}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t bg-gray-50 text-center">
              <p className="text-xs text-gray-400">به‌روزرسانی خودکار هر ۱۵ ثانیه — فعالیت‌های جدید روی صفحه هم نمایش داده می‌شوند</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
