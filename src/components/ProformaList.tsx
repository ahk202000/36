"use client";

import { useState, useEffect, useMemo } from "react";
import type { UserInfo } from "@/app/page";
import { formatPrice, toPersianDigits } from "@/lib/utils";
import { isRevisedProforma } from "@/lib/proforma-number";
import PersianDatePicker from "@/components/PersianDatePicker";
import DocNo from "@/components/DocNo";

interface ProformaRow {
  id: number;
  proformaNumber: string;
  revisionNo?: number | null;
  letterSeq?: number | null;
  typeName: string | null;
  companyName: string | null;
  issueDate: string;
  totalAmount: string;
  showTotal: boolean;
  status: string;
  letterId: number | null;
  letterNumber?: string | null;
  isFinalSale?: boolean;
  createdByName: string | null;
  updatedByName: string | null;
  approvedByName: string | null;
}

interface Props {
  user: UserInfo;
  onNewProforma: () => void;
  onEditProforma: (id: number) => void;
  onViewProforma: (id: number) => void;
}

const statusLabels: Record<string, string> = {
  draft: "پیش‌نویس",
  pending: "در انتظار تایید",
  approved: "تایید شده",
  rejected: "رد شده",
  revised: "نیاز به اصلاح",
  correction_send: "اصلاح و ارسال",
  ready_to_send: "آماده ارسال",
  sent: "ارسال شده",
  final_sale: "فروش قطعی",
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  revised: "bg-orange-100 text-orange-800",
  correction_send: "bg-violet-100 text-violet-800",
  ready_to_send: "bg-cyan-100 text-cyan-800",
  sent: "bg-emerald-100 text-emerald-800",
  final_sale: "bg-green-600 text-white",
};

type Tab = "all" | "active" | "approved" | "rejected" | "sent" | "final_sale";

const PAGE_SIZE = 20;

export default function ProformaList({ user, onNewProforma, onEditProforma, onViewProforma }: Props) {
  const [proformas, setProformas] = useState<ProformaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [currentPage, setCurrentPage] = useState(1);

  /* ── Search states ── */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterAmountMin, setFilterAmountMin] = useState("");
  const [filterAmountMax, setFilterAmountMax] = useState("");
  const [filterProformaNumber, setFilterProformaNumber] = useState("");
  const [filterCustomerName, setFilterCustomerName] = useState("");

  useEffect(() => {
    fetch("/api/proforma")
      .then((r) => r.json())
      .then((d) => { setProformas(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const formatAmount = (amount: string, showTotal: boolean) => {
    if (!showTotal) return "بدون جمع کل";
    const n = parseFloat(amount);
    if (isNaN(n) || n === 0) return "-";
    return toPersianDigits(formatPrice(n)) + " ریال";
  };

  /* ── Unique proforma types ── */
  const proformaTypeNames = useMemo(() => {
    const set = new Set(proformas.map((p) => p.typeName).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [proformas]);

  /* ── Tab-based base lists ── */
  const activeList = proformas.filter(p => ["draft", "pending", "revised", "correction_send", "ready_to_send"].includes(p.status));
  const approvedList = proformas.filter(p => p.status === "approved");
  const rejectedList = proformas.filter(p => p.status === "rejected");
  const sentList = proformas.filter(p => p.status === "sent");
  const finalSaleList = proformas.filter(p => p.status === "final_sale" || p.isFinalSale);

  const tabList = (() => {
    switch (tab) {
      case "active": return activeList;
      case "approved": return approvedList;
      case "rejected": return rejectedList;
      case "sent": return sentList;
      case "final_sale": return finalSaleList;
      default: return proformas;
    }
  })();

  /* ── Apply search / filters on top of tab ── */
  const filtered = useMemo(() => {
    let list = tabList;

    // Free-text search
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.proformaNumber.toLowerCase().includes(q) ||
          (p.companyName || "").toLowerCase().includes(q) ||
          (p.typeName || "").toLowerCase().includes(q)
      );
    }

    // شماره پیش فاکتور
    if (filterProformaNumber.trim()) {
      const q = filterProformaNumber.trim().toLowerCase();
      list = list.filter((p) => p.proformaNumber.toLowerCase().includes(q));
    }

    // نام مشتری
    if (filterCustomerName.trim()) {
      const q = filterCustomerName.trim().toLowerCase();
      list = list.filter((p) => (p.companyName || "").toLowerCase().includes(q));
    }

    // Status filter (additional to tab)
    if (filterStatus !== "all") {
      list = list.filter((p) => p.status === filterStatus);
    }

    // Type filter
    if (filterType !== "all") {
      list = list.filter((p) => p.typeName === filterType);
    }

    // Date range
    if (filterDateFrom) {
      list = list.filter((p) => p.issueDate >= filterDateFrom);
    }
    if (filterDateTo) {
      list = list.filter((p) => p.issueDate <= filterDateTo);
    }

    // Amount range
    if (filterAmountMin) {
      const min = parseFloat(filterAmountMin);
      if (!isNaN(min)) list = list.filter((p) => parseFloat(p.totalAmount) >= min);
    }
    if (filterAmountMax) {
      const max = parseFloat(filterAmountMax);
      if (!isNaN(max)) list = list.filter((p) => parseFloat(p.totalAmount) <= max);
    }

    return list;
  }, [tabList, searchText, filterStatus, filterType, filterDateFrom, filterDateTo, filterAmountMin, filterAmountMax, filterProformaNumber, filterCustomerName]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedList = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [tab, searchText, filterStatus, filterType, filterDateFrom, filterDateTo, filterAmountMin, filterAmountMax, filterProformaNumber, filterCustomerName]);

  const hasActiveFilters =
    searchText.trim() !== "" ||
    filterStatus !== "all" ||
    filterType !== "all" ||
    filterDateFrom !== "" ||
    filterDateTo !== "" ||
    filterAmountMin !== "" ||
    filterAmountMax !== "" ||
    filterProformaNumber !== "" ||
    filterCustomerName !== "";

  const clearFilters = () => {
    setSearchText("");
    setFilterStatus("all");
    setFilterType("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterAmountMin("");
    setFilterAmountMax("");
    setFilterProformaNumber("");
    setFilterCustomerName("");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">پیش فاکتورها</h1>
          <p className="text-sm text-gray-500 mt-1">مدیریت، پیگیری و بایگانی پیش‌فاکتورها</p>
        </div>
        <button
          onClick={onNewProforma}
          className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition flex items-center gap-2"
        >
          <span className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">+</span>
          صدور پیش فاکتور جدید
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setTab("all")}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition ${tab === "all" ? "bg-white shadow-md text-gray-900 border border-gray-200" : "bg-gray-100 text-gray-500 hover:text-gray-700"}`}
        >
          📋 همه ({toPersianDigits(proformas.length)})
        </button>
        <button
          onClick={() => setTab("active")}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition ${tab === "active" ? "bg-white shadow-md text-blue-700 border border-blue-200" : "bg-gray-100 text-gray-500 hover:text-gray-700"}`}
        >
          ⏳ فعال ({toPersianDigits(activeList.length)})
        </button>

        <div className="w-px bg-gray-300 mx-1 self-stretch"></div>
        <span className="text-xs text-gray-400 self-center font-bold">بایگانی:</span>

        <button
          onClick={() => setTab("approved")}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-1.5 ${tab === "approved" ? "bg-green-600 text-white shadow-md" : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"}`}
        >
          <span className="w-2 h-2 bg-green-400 rounded-full"></span>
          تایید شده ({toPersianDigits(approvedList.length)})
        </button>
        <button
          onClick={() => setTab("rejected")}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-1.5 ${tab === "rejected" ? "bg-red-600 text-white shadow-md" : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"}`}
        >
          <span className="w-2 h-2 bg-red-400 rounded-full"></span>
          رد شده ({toPersianDigits(rejectedList.length)})
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-1.5 ${tab === "sent" ? "bg-emerald-600 text-white shadow-md" : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"}`}
        >
          <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
          ارسال شده ({toPersianDigits(sentList.length)})
        </button>
        <button
          onClick={() => setTab("final_sale")}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-1.5 ${tab === "final_sale" ? "bg-green-600 text-white shadow-md" : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"}`}
        >
          <span className="w-2 h-2 bg-indigo-400 rounded-full"></span>
          فروش قطعی ({toPersianDigits(finalSaleList.length)})
        </button>
      </div>

      {/* ── Quick search bar ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="جستجو در شماره، شرکت، نوع پیش‌فاکتور ..."
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition bg-white"
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
            searchOpen || hasActiveFilters
              ? "bg-indigo-50 border-indigo-300 text-indigo-700"
              : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          جستجوی پیشرفته
          {hasActiveFilters && <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-red-600 hover:text-red-800 font-medium"
          >
            پاک‌سازی فیلترها
          </button>
        )}
      </div>

      {/* ── Advanced search panel ── */}
      {searchOpen && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-5 mb-4 border border-indigo-100">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* شماره پیش فاکتور */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">شماره پیش فاکتور</label>
              <input
                type="text"
                value={filterProformaNumber}
                onChange={(e) => setFilterProformaNumber(e.target.value)}
                placeholder="مثلا: 1404-0012"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>

            {/* نام مشتری */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">نام مشتری</label>
              <input
                type="text"
                value={filterCustomerName}
                onChange={(e) => setFilterCustomerName(e.target.value)}
                placeholder="نام شرکت یا مشتری"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">وضعیت</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
              >
                <option value="all">همه وضعیت‌ها</option>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">نوع پیش‌فاکتور</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
              >
                <option value="all">همه انواع</option>
                {proformaTypeNames.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">از تاریخ صدور</label>
              <PersianDatePicker
                value={filterDateFrom}
                onChange={setFilterDateFrom}
                placeholder="انتخاب تاریخ"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">تا تاریخ صدور</label>
              <PersianDatePicker
                value={filterDateTo}
                onChange={setFilterDateTo}
                placeholder="انتخاب تاریخ"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
              />
            </div>

            {/* Amount Min */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">حداقل مبلغ (ریال)</label>
              <input
                type="text"
                value={filterAmountMin}
                onChange={(e) => setFilterAmountMin(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="مثلا ۱۰۰۰۰۰۰۰"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 ltr-input"
              />
            </div>

            {/* Amount Max */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">حداکثر مبلغ (ریال)</label>
              <input
                type="text"
                value={filterAmountMax}
                onChange={(e) => setFilterAmountMax(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="مثلا ۵۰۰۰۰۰۰۰۰"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 ltr-input"
              />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">{hasActiveFilters ? "🔍" : "📋"}</span>
          </div>
          {hasActiveFilters ? (
            <>
              <p className="text-gray-500 font-medium">نتیجه‌ای یافت نشد</p>
              <button onClick={clearFilters} className="mt-4 text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                پاک‌سازی فیلترها
              </button>
            </>
          ) : (
            <p className="text-gray-500">هیچ پیش فاکتوری صادر نشده است</p>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-right font-bold text-gray-600">ردیف</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-600">شماره</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-600">نوع</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-600">شرکت</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-600">تاریخ</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-600">مبلغ</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-600">صادرکننده</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-600">وضعیت</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-600">فروش قطعی</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-600">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedList.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-500">{toPersianDigits((currentPage - 1) * PAGE_SIZE + idx + 1)}</td>
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <bdi dir="ltr" style={{ unicodeBidi: "isolate", display: "inline-block" }}>{highlight(toPersianDigits(p.proformaNumber), searchText)}</bdi>
                          {isRevisedProforma(p) && (
                            <span className="bg-orange-100 text-orange-700 border border-orange-200 text-[10px] px-1.5 py-0.5 rounded-full font-bold" title="پیش‌فاکتور اصلاحی">
                              اصلاحی
                            </span>
                          )}
                          {(p.letterSeq ?? 1) > 1 && (
                            <span className="bg-sky-100 text-sky-700 border border-sky-200 text-[10px] px-1.5 py-0.5 rounded-full font-bold" title="پیش‌فاکتور دوم/سوم همان نامه">
                              پ.ف {toPersianDigits(p.letterSeq!)} نامه
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">{highlight(p.typeName || "-", searchText)}</td>
                      <td className="px-4 py-3">{highlight(p.companyName || "-", searchText)}</td>
                      <td className="px-4 py-3">{toPersianDigits(p.issueDate)}</td>
                      <td className="px-4 py-3">{formatAmount(p.totalAmount, p.showTotal)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">{p.createdByName || "-"}</span>
                          {p.approvedByName && (
                            <span className="text-[10px] text-green-600">تایید: {p.approvedByName}</span>
                          )}
                          {p.updatedByName && p.updatedByName !== p.createdByName && !p.approvedByName && (
                            <span className="text-[10px] text-gray-400">ویرایش: {p.updatedByName}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusColors[p.status] || "bg-gray-100"}`}>
                          {statusLabels[p.status] || p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {(p.status === "final_sale" || p.isFinalSale) ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => onViewProforma(p.id)}
                            className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                          >
                            مشاهده
                          </button>
                          {(p.status !== "pending" || user.role === "manager" || user.role === "admin") && !["approved", "rejected", "sent", "final_sale"].includes(p.status) && (
                            <button
                              onClick={() => onEditProforma(p.id)}
                              className="bg-gray-50 text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                            >
                              ویرایش
                            </button>
                          )}
                          {p.status === "sent" && (
                            <button
                              onClick={() => onEditProforma(p.id)}
                              className="bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                              title="این پیش‌فاکتور به مشتری ارسال شده است — با اصلاح، «پیش‌فاکتور اصلاحی» با پسوند e (مثلاً ۱۴۰۴/۰۰۱۲e) ثبت می‌شود"
                            >
                              اصلاح و نسخه جدید
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                قبلی
              </button>
              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition ${
                        currentPage === pageNum
                          ? "bg-indigo-600 text-white"
                          : "border border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {toPersianDigits(pageNum)}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                بعدی
              </button>
              <span className="text-sm text-gray-500 mr-2">
                صفحه {toPersianDigits(currentPage)} از {toPersianDigits(totalPages)} ({toPersianDigits(filtered.length)} مورد)
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Highlight matching text ── */
function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const q = query.trim();
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}
