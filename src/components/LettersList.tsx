"use client";

import { useState, useEffect, useMemo } from "react";
import type { UserInfo } from "@/app/page";
import PersianDatePicker from "@/components/PersianDatePicker";
import { getPermissions } from "@/lib/permissions";
import { toPersianDigits, toEnglishDigits } from "@/lib/utils";
import DocNo from "@/components/DocNo";

interface LetterRow {
  id: number;
  letterNumber: string;
  companyName: string | null;
  registrationDate: string;
  letterDate: string;
  requestType: string;
  communicationMethod: string | null;
  referralDepartment: string | null;
  status: string;
  isFinalConfirmed: boolean;
  createdByName: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
}

interface Props {
  user: UserInfo;
  onNewLetter: () => void;
  onEditLetter: (id: number) => void;
  onCreateProforma: (letterId: number) => void;
}

const statusLabels: Record<string, string> = {
  received: "دریافت شده",
  referred: "ارجاع شده",
  processed: "پردازش شده",
};

const statusColors: Record<string, string> = {
  received: "bg-yellow-100 text-yellow-800",
  referred: "bg-blue-100 text-blue-800",
  processed: "bg-green-100 text-green-800",
};

export default function LettersList({ user, onNewLetter, onEditLetter, onCreateProforma }: Props) {
  const perms = getPermissions(user.role, user.permissions);
  const canEdit = perms.manageLetters; // ثبت/ویرایش نامه
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Pageination states ── */
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /* ── Search states ── */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterRequestType, setFilterRequestType] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  useEffect(() => {
    fetch("/api/letters")
      .then((r) => r.json())
      .then((d) => { setLetters(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  /* ── Unique values for filter dropdowns ── */
  const requestTypes = useMemo(() => {
    const set = new Set(letters.map((l) => l.requestType).filter(Boolean));
    return Array.from(set).sort();
  }, [letters]);

  /* ── Filtered results ── */
  const filtered = useMemo(() => {
    let list = letters;

    // Free-text search — جستجوی شماره نامه نسبت به فارسی/انگلیسی بودن ارقام بی‌تفاوت است
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      const qDigitsEn = toEnglishDigits(q);
      list = list.filter(
        (l) =>
          toEnglishDigits(l.letterNumber).toLowerCase().includes(qDigitsEn) ||
          (l.companyName || "").toLowerCase().includes(q) ||
          l.requestType.toLowerCase().includes(q) ||
          (l.referralDepartment || "").toLowerCase().includes(q) ||
          (l.communicationMethod || "").toLowerCase().includes(q)
      );
    }

    // Status filter
    if (filterStatus !== "all") {
      list = list.filter((l) => l.status === filterStatus);
    }

    // Request-type filter
    if (filterRequestType !== "all") {
      list = list.filter((l) => l.requestType === filterRequestType);
    }

    // Date range (registration date, jalali string comparison works for same-format dates)
    if (filterDateFrom) {
      list = list.filter((l) => l.registrationDate >= filterDateFrom);
    }
    if (filterDateTo) {
      list = list.filter((l) => l.registrationDate <= filterDateTo);
    }

    return list;
  }, [letters, searchText, filterStatus, filterRequestType, filterDateFrom, filterDateTo]);

  // صفحه‌بندی
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedList = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasActiveFilters =
    searchText.trim() !== "" ||
    filterStatus !== "all" ||
    filterRequestType !== "all" ||
    filterDateFrom !== "" ||
    filterDateTo !== "";

  const clearFilters = () => {
    setSearchText("");
    setFilterStatus("all");
    setFilterRequestType("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setCurrentPage(1);
  };

  // ریست صفحه هنگام تغییر فیلترها
  const resetPage = () => setCurrentPage(1);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">نامه‌های وارده</h1>
          <p className="text-sm text-gray-500 mt-1">مدیریت و پیگیری نامه‌های دریافتی</p>
        </div>
        {canEdit && (
        <button
          onClick={onNewLetter}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
        >
          + ثبت نامه جدید
        </button>
        )}
      </div>

      {/* ── Quick search bar (always visible) ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
            placeholder="جستجو در شماره، شرکت، نوع درخواست، ارجاع ..."
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition bg-white"
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
              ? "bg-blue-50 border-blue-300 text-blue-700"
              : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          فیلترها
          {hasActiveFilters && (
            <span className="w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center">
              !
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-red-500 hover:text-red-700 text-xs font-medium flex items-center gap-1 transition"
          >
            ✕ پاک‌سازی فیلترها
          </button>
        )}

        {/* Result count */}
        {!loading && (
          <span className="text-xs text-gray-400 mr-auto">
            {hasActiveFilters
              ? `${filtered.length} از ${letters.length} نامه`
              : `${letters.length} نامه`}
          </span>
        )}
      </div>

      {/* ── Advanced filters panel ── */}
      {searchOpen && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4 shadow-sm slide-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Status */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">وضعیت</label>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="received">دریافت شده</option>
                <option value="referred">ارجاع شده</option>
                <option value="processed">پردازش شده</option>
              </select>
            </div>

            {/* Request Type */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">نوع درخواست</label>
              <select
                value={filterRequestType}
                onChange={(e) => { setFilterRequestType(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              >
                <option value="all">همه انواع</option>
                {requestTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">از تاریخ ثبت</label>
              <PersianDatePicker
                value={filterDateFrom}
                onChange={(v) => { setFilterDateFrom(v); setCurrentPage(1); }}
                placeholder="انتخاب تاریخ"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">تا تاریخ ثبت</label>
              <PersianDatePicker
                value={filterDateTo}
                onChange={(v) => { setFilterDateTo(v); setCurrentPage(1); }}
                placeholder="انتخاب تاریخ"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          {hasActiveFilters ? (
            <>
              <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🔍</span>
              </div>
              <p className="text-gray-500 font-medium">نتیجه‌ای یافت نشد</p>
              <p className="text-gray-400 text-sm mt-1">فیلترها را تغییر دهید یا پاک‌سازی کنید</p>
              <button
                onClick={clearFilters}
                className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                پاک‌سازی فیلترها
              </button>
            </>
          ) : (
            <p className="text-gray-500">هیچ نامه‌ای ثبت نشده است</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">شماره دبیرخانه</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">شرکت</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">تاریخ ثبت</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">تاریخ نامه</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">نوع درخواست</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">ارجاع</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">ثبت‌کننده</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">وضعیت</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedList.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-medium"><bdi dir="ltr" style={{ unicodeBidi: "isolate", display: "inline-block" }}>{highlightDocNo(l.letterNumber, searchText)}</bdi></td>
                    <td className="px-4 py-3">{highlight(l.companyName || "-", searchText)}</td>
                    <td className="px-4 py-3">{l.registrationDate ? toPersian(l.registrationDate) : "-"}</td>
                    <td className="px-4 py-3">{l.letterDate ? toPersian(l.letterDate) : "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {highlight(l.requestType, searchText)}
                        {l.requestType === "تاییدیه استعلام" && (
                          l.isFinalConfirmed ? (
                            <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">✓ فروش قطعی</span>
                          ) : (
                            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">⏳ منتظر تأیید</span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{highlight(l.referralDepartment || "-", searchText)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">{l.createdByName || "-"}</span>
                        {l.updatedByName && l.updatedByName !== l.createdByName && (
                          <span className="text-[10px] text-gray-400">ویرایش: {l.updatedByName}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[l.status] || "bg-gray-100"}`}>
                        {statusLabels[l.status] || l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onEditLetter(l.id)}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                        >
                          {canEdit ? "مشاهده/ویرایش" : "مشاهده"}
                        </button>
                        {perms.createProforma && (l.requestType === "استعلام" || l.requestType === "پیش فاکتور") && (
                          <button
                            onClick={() => onCreateProforma(l.id)}
                            className="text-green-600 hover:text-green-800 text-xs"
                          >
                            صدور پیش فاکتور
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── صفحه‌بندی ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50">
            <div className="text-xs text-gray-500">
              نمایش {toPersian(filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1)} تا {toPersian(Math.min(safePage * pageSize, filtered.length))} از {toPersian(filtered.length)} نامه
            </div>
            <div className="flex items-center gap-2">
              {/* اندازه صفحه */}
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(parseInt(e.target.value)); setCurrentPage(1); }}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value={10}>۱۰ در صفحه</option>
                <option value={20}>۲۰ در صفحه</option>
                <option value={50}>۵۰ در صفحه</option>
                <option value={100}>۱۰۰ در صفحه</option>
              </select>

              {/* دکمه‌های صفحه */}
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={safePage === 1}
                  className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  «
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  قبلی
                </button>

                {/* شماره صفحات */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (safePage <= 3) {
                    pageNum = i + 1;
                  } else if (safePage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = safePage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                        pageNum === safePage
                          ? "bg-blue-600 text-white"
                          : "border border-gray-200 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {toPersian(pageNum)}
                    </button>
                  );
                })}

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  بعدی
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safePage === totalPages}
                  className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  »
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// تبدیل اعداد به فارسی
function toPersian(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[parseInt(d)]);
}

/* ── شماره نامه/سند: نمایش با ارقام فارسی + هایلایت جستجو ──
   تطبیق روی متنِ نرمال‌شده (ارقام انگلیسی) انجام می‌شود تا کاربر
   با هر دو نوع رقم (فارسی/انگلیسی) بتواند جستجو کند؛ چون تبدیل
   ارقام نویسه‌به‌نویسه است، اندیس‌ها همیشه تراز می‌مانند. */
function highlightDocNo(text: string, query: string) {
  const display = toPersianDigits(text);
  const q = query.trim();
  if (!q) return display;
  const normDisplay = toEnglishDigits(display).toLowerCase();
  const normQ = toEnglishDigits(q).toLowerCase();
  const idx = normDisplay.indexOf(normQ);
  if (idx === -1) return display;
  return (
    <>
      {display.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{display.slice(idx, idx + normQ.length)}</mark>
      {display.slice(idx + normQ.length)}
    </>
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
