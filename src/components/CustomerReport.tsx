"use client";

import { formatPrice, formatQuantity, toPersianDigits } from "@/lib/utils";
import { getPermissions } from "@/lib/permissions";
import type { UserInfo } from "@/app/page";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Package, FileText, Mail, BarChart3, History } from "lucide-react";
import CompanySearch from "./CompanySearch";
import DocNo from "@/components/DocNo";

interface Company {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
}

interface ProformaItemRow {
  id: number;
  description: string;
  equipmentName: string | null;
  quantity: string;
  unitPrice: string;
  pointCount: number | null;
  totalPrice: string;
}

interface ReportData {
  proformas: Array<{
    id: number;
    proformaNumber: string;
    letterId: number | null;
    issueDate: string;
    status: string;
    showTotal: boolean;
    totalAmount: string;
    itemCount: number;
    items?: ProformaItemRow[];
  }>;
  letters: Array<{ id: number; letterNumber: string; letterDate: string; registrationDate: string; requestType: string; status: string }>;
  priceHistory: Array<{ id: number; equipmentId: number; equipmentName: string | null; unitPrice: string; priceDate: string; pointCount: number | null }>;
  equipmentSummary: Array<{ equipmentId: number; name: string | null; count: number; latestPrice: string; latestDate: string; allPrices: unknown[] }>;
  stats: { totalProformas: number; totalLetters: number; totalAmountAll: number; approvedCount: number; pendingCount: number };
}

const statusLabels: Record<string, string> = {
  draft: "پیش‌نویس",
  pending: "در انتظار تایید",
  approved: "تایید شده",
  rejected: "رد شده",
  revised: "نیاز به اصلاح",
  sent: "ارسال شده",
  correction_send: "اصلاح و ارسال",
  ready_to_send: "آماده ارسال",
};

interface Props {
  user: UserInfo;
}

export default function CustomerReport({ user }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  // شناسه پیش‌فاکتورهای باز شده (آکاردئون — لیست سبک بماند)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  // کش اقلام — فقط هنگام کلیک از سرور واکشی می‌شود
  const [itemsCache, setItemsCache] = useState<Record<number, ProformaItemRow[]>>({});
  const [loadingItems, setLoadingItems] = useState<Set<number>>(new Set());

  const perms = getPermissions(user.role, user.permissions);
  // سوابق پیش‌فاکتور فقط برای بازرگانی / مدیر عامل / ادمین
  const canSeeProformas =
    user.role === "commercial" ||
    user.role === "manager" ||
    user.role === "admin" ||
    perms.createProforma ||
    perms.approveProforma;

  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then(setCompanies).catch(() => {});
  }, []);

  const handleCompanyAdded = (c: Company) => {
    setCompanies((prev) => [...prev, c]);
  };

  const loadReport = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/customer?companyId=${selectedCompanyId}`);
      const json = await res.json();
      setData(json);
      setExpandedIds(new Set());
      setItemsCache({});
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (selectedCompanyId) {
      loadReport();
    } else {
      setData(null);
    }
  }, [selectedCompanyId]);

  const toggleExpanded = async (id: number) => {
    const willOpen = !expandedIds.has(id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // واکشی تنبل اقلام — فقط در اولین باز شدن
    if (willOpen && !itemsCache[id] && selectedCompanyId) {
      setLoadingItems((prev) => new Set(prev).add(id));
      try {
        const res = await fetch(`/api/reports/customer?companyId=${selectedCompanyId}&proformaId=${id}`);
        const json = await res.json();
        setItemsCache((prev) => ({ ...prev, [id]: Array.isArray(json.items) ? json.items : [] }));
      } catch {
        setItemsCache((prev) => ({ ...prev, [id]: [] }));
      }
      setLoadingItems((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const selectedCompany = companies.find((c) => c.id.toString() === selectedCompanyId);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <BarChart3 className="w-7 h-7 text-purple-600" />
        سوابق و گزارش بر حسب مشتری
      </h1>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">انتخاب مشتری</label>
        <CompanySearch
          value={selectedCompanyId}
          companies={companies}
          onSelect={setSelectedCompanyId}
          onCompanyAdded={handleCompanyAdded}
          label="نام شرکت را جستجو کنید..."
        />
        {selectedCompany && (
          <div className="mt-3 text-sm text-gray-500">
            مشتری انتخاب شده: <span className="font-bold text-gray-800">{selectedCompany.name}</span>
          </div>
        )}
      </div>

      {!selectedCompanyId ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>مشتری را انتخاب کنید تا سوابق و گزارش کامل او نمایش داده شود</p>
        </div>
      ) : loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Stats */}
          {canSeeProformas ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm text-center">
                <div className="text-2xl font-bold text-blue-600">{toPersianDigits(data.stats.totalProformas)}</div>
                <div className="text-xs text-gray-500">تعداد پیش‌فاکتور</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm text-center">
                <div className="text-2xl font-bold text-green-600">{toPersianDigits(data.stats.approvedCount)}</div>
                <div className="text-xs text-gray-500">تایید شده</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm text-center">
                <div className="text-2xl font-bold text-yellow-600">{toPersianDigits(data.stats.pendingCount)}</div>
                <div className="text-xs text-gray-500">در انتظار</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm text-center">
                <div className="text-2xl font-bold text-purple-600">{toPersianDigits(data.stats.totalLetters)}</div>
                <div className="text-xs text-gray-500">تعداد نامه</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm text-center">
                <div className="text-lg font-bold text-gray-800">{formatPrice(data.stats.totalAmountAll)}</div>
                <div className="text-xs text-gray-500">جمع کل (ریال)</div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm text-center">
                <div className="text-2xl font-bold text-purple-600">{toPersianDigits(data.stats.totalLetters)}</div>
                <div className="text-xs text-gray-500">تعداد نامه</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm text-center col-span-2">
                <div className="text-sm font-bold text-gray-800 pt-1">{selectedCompany?.name}</div>
                <div className="text-xs text-gray-500 mt-1">سوابق نامه‌های این مشتری</div>
              </div>
            </div>
          )}

          {/* Equipment Summary — فقط بازرگانی/مدیرعامل */}
          {canSeeProformas && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                خلاصه قیمت تجهیزات برای این مشتری
              </h2>
              {data.equipmentSummary.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">سابقه قیمتی برای تجهیزات این مشتری ثبت نشده</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">تجهیز</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">تعداد دفعات</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">آخرین قیمت واحد</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">آخرین تاریخ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.equipmentSummary.map((e) => (
                        <tr key={e.equipmentId} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{e.name || `تجهیز #${toPersianDigits(e.equipmentId)}`}</td>
                          <td className="px-3 py-2">
                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs">{toPersianDigits(e.count)} بار</span>
                          </td>
                          <td className="px-3 py-2 font-medium text-green-700">{formatPrice(e.latestPrice)} ریال</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{toPersianDigits(e.latestDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Proformas — آکاردئون (باز شدن با کلیک) — فقط بازرگانی/مدیرعامل */}
          {canSeeProformas && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                پیش‌فاکتورهای مشتری ({toPersianDigits(data.proformas.length)})
              </h2>
              {data.proformas.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">پیش‌فاکتوری برای این مشتری صادر نشده</p>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                  {data.proformas.map((p) => {
                    const isOpen = expandedIds.has(p.id);
                    return (
                      <div key={p.id} className="bg-white">
                        {/* سطر خلاصه — کلیک برای باز شدن لیست اقلام */}
                        <button
                          onClick={() => toggleExpanded(p.id)}
                          className="w-full text-right px-4 py-3 hover:bg-gray-50 transition flex flex-wrap items-center gap-3"
                        >
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${isOpen ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </span>
                          <span className="font-bold"><DocNo v={p.proformaNumber} /></span>
                          <span className="text-xs text-gray-400">{toPersianDigits(p.issueDate)}</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            p.status === "approved" ? "bg-green-100 text-green-800" :
                            p.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                            p.status === "rejected" ? "bg-red-100 text-red-800" :
                            p.status === "sent" ? "bg-emerald-100 text-emerald-800" :
                            "bg-gray-100 text-gray-700"
                          }`}>
                            {statusLabels[p.status] || p.status}
                          </span>
                          <span className="text-xs text-gray-400">
                            {toPersianDigits(p.itemCount)} قلم{p.letterId ? ` • نامه #${toPersianDigits(p.letterId)}` : ""}
                          </span>
                          <span className="mr-auto text-sm">
                            {p.showTotal ? (
                              <span className="font-bold text-green-700">{formatPrice(p.totalAmount)} ریال</span>
                            ) : (
                              <span className="text-xs bg-gray-100 px-2 py-1 rounded">بدون جمع کل</span>
                            )}
                          </span>
                        </button>

                        {/* اقلام — فقط هنگام باز بودن واکشی و رندر می‌شود */}
                        {isOpen && loadingItems.has(p.id) && (
                          <div className="bg-gray-50 border-t border-gray-100 px-4 py-4 text-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-500 border-t-transparent mx-auto" />
                          </div>
                        )}
                        {isOpen && !loadingItems.has(p.id) && (itemsCache[p.id] || []).length > 0 && (
                          <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 slide-in">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-400">
                                  <th className="text-right font-normal pb-1">شرح</th>
                                  <th className="text-right font-normal pb-1">تعداد</th>
                                  <th className="text-right font-normal pb-1">قیمت واحد</th>
                                  <th className="text-right font-normal pb-1">مبلغ</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {(itemsCache[p.id] || []).map((it) => (
                                  <tr key={it.id}>
                                    <td className="py-1.5 pl-2">{it.description || it.equipmentName}</td>
                                    <td className="py-1.5 whitespace-nowrap">{formatQuantity(it.quantity)}{it.pointCount ? ` × ${toPersianDigits(it.pointCount)} نقطه` : ""}</td>
                                    <td className="py-1.5 whitespace-nowrap">{formatPrice(it.unitPrice)}</td>
                                    <td className="py-1.5 font-medium whitespace-nowrap">{formatPrice(it.totalPrice)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {isOpen && !loadingItems.has(p.id) && (itemsCache[p.id] || []).length === 0 && (
                          <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 text-xs text-gray-400">
                            قلمی برای این پیش‌فاکتور ثبت نشده است
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Letters — برای همه کاربران (دبیرخانه فقط همین بخش را می‌بیند) */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-emerald-600" />
              نامه‌های مشتری ({toPersianDigits(data.letters.length)})
            </h2>
            {data.letters.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">نامه‌ای برای این مشتری ثبت نشده</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">شماره دبیرخانه</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">تاریخ نامه</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">تاریخ ثبت</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">نوع درخواست</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.letters.map((l) => (
                      <tr key={l.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs"><DocNo v={l.letterNumber} /></td>
                        <td className="px-3 py-2">{toPersianDigits(l.letterDate)}</td>
                        <td className="px-3 py-2">{toPersianDigits(l.registrationDate)}</td>
                        <td className="px-3 py-2">{l.requestType}</td>
                        <td className="px-3 py-2"><span className="bg-gray-100 px-2 py-1 rounded text-xs">{statusLabels[l.status] || l.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detailed Price History — فقط بازرگانی/مدیرعامل */}
          {canSeeProformas && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                <History className="w-5 h-5 text-purple-600" />
                سوابق قیمتی تفصیلی (مختص این مشتری)
              </h2>
              {data.priceHistory.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">سابقه‌ای وجود ندارد</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">تاریخ</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">تجهیز</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">قیمت واحد</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">نقطه</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">پیش‌فاکتور</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.priceHistory.slice(0, 50).map((h) => (
                        <tr key={h.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs">{toPersianDigits(h.priceDate)}</td>
                          <td className="px-3 py-2">{h.equipmentName || `تجهیز #${toPersianDigits(h.equipmentId)}`}</td>
                          <td className="px-3 py-2 font-medium">{formatPrice(h.unitPrice)}</td>
                          <td className="px-3 py-2">{h.pointCount ? toPersianDigits(h.pointCount) : "—"}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">#{toPersianDigits(h.priceDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
