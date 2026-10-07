"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { formatPrice, toPersianDigits, COMMUNICATION_METHODS } from "@/lib/utils";
import PersianDatePicker, { getTodayJalali } from "./PersianDatePicker";
import Pagination from "./Pagination";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";

interface ImportReport {
  total: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  errors: Array<{ row: number; reason: string }>;
  detectedColumns?: string[];
}

interface Company {
  id: number;
  name: string;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  contactPerson: string | null;
  communicationMethod?: string | null;
  communicationId?: string | null;
}

interface ContractFileItem {
  id: number;
  fileName: string;
  filePath: string;
  fileSize: number | null;
}

interface Contract {
  id: number;
  companyId: number;
  companyName: string | null;
  contractNumber: string;
  title: string | null;
  startDate: string;
  endDate: string;
  description: string | null;
  filePath: string | null;
  fileName: string | null;
  isActive: boolean;
  // همه فایل‌های قرارداد (چند فایل برای هر قرارداد)
  files?: ContractFileItem[];
}

export default function CompaniesPanel() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "", phone: "", fax: "", email: "", address: "", contactPerson: "",
    communicationMethod: "", communicationId: "",
  });
  const [commMethods, setCommMethods] = useState<string[]>(COMMUNICATION_METHODS);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"companies" | "contracts">("companies");
  const [searchText, setSearchText] = useState("");
  const [contractSearch, setContractSearch] = useState("");
  // صفحه‌بندی
  const [companyPage, setCompanyPage] = useState(1);
  const [companyPageSize, setCompanyPageSize] = useState(20);
  // درون‌ریزی اکسل
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [contractPage, setContractPage] = useState(1);
  const [contractPageSize, setContractPageSize] = useState(20);
  
  // Contract form
  const [showContractForm, setShowContractForm] = useState(false);
  const [editingContractId, setEditingContractId] = useState<number | null>(null);
  const [contractForm, setContractForm] = useState({
    companyId: "", contractNumber: "", title: "", startDate: "", endDate: "", description: "",
  });
  // فایل‌های جدید انتخاب‌شده برای بارگذاری (امکان اضافه کردن چند فایل)
  const [contractFilesNew, setContractFilesNew] = useState<File[]>([]);
  // فایل‌های موجود قرارداد در حالت ویرایش (با امکان حذف تک‌تک)
  const [contractFilesExisting, setContractFilesExisting] = useState<ContractFileItem[]>([]);
  const [removeFileIds, setRemoveFileIds] = useState<number[]>([]);
  const [uploadingContract, setUploadingContract] = useState(false);
  const contractFileRef = useRef<HTMLInputElement>(null);
  const [selectedCompanyContracts, setSelectedCompanyContracts] = useState<number | null>(null);

  const loadData = () => {
  Promise.all([
    fetch("/api/companies").then((r) => r.json()),
    fetch("/api/contracts").then((r) => r.json()),
  ])
    .then(([c, ct]) => {
      const safeCompanies = Array.isArray(c)
        ? c
        : Array.isArray(c?.companies)
          ? c.companies
          : [];

      const safeContracts = Array.isArray(ct)
        ? ct
        : Array.isArray(ct?.contracts)
          ? ct.contracts
          : [];

      setCompanies(safeCompanies);
      setContracts(safeContracts);
      setLoading(false);
    })
    .catch(() => {
      setCompanies([]);
      setContracts([]);
      setLoading(false);
    });
};
  useEffect(() => { loadData(); }, []);

  // گزینه‌های «طریقه ارتباط» — همان مقادیر تنظیم‌شده در فرم ثبت نامه
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((rows: Array<{ settingKey: string; settingValue: string }>) => {
        const row = Array.isArray(rows) ? rows.find((s) => s.settingKey === "communication_methods") : null;
        if (!row?.settingValue) return;
        try {
          const parsed = JSON.parse(row.settingValue);
          if (Array.isArray(parsed) && parsed.length > 0) setCommMethods(parsed.map(String));
        } catch {
          // مقادیر پیش‌فرض حفظ می‌شوند
        }
      })
      .catch(() => {});
  }, []);

  // فیلتر شرکت‌ها
  const filteredCompanies = useMemo(() => {
    if (!searchText.trim()) return companies;
    const q = searchText.trim().toLowerCase();
    return companies.filter(c => 
      c.name.toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.contactPerson || "").toLowerCase().includes(q)
    );
  }, [companies, searchText]);

  // فیلتر قراردادها
const filteredContracts = useMemo(() => {
  const safeContracts = Array.isArray(contracts) ? contracts : [];

  if (!contractSearch.trim()) return safeContracts;

  const q = contractSearch.trim().toLowerCase();

  return safeContracts.filter((c) =>
    (c.contractNumber || "").toLowerCase().includes(q) ||
    (c.title || "").toLowerCase().includes(q) ||
    (c.companyName || "").toLowerCase().includes(q)
  );
}, [contracts, contractSearch]);

  // صفحه‌بندی شرکت‌ها
  const companyTotalPages = Math.max(1, Math.ceil(filteredCompanies.length / companyPageSize));
  const safeCompanyPage = Math.min(companyPage, companyTotalPages);
  const paginatedCompanies = filteredCompanies.slice((safeCompanyPage - 1) * companyPageSize, safeCompanyPage * companyPageSize);

  // صفحه‌بندی قراردادها
const contractTotalPages = Math.max(
  1,
  Math.ceil(filteredContracts.length / contractPageSize)
);

const safeContractPage = Math.min(
  contractPage,
  contractTotalPages
);

const paginatedContracts = filteredContracts.slice(
  (safeContractPage - 1) * contractPageSize,
  safeContractPage * contractPageSize
);
// قراردادهای مربوط به یک شرکت
const getCompanyContracts = (companyId: number) => {
  return contracts.filter((contract) => contract.companyId === companyId);
};

// بررسی وجود حداقل یک قرارداد فعال برای شرکت
const hasActiveContract = (companyId: number) => {
  return getCompanyContracts(companyId).some(
    (contract) => contract.isActive === true
  );
};
  const handleSave = async () => {
    if (!form.name.trim()) {
      alert("نام شرکت الزامی است");
      return;
    }
    if (!form.contactPerson.trim()) {
      alert("نام مسئول شرکت الزامی است");
      requestAnimationFrame(() => {
        const input = document.getElementById("company-contact-person") as HTMLInputElement | null;
        input?.focus();
      });
      return;
    }
    setSaving(true);
    
    const res = editingId
      ? await fetch(`/api/companies/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      : await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });

    if (!res.ok) {
      // ۴۰۹ = مشتری تکراری (مثلاً «آدوراطب» در برابر «آدورا طب»)
      const data = await res.json().catch(() => ({}));
      alert(data.error || "خطا در ذخیره شرکت");
      setSaving(false);
      requestAnimationFrame(() => {
        const input = document.getElementById("company-name") as HTMLInputElement | null;
        input?.focus();
      });
      return;
    }
    
    setForm({ name: "", phone: "", fax: "", email: "", address: "", contactPerson: "", communicationMethod: "", communicationId: "" });
    setEditingId(null);
    setShowForm(false);
    setSaving(false);
    loadData();
  };

  const startEditCompany = (c: Company) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      phone: c.phone || "",
      fax: c.fax || "",
      email: c.email || "",
      address: c.address || "",
      contactPerson: c.contactPerson || "",
      communicationMethod: c.communicationMethod || "",
      communicationId: c.communicationId || "",
    });
    setShowForm(true);
  };

  const deleteCompany = async (id: number) => {
    if (!confirm("آیا از حذف این شرکت مطمئن هستید؟")) return;
    await fetch(`/api/companies/${id}`, { method: "DELETE" });
    loadData();
  };


  // افزودن فایل(ها) به لیست انتخاب‌شده — پشتیبانی از انتخاب چند فایل همزمان و مرحله‌ای
  const addContractFiles = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const incoming = Array.from(filesList);
    setContractFilesNew((prev) => {
      const merged = [...prev];
      for (const f of incoming) {
        // جلوگیری از افزودن فایل تکراری (هم‌نام و هم‌حجم)
        if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
      }
      return merged;
    });
  };

  const handleSaveContract = async () => {
    if (!contractForm.companyId || !contractForm.contractNumber || !contractForm.startDate || !contractForm.endDate) {
      alert("لطفا فیلدهای اجباری را پر کنید");
      return;
    }
    setUploadingContract(true);

    try {
      // ۱) بارگذاری همه فایل‌های انتخاب‌شده (چند فایل)
      const uploadedFiles: Array<{ fileName: string; filePath: string; fileSize: number }> = [];
      for (const f of contractFilesNew) {
        const formData = new FormData();
        formData.append("file", f);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) {
          alert(uploadData?.error || `خطا در آپلود فایل «${f.name}»`);
          setUploadingContract(false);
          return;
        }
        const p = uploadData.filePath || uploadData.path;
        if (!p) {
          alert(`پاسخ نامعتبر آپلود برای فایل «${f.name}»`);
          setUploadingContract(false);
          return;
        }
        uploadedFiles.push({ fileName: f.name, filePath: p, fileSize: f.size });
      }

      // ۲) ساخت payload — توجه: filePath/fileName خالی ارسال نمی‌شوند تا
      //    در ویرایش، فایل‌های قبلی قرارداد پاک نشوند (ایراد قبلی).
      const payload: Record<string, unknown> = {
        ...contractForm,
        companyId: parseInt(contractForm.companyId),
      };
      if (uploadedFiles.length > 0) payload.files = uploadedFiles;
      if (editingContractId && removeFileIds.length > 0) payload.removeFileIds = removeFileIds;

      // ۳) ارسال به سرور + بررسی واقعی نتیجه (رفع ایراد «ذخیره نمی‌شود» بدون پیام)
      const res = editingContractId
        ? await fetch(`/api/contracts/${editingContractId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/contracts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "خطا در ذخیره قرارداد — لطفاً دوباره تلاش کنید");
        setUploadingContract(false);
        return;
      }
      if (data?.filesWarning) {
        alert(`⚠️ قرارداد ذخیره شد ولی: ${data.filesWarning}`);
      } else {
        alert("✅ قرارداد با موفقیت ذخیره شد");
      }

      // ۴) پاک‌سازی فرم
      setContractForm({ companyId: "", contractNumber: "", title: "", startDate: "", endDate: "", description: "" });
      setContractFilesNew([]);
      setContractFilesExisting([]);
      setRemoveFileIds([]);
      if (contractFileRef.current) contractFileRef.current.value = "";
      setEditingContractId(null);
      setShowContractForm(false);
      setUploadingContract(false);
      loadData();
    } catch {
      alert("خطای ارتباط با سرور — قرارداد ذخیره نشد");
      setUploadingContract(false);
    }
  };

  const startEditContract = (ct: Contract) => {
    setEditingContractId(ct.id);
    setContractForm({
      companyId: ct.companyId.toString(),
      contractNumber: ct.contractNumber,
      title: ct.title || "",
      startDate: ct.startDate,
      endDate: ct.endDate,
      description: ct.description || "",
    });
    // فایل‌های موجود قرارداد برای نمایش/حذف در فرم ویرایش
    const existing = Array.isArray(ct.files) && ct.files.length > 0
      ? ct.files
      : ct.filePath && ct.fileName
        ? [{ id: -ct.id, fileName: ct.fileName, filePath: ct.filePath, fileSize: null }]
        : [];
    setContractFilesExisting(existing);
    setRemoveFileIds([]);
    setContractFilesNew([]);
    if (contractFileRef.current) contractFileRef.current.value = "";
    setShowContractForm(true);
  };

  // حذف یک فایل موجودِ قرارداد در حالت ویرایش — با تایید، بلافاصله به لیست حذف می‌رود
  const markContractFileForRemoval = (fileId: number) => {
    setContractFilesExisting((prev) => prev.filter((f) => f.id !== fileId));
    setRemoveFileIds((prev) => (prev.includes(fileId) ? prev : [...prev, fileId]));
  };

  const deleteContract = async (id: number) => {
    if (!confirm("آیا از حذف این قرارداد مطمئن هستید؟")) return;
    await fetch(`/api/contracts/${id}`, { method: "DELETE" });
    loadData();
  };

  // درون‌ریزی لیست مشتریان از فایل اکسل/CSV
  const handleImportFile = async (file: File) => {
    setImporting(true);
    setImportReport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/companies/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        alert("خطا: " + (json.error || "درون‌ریزی ناموفق بود"));
      } else {
        setImportReport(json);
        loadData();
        const w = window as unknown as { showToast?: (m: string) => void };
        if (w.showToast && json.inserted > 0) w.showToast(`${json.inserted} مشتری جدید ثبت شد`);
      }
    } catch {
      alert("خطا در ارتباط با سرور");
    }
    setImporting(false);
    if (importInputRef.current) importInputRef.current.value = "";
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">شرکت‌ها و قراردادها</h1>
        <div className="flex gap-2">
          {tab === "companies" && (
            <>
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
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-50"
                title="درون‌ریزی لیست مشتریان از فایل Excel یا CSV"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {importing ? "در حال درون‌ریزی..." : "درون‌ریزی از اکسل"}
              </button>
              <button
                onClick={() => { setEditingId(null); setForm({ name: "", phone: "", fax: "", email: "", address: "", contactPerson: "", communicationMethod: "", communicationId: "" }); setShowForm(true); }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                + شرکت جدید
              </button>
            </>
          )}
          {tab === "contracts" && (
            <button
              onClick={() => { setEditingContractId(null); setContractForm({ companyId: "", contractNumber: "", title: "", startDate: getTodayJalali(), endDate: "", description: "" }); setContractFilesNew([]); setContractFilesExisting([]); setRemoveFileIds([]); if (contractFileRef.current) contractFileRef.current.value = ""; setShowContractForm(!showContractForm); }}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              + قرارداد جدید
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("companies")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "companies" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
        >
          🏢 شرکت‌ها ({toPersianDigits(companies.length)})
        </button>
        <button
          onClick={() => setTab("contracts")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "contracts" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700"}`}
        >
          📄 قراردادها ({toPersianDigits(contracts.length)})
        </button>
      </div>

      {/* Import result panel */}
      {importReport && tab === "companies" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                <UploadCloud className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <p className="font-bold text-emerald-800 text-sm">نتیجه درون‌ریزی از اکسل</p>
                <p className="text-xs text-emerald-700 mt-1">
                  <span className="font-bold">{toPersianDigits(importReport.inserted)}</span> جدید ثبت شد
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

      {/* Companies Tab */}
      {tab === "companies" && (
        <>
          {/* Import hint */}
          <div className="mb-4 bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-xs text-blue-700 inline-flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              قالب سرفصل اکسل: نام شرکت، تلفن، فکس، ایمیل، مسئول، آدرس (فقط ستون اول الزامی است)
            </span>
            <a
              href="/api/companies/import"
              download
              className="text-xs font-bold text-blue-600 hover:text-blue-800 underline underline-offset-4 mr-auto"
            >
              دانلود قالب نمونه
            </a>
          </div>

          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="🔍 جستجو در نام شرکت، تلفن، مسئول..."
              className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>


          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">نام شرکت</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">تلفن</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">مسئول</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">ارتباط</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">قراردادها</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
  {paginatedCompanies.map((c) => {
    const companyContracts = getCompanyContracts(c.id);
    const isExpanded = selectedCompanyContracts === c.id;

    return (
      <React.Fragment key={c.id}>
        {/* ردیف شرکت */}
        <tr className="hover:bg-gray-50">
          <td className="px-4 py-3 font-medium">
            {c.name}
          </td>

          <td className="px-4 py-3">
            {c.phone || "-"}
          </td>

          <td className="px-4 py-3">
            {c.contactPerson || "-"}
          </td>

          <td className="px-4 py-3">
            {c.communicationMethod ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-sky-700">
                  {c.communicationMethod}
                </span>

                {c.communicationId && (
                  <code
                    dir="ltr"
                    className="text-[10px] text-gray-500 text-left"
                  >
                    {c.communicationId}
                  </code>
                )}
              </div>
            ) : (
              <span className="text-xs text-gray-400">
                -
              </span>
            )}
          </td>

          {/* قراردادها */}
          <td className="px-4 py-3">
            <button
              type="button"
              onClick={() =>
                setSelectedCompanyContracts(
                  isExpanded ? null : c.id
                )
              }
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                hasActiveContract(c.id)
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : companyContracts.length > 0
                    ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {isExpanded ? "▲ " : "▼ "}
              {toPersianDigits(companyContracts.length)} قرارداد
            </button>
          </td>

          {/* عملیات */}
          <td className="px-4 py-3">
            <div className="flex gap-2">
              <button
                onClick={() => startEditCompany(c)}
                className="text-blue-600 hover:text-blue-800 text-xs"
              >
                ✏️ ویرایش
              </button>

              <button
                onClick={() => deleteCompany(c.id)}
                className="text-red-600 hover:text-red-800 text-xs"
              >
                🗑️ حذف
              </button>
            </div>
          </td>
        </tr>

        {/* لیست قراردادهای شرکت انتخاب‌شده */}
        {isExpanded && (
          <tr>
            <td
              colSpan={6}
              className="bg-gray-50 px-4 py-4"
            >
              <div className="mr-4 border-r-4 border-green-500 pr-4">

                {/* عنوان */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-800">
                      📄 قراردادهای {c.name}
                    </h3>

                    <p className="text-xs text-gray-500 mt-1">
                      {companyContracts.length === 0
                        ? "این شرکت قراردادی ندارد"
                        : `${toPersianDigits(companyContracts.length)} قرارداد ثبت شده است`}
                    </p>
                  </div>

                  {companyContracts.length > 0 && (
                    <span
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium ${
                        hasActiveContract(c.id)
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {hasActiveContract(c.id)
                        ? "● قرارداد فعال دارد"
                        : "● قرارداد فعال ندارد"}
                    </span>
                  )}
                </div>

                {/* اگر قراردادی وجود نداشته باشد */}
                {companyContracts.length === 0 ? (
                  <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center">
                    <div className="text-3xl mb-2">
                      📄
                    </div>

                    <p className="text-sm text-gray-500">
                      برای این شرکت قراردادی ثبت نشده است.
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setContractForm({
                          companyId: c.id.toString(),
                          contractNumber: "",
                          title: "",
                          startDate: getTodayJalali(),
                          endDate: "",
                          description: "",
                        });
                        
                        setEditingContractId(null);
                        setContractFilesNew([]);
                        setContractFilesExisting([]);
                        setRemoveFileIds([]);
                        if (contractFileRef.current) contractFileRef.current.value = "";
                        setShowContractForm(true);
                        setTab("contracts");
                        setSelectedCompanyContracts(null);
                      }}
                      className="mt-3 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-xs"
                    >
                      + ثبت قرارداد برای این شرکت
                    </button>
                  </div>
                ) : (
                  /* جدول قراردادها */
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-3 py-2 text-right font-bold text-gray-600">
                              شماره قرارداد
                            </th>

                            <th className="px-3 py-2 text-right font-bold text-gray-600">
                              عنوان
                            </th>

                            <th className="px-3 py-2 text-right font-bold text-gray-600">
                              شروع
                            </th>

                            <th className="px-3 py-2 text-right font-bold text-gray-600">
                              پایان
                            </th>

                            <th className="px-3 py-2 text-right font-bold text-gray-600">
                              وضعیت
                            </th>

                            <th className="px-3 py-2 text-right font-bold text-gray-600">
                              فایل
                            </th>

                            <th className="px-3 py-2 text-right font-bold text-gray-600">
                              عملیات
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                          {companyContracts.map((ct) => (
                            <tr
                              key={ct.id}
                              className="hover:bg-gray-50"
                            >
                              <td className="px-3 py-2 font-medium">
                                {ct.contractNumber || "-"}
                              </td>

                              <td className="px-3 py-2">
                                {ct.title || "-"}
                              </td>

                              <td className="px-3 py-2">
                                {toPersianDigits(ct.startDate)}
                              </td>

                              <td className="px-3 py-2">
                                {toPersianDigits(ct.endDate)}
                              </td>

                              <td className="px-3 py-2">
                                <span
                                  className={`px-2 py-1 rounded text-[10px] ${
                                    ct.isActive
                                      ? "bg-green-100 text-green-700"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {ct.isActive
                                    ? "فعال"
                                    : "منقضی"}
                                </span>
                              </td>

                              <td className="px-3 py-2">
                                {(() => {
                                  // همه فایل‌های قرارداد (چند فایل) + سازگاری با فایل تکی قدیمی
                                  const ctFiles = Array.isArray(ct.files) && ct.files.length > 0
                                    ? ct.files
                                    : ct.filePath && ct.fileName
                                      ? [{ id: -ct.id, fileName: ct.fileName, filePath: ct.filePath, fileSize: null }]
                                      : [];
                                  return ctFiles.length > 0 ? (
                                    <div className="flex flex-col gap-1">
                                      {ctFiles.map((f) => (
                                        <a
                                          key={f.id}
                                          href={f.filePath}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title={f.fileName}
                                          className="text-purple-600 hover:text-purple-800 max-w-[130px] truncate"
                                        >
                                          📎 {f.fileName}
                                        </a>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">
                                      بدون فایل
                                    </span>
                                  );
                                })()}
                              </td>

                              <td className="px-3 py-2">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      startEditContract(ct);
                                      setTab("contracts");
                                    }}
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    ✏️ ویرایش
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteContract(ct.id)
                                    }
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    🗑️ حذف
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* دکمه ثبت قرارداد جدید */}
                    <div className="border-t bg-gray-50 px-3 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setContractForm({
                            companyId: c.id.toString(),
                            contractNumber: "",
                            title: "",
                            startDate: getTodayJalali(),
                            endDate: "",
                            description: "",
                          });

                          setEditingContractId(null);
                          setContractFilesNew([]);
                          setContractFilesExisting([]);
                          setRemoveFileIds([]);
                          if (contractFileRef.current) contractFileRef.current.value = "";
                          setShowContractForm(true);
                          setTab("contracts");
                          setSelectedCompanyContracts(null);
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-xs"
                      >
                        + ثبت قرارداد جدید برای {c.name}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  })}
</tbody>
            </table>
            {filteredCompanies.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                {searchText ? "نتیجه‌ای یافت نشد" : "شرکتی ثبت نشده است"}
              </div>
            )}
            <Pagination
              currentPage={safeCompanyPage}
              totalPages={companyTotalPages}
              totalItems={filteredCompanies.length}
              pageSize={companyPageSize}
              onPageChange={setCompanyPage}
              onPageSizeChange={(s) => { setCompanyPageSize(s); setCompanyPage(1); }}
            />
          </div>
        </>
      )}

      {/* Contracts Tab */}
      {tab === "contracts" && (
        <>
          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              value={contractSearch}
              onChange={(e) => setContractSearch(e.target.value)}
              placeholder="🔍 جستجو در شماره قرارداد، عنوان، شرکت..."
              className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>

          {showContractForm && (
            <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
              <h2 className="font-bold mb-4">{editingContractId ? "ویرایش قرارداد" : "ثبت قرارداد جدید"}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">شرکت *</label>
                  <select value={contractForm.companyId} onChange={(e) => setContractForm({ ...contractForm, companyId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    <option value="">انتخاب کنید</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">شماره قرارداد *</label>
                  <input type="text" value={contractForm.contractNumber} onChange={(e) => setContractForm({ ...contractForm, contractNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">عنوان</label>
                  <input type="text" value={contractForm.title} onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تاریخ شروع *</label>
                  <PersianDatePicker value={contractForm.startDate} onChange={(v) => setContractForm({ ...contractForm, startDate: v })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تاریخ پایان *</label>
                  <PersianDatePicker value={contractForm.endDate} onChange={(v) => setContractForm({ ...contractForm, endDate: v })} />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    فایل‌های قرارداد <span className="text-xs text-gray-400 font-normal">(امکان انتخاب چند فایل)</span>
                  </label>
                  <input
                    type="file"
                    ref={contractFileRef}
                    multiple
                    onChange={(e) => { addContractFiles(e.target.files); e.target.value = ""; }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  {/* فایل‌های موجود قرارداد (حالت ویرایش) — قابل حذف تک‌تک */}
                  {contractFilesExisting.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-xs font-bold text-gray-500">فایل‌های فعلی قرارداد:</p>
                      {contractFilesExisting.map((f) => (
                        <div key={f.id} className="flex items-center justify-between gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 text-xs">
                          <a href={f.filePath} target="_blank" rel="noopener noreferrer" className="text-purple-700 hover:text-purple-900 font-medium truncate">
                            📎 {f.fileName}
                          </a>
                          <button
                            type="button"
                            onClick={() => markContractFileForRemoval(f.id)}
                            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-red-600 hover:bg-red-100"
                            title="حذف این فایل"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* فایل‌های جدید انتخاب‌شده — قبل از ذخیره قابل حذف از لیست */}
                  {contractFilesNew.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-xs font-bold text-gray-500">فایل‌های جدید ({toPersianDigits(contractFilesNew.length)} فایل):</p>
                      {contractFilesNew.map((f, idx) => (
                        <div key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-xs">
                          <span className="text-green-800 font-medium truncate">
                            📎 {f.name}
                            <span className="text-green-500 mr-1">({toPersianDigits((f.size / 1024).toFixed(0))} KB)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setContractFilesNew((prev) => prev.filter((_, i) => i !== idx))}
                            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-red-600 hover:bg-red-100"
                            title="حذف از لیست"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">توضیحات</label>
                  <textarea value={contractForm.description} onChange={(e) => setContractForm({ ...contractForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg" rows={2} />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => { setShowContractForm(false); setEditingContractId(null); setContractFilesNew([]); setContractFilesExisting([]); setRemoveFileIds([]); if (contractFileRef.current) contractFileRef.current.value = ""; }} className="px-4 py-2 border rounded-lg">انصراف</button>
                <button onClick={handleSaveContract} disabled={uploadingContract} className="bg-green-600 text-white px-6 py-2 rounded-lg disabled:opacity-50">
                  {uploadingContract ? "ذخیره..." : editingContractId ? "ویرایش" : "ذخیره"}
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">شماره</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">شرکت</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">عنوان</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">تاریخ شروع</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">تاریخ پایان</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">وضعیت</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedContracts.map((ct) => (
                  <tr key={ct.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{ct.contractNumber}</td>
                    <td className="px-4 py-3">{ct.companyName || "-"}</td>
                    <td className="px-4 py-3">{ct.title || "-"}</td>
                    <td className="px-4 py-3">{toPersianDigits(ct.startDate)}</td>
                    <td className="px-4 py-3">{toPersianDigits(ct.endDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${ct.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {ct.isActive ? "فعال" : "منقضی"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap items-center">
                        {/* همه فایل‌های قرارداد (چند فایل) — سازگار با فایل تکی قدیمی */}
                        {(() => {
                          const ctFiles = Array.isArray(ct.files) && ct.files.length > 0
                            ? ct.files
                            : ct.filePath && ct.fileName
                              ? [{ id: -ct.id, fileName: ct.fileName, filePath: ct.filePath, fileSize: null }]
                              : [];
                          return ctFiles.map((f) => (
                            <a
                              key={f.id}
                              href={f.filePath}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={f.fileName}
                              className="text-purple-600 hover:text-purple-800 text-xs max-w-[110px] truncate inline-block align-middle"
                            >
                              📎 {f.fileName}
                            </a>
                          ));
                        })()}
                        <button onClick={() => startEditContract(ct)} className="text-blue-600 hover:text-blue-800 text-xs">✏️ ویرایش</button>
                        <button onClick={() => deleteContract(ct.id)} className="text-red-600 hover:text-red-800 text-xs">🗑️ حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredContracts.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                {contractSearch ? "نتیجه‌ای یافت نشد" : "قراردادی ثبت نشده است"}
              </div>
            )}
            <Pagination
              currentPage={safeContractPage}
              totalPages={contractTotalPages}
              totalItems={filteredContracts.length}
              pageSize={contractPageSize}
              onPageChange={setContractPage}
              onPageSizeChange={(s) => { setContractPageSize(s); setContractPage(1); }}
            />
          </div>
        </>
      )}

      {/* پاپ‌آپ ثبت / ویرایش شرکت */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
          onClick={() => { if (!saving) { setShowForm(false); setEditingId(null); } }}
        >
          <div
            className="bg-white w-full max-w-3xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 bg-gradient-to-l from-blue-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-black text-lg truncate">
                  {editingId ? "✏️ ویرایش شرکت" : "➕ ثبت شرکت جدید"}
                </h2>
                <p className="text-[11px] text-white/80 mt-0.5">
                  اطلاعات تماس و ارتباط مشتری برای ارسال خودکار پیش‌فاکتور استفاده می‌شود
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-lg transition shrink-0"
                title="بستن"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">نام شرکت *</label>
                  <input type="text" id="company-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="نام کامل شرکت"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تلفن</label>
                  <input type="text" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-left focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">فکس</label>
                  <input type="text" dir="ltr" value={form.fax} onChange={(e) => setForm({ ...form, fax: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-left focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label htmlFor="company-contact-person" className="block text-sm font-bold text-gray-700 mb-1">
                    نام مسئول <span className="text-red-600" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="company-contact-person"
                    type="text"
                    required
                    aria-required="true"
                    value={form.contactPerson}
                    onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                    placeholder="نام مسئول شرکت — الزامی"
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none ${
                      form.contactPerson.trim()
                        ? "border-gray-300 focus:ring-blue-500"
                        : "border-red-300 bg-red-50/40 focus:ring-red-400"
                    }`}
                  />
                  {!form.contactPerson.trim() && (
                    <p className="mt-1 text-[10px] font-medium text-red-600">برای ثبت یا ویرایش شرکت الزامی است</p>
                  )}
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">ایمیل</label>
                  <input type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="customer@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-left focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>

                {/* اطلاعات ارتباط پیام‌رسان */}
                <div className="md:col-span-3 mt-1 pt-4 border-t border-gray-100">
                  <div className="text-sm font-black text-gray-800 mb-1">📨 اطلاعات ارتباط</div>
                  <p className="text-[11px] text-gray-500 mb-3">
                    این مقادیر هنگام ثبت نامه و صدور پیش‌فاکتور به‌صورت خودکار پیشنهاد می‌شوند.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">نوع ارتباط</label>
                  <select
                    value={form.communicationMethod}
                    onChange={(e) => setForm({ ...form, communicationMethod: e.target.value, communicationId: "" })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">انتخاب کنید</option>
                    {commMethods.map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">شناسه ارتباط</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={form.communicationId}
                    onChange={(e) => setForm({ ...form, communicationId: e.target.value.trim() })}
                    placeholder={
                      /تلگرام|telegram/i.test(form.communicationMethod) ? "Chat ID عددی تلگرام"
                        : /روبیکا|rubika/i.test(form.communicationMethod) ? "b0... / g0... / u0... / c0..."
                        : /بله|bale/i.test(form.communicationMethod) ? "شناسه عددی چت بله"
                        : /ایتا|eitaa|eita/i.test(form.communicationMethod) ? "شناسه کاربر/کانال ایتا"
                        : /واتساپ|whatsapp/i.test(form.communicationMethod) ? "شماره بین‌المللی (مثال: 09123456789)"
                        : /ایمیل|email/i.test(form.communicationMethod) ? "customer@example.com"
                        : "آیدی پیام‌رسان، شماره یا ایمیل"
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-left focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">آدرس</label>
                  <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" rows={2} />
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t bg-gray-50 px-6 py-4 flex items-center justify-end gap-2">
              <button
                onClick={() => { setShowForm(false); setEditingId(null); }}
                disabled={saving}
                className="px-5 py-2 border border-gray-300 bg-white rounded-lg hover:bg-gray-100 disabled:opacity-50 transition"
              >
                انصراف
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.contactPerson.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {saving ? "در حال ذخیره..." : editingId ? "ذخیره تغییرات" : "ثبت شرکت"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
