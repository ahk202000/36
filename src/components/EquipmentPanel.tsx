"use client";

import { formatPrice, toPersianDigits } from "@/lib/utils";
import Pagination from "./Pagination";

import { useState, useEffect, useRef, Fragment } from "react";
import { FileSpreadsheet, UploadCloud, X, Search, Sliders, Plus, Trash2 } from "lucide-react";

interface EquipmentImportReport {
  total: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  createdCategoriesCount?: number;
  errors: Array<{ row: number; reason: string }>;
  detectedColumns?: string[];
}

const CALIBRATION_LOCATIONS = [
  "سایت مشتری",
  "آزمایشگاه بهسا",
  "سایت مشتری -آزمایشگاه بهسا",
];

interface EquipmentItem {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  description: string | null;
  unitPrice: string;
  pricePerPoint: boolean;
  calibrationLocation: string | null;
}

interface Category {
  id: number;
  name: string;
}

interface Param {
  id: number;
  categoryId: number | null;
  equipmentId?: number | null;
  paramName: string;
  paramUnit: string | null;
  sortOrder?: number | null;
  categoryName?: string | null;
}

export default function EquipmentPanel() {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [params, setParams] = useState<Param[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", categoryId: "", description: "", unitPrice: "0", pricePerPoint: false, calibrationLocation: "" });
  const [catName, setCatName] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedCatForParams, setSelectedCatForParams] = useState<number | null>(null);
  const [newParamName, setNewParamName] = useState("");
  const [newParamUnit, setNewParamUnit] = useState("");
  const [showParamForm, setShowParamForm] = useState(false);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState("");
  // صفحه‌بندی
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // درون‌ریزی اکسل
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<EquipmentImportReport | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // جستجوی تجهیزات
  const [searchText, setSearchText] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("all");
  const [filterPointOnly, setFilterPointOnly] = useState(false);

  // مدیریت پارامترهای هر تجهیز
  const [paramsForEquipment, setParamsForEquipment] = useState<number | null>(null);
  const [eqParams, setEqParams] = useState<Param[]>([]);
  const [loadingEqParams, setLoadingEqParams] = useState(false);
  const [newEqParam, setNewEqParam] = useState({ name: "", unit: "" });

  // فیلتر و جستجوی تجهیزات
  const filteredEquipment = equipment.filter((e) => {
    if (filterCategoryId !== "all") {
      if (filterCategoryId === "none" ? e.categoryId !== null : e.categoryId?.toString() !== filterCategoryId) return false;
    }
    if (filterPointOnly && !e.pricePerPoint) return false;
    const q = searchText.trim().replace(/ي/g, "ی").replace(/ك/g, "ک").toLowerCase();
    if (!q) return true;
    const hay = [e.name, e.categoryName || "", e.description || "", e.calibrationLocation || ""]
      .join(" ")
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .toLowerCase();
    return hay.includes(q);
  });

  const hasEquipFilters = searchText.trim() !== "" || filterCategoryId !== "all" || filterPointOnly;

  const totalPages = Math.max(1, Math.ceil(filteredEquipment.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEquipment = filteredEquipment.slice((safePage - 1) * pageSize, safePage * pageSize);

  // بازنشانی صفحه هنگام تغییر فیلترها
  useEffect(() => { setCurrentPage(1); }, [searchText, filterCategoryId, filterPointOnly]);

  const loadData = () => {
    Promise.all([
      fetch("/api/equipment").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/equipment-params").then((r) => r.json()),
    ]).then(([e, c, p]) => {
      setEquipment(e);
      setCategories(c);
      setParams(p);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    const payload = {
      name: form.name,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      description: form.description || null,
      unitPrice: form.unitPrice,
      pricePerPoint: form.pricePerPoint,
      calibrationLocation: form.calibrationLocation || null,
    };
    const res = editingId
      ? await fetch(`/api/equipment/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/equipment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      // ۴۰۹ = تجهیز تکراری (بدون توجه به فاصله/نیم‌فاصله)
      const data = await res.json().catch(() => ({}));
      alert(data.error || "خطا در ذخیره تجهیز");
      setSaving(false);
      return;
    }
    setForm({ name: "", categoryId: "", description: "", unitPrice: "0", pricePerPoint: false, calibrationLocation: "" });
    setEditingId(null);
    setShowForm(false);
    setSaving(false);
    loadData();
  };

  const startEdit = (eq: EquipmentItem) => {
    setEditingId(eq.id);
    setForm({
      name: eq.name,
      categoryId: eq.categoryId?.toString() || "",
      description: eq.description || "",
      unitPrice: eq.unitPrice,
      pricePerPoint: eq.pricePerPoint,
      calibrationLocation: eq.calibrationLocation || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("حذف تجهیز؟")) return;
    await fetch(`/api/equipment/${id}`, { method: "DELETE" });
    loadData();
  };

  const addCategory = async () => {
    if (!catName) return;
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: catName }),
    });
    setCatName("");
    setShowCatForm(false);
    loadData();
  };

  const updateCategory = async (catId: number) => {
    if (!editCatName) return;
    await fetch(`/api/categories/${catId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editCatName }),
    });
    setEditingCatId(null);
    setEditCatName("");
    loadData();
  };

  const deleteCategory = async (catId: number) => {
    if (!confirm("آیا از حذف این دسته‌بندی مطمئن هستید؟")) return;
    await fetch(`/api/categories/${catId}`, { method: "DELETE" });
    loadData();
  };

  const addParam = async () => {
    if (!newParamName || !selectedCatForParams) return;
    await fetch("/api/equipment-params", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: selectedCatForParams,
        paramName: newParamName,
        paramUnit: newParamUnit || null,
      }),
    });
    setNewParamName("");
    setNewParamUnit("");
    setShowParamForm(false);
    loadData();
  };

  const deleteParam = async (id: number) => {
    if (!confirm("حذف پارامتر؟")) return;
    await fetch(`/api/equipment-params/${id}`, { method: "DELETE" });
    loadData();
  };

  const getParamsForCategory = (catId: number | null) => {
    if (!catId) return [];
    return params.filter((p) => p.categoryId === catId && !p.equipmentId);
  };

  // ── مدیریت پارامترهای یک تجهیز (هر تجهیز چند پارامتر) ──
  const openEquipmentParams = async (eqId: number) => {
    if (paramsForEquipment === eqId) {
      setParamsForEquipment(null);
      return;
    }
    setParamsForEquipment(eqId);
    setLoadingEqParams(true);
    setNewEqParam({ name: "", unit: "" });
    try {
      const res = await fetch(`/api/equipment-params?equipmentId=${eqId}`);
      const data = await res.json();
      setEqParams(Array.isArray(data) ? data : []);
    } catch {
      setEqParams([]);
    }
    setLoadingEqParams(false);
  };

  const addEquipmentParam = async () => {
    if (!newEqParam.name.trim() || !paramsForEquipment) return;
    await fetch("/api/equipment-params", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        equipmentId: paramsForEquipment,
        paramName: newEqParam.name.trim(),
        paramUnit: newEqParam.unit.trim() || null,
      }),
    });
    setNewEqParam({ name: "", unit: "" });
    const res = await fetch(`/api/equipment-params?equipmentId=${paramsForEquipment}`);
    setEqParams(await res.json());
    loadData();
  };

  const removeEquipmentParam = async (id: number) => {
    if (!confirm("حذف این پارامتر؟")) return;
    await fetch(`/api/equipment-params/${id}`, { method: "DELETE" });
    if (paramsForEquipment) {
      const res = await fetch(`/api/equipment-params?equipmentId=${paramsForEquipment}`);
      setEqParams(await res.json());
    }
    loadData();
  };

  // درون‌ریزی لیست تجهیزات از فایل اکسل/CSV
  const handleImportFile = async (file: File) => {
    setImporting(true);
    setImportReport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/equipment/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        alert("خطا: " + (json.error || "درون‌ریزی ناموفق بود"));
      } else {
        setImportReport(json);
        loadData();
        const w = window as unknown as { showToast?: (m: string) => void };
        if (w.showToast && json.inserted > 0) {
          w.showToast(`${json.inserted} تجهیز جدید با موفقیت ثبت شد`);
        }
      }
    } catch {
      alert("خطا در ارتباط با سرور");
    }
    setImporting(false);
    if (importInputRef.current) importInputRef.current.value = "";
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black">تجهیزات و پارامترها</h1>
          <p className="text-sm text-gray-500 mt-1">مدیریت لیست تجهیزات، تعرفه‌ها و پارامترهای کالیبراسیون</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
            }}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50 transition shadow-sm"
            title="درون‌ریزی لیست تجهیزات از فایل Excel یا CSV"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {importing ? "در حال درون‌ریزی..." : "درون‌ریزی از اکسل"}
          </button>
          <button
            onClick={() => setShowCatForm(!showCatForm)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition"
          >
            + دسته‌بندی جدید
          </button>
          <button
            onClick={() => { setEditingId(null); setForm({ name: "", categoryId: "", description: "", unitPrice: "0", pricePerPoint: false, calibrationLocation: "" }); setShowForm(!showForm); }}
            className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition"
          >
            + تجهیز جدید
          </button>
        </div>
      </div>

      {/* راهنمای سرفصل‌های اکسل و دانلود قالب نمونه */}
      <div className="mb-4 bg-emerald-50/70 border border-emerald-200/80 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-xs text-emerald-800 inline-flex items-center gap-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          قالب سرفصل اکسل: نام تجهیز (الزامی)، دسته‌بندی، قیمت واحد، قیمت هر نقطه (بله/خیر)، محل کالیبراسیون، توضیحات
        </span>
        <a
          href="/api/equipment/import"
          download
          className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline underline-offset-4"
        >
          دانلود قالب نمونه تجهیزات
        </a>
      </div>

      {/* گزارش نتیجه درون‌ریزی */}
      {importReport && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                <UploadCloud className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <p className="font-bold text-emerald-800 text-sm">نتیجه درون‌ریزی تجهیزات از اکسل</p>
                <p className="text-xs text-emerald-700 mt-1">
                  <span className="font-bold">{toPersianDigits(importReport.inserted)}</span> تجهیز جدید ثبت شد
                  {importReport.createdCategoriesCount ? <> • <span className="font-bold">{toPersianDigits(importReport.createdCategoriesCount)}</span> دسته‌بندی جدید خودکار ساخته شد</> : null}
                  {importReport.duplicates > 0 && <> • <span className="font-bold">{toPersianDigits(importReport.duplicates)}</span> تکراری رد شد</>}
                  {importReport.invalid > 0 && <> • <span className="font-bold text-red-600">{toPersianDigits(importReport.invalid)}</span> نامعتبر</>}
                </p>
              </div>
            </div>
            <button onClick={() => setImportReport(null)} className="text-emerald-600 hover:text-emerald-800 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          {importReport.errors.length > 0 && (
            <div className="mt-3 bg-white/60 rounded-xl p-3 max-h-32 overflow-auto">
              <p className="text-xs font-bold text-red-700 mb-1">سطرهای ناموفق:</p>
              {importReport.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">سطر {toPersianDigits(e.row)}: {e.reason}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── نوار جستجوی تجهیزات ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="جستجو در نام تجهیز، دسته‌بندی، توضیحات، محل کالیبراسیون ..."
            className="w-full pr-10 pl-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition bg-white"
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <select
          value={filterCategoryId}
          onChange={(e) => setFilterCategoryId(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="all">همه دسته‌بندی‌ها</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id.toString()}>{c.name}</option>
          ))}
          <option value="none">بدون دسته‌بندی</option>
        </select>

        <label className="inline-flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterPointOnly}
            onChange={(e) => setFilterPointOnly(e.target.checked)}
            className="w-4 h-4 accent-indigo-600"
          />
          فقط نقطه‌ای
        </label>

        {hasEquipFilters && (
          <button
            onClick={() => { setSearchText(""); setFilterCategoryId("all"); setFilterPointOnly(false); }}
            className="text-red-500 hover:text-red-700 text-xs font-medium"
          >
            ✕ پاک‌سازی
          </button>
        )}

        <span className="text-xs text-gray-400 mr-auto">
          {hasEquipFilters
            ? `${toPersianDigits(filteredEquipment.length)} از ${toPersianDigits(equipment.length)} تجهیز`
            : `${toPersianDigits(equipment.length)} تجهیز`}
        </span>
      </div>

      {showCatForm && (
        <div className="bg-purple-50 rounded-xl shadow-sm p-4 mb-4 flex gap-3">
          <input
            type="text"
            placeholder="نام دسته‌بندی (مثلا: انکوباتور)"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
          />
          <button onClick={addCategory} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700">ذخیره</button>
          <button onClick={() => setShowCatForm(false)} className="text-gray-500 text-sm">انصراف</button>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="font-black text-lg mb-4">{editingId ? "ویرایش تجهیز" : "ثبت تجهیز جدید"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">نام تجهیز *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 focus:bg-white"
                placeholder="مثلا: انکوباتور دمایی"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">دسته‌بندی</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50"
              >
                <option value="">انتخاب کنید</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">قیمت واحد (ریال)</label>
              <input
                type="number"
                value={form.unitPrice}
                onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">توضیحات</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50"
                placeholder="توضیحات"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">محل کالیبره</label>
              <select
                value={form.calibrationLocation}
                onChange={(e) => setForm({ ...form, calibrationLocation: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50"
              >
                <option value="">انتخاب کنید</option>
                {CALIBRATION_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
                <input
                  type="checkbox"
                  checked={form.pricePerPoint}
                  onChange={(e) => setForm({ ...form, pricePerPoint: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-bold">قیمت بر اساس نقطه/پارامتر</span>
              </label>
            </div>
            {form.categoryId && getParamsForCategory(parseInt(form.categoryId)).length > 0 && (
              <div className="md:col-span-3 bg-blue-50 p-3 rounded-xl border border-blue-100">
                <div className="text-xs font-bold text-blue-700 mb-1">پارامترهای این دسته:</div>
                <div className="flex flex-wrap gap-2">
                  {getParamsForCategory(parseInt(form.categoryId)).map((p) => (
                    <span key={p.id} className="bg-white border border-blue-200 px-2 py-1 rounded-full text-xs">{p.paramName} {p.paramUnit ? `(${p.paramUnit})` : ""}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 border border-gray-300 rounded-xl text-sm">انصراف</button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name}
              className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-6 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {saving ? "ذخیره..." : editingId ? "ویرایش" : "ذخیره"}
            </button>
          </div>
        </div>
      )}

      {/* Categories with params */}
      {categories.length > 0 && (
        <div className="mb-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-black mb-3 flex items-center gap-2"><span className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center">🏷️</span> دسته‌بندی‌ها و پارامترها</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map((c) => {
              const catParams = getParamsForCategory(c.id);
              return (
                <div key={c.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    {editingCatId === c.id ? (
                      <div className="flex gap-2 flex-1 ml-2">
                        <input type="text" value={editCatName} onChange={(e) => setEditCatName(e.target.value)} className="flex-1 px-2 py-1 border rounded text-sm" />
                        <button onClick={() => updateCategory(c.id)} className="bg-indigo-600 text-white px-2 py-1 rounded text-xs">ذخیره</button>
                        <button onClick={() => setEditingCatId(null)} className="text-xs text-gray-500">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{c.name}</span>
                        <button onClick={() => { setEditingCatId(c.id); setEditCatName(c.name); }} className="text-xs text-indigo-600 hover:text-indigo-800">✏️</button>
                        <button onClick={() => deleteCategory(c.id)} className="text-xs text-red-500 hover:text-red-700">🗑</button>
                      </div>
                    )}
                    <button
                      onClick={() => { setSelectedCatForParams(c.id); setShowParamForm(true); }}
                      className="text-xs bg-white border px-2 py-1 rounded-lg hover:bg-indigo-50"
                    >
                      + پارامتر
                    </button>
                  </div>
                  {catParams.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {catParams.map((p) => (
                        <span key={p.id} className="bg-white border px-2 py-1 rounded-full text-xs flex items-center gap-1">
                          {p.paramName} {p.paramUnit && <span className="text-gray-400">({p.paramUnit})</span>}
                          <button onClick={() => deleteParam(p.id)} className="text-red-400 hover:text-red-600 ml-1">✕</button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400">پارامتری تعریف نشده — مثلا: نقطه دمایی, نقطه رطوبتی, اندازه</div>
                  )}
                  {showParamForm && selectedCatForParams === c.id && (
                    <div className="mt-3 bg-white p-3 rounded-xl border flex gap-2">
                      <input
                        type="text"
                        placeholder="نام پارامتر"
                        value={newParamName}
                        onChange={(e) => setNewParamName(e.target.value)}
                        className="flex-1 px-2 py-1.5 border rounded text-sm"
                      />
                      <input
                        type="text"
                        placeholder="واحد"
                        value={newParamUnit}
                        onChange={(e) => setNewParamUnit(e.target.value)}
                        className="w-24 px-2 py-1.5 border rounded text-sm"
                      />
                      <button onClick={addParam} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-xs">افزودن</button>
                      <button onClick={() => setShowParamForm(false)} className="text-xs">✕</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent mx-auto" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right font-bold text-gray-600">نام تجهیز</th>
                <th className="px-4 py-3 text-right font-bold text-gray-600">دسته‌بندی</th>
                <th className="px-4 py-3 text-right font-bold text-gray-600">پارامترها</th>
                <th className="px-4 py-3 text-right font-bold text-gray-600">قیمت واحد</th>
                <th className="px-4 py-3 text-right font-bold text-gray-600">نقطه‌ای</th>
                <th className="px-4 py-3 text-right font-bold text-gray-600">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedEquipment.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {hasEquipFilters ? "تجهیزی با این فیلترها یافت نشد" : "هنوز تجهیزی ثبت نشده است"}
                  </td>
                </tr>
              )}
              {paginatedEquipment.map((e) => {
                // پارامترهای اختصاصی تجهیز + پارامترهای دسته‌بندی
                const ownParams = params.filter((p) => p.equipmentId === e.id);
                const catParams = getParamsForCategory(e.categoryId);
                const allParams = [...ownParams, ...catParams];
                const isParamsOpen = paramsForEquipment === e.id;
                return (
                  <Fragment key={e.id}>
                    <tr className={`hover:bg-gray-50 ${isParamsOpen ? "bg-indigo-50/40" : ""}`}>
                      <td className="px-4 py-3 font-medium">{e.name}</td>
                      <td className="px-4 py-3">{e.categoryName || "-"}</td>
                      <td className="px-4 py-3">
                        {allParams.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {allParams.slice(0, 3).map((p) => (
                              <span
                                key={p.id}
                                className={`px-1.5 py-0.5 rounded text-xs ${p.equipmentId ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}
                                title={p.equipmentId ? "پارامتر اختصاصی این تجهیز" : "پارامتر دسته‌بندی"}
                              >
                                {p.paramName}
                              </span>
                            ))}
                            {allParams.length > 3 && <span className="text-xs text-gray-400">+{toPersianDigits(allParams.length - 3)}</span>}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{formatPrice(e.unitPrice)} ریال</td>
                      <td className="px-4 py-3">{e.pricePerPoint ? "✅ نقطه‌ای/پارامتری" : "ثابت"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEquipmentParams(e.id)}
                            className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1 transition ${isParamsOpen ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                            title="مدیریت پارامترهای این تجهیز"
                          >
                            <Sliders className="w-3 h-3" />
                            پارامترها
                          </button>
                          <button onClick={() => startEdit(e)} className="text-indigo-600 hover:text-indigo-800 text-xs bg-indigo-50 px-2 py-1 rounded">ویرایش</button>
                          <button onClick={() => handleDelete(e.id)} className="text-red-500 hover:text-red-700 text-xs">حذف</button>
                        </div>
                      </td>
                    </tr>

                    {/* ── پنل مدیریت پارامترهای این تجهیز ── */}
                    {isParamsOpen && (
                      <tr className="bg-emerald-50/40">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="bg-white rounded-xl border border-emerald-200 p-4">
                            <h4 className="font-bold text-sm mb-3 flex items-center gap-2 text-emerald-800">
                              <Sliders className="w-4 h-4" />
                              پارامترهای «{e.name}»
                              <span className="text-xs font-normal text-gray-400">— هر تجهیز می‌تواند چند پارامتر داشته باشد</span>
                            </h4>

                            {loadingEqParams ? (
                              <div className="py-4 text-center">
                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-500 border-t-transparent mx-auto" />
                              </div>
                            ) : (
                              <>
                                {eqParams.length > 0 ? (
                                  <div className="flex flex-wrap gap-2 mb-3">
                                    {eqParams.map((p) => (
                                      <span
                                        key={p.id}
                                        className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 border ${
                                          p.equipmentId
                                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                            : "bg-indigo-50 border-indigo-200 text-indigo-800"
                                        }`}
                                      >
                                        <span className="font-bold">{p.paramName}</span>
                                        {p.paramUnit && <span className="text-gray-500">({p.paramUnit})</span>}
                                        {!p.equipmentId && <span className="text-[10px] text-indigo-400">دسته‌بندی</span>}
                                        {p.equipmentId && (
                                          <button
                                            onClick={() => removeEquipmentParam(p.id)}
                                            className="text-red-400 hover:text-red-600"
                                            title="حذف پارامتر"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400 mb-3">
                                    پارامتری تعریف نشده — مثال: هر نقطه دمایی، هر نقطه رطوبت، هر اندازه، هر پارچه
                                  </p>
                                )}

                                <div className="flex flex-wrap gap-2 items-center">
                                  <input
                                    type="text"
                                    placeholder="نام پارامتر (مثلا: هر نقطه دمایی)"
                                    value={newEqParam.name}
                                    onChange={(ev) => setNewEqParam({ ...newEqParam, name: ev.target.value })}
                                    onKeyDown={(ev) => { if (ev.key === "Enter") addEquipmentParam(); }}
                                    className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                  <input
                                    type="text"
                                    placeholder="واحد (نقطه)"
                                    value={newEqParam.unit}
                                    onChange={(ev) => setNewEqParam({ ...newEqParam, unit: ev.target.value })}
                                    onKeyDown={(ev) => { if (ev.key === "Enter") addEquipmentParam(); }}
                                    className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                  <button
                                    onClick={addEquipmentParam}
                                    disabled={!newEqParam.name.trim()}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    افزودن پارامتر
                                  </button>
                                  <div className="flex flex-wrap gap-1 mr-auto">
                                    {["هر نقطه دمایی", "هر نقطه رطوبت", "هر نقطه فشار", "هر اندازه", "هر پارچه", "هر کانال"].map((sug) => (
                                      <button
                                        key={sug}
                                        onClick={() => setNewEqParam({ name: sug, unit: sug.includes("نقطه") ? "نقطه" : "عدد" })}
                                        className="text-[10px] bg-gray-100 hover:bg-emerald-100 text-gray-600 px-2 py-1 rounded-full transition"
                                      >
                                        + {sug}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={filteredEquipment.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
          />
        </div>
      )}
    </div>
  );
}
