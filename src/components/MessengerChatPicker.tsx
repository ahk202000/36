"use client";

import { useEffect, useMemo, useState } from "react";

export interface MessengerChat {
  id: string;
  name: string;
  username?: string;
  type?: string;
  lastMessage?: string;
  linkedCompanies?: Array<{ id: number; name: string }>;
}

interface Props {
  open: boolean;
  loading: boolean;
  chats: MessengerChat[];
  errorNote?: string;
  messengerKey: "telegram" | "bale" | "rubika" | "eitaa" | null;
  messengerLabel: string;
  companyId: string;
  companyName?: string;
  botUsername?: string;
  botShareUrl?: string;
  onSelect: (chatId: string) => void;
  onClose: () => void;
  onRefresh?: () => void;
}

/**
 * پاپ‌آپ تمام‌صفحه انتخاب شناسه ارتباط از چت‌های اخیر پیام‌رسان
 * مشترک بین فرم ثبت نامه و فرم صدور پیش‌فاکتور
 */
export default function MessengerChatPicker({
  open,
  loading,
  chats,
  errorNote,
  messengerKey,
  messengerLabel,
  companyId,
  companyName,
  botUsername,
  botShareUrl,
  onSelect,
  onClose,
  onRefresh,
}: Props) {
  const [search, setSearch] = useState("");
  const isEitaa = messengerKey === "eitaa";

  // بستن با کلید Escape و قفل اسکرول پس‌زمینه
  useEffect(() => {
    if (!open) return;
    setSearch("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => {
      const companiesText = (c.linkedCompanies || []).map((x) => x.name).join(" ");
      return [c.name, c.username, c.id, c.lastMessage, companiesText]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [chats, search]);

  if (!open) return null;

  const typeLabel = (t?: string) => {
    const n = (t || "").toLowerCase();
    if (n === "private" || n === "user") return "شخصی";
    if (n === "channel") return "کانال";
    if (n === "group" || n === "supergroup") return "گروه";
    return t || "چت";
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative m-auto w-full h-full sm:h-[92vh] sm:w-[min(96vw,900px)] sm:rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* هدر */}
        <div className="shrink-0 bg-gradient-to-l from-sky-600 to-indigo-600 text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-black text-base sm:text-lg truncate">
              {isEitaa ? "📒 انتخاب شناسه ثبت‌شده ایتا" : `🔎 انتخاب شناسه از چت‌های اخیر ${messengerLabel}`}
            </h3>
            {companyName && (
              <p className="text-[11px] sm:text-xs text-white/80 mt-0.5 truncate">شرکت جاری: {companyName}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-50 text-xs font-bold transition"
              >
                {loading ? "..." : "↻ بروزرسانی"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-lg transition"
              title="بستن (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* جستجو */}
        <div className="shrink-0 px-5 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو در نام، شناسه، آخرین پیام یا نام شرکت..."
            className="flex-1 min-w-[200px] px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-sky-400 bg-white"
          />
          <span className="text-xs font-bold text-gray-500 shrink-0">
            {loading ? "در حال دریافت..." : `${filtered.length} مورد`}
          </span>
        </div>

        {/* راهنمای ایتا */}
        {isEitaa && !loading && (
          <div className="shrink-0 mx-5 mt-3 rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-2.5 text-[11px] leading-6 text-indigo-800">
            ایتایار امکان دریافت پیام‌های ورودی ندارد؛ این فهرست از شناسه‌های ثبت‌شده در نامه‌ها و پیش‌فاکتورهای سیستم ساخته شده است.
          </div>
        )}

        {/* لیست */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-400">
              <span className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">در حال دریافت شناسه‌ها...</span>
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filtered.map((chat) => {
                const links = chat.linkedCompanies || [];
                const linkedToCurrent = links.some((c) => String(c.id) === companyId);
                const linkedElsewhere = links.filter((c) => String(c.id) !== companyId);
                return (
                  <button
                    type="button"
                    key={chat.id}
                    onClick={() => {
                      if (linkedElsewhere.length > 0 && !linkedToCurrent) {
                        const names = linkedElsewhere.map((c) => c.name).join("، ");
                        if (!window.confirm(`این شناسه قبلاً برای «${names}» ثبت شده است. آیا مطمئنید برای «${companyName || "شرکت فعلی"}» هم انتخاب شود؟`)) return;
                      }
                      onSelect(chat.id);
                      onClose();
                    }}
                    className={`w-full rounded-2xl border-2 px-4 py-3.5 text-right transition hover:shadow-md ${
                      linkedToCurrent
                        ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                        : linkedElsewhere.length > 0
                          ? "border-amber-300 bg-amber-50 hover:bg-amber-100"
                          : "border-gray-200 bg-white hover:border-sky-300 hover:bg-sky-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-black text-gray-800">{chat.name}</span>
                          {chat.username && <span dir="ltr" className="text-[11px] text-sky-700">@{chat.username}</span>}
                          <span className="text-[9px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{typeLabel(chat.type)}</span>
                        </div>
                        {chat.lastMessage && (
                          <p className="mt-1.5 text-[11px] text-gray-600 line-clamp-2 leading-5">
                            <span className="font-bold">{isEitaa ? "اطلاعات ثبت‌شده:" : "آخرین پیام:"}</span> {chat.lastMessage}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {linkedToCurrent && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✓ ثبت‌شده برای همین شرکت</span>
                          )}
                          {linkedElsewhere.map((c) => (
                            <span key={c.id} className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">شرکت قبلی: {c.name}</span>
                          ))}
                          {links.length === 0 && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">هنوز به شرکتی متصل نشده</span>
                          )}
                        </div>
                      </div>
                      <code dir="ltr" className="text-[11px] text-sky-700 shrink-0 bg-white/80 border border-sky-100 rounded-lg px-2 py-1">{chat.id}</code>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="max-w-lg text-center bg-amber-50 border border-amber-200 rounded-2xl px-6 py-8">
                <div className="text-3xl mb-2">📭</div>
                <p className="text-sm font-bold text-amber-800 mb-2">
                  {search.trim() ? "نتیجه‌ای برای جستجوی شما پیدا نشد." : errorNote || "شناسه‌ای یافت نشد."}
                </p>
                {!search.trim() && (
                  <p className="text-xs leading-6 text-amber-700">
                    {isEitaa
                      ? "شناسه مشتری یا کانال را از پنل ایتایار بردارید و در فیلد شناسه ارتباط وارد کنید."
                      : messengerKey === "rubika"
                        ? "مشتری باید بات روبیکا را شروع کند و یک پیام بفرستد؛ سپس بروزرسانی بزنید."
                        : botUsername
                          ? `مشتری باید به @${botUsername} پیام /start بفرستد؛ سپس بروزرسانی بزنید.`
                          : "مشتری باید ابتدا ربات را Start کند و یک پیام بفرستد؛ سپس بروزرسانی بزنید."}
                  </p>
                )}
                {messengerKey === "rubika" && botShareUrl && (
                  <a href={botShareUrl} target="_blank" rel="noreferrer" dir="ltr" className="mt-3 inline-flex text-sky-700 underline underline-offset-2 text-xs">
                    باز کردن لینک بات روبیکا
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* فوتر */}
        <div className="shrink-0 border-t bg-gray-50 px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-300" /> همین شرکت</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 border border-amber-300" /> شرکت دیگر</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 border border-gray-300" /> بدون اتصال</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-sm font-bold transition"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
