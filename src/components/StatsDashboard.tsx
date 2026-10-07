"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from "recharts";
import type { UserInfo } from "@/app/page";
import { getPermissions, isOperationalUser } from "@/lib/permissions";
import { formatPrice } from "@/lib/utils";
import DocNo from "@/components/DocNo";

interface StatsData {
  filters?: { from: string | null; to: string | null; previousFrom: string | null; previousTo: string | null };
  statusStats: Array<{ status: string; count: number; totalAmount: string }>;
  requestTypeStats: Array<{ requestType: string; count: number }>;
  topCompanies: Array<{
    companyId: number | null; companyName: string | null; count: number; totalAmount: string;
    confirmedCount?: number; confirmedAmount?: string; conversionRate?: number;
  }>;
  salesByType: Array<{ typeId: number | null; typeName: string | null; typeCode: string | null; count: number; totalAmount: string }>;
  monthlyTrend: Array<{ month: string; count: number; amount: string; approvedCount?: number; confirmedAmount?: string }>;
  recentProformas: Array<{ id: number; proformaNumber: string; companyName: string | null; typeName: string | null; status: string; totalAmount: string; issueDate: string }>;
  topEquipment?: Array<{
    equipmentId: number | null; name: string; lineCount: number; proformaCount: number;
    customerCount: number; quotedAmount: string; confirmedAmount: string;
  }>;
  operatorPerformance?: Array<{
    userId: number; fullName: string; createdCount: number; approvedCount: number;
    sentCount: number; rejectedCount: number; totalAmount: string; avgCycleHours: number;
  }>;
  staleProformas?: Array<{
    id: number; proformaNumber: string; companyName: string | null; status: string;
    totalAmount: string; issueDate: string; ageDays: number;
  }>;
  funnel?: {
    issued: number; approved: number; sent: number; confirmed: number;
    approvalRate: number; conversionRate: number; rejectionRate: number;
  };
  managementKpis?: {
    quoteAmount: string; approvedAmount: string; confirmedAmount: string; averageQuote: string;
    // محاسبات داخلی — پیش‌فاکتورهای «بدون جمع» که برای مشتری محاسبه نمی‌شوند
    internalAmount?: string; internalCount?: number;
    // جمع کل پیشنهادها = نسخه‌های دارای جمع + بدون جمع (با هم)
    grandQuoteAmount?: string;
    avgApprovalHours: number; staleCount: number; revisions: number;
    previous: { proformas: number; quoteAmount: string; approved: number; confirmed: number; confirmedAmount: string };
    changes: { proformas: number; quoteAmount: number; confirmedAmount: number };
  };
  totals: { proformas: number; letters: number; companies: number; users: number; pending: number; confirmedSales?: number; confirmedSalesAmount?: string };
}

interface Props {
  user: UserInfo;
  setView: (v: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  pending: "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
  revised: "#f97316",
  correction_send: "#8b5cf6",
  ready_to_send: "#06b6d4",
  sent: "#0ea5e9",
  final_sale: "#16a34a",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "پیش‌نویس",
  pending: "در انتظار",
  approved: "تایید شده",
  rejected: "رد شده",
  revised: "نیاز به اصلاح",
  correction_send: "اصلاح و ارسال",
  ready_to_send: "آماده ارسال",
  sent: "ارسال شده",
  final_sale: "فروش قطعی",
};

const REQUEST_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b"];
const TYPE_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#64748b"];

function getCurrentJalaliYear(): number {
  try {
    const part = new Intl.DateTimeFormat("en-US-u-ca-persian", { year: "numeric" })
      .formatToParts(new Date())
      .find((p) => p.type === "year")?.value;
    return part ? parseInt(part) : 1405;
  } catch {
    return 1405;
  }
}

export default function StatsDashboard({ user, setView }: Props) {
  const currentYear = getCurrentJalaliYear();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromDate, setFromDate] = useState(`${currentYear}/01/01`);
  const [toDate, setToDate] = useState(`${currentYear}/12/30`);
  const [typeViewMode, setTypeViewMode] = useState<"amount" | "count">("amount");
  // آمار کارتابل برنامه‌ریزی (کل + انجام شده)
  const [plannerStats, setPlannerStats] = useState<{ total: number; done: number }>({ total: 0, done: 0 });

  const loadStats = useCallback(async (initial = false) => {
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/stats/dashboard?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "خطا در دریافت گزارش");
      setData(json);
    } catch {
      if (initial) setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    const timer = setTimeout(() => loadStats(!data), 250);
    return () => clearTimeout(timer);
    // data عمداً dependency نیست؛ تغییر بازه باید تنها عامل واکشی خودکار باشد
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStats]);

  // واکشی آمار کارتابل برای برنامه‌ریزی
  useEffect(() => {
    const isPlannerUser = isOperationalUser(user);
    if (!isPlannerUser) return;
    const params = new URLSearchParams();
    if (user.departmentName) params.set("department", user.departmentName);
    params.set("userId", user.id.toString());
    fetch(`/api/workflow?${params.toString()}`)
      .then((r) => r.json())
      .then((items: Array<{ doneStatus?: string | null }>) => {
        if (!Array.isArray(items)) return;
        const total = items.length;
        const done = items.filter((it) => it.doneStatus === "done").length;
        setPlannerStats({ total, done });
      })
      .catch(() => {});
  }, [user]);

  const perms = getPermissions(user.role, user.permissions);
  const isManagerOrCommercial = perms.approveProforma || perms.createProforma || user.role === "manager" || user.role === "admin" || user.role === "commercial";

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-2xl p-6 shadow-sm animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!data || !data.statusStats) {
    return <div className="text-center py-12 text-gray-500">خطا در بارگذاری آمار</div>;
  }

  // مقادیر پیش‌فرض برای جلوگیری از خطای undefined
  const totals = data.totals || {
    proformas: 0, letters: 0, companies: 0, users: 0,
    pending: 0, confirmedSales: 0, confirmedSalesAmount: "0",
  };

  const pieData = (data.statusStats || []).map((s) => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] || "#6366f1",
  }));

  const barData = (data.requestTypeStats || []).map((r, i) => ({
    name: r.requestType,
    count: r.count,
    fill: REQUEST_COLORS[i % REQUEST_COLORS.length],
  }));

  const salesByTypeData = (data.salesByType || []).map((t, i) => ({
    name: t.typeName || "نامشخص",
    count: t.count,
    amount: Math.round(parseFloat(t.totalAmount) || 0),
    amountFormatted: formatPrice(t.totalAmount),
    fill: TYPE_COLORS[i % TYPE_COLORS.length],
  }));

  const areaData = (data.monthlyTrend && data.monthlyTrend.length > 0) ? data.monthlyTrend : [
    { month: "1404-01", count: 0, amount: "0" },
    { month: "1404-02", count: 0, amount: "0" },
  ];

  const totalSalesAmount = salesByTypeData.reduce((sum, t) => sum + t.amount, 0);

  // آیا کاربر عادی یا برنامه‌ریزی است (نباید اطلاعات فروش ببیند)
  const isBasicUser = !isManagerOrCommercial && !perms.manageLetters;
  const isPlanner = isOperationalUser(user);
  // کاربری که نباید هیچ اطلاعات فروش/آماری ببیند
  const hasNoSalesAccess = isBasicUser || isPlanner;
  const funnel = data.funnel || {
    issued: totals.proformas, approved: 0, sent: 0, confirmed: totals.confirmedSales || 0,
    approvalRate: 0, conversionRate: 0, rejectionRate: 0,
  };
  const kpis = data.managementKpis;

  const exportManagementCsv = () => {
    if (!data) return;
    const q = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows: string[][] = [
      ["گزارش مدیریتی", `${fromDate || "ابتدا"} تا ${toDate || "امروز"}`],
      [],
      ["شاخص", "مقدار"],
      ["تعداد پیش‌فاکتور", String(funnel.issued)],
      ["تعداد تاییدشده", String(funnel.approved)],
      ["تعداد ارسال‌شده", String(funnel.sent)],
      ["فروش قطعی", String(funnel.confirmed)],
      ["نرخ تایید", `${funnel.approvalRate}%`],
      ["نرخ تبدیل به فروش قطعی", `${funnel.conversionRate}%`],
      ["مبلغ کل پیشنهادها", kpis?.quoteAmount || "0"],
      ["مبلغ فروش قطعی", kpis?.confirmedAmount || totals.confirmedSalesAmount || "0"],
      ["میانگین زمان تایید (ساعت)", String(kpis?.avgApprovalHours || 0)],
      [],
      ["مشتریان برتر"],
      ["شرکت", "تعداد پیش‌فاکتور", "مبلغ پیشنهادی", "تعداد فروش قطعی", "مبلغ فروش قطعی", "نرخ تبدیل"],
      ...(data.topCompanies || []).map((c) => [
        c.companyName || "نامشخص", String(c.count), c.totalAmount,
        String(c.confirmedCount || 0), c.confirmedAmount || "0", `${c.conversionRate || 0}%`,
      ]),
      [],
      ["تجهیزات برتر"],
      ["تجهیز", "تعداد پیش‌فاکتور", "تعداد مشتری", "مبلغ پیشنهادی", "مبلغ فروش قطعی"],
      ...(data.topEquipment || []).map((e) => [
        e.name, String(e.proformaCount), String(e.customerCount), e.quotedAmount, e.confirmedAmount,
      ]),
      [],
      ["عملکرد کارشناسان"],
      ["کارشناس", "ایجادشده", "تاییدشده", "ارسال‌شده", "ردشده", "میانگین چرخه (ساعت)"],
      ...(data.operatorPerformance || []).map((o) => [
        o.fullName, String(o.createdCount), String(o.approvedCount), String(o.sentCount),
        String(o.rejectedCount), String(Math.round(o.avgCycleHours || 0)),
      ]),
      [],
      ["موارد راکد بیش از ۷ روز"],
      ["شماره", "شرکت", "وضعیت", "تاریخ", "سن (روز)", "مبلغ"],
      ...(data.staleProformas || []).map((p) => [
        p.proformaNumber, p.companyName || "", STATUS_LABELS[p.status] || p.status,
        p.issueDate, String(p.ageDays), p.totalAmount,
      ]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(q).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `management-report-${fromDate || "all"}-${toDate || "all"}.csv`.replace(/\//g, "-");
    a.click();
    URL.revokeObjectURL(url);
  };

  // داده نمودار دایره‌ای برنامه‌ریزی
  const plannerPieData = [
    { name: "انجام شده", value: plannerStats.done, color: "#10b981" },
    { name: "در انتظار", value: Math.max(plannerStats.total - plannerStats.done, 0), color: "#f59e0b" },
  ];

  const changeBadge = (value: number | undefined) => {
    if (!data.filters?.from || !data.filters?.to) return null;
    const v = value || 0;
    return (
      <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
        v > 0 ? "bg-emerald-100 text-emerald-700" : v < 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
      }`}>
        {v > 0 ? "▲" : v < 0 ? "▼" : "="} {Math.abs(v).toLocaleString("fa-IR")}% نسبت به سال قبل
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-3xl p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-32 translate-x-32"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl translate-y-32 -translate-x-32"></div>
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black mb-2">سلام، {user.fullName} 👋</h1>
              <p className="text-white/80">
                {user.departmentName} • {user.role} • امروز {new Date().toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran" })} • ساعت {new Date().toLocaleTimeString("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-white/60 text-sm mt-2">
                سیستم جامع مدیریت نامه‌ها و صدور پیش‌فاکتور • نسخه مدرن با کارتابل هوشمند
              </p>
            </div>
            {!isBasicUser && (
              <div className="bg-white/20 backdrop-blur rounded-2xl px-6 py-4 text-center">
                <div className="text-3xl font-black">{totals.pending}</div>
                <div className="text-xs text-white/80">در انتظار تایید</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* کنترل بازه گزارش مدیریتی */}
      {!hasNoSalesAccess && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="ml-auto">
              <div className="text-sm font-black text-gray-800">بازه گزارش</div>
              <div className="text-[11px] text-gray-500 mt-0.5">تمام شاخص‌ها و نمودارها بر اساس تاریخ صدور فیلتر می‌شوند</div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">از تاریخ</label>
              <input
                type="text"
                dir="ltr"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value.replace(/-/g, "/"))}
                placeholder="1405/01/01"
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">تا تاریخ</label>
              <input
                type="text"
                dir="ltr"
                value={toDate}
                onChange={(e) => setToDate(e.target.value.replace(/-/g, "/"))}
                placeholder="1405/12/30"
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => { setFromDate(`${currentYear}/01/01`); setToDate(`${currentYear}/12/30`); }}
                className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold"
              >سال جاری</button>
              <button
                type="button"
                onClick={() => { setFromDate(`${currentYear - 1}/01/01`); setToDate(`${currentYear - 1}/12/30`); }}
                className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-bold"
              >سال قبل</button>
              <button
                type="button"
                onClick={() => { setFromDate(""); setToDate(""); }}
                className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-bold"
              >همه دوره‌ها</button>
            </div>
            <button
              type="button"
              onClick={() => loadStats(false)}
              disabled={refreshing}
              className="px-4 py-2 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 text-xs font-bold"
            >{refreshing ? "در حال بروزرسانی..." : "↻ تازه‌سازی"}</button>
            <button
              type="button"
              onClick={exportManagementCsv}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
            >⬇ خروجی Excel/CSV</button>
          </div>
        </div>
      )}

      {/* برای کاربر عادی فقط پیام خوشامدگویی */}
      {isBasicUser && !isPlanner && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📥</span>
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-2">کارتابل شما</h2>
          <p className="text-gray-500 mb-4">برای مشاهده نامه‌ها و پیش‌فاکتورهای ارجاع شده به شما، به «کارتابل من» مراجعه کنید.</p>
          <button
            onClick={() => setView("kartabl")}
            className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition"
          >
            📥 رفتن به کارتابل من
          </button>
        </div>
      )}

      {/* ── داشبورد اختصاصی برنامه‌ریزی — نمودار دایره‌ای کل / انجام شده ── */}
      {isPlanner && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-black text-gray-900 flex items-center gap-2">
                <span className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white">📊</span>
                وضعیت پیش‌فاکتورهای ارجاعی
              </h3>
              <p className="text-xs text-gray-500 mt-1">نمودار کل پیش‌فاکتورها و انجام شده در کارتابل شما</p>
            </div>
            <button
              onClick={() => setView("kartabl")}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              مشاهده کارتابل ←
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* نمودار دایره‌ای */}
            <div className="md:col-span-2 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={plannerPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {plannerPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 30px rgba(0,0,0,0.1)", direction: "rtl" }}
                    formatter={(value: unknown, name: unknown) => [`${value} مورد`, String(name)]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => <span className="text-sm text-gray-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* خلاصه عددی */}
            <div className="space-y-3">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
                <div className="text-3xl font-black text-indigo-700">{plannerStats.total.toLocaleString("fa-IR")}</div>
                <div className="text-xs text-indigo-600 mt-1">کل پیش‌فاکتورها</div>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                <div className="text-3xl font-black text-green-700">{plannerStats.done.toLocaleString("fa-IR")}</div>
                <div className="text-xs text-green-600 mt-1">انجام شده</div>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                <div className="text-3xl font-black text-amber-700">{(plannerStats.total - plannerStats.done).toLocaleString("fa-IR")}</div>
                <div className="text-xs text-amber-600 mt-1">در انتظار</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards — فقط برای کاربران مجاز */}
      {!isBasicUser && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {perms.manageLetters && (
        <div className="group bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card-hover cursor-pointer" onClick={() => setView("letters")}>
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <span className="text-white text-xl">📨</span>
            </div>
            <span className="text-xs font-medium bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">نامه‌ها</span>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-black text-gray-900">{totals.letters.toLocaleString("fa-IR")}</div>
            <div className="text-sm text-gray-500">کل نامه‌های وارده</div>
          </div>
          <div className="mt-4 flex items-center text-xs text-blue-600 font-medium">
            <span>مشاهده نامه‌ها</span>
            <span className="mr-1 group-hover:mr-2 transition-all">←</span>
          </div>
        </div>
        )}

        {(perms.createProforma || perms.approveProforma) && (
        <div className="group bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card-hover cursor-pointer" onClick={() => setView("proformas")}>
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <span className="text-white text-xl">📋</span>
            </div>
            <span className="text-xs font-medium bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full">
              {data.statusStats.find(s => s.status === "approved")?.count || 0} تایید شده
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-black text-gray-900">{totals.proformas.toLocaleString("fa-IR")}</div>
            <div className="text-sm text-gray-500">کل پیش‌فاکتورها</div>
          </div>
          <div className="mt-4 flex items-center text-xs text-emerald-600 font-medium">
            <span>مشاهده پیش‌فاکتورها</span>
            <span className="mr-1 group-hover:mr-2 transition-all">←</span>
          </div>
        </div>
        )}

        {(perms.approveProforma || perms.createProforma) && (
        <div className="group bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card-hover" >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/25">
              <span className="text-white text-xl">⏳</span>
            </div>
            <span className="text-xs font-medium bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full animate-pulse">نیاز به رسیدگی</span>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-black text-gray-900">{totals.pending.toLocaleString("fa-IR")}</div>
            <div className="text-sm text-gray-500">در انتظار تایید مدیریت</div>
          </div>
          <div className="mt-4 w-full bg-gray-100 rounded-full h-2">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 h-2 rounded-full" style={{ width: `${totals.proformas ? (totals.pending / totals.proformas * 100) : 0}%` }}></div>
          </div>
        </div>
        )}

        {perms.manageCompanies && (
        <div className="group bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card-hover cursor-pointer" onClick={() => setView("companies")}>
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
              <span className="text-white text-xl">🏢</span>
            </div>
            <span className="text-xs font-medium bg-purple-50 text-purple-600 px-2.5 py-1 rounded-full">{totals.users} کاربر</span>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-black text-gray-900">{totals.companies.toLocaleString("fa-IR")}</div>
            <div className="text-sm text-gray-500">مشتریان فعال</div>
          </div>
          <div className="mt-4 flex items-center text-xs text-purple-600 font-medium">
            <span>مدیریت مشتریان</span>
            <span className="mr-1 group-hover:mr-2 transition-all">←</span>
          </div>
        </div>
        )}
      </div>
      )}

      {/* فروش قطعی - بنر ویژه */}
      {isManagerOrCommercial && (totals.confirmedSales !== undefined) && (
        <div className="relative overflow-hidden bg-gradient-to-br from-green-600 via-emerald-600 to-teal-600 rounded-3xl p-6 text-white">
          <div className="absolute top-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -translate-y-24 -translate-x-24"></div>
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl translate-y-32 translate-x-32"></div>
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
                <span className="text-3xl">💵</span>
              </div>
              <div>
                <div className="text-white/80 text-sm font-medium">فروش قطعی (تأیید نهایی شده توسط مشتری)</div>
                <div className="text-3xl font-black mt-1">
                  {formatPrice(totals.confirmedSalesAmount || "0")} ریال
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center bg-white/20 backdrop-blur rounded-xl px-6 py-3">
                <div className="text-2xl font-black">{totals.confirmedSales}</div>
                <div className="text-xs text-white/80">تاییدیه استعلام</div>
              </div>
              <div className="text-xs text-white/70 max-w-[200px]">
                📌 این آمار بر اساس نامه‌های نوع «تاییدیه استعلام» که توسط مشتری یا کارشناس بازرگانی تأیید نهایی شده‌اند محاسبه می‌شود
              </div>
            </div>
          </div>
        </div>
      )}

      {/* شاخص‌های تصمیم‌گیری و قیف تبدیل */}
      {isManagerOrCommercial && kpis && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-indigo-100 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl">🧾</div>
                {changeBadge(kpis.changes.quoteAmount)}
              </div>
              <div className="mt-4 text-xs text-gray-500">ارزش کل پیشنهادهای صادرشده</div>
              <div className="mt-1 text-xl font-black text-gray-900">{formatPrice(kpis.quoteAmount)} <span className="text-xs font-normal text-gray-400">ریال</span></div>
              <div className="mt-2 text-[10px] text-gray-400">فقط نسخه‌های دارای جمع برای مشتری محاسبه می‌شوند</div>
              {/* محاسبات داخلی — پیش‌فاکتورهای «بدون جمع» مخصوص محاسبات داخلی شرکت */}
              <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                <div className="text-[10px] font-bold text-amber-700">محاسبات داخلی (پیش‌فاکتور بدون جمع)</div>
                <div className="text-xs font-black text-amber-800">
                  {formatPrice(kpis.internalAmount || "0")} ریال
                  {typeof kpis.internalCount === "number" && kpis.internalCount > 0 && (
                    <span className="font-normal text-amber-600"> — {kpis.internalCount.toLocaleString("fa-IR")} پیش‌فاکتور</span>
                  )}
                </div>
              </div>
              {/* درخواست: جمع کل پیشنهادها با احتساب نسخه‌های «بدون جمع» هم نمایش داده شود */}
              <div className="mt-2 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1.5">
                <div className="text-[10px] font-bold text-indigo-700">جمع کل پیشنهادها (دارای جمع + بدون جمع)</div>
                <div className="text-xs font-black text-indigo-900">
                  {formatPrice(kpis.grandQuoteAmount || "0")} ریال
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-emerald-100 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl">💵</div>
                {changeBadge(kpis.changes.confirmedAmount)}
              </div>
              <div className="mt-4 text-xs text-gray-500">فروش قطعی واقعی</div>
              <div className="mt-1 text-xl font-black text-emerald-700">{formatPrice(kpis.confirmedAmount)} <span className="text-xs font-normal text-gray-400">ریال</span></div>
            </div>
            <div className="bg-white rounded-2xl border border-sky-100 p-5 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center text-xl">⏱️</div>
              <div className="mt-4 text-xs text-gray-500">میانگین زمان چرخه تأیید</div>
              <div className="mt-1 text-xl font-black text-gray-900">
                {kpis.avgApprovalHours < 24
                  ? `${Math.round(kpis.avgApprovalHours).toLocaleString("fa-IR")} ساعت`
                  : `${(kpis.avgApprovalHours / 24).toFixed(1).replace(".0", "")} روز`}
              </div>
            </div>
            <div className={`rounded-2xl border p-5 shadow-sm ${kpis.staleCount > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-100"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${kpis.staleCount > 0 ? "bg-red-100 text-red-700" : "bg-gray-100"}`}>⚠️</div>
                {kpis.revisions > 0 && <span className="text-[10px] bg-violet-100 text-violet-700 rounded-full px-2 py-0.5">{kpis.revisions.toLocaleString("fa-IR")} اصلاحی</span>}
              </div>
              <div className="mt-4 text-xs text-gray-500">پرونده‌های راکد بیش از ۷ روز</div>
              <div className={`mt-1 text-2xl font-black ${kpis.staleCount > 0 ? "text-red-700" : "text-gray-900"}`}>{kpis.staleCount.toLocaleString("fa-IR")}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                  <h3 className="font-black text-gray-900">قیف تبدیل پیش‌فاکتور به فروش</h3>
                  <p className="text-xs text-gray-500 mt-1">تفکیک تأیید داخلی از فروش قطعی مشتری</p>
                </div>
                <div className="flex gap-2">
                  <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">نرخ تأیید: {funnel.approvalRate.toLocaleString("fa-IR")}%</span>
                  <span className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">نرخ تبدیل: {funnel.conversionRate.toLocaleString("fa-IR")}%</span>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { label: "صادرشده", value: funnel.issued, base: funnel.issued, color: "from-indigo-500 to-purple-500", icon: "🧾" },
                  { label: "تأیید داخلی", value: funnel.approved, base: funnel.issued, color: "from-sky-500 to-cyan-500", icon: "✅" },
                  { label: "ارسال‌شده به مشتری", value: funnel.sent, base: funnel.issued, color: "from-amber-500 to-orange-500", icon: "📤" },
                  { label: "فروش قطعی", value: funnel.confirmed, base: funnel.issued, color: "from-emerald-500 to-green-600", icon: "💰" },
                ].map((step) => {
                  const width = step.base ? Math.max((step.value / step.base) * 100, step.value > 0 ? 5 : 0) : 0;
                  return (
                    <div key={step.label} className="grid grid-cols-[125px_1fr_55px] items-center gap-3">
                      <div className="text-xs font-bold text-gray-700">{step.icon} {step.label}</div>
                      <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
                        <div className={`h-full bg-gradient-to-l ${step.color} rounded-lg transition-all flex items-center justify-end px-2`} style={{ width: `${width}%` }}>
                          {width > 18 && <span className="text-[10px] text-white font-bold">{Math.round(width).toLocaleString("fa-IR")}%</span>}
                        </div>
                      </div>
                      <div className="text-sm font-black text-left">{step.value.toLocaleString("fa-IR")}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-center">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500">میانگین مبلغ هر پیشنهاد</div>
                  <div className="font-black text-gray-800 mt-1">{formatPrice(kpis.averageQuote)} ریال</div>
                </div>
                <div className="bg-red-50 rounded-xl p-3">
                  <div className="text-xs text-red-600">نرخ رد مدیریت</div>
                  <div className="font-black text-red-700 mt-1">{funnel.rejectionRate.toLocaleString("fa-IR")}%</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-black mb-1">مقایسه با سال قبل</h3>
              {data.filters?.from && data.filters?.to ? (
                <>
                  <p className="text-xs text-white/50 mb-5">{data.filters.previousFrom} تا {data.filters.previousTo}</p>
                  <div className="space-y-3">
                    <div className="bg-white/10 rounded-xl p-3 flex items-center justify-between">
                      <span className="text-xs text-white/70">پیش‌فاکتور</span>
                      <span className="font-black">{kpis.previous.proformas.toLocaleString("fa-IR")}</span>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <div className="text-xs text-white/70">مبلغ پیشنهادی</div>
                      <div className="font-black mt-1">{formatPrice(kpis.previous.quoteAmount)} ریال</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <div className="text-xs text-white/70">فروش قطعی</div>
                      <div className="font-black text-emerald-300 mt-1">{formatPrice(kpis.previous.confirmedAmount)} ریال</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-5 bg-white/10 rounded-xl p-4 text-sm leading-6 text-white/70">
                  برای مشاهده مقایسه دوره‌ای، یک بازه تاریخ مشخص انتخاب کنید.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* آمار فروش بر حسب نوع پیش فاکتور - ویژه مدیریت و بازرگانی */}
      {isManagerOrCommercial && salesByTypeData.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h3 className="font-black text-gray-900 flex items-center gap-2">
                <span className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white">💰</span>
                آمار فروش بر حسب نوع پیش‌فاکتور
              </h3>
              <p className="text-xs text-gray-500 mt-1">مجموع فروش: {formatPrice(totalSalesAmount)} ریال • {totals.proformas} پیش‌فاکتور</p>
            </div>
            <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setTypeViewMode("amount")}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${typeViewMode === "amount" ? "bg-white shadow text-indigo-600" : "text-gray-500"}`}
              >
                مبلغ فروش
              </button>
              <button
                onClick={() => setTypeViewMode("count")}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${typeViewMode === "count" ? "bg-white shadow text-indigo-600" : "text-gray-500"}`}
              >
                تعداد
              </button>
            </div>
          </div>

          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByTypeData} layout="vertical" margin={{ left: 30, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={true} vertical={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => typeViewMode === "amount" ? formatPrice(val) : val.toLocaleString("fa-IR")}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={110}
                  tick={{ fontSize: 12, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 30px rgba(0,0,0,0.1)", direction: "rtl" }}
                  formatter={(value: unknown) => {
                    const num = Number(value);
                    if (typeViewMode === "amount") {
                      return [`${formatPrice(num)} ریال`, "مبلغ فروش"] as unknown as string;
                    }
                    return [num, "تعداد"] as unknown as string;
                  }}
                  labelFormatter={(label) => `نوع: ${String(label)}`}
                />
                <Bar
                  dataKey={typeViewMode === "amount" ? "amount" : "count"}
                  radius={[0, 8, 8, 0]}
                  barSize={28}
                >
                  {salesByTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary table */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {salesByTypeData.map((t) => (
              <div key={t.name} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                <div className="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center text-white text-xs font-bold" style={{ background: t.fill }}>{t.name.charAt(0)}</div>
                <div className="text-xs font-bold text-gray-700 truncate">{t.name}</div>
                <div className="text-xs text-gray-500 mt-1">{t.count} فقره</div>
                <div className="text-xs font-black text-indigo-600 mt-1">{t.amountFormatted} <span className="font-normal text-gray-400">ریال</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts — فقط برای کاربران مجاز (بدون فروش برای عادی/برنامه‌ریزی) */}
      {!hasNoSalesAccess && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900">توزیع وضعیت پیش‌فاکتورها</h3>
            <span className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full">Pie Chart</span>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 30px rgba(0,0,0,0.1)", direction: "rtl" }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-sm text-gray-600">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Request Types */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900">انواع درخواست</h3>
            <span className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full">Bar Chart</span>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Monthly Trend & Top Companies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900">روند ماهانه صدور پیش‌فاکتور</h3>
            <span className="text-xs bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-3 py-1 rounded-full">Area Chart</span>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }} />
                <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCount)" name="تعداد" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-1">برترین مشتریان</h3>
          <p className="text-[11px] text-gray-500 mb-5">رتبه‌بندی بر اساس فروش قطعی و سپس مبلغ پیشنهادی</p>
          <div className="space-y-4">
            {(data.topCompanies || []).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">داده‌ای وجود ندارد</p>
            ) : (
              (data.topCompanies || []).map((company, idx) => (
                <div key={company.companyId || idx} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                    idx === 0 ? "bg-gradient-to-br from-yellow-400 to-orange-500" :
                    idx === 1 ? "bg-gradient-to-br from-gray-400 to-gray-600" :
                    idx === 2 ? "bg-gradient-to-br from-amber-600 to-yellow-700" :
                    "bg-gradient-to-br from-indigo-400 to-purple-500"
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{company.companyName || "نامشخص"}</div>
                    <div className="text-[11px] text-gray-500">پیشنهاد: {formatPrice(company.totalAmount)} ریال</div>
                    <div className="text-[11px] font-bold text-emerald-600">فروش قطعی: {formatPrice(company.confirmedAmount || "0")} ریال</div>
                  </div>
                  <div className="text-center shrink-0">
                    <div className="text-xs bg-gray-100 px-2 py-1 rounded-full">{company.count} فقره</div>
                    <div className="text-[10px] text-indigo-600 mt-1">تبدیل {company.conversionRate || 0}%</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* تجهیزات برتر و عملکرد تیم */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between gap-2 mb-5">
            <div>
              <h3 className="font-black text-gray-900">تجهیزات برتر</h3>
              <p className="text-[11px] text-gray-500 mt-1">بر اساس مبلغ اقلام پیشنهادی در بازه گزارش</p>
            </div>
            <span className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-3 py-1">Top 10</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50 text-gray-500">
                <th className="text-right px-3 py-2 rounded-r-lg">تجهیز</th>
                <th className="text-center px-3 py-2">مشتری</th>
                <th className="text-center px-3 py-2">پیشنهاد</th>
                <th className="text-left px-3 py-2 rounded-l-lg">مبلغ</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {(data.topEquipment || []).map((item, idx) => (
                  <tr key={`${item.equipmentId}-${item.name}`} className="hover:bg-gray-50">
                    <td className="px-3 py-3"><span className="text-gray-400 ml-2">{idx + 1}</span><span className="font-bold text-gray-800">{item.name}</span></td>
                    <td className="px-3 py-3 text-center">{item.customerCount.toLocaleString("fa-IR")}</td>
                    <td className="px-3 py-3 text-center">{item.proformaCount.toLocaleString("fa-IR")}</td>
                    <td className="px-3 py-3 text-left font-bold text-indigo-700 whitespace-nowrap">{formatPrice(item.quotedAmount)}</td>
                  </tr>
                ))}
                {(data.topEquipment || []).length === 0 && <tr><td colSpan={4} className="text-center py-8 text-gray-400">داده‌ای در این بازه وجود ندارد</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between gap-2 mb-5">
            <div>
              <h3 className="font-black text-gray-900">عملکرد کارشناسان</h3>
              <p className="text-[11px] text-gray-500 mt-1">حجم کار، نتیجه و سرعت چرخه پیش‌فاکتور</p>
            </div>
            <span className="text-xs bg-purple-50 text-purple-700 rounded-full px-3 py-1">تیم</span>
          </div>
          <div className="space-y-3">
            {(data.operatorPerformance || []).map((op) => {
              const success = op.createdCount ? Math.round((op.approvedCount / op.createdCount) * 100) : 0;
              return (
                <div key={op.userId} className="rounded-xl border border-gray-100 p-3 hover:border-purple-200">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-sm text-gray-800">{op.fullName}</div>
                    <div className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">موفقیت {success.toLocaleString("fa-IR")}%</div>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                    <div><div className="font-black text-indigo-700">{op.createdCount.toLocaleString("fa-IR")}</div><div className="text-[9px] text-gray-400">ایجاد</div></div>
                    <div><div className="font-black text-emerald-700">{op.approvedCount.toLocaleString("fa-IR")}</div><div className="text-[9px] text-gray-400">تأیید</div></div>
                    <div><div className="font-black text-sky-700">{op.sentCount.toLocaleString("fa-IR")}</div><div className="text-[9px] text-gray-400">ارسال</div></div>
                    <div><div className="font-black text-gray-700">{op.avgCycleHours < 24 ? `${Math.round(op.avgCycleHours)}س` : `${(op.avgCycleHours / 24).toFixed(1)}ر`}</div><div className="text-[9px] text-gray-400">چرخه</div></div>
                  </div>
                </div>
              );
            })}
            {(data.operatorPerformance || []).length === 0 && <p className="text-center py-8 text-sm text-gray-400">داده‌ای وجود ندارد</p>}
          </div>
        </div>
      </div>

      {/* هشدار پرونده‌های راکد */}
      {(data.staleProformas || []).length > 0 && (
        <div className="bg-red-50 rounded-2xl p-6 shadow-sm border border-red-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-black text-red-900 flex items-center gap-2">🚨 نیازمند پیگیری فوری</h3>
              <p className="text-xs text-red-700/70 mt-1">پیش‌فاکتورهایی که بیش از ۷ روز در وضعیت عملیاتی متوقف مانده‌اند</p>
            </div>
            <button onClick={() => setView("proformas")} className="text-xs bg-white border border-red-200 text-red-700 px-3 py-1.5 rounded-lg font-bold">مشاهده پیش‌فاکتورها ←</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(data.staleProformas || []).map((p) => (
              <div key={p.id} className="bg-white border border-red-100 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm text-gray-900"><DocNo v={p.proformaNumber} persian={false} /></div>
                    <div className="text-xs text-gray-500 mt-1">{p.companyName || "نامشخص"}</div>
                  </div>
                  <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-1 font-bold">{p.ageDays.toLocaleString("fa-IR")} روز</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <span className="text-orange-700">{STATUS_LABELS[p.status] || p.status}</span>
                  <span className="font-bold text-gray-700">{formatPrice(p.totalAmount)} ریال</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Proformas & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900">آخرین پیش‌فاکتورها</h3>
            <button onClick={() => setView("proformas")} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">مشاهده همه ←</button>
          </div>
          <div className="space-y-3">
            {(data.recentProformas || []).map((p) => (
              <div key={p.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition group">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-10 rounded-full ${
                    p.status === "approved" ? "bg-green-500" :
                    p.status === "pending" ? "bg-amber-500" :
                    p.status === "rejected" ? "bg-red-500" : "bg-gray-300"
                  }`}></div>
                  <div>
                    <div className="font-medium text-sm"><DocNo v={p.proformaNumber} persian={false} /> <span className="text-xs text-gray-400">• {p.typeName || ""}</span></div>
                    <div className="text-xs text-gray-500">{p.companyName} • {p.issueDate}</div>
                  </div>
                </div>
                <div className="text-left">
                  <div className="font-bold text-sm">{formatPrice(p.totalAmount)} <span className="text-xs font-normal text-gray-500">ریال</span></div>
                  <div className={`text-xs px-2 py-1 rounded-full inline-block mt-1 ${
                    p.status === "approved" ? "bg-green-100 text-green-700" :
                    p.status === "pending" ? "bg-amber-100 text-amber-700" :
                    p.status === "rejected" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {STATUS_LABELS[p.status] || p.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <h3 className="font-bold mb-4 relative">دسترسی سریع</h3>
          <div className="space-y-3 relative">
            {perms.manageLetters && (
              <button onClick={() => setView("letters")} className="w-full bg-white/10 backdrop-blur hover:bg-white/20 rounded-xl p-4 flex items-center gap-3 transition text-right">
                <span className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">📨</span>
                <div>
                  <div className="font-medium text-sm">نامه جدید</div>
                  <div className="text-xs text-white/60">ثبت نامه وارده</div>
                </div>
              </button>
            )}
            {(perms.createProforma || perms.approveProforma) && (
              <button onClick={() => setView("proformas")} className="w-full bg-white/10 backdrop-blur hover:bg-white/20 rounded-xl p-4 flex items-center gap-3 transition text-right">
                <span className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">📋</span>
                <div>
                  <div className="font-medium text-sm">پیش‌فاکتور جدید</div>
                  <div className="text-xs text-white/60">صدور پیش‌فاکتور</div>
                </div>
              </button>
            )}
            <button onClick={() => setView("reports")} className="w-full bg-white/10 backdrop-blur hover:bg-white/20 rounded-xl p-4 flex items-center gap-3 transition text-right">
              <span className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center">📈</span>
              <div>
                <div className="font-medium text-sm">سوابق مشتری</div>
                <div className="text-xs text-white/60">گزارش و آمار</div>
              </div>
            </button>
          </div>
          <div className="mt-6 p-4 bg-white/10 backdrop-blur rounded-xl">
            <div className="text-xs text-white/60 mb-1">نکته</div>
            <div className="text-sm">هر واحد کارتابل اختصاصی خود را دارد — اعلانات جدید را از 🔔 بالا ببینید</div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
