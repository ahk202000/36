"use client";

import { useMemo, useState } from "react";
import { toPersianDigits } from "@/lib/utils";
import DocNo from "@/components/DocNo";
import { Building2, ChevronDown, ChevronUp, Search, Users, X } from "lucide-react";

/** ساختار حداقلی آیتم کارتابل — همان چیزی که Kartabl از /api/workflow می‌گیرد */
export interface KartablLikeItem {
  id: number;
  letterId: number | null;
  proformaId: number | null;
  action: string;
  companyName?: string | null;
  letterNumber?: string | null;
  proformaNumber?: string | null;
  letterRequestType?: string | null;
  doneStatus?: string | null; // pending | done | not_done
  doneByName?: string | null;
  doneAt?: string | null;
  createdAt: string;
  fromUserName?: string | null;
  comment?: string | null;
  note?: string | null;
  itemCount?: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: KartablLikeItem[];
}

const actionLabels: Record<string, string> = {
  refer: "ارجاع",
  submit: "ارسال برای تایید",
  approved: "تایید",
  rejected: "رد",
  revised: "نیاز به اصلاح",
  correction_send: "اصلاح و تایید (توسط بازرگانی)",
  final_sale: "فروش قطعی",
  confirm_refer: "تاییدیه استعلام",
  range_letter: "نامه رنج (فروش قطعی)",
  sent: "ارسال به مشتری",
  auto_sent: "ارسال خودکار به مشتری",
};

/** نرمال‌سازی نام مشتری برای ادغام تکراری‌ها (ی/ک عربی، نیم‌فاصله، فاصله اضافی) */
const normName = (s: string) =>
  s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ").replace(/\s+/g, " ").trim();

const normSearch = (s: string) => normName(s).toLowerCase();

type OverallStatus = "done" | "in_progress" | "not_done";

const statusMeta: Record<OverallStatus, { label: string; badge: string; dot: string }> = {
  done: {
    label: "انجام شده",
    badge: "bg-green-100 text-green-800 border-green-300",
    dot: "bg-green-500",
  },
  in_progress: {
    label: "در حال انجام",
    badge: "bg-amber-100 text-amber-800 border-amber-300",
    dot: "bg-amber-500",
  },
  not_done: {
    label: "انجام نشده",
    badge: "bg-red-100 text-red-700 border-red-300",
    dot: "bg-red-500",
  },
};

interface CustomerJob {
  id: number;
  refNumber: string;
  kind: "نامه" | "پیش‌فاکتور";
  actionLabel: string;
  doneStatus: string | null | undefined;
  createdAt: string;
  doneByName?: string | null;
}

interface CustomerRow {
  key: string;
  name: string;
  jobs: CustomerJob[];
  doneCount: number;
  notDoneCount: number;
  openCount: number;
  lastActivity: string;
  overall: OverallStatus;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran" });

export default function CustomersWorkedPanel({ open, onClose, items }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OverallStatus>("all");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // ── تجمیع همه ارجاع‌های کارتابل بر اساس مشتری — یعنی «مشتریانی که تاکنون
  //    برای آن‌ها کار انجام شده» به همراه وضعیت هر مشتری در انتهای هر سطر ──
  const customers = useMemo<CustomerRow[]>(() => {
    const map = new Map<string, CustomerRow>();
    for (const it of items) {
      const raw = it.companyName ? normName(it.companyName) : "";
      if (!raw) continue;
      const job: CustomerJob = {
        id: it.id,
        refNumber: it.letterNumber || it.proformaNumber || `#${it.letterId || it.proformaId || it.id}`,
        kind: it.letterId ? "نامه" : "پیش‌فاکتور",
        actionLabel: actionLabels[it.action] || it.action,
        doneStatus: it.doneStatus,
        createdAt: it.createdAt,
        doneByName: it.doneByName,
      };
      let row = map.get(raw);
      if (!row) {
        row = {
          key: raw,
          name: it.companyName!.trim(),
          jobs: [],
          doneCount: 0,
          notDoneCount: 0,
          openCount: 0,
          lastActivity: it.createdAt,
          overall: "in_progress",
        };
        map.set(raw, row);
      }
      row.jobs.push(job);
      if (it.doneStatus === "done") row.doneCount++;
      else if (it.doneStatus === "not_done") row.notDoneCount++;
      else row.openCount++;
      if (new Date(it.createdAt).getTime() > new Date(row.lastActivity).getTime()) {
        row.lastActivity = it.createdAt;
      }
    }
    const list = Array.from(map.values());
    for (const row of list) {
      // وضعیت کلی مشتری از روی آخرین وضعیت کارهایش
      if (row.openCount > 0) row.overall = "in_progress";
      else if (row.notDoneCount > 0) row.overall = "not_done";
      else row.overall = "done";
      // جدیدترین کارها بالای لیست جزئیات
      row.jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    // مرتب‌سازی: جدیدترین فعالیت بالا
    list.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
    return list;
  }, [items]);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (statusFilter !== "all" && c.overall !== statusFilter) return false;
      if (search.trim() && !normSearch(c.name).includes(normSearch(search.trim()))) return false;
      return true;
    });
  }, [customers, search, statusFilter]);

  const totals = useMemo(() => {
    const done = customers.filter((c) => c.overall === "done").length;
    const prog = customers.filter((c) => c.overall === "in_progress").length;
    const nd = customers.filter((c) => c.overall === "not_done").length;
    const jobs = customers.reduce((s, c) => s + c.jobs.length, 0);
    return { customers: customers.length, jobs, done, prog, nd };
  }, [customers]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-black text-lg flex items-center gap-2">
              <Users className="w-5 h-5" />
              لیست مشتریان انجام‌شده
            </h3>
            <p className="text-white/80 text-xs mt-1">
              مشتریانی که تاکنون در این واحد برای آن‌ها کار انجام شده — وضعیت هر مشتری در انتهای سطرش مشخص است
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary chips + search */}
        <div className="p-4 border-b bg-gray-50/80 shrink-0 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700">
              {toPersianDigits(totals.customers)} مشتری • {toPersianDigits(totals.jobs)} کار
            </span>
            <button
              onClick={() => setStatusFilter(statusFilter === "done" ? "all" : "done")}
              className={`px-3 py-1.5 rounded-lg border transition ${statusFilter === "done" ? "bg-green-600 text-white border-green-600" : "bg-green-50 text-green-800 border-green-200 hover:bg-green-100"}`}
            >
              انجام شده ({toPersianDigits(totals.done)})
            </button>
            <button
              onClick={() => setStatusFilter(statusFilter === "in_progress" ? "all" : "in_progress")}
              className={`px-3 py-1.5 rounded-lg border transition ${statusFilter === "in_progress" ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"}`}
            >
              در حال انجام ({toPersianDigits(totals.prog)})
            </button>
            <button
              onClick={() => setStatusFilter(statusFilter === "not_done" ? "all" : "not_done")}
              className={`px-3 py-1.5 rounded-lg border transition ${statusFilter === "not_done" ? "bg-red-600 text-white border-red-600" : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"}`}
            >
              انجام نشده ({toPersianDigits(totals.nd)})
            </button>
            {statusFilter !== "all" && (
              <button onClick={() => setStatusFilter("all")} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 transition">
                نمایش همه
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نام مشتری..."
              className="w-full pr-9 pl-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Customer list */}
        <div className="flex-1 overflow-auto p-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <Building2 className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-gray-500 text-sm">
                {customers.length === 0
                  ? "تاکنون کاری برای مشتری‌ای در این واحد ثبت نشده است"
                  : "مشتری‌ای با این مشخصات یافت نشد"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((c, idx) => {
                const meta = statusMeta[c.overall];
                const expanded = expandedKey === c.key;
                return (
                  <div
                    key={c.key}
                    className={`border rounded-xl overflow-hidden transition ${expanded ? "border-emerald-300 shadow-sm" : "border-gray-200 hover:border-gray-300"}`}
                  >
                    {/* ── سطر مشتری: وضعیت در «آخر» سطر قرار دارد ── */}
                    <button
                      onClick={() => setExpandedKey(expanded ? null : c.key)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition text-right"
                    >
                      <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs font-black shrink-0">
                        {toPersianDigits(idx + 1)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-gray-800 truncate flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          {c.name}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500 mt-0.5">
                          <span>{toPersianDigits(c.jobs.length)} کار ارجاعی</span>
                          <span className="text-green-700">انجام شد: {toPersianDigits(c.doneCount)}</span>
                          <span className="text-amber-700">باز: {toPersianDigits(c.openCount)}</span>
                          <span className="text-red-700">انجام نشد: {toPersianDigits(c.notDoneCount)}</span>
                          <span className="hidden sm:inline">آخرین فعالیت: {formatDate(c.lastActivity)}</span>
                        </div>
                      </div>
                      {/* وضعیت مشتری — انتهای سطر */}
                      <span className={`flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-lg border shrink-0 ${meta.badge}`}>
                        <span className={`w-2 h-2 rounded-full ${meta.dot}`}></span>
                        {meta.label}
                      </span>
                      {expanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                    </button>

                    {/* جزئیات کارهای این مشتری — وضعیت هر کار انتهای سطرش */}
                    {expanded && (
                      <div className="border-t border-emerald-100 bg-emerald-50/40 divide-y divide-emerald-100/70">
                        {c.jobs.map((j, jidx) => (
                          <div key={`${j.id}-${jidx}`} className="flex items-center gap-3 px-4 py-2.5 pr-14">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${j.kind === "نامه" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}`}>
                              {j.kind}
                            </span>
                            <span className="text-xs font-bold text-gray-700">
                              <DocNo v={j.refNumber} persian={false} />
                            </span>
                            <span className="text-[11px] text-gray-500 flex-1 truncate">
                              {j.actionLabel} • {formatDate(j.createdAt)}
                              {j.doneByName ? ` — ${j.doneByName}` : ""}
                            </span>
                            {/* وضعیت کار — انتهای سطر */}
                            {j.doneStatus === "done" ? (
                              <span className="text-[10px] font-black px-2 py-1 rounded bg-green-600 text-white shrink-0">انجام شد</span>
                            ) : j.doneStatus === "not_done" ? (
                              <span className="text-[10px] font-black px-2 py-1 rounded bg-red-600 text-white shrink-0">انجام نشد</span>
                            ) : (
                              <span className="text-[10px] font-black px-2 py-1 rounded bg-amber-500 text-white shrink-0">در انتظار</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 p-4 flex items-center justify-between shrink-0">
          <span className="text-xs text-gray-400">
            {statusFilter !== "all" || search.trim()
              ? `${toPersianDigits(filtered.length)} از ${toPersianDigits(customers.length)} مشتری`
              : `${toPersianDigits(customers.length)} مشتری`}
          </span>
          <button onClick={onClose} className="px-6 py-2.5 border border-gray-300 rounded-xl text-sm font-bold hover:bg-gray-100 transition">
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
