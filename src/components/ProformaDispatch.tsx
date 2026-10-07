"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { UserInfo } from "@/app/page";
import { formatPrice, toPersianDigits, toJalali } from "@/lib/utils";
import {
  openProformaPrintWindow,
  type PrintProformaData,
} from "@/lib/print-proforma";
import {
  SendHorizonal,
  CheckCircle2,
  Download,
  Eye,
  Inbox,
  Archive,
  Loader2,
  AlertCircle,
  Search,
  Printer,
  MessageCircle,
  Bot,
} from "lucide-react";
import DocNo from "@/components/DocNo";

interface ProformaRow {
  id: number;
  proformaNumber: string;
  typeName: string | null;
  companyId: number | null;
  companyName: string | null;
  letterId: number | null;
  issueDate: string;
  showTotal: boolean;
  totalAmount: string;
  status: string;
  approvedByName: string | null;
  createdByName: string | null;
  updatedAt: string | null;
  communicationMethod?: string | null;
  communicationId?: string | null;
}

interface Props {
  user: UserInfo;
  onViewProforma: (id: number) => void;
}

export default function ProformaDispatch({ user, onViewProforma }: Props) {
  const [proformas, setProformas] = useState<ProformaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "sent">("pending");
  const [searchText, setSearchText] = useState("");
  const [acting, setActing] = useState<number | null>(null);
  const [autoSending, setAutoSending] = useState<number | null>(null);

  const loadList = () => {
    fetch("/api/proforma")
      .then((r) => r.json())
      .then((d) => setProformas(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadList();
  }, []);

  // پیش‌فاکتورهای تایید شده → در انتظار ارسال به مشتری
  const pendingList = proformas.filter((p) => p.status === "approved");
  // ارسال شده‌ها
  const sentList = proformas.filter((p) => p.status === "sent" || p.status === "final_sale");

  const filtered = useMemo(() => {
    let list = tab === "pending" ? pendingList : sentList;
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.proformaNumber.toLowerCase().includes(q) ||
          (p.companyName || "").toLowerCase().includes(q) ||
          (p.typeName || "").toLowerCase().includes(q)
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, proformas, searchText]);

  const toast = (msg: string) => {
    const w = window as unknown as { showToast?: (m: string) => void };
    if (w.showToast) w.showToast(msg);
  };

  // کش تنظیمات چاپ (سربرگ/ته‌برگ/رنگ/ستون‌ها) — یک‌بار واکشی می‌شود
  const settingsCache = useRef<Record<string, string> | null>(null);
  const getLetterSettings = async (): Promise<Record<string, string>> => {
    if (settingsCache.current) return settingsCache.current;
    try {
      const res = await fetch("/api/settings");
      const rows: Array<{ settingKey: string; settingValue: string }> = await res.json();
      const map: Record<string, string> = {};
      for (const row of rows) map[row.settingKey] = row.settingValue;
      settingsCache.current = map;
      return map;
    } catch {
      return {};
    }
  };

  // واکشی جزئیات کامل پیش‌فاکتور برای چاپ/دانلود — با همان داده‌ای که صفحه مشاهده استفاده می‌کند
  const [preparing, setPreparing] = useState<number | null>(null);
  const preparePrintData = async (id: number): Promise<PrintProformaData | null> => {
    try {
      const res = await fetch(`/api/proforma/${id}`);
      const detail = await res.json();
      if (!detail || detail.error) return null;
      return detail as PrintProformaData;
    } catch {
      return null;
    }
  };

  // «چاپ/PDF» — دقیقاً همان خروجی دکمه چاپ در صفحه مشاهده
  const handlePrintPreview = async (p: ProformaRow) => {
    setPreparing(p.id);
    const [detail, settings] = await Promise.all([preparePrintData(p.id), getLetterSettings()]);
    setPreparing(null);
    if (!detail) {
      toast("خطا در دریافت اطلاعات پیش‌فاکتور");
      return;
    }
    openProformaPrintWindow(detail, settings);
  };

  // «دانلود PDF» — فایل PDF واقعی رندرشده سمت سرور، دقیقاً همان رندر چاپ مرورگر
  const handleDownloadExact = (p: ProformaRow) => {
    setPreparing(p.id);
    const a = document.createElement("a");
    a.href = `/api/proforma/${p.id}/pdf`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(`در حال آماده‌سازی PDF پیش‌فاکتور ${p.proformaNumber}...`);
    setTimeout(() => setPreparing(null), 1500);
  };

  // ارسال خودکار فایل PDF از طریق پیام‌رسان (بله/تلگرام/ایتا)
  const handleAutoSend = async (p: ProformaRow) => {
    if (autoSending) return;
    setAutoSending(p.id);
    try {
      const res = await fetch(`/api/proforma/${p.id}/send-via`, { method: "POST" });
      const result = await res.json();
      if (result.success) {
        toast(`✅ فایل از طریق ${result.messenger} به شناسه ${result.chatId} ارسال شد و به لیست ارسال‌شده‌ها منتقل گردید`);
        setProformas((prev) => prev.map((row) => (row.id === p.id ? { ...row, status: "sent" } : row)));
      } else {
        toast("❌ " + (result.error || "ارسال ناموفق بود"));
      }
    } catch {
      toast("خطا در ارتباط با سرور");
    }
    setAutoSending(null);
  };

  // تایید ارسال: از «ارسال نشده» خارج و به «ارسال شده» منتقل می‌شود
  const handleConfirmSend = async (p: ProformaRow) => {
    if (acting) return;
    setActing(p.id);
    try {
      const res = await fetch(`/api/proforma/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sent", updatedBy: user.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "خطا در ثبت ارسال");
      }
      // ثبت در گردش کار
      await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proformaId: p.id,
          fromUserId: user.id,
          toDepartment: "دبیرخانه",
          action: "sent",
          comment: `پیش‌فاکتور ${p.proformaNumber} توسط ${user.fullName} به مشتری ارسال شد`,
        }),
      }).catch(() => {});
      // به‌روزرسانی محلی — جابه‌جایی بین دو لیست
      setProformas((prev) =>
        prev.map((row) => (row.id === p.id ? { ...row, status: "sent" } : row))
      );
      toast(`پیش‌فاکتور ${p.proformaNumber} به لیست ارسال‌شده‌ها منتقل شد`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "خطا در ثبت ارسال");
    }
    setActing(null);
  };



  const renderRow = (p: ProformaRow, isPending: boolean) => (
    <tr key={p.id} className="hover:bg-gray-50 transition">
      <td className="px-4 py-3 font-bold"><DocNo v={p.proformaNumber} /></td>
      <td className="px-4 py-3">{p.companyName || "-"}</td>
      <td className="px-4 py-3">{p.typeName || "-"}</td>
      <td className="px-4 py-3">{toPersianDigits(p.issueDate)}</td>
      <td className="px-4 py-3">
        {p.showTotal ? (
          <span className="font-bold text-green-700">{formatPrice(p.totalAmount)} ریال</span>
        ) : (
          <span className="text-xs bg-gray-100 px-2 py-1 rounded">بدون جمع</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col">
          {isPending ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              تایید شده {p.approvedByName ? `(${p.approvedByName})` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
              <SendHorizonal className="w-3.5 h-3.5" />
              ارسال شده {p.updatedAt ? `در ${toJalali(p.updatedAt)}` : ""}
            </span>
          )}
          {p.createdByName && <span className="text-[10px] text-gray-400 mt-0.5">صادرکننده: {p.createdByName}</span>}
          {/* طریقه ارتباط و شناسه از نامه مرتبط */}
          {p.communicationMethod && (
            <span className="inline-flex items-center gap-1 text-[10px] text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-full mt-1 whitespace-nowrap">
              <MessageCircle className="w-3 h-3" />
              {p.communicationMethod}
              {p.communicationId && <span className="text-sky-500">({p.communicationId})</span>}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onViewProforma(p.id)}
            className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold transition"
          >
            <Eye className="w-3.5 h-3.5" />
            مشاهده
          </button>
          <button
            onClick={() => handlePrintPreview(p)}
            disabled={preparing === p.id}
            className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50"
            title="باز کردن خروجی چاپ در مرورگر — دقیقاً مانند دکمه چاپ صفحه مشاهده"
          >
            {preparing === p.id ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Printer className="w-3.5 h-3.5" />
            )}
            چاپ/PDF
          </button>
          <button
            onClick={() => handleDownloadExact(p)}
            disabled={preparing === p.id}
            className="inline-flex items-center gap-1 bg-purple-50 text-purple-600 hover:bg-purple-100 px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50"
            title="دانلود فایل PDF واقعی — دقیقاً از روی قالب چاپ"
          >
            {preparing === p.id ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            دانلود PDF
          </button>
          {/* ارسال خودکار از طریق پیام‌رسان */}
          {isPending && p.communicationMethod && ["بله", "تلگرام", "ایتا", "واتساپ", "روبیکا", "ایمیل"].some((m) => p.communicationMethod!.trim().includes(m)) && (
            <button
              onClick={() => handleAutoSend(p)}
              disabled={autoSending === p.id}
              className="inline-flex items-center gap-1 bg-sky-600 text-white hover:bg-sky-700 px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50 shadow-sm"
              title={`ارسال خودکار فایل PDF از طریق ${p.communicationMethod} به شناسه ${p.communicationId || "ثبت‌نشده"}`}
            >
              {autoSending === p.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Bot className="w-3.5 h-3.5" />
              )}
              ارسال با {p.communicationMethod}
            </button>
          )}
          {isPending && (
            <button
              onClick={() => handleConfirmSend(p)}
              disabled={acting === p.id}
              className="inline-flex items-center gap-1 bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50 shadow-sm"
            >
              {acting === p.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <SendHorizonal className="w-3.5 h-3.5" />
              )}
              تایید ارسال به مشتری
            </button>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <SendHorizonal className="w-7 h-7 text-emerald-600" />
            ارسال پیش‌فاکتورهای تایید شده
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            پیش‌فاکتورهایی که توسط مدیریت تایید شده‌اند و باید صادر و به مشتری ارسال شوند
          </p>
        </div>
      </div>

      {/* اعلان وضعیت — راهنمای کاربر دبیرخانه و بازرگانی */}
      {pendingList.length > 0 && tab === "pending" && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-green-700" />
          </div>
          <div>
            <p className="font-bold text-green-800 text-sm">
              {toPersianDigits(pendingList.length)} پیش‌فاکتور تایید شده در انتظار صدور و ارسال است
            </p>
            <p className="text-xs text-green-700 mt-1">
              این پیش‌فاکتورها توسط مدیریت تایید شده‌اند. خروجی PDF را دانلود کنید، به مشتری ارسال نمایید و سپس دکمه «تایید ارسال به مشتری» را بزنید تا به لیست ارسال‌شده‌ها منتقل شود.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setTab("pending")}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
            tab === "pending"
              ? "bg-green-600 text-white shadow-md"
              : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
          }`}
        >
          <Inbox className="w-4 h-4" />
          ارسال نشده — در انتظار صدور ({toPersianDigits(pendingList.length)})
          {pendingList.length > 0 && (
            <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
          )}
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
            tab === "sent"
              ? "bg-emerald-600 text-white shadow-md"
              : "bg-gray-100 text-gray-500 hover:text-gray-700"
          }`}
        >
          <Archive className="w-4 h-4" />
          ارسال شده ({toPersianDigits(sentList.length)})
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="جستجو در شماره، شرکت، نوع ..."
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition bg-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            {tab === "pending" ? (
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            ) : (
              <Archive className="w-8 h-8 text-gray-400" />
            )}
          </div>
          <p className="text-gray-500 font-medium">
            {tab === "pending"
              ? "پیش‌فاکتور تاییدشده‌ای در انتظار ارسال نیست"
              : "هنوز پیش‌فاکتوری ارسال نشده است"}
          </p>
          {tab === "pending" && (
            <p className="text-gray-400 text-sm mt-1">وقتی مدیریت پیش‌فاکتوری را تایید کند، اینجا نمایش داده می‌شود</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={tab === "pending" ? "bg-green-50/70" : "bg-gray-50"}>
                <tr>
                  <th className="px-4 py-3 text-right font-bold text-gray-600">شماره</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-600">شرکت</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-600">نوع</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-600">تاریخ</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-600">مبلغ</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-600">وضعیت</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-600">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => renderRow(p, tab === "pending"))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
