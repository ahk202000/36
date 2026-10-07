"use client";

import { useState, useEffect, useRef } from "react";

interface Company {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

interface Props {
  value: string; // companyId as string
  companies: Company[];
  onSelect: (companyId: string) => void;
  onCompanyAdded: (company: Company) => void;
  label?: string;
}

export default function CompanySearch({ value, companies, onSelect, onCompanyAdded, label }: Props) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: "", phone: "", email: "", address: "", contactPerson: "" });
  const [saving, setSaving] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedCompany = companies.find((c) => c.id.toString() === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = search.trim()
    ? companies.filter((c) => c.name.includes(search))
    : companies.slice(0, 20);

  const handleSelect = (company: Company) => {
    onSelect(company.id.toString());
    setSearch("");
    setIsOpen(false);
  };

  const handleClear = () => {
    onSelect("");
    setSearch("");
  };

  const handleAddNew = async () => {
    if (!newCompany.name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCompany.name,
          phone: newCompany.phone || null,
          email: newCompany.email || null,
          address: newCompany.address || null,
          contactPerson: newCompany.contactPerson || null,
        }),
      });
      const created = await res.json();
      if (!res.ok || created?.error) {
        // مشتری تکراری یا خطای اعتبارسنجی
        alert(created?.error || "خطا در افزودن شرکت");
        setSaving(false);
        return;
      }
      setNewCompany({ name: "", phone: "", email: "", address: "", contactPerson: "" });
      setShowAddForm(false);
      onCompanyAdded(created);
      onSelect(created.id.toString());
      setIsOpen(false);
      setSearch("");
    } catch {
      alert("خطا در افزودن شرکت");
    }
    setSaving(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      {selectedCompany && !isOpen ? (
        <div className="flex items-center gap-2">
          <div
            onClick={() => setIsOpen(true)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-blue-400 transition flex items-center justify-between"
          >
            <span className="text-sm font-medium">{selectedCompany.name}</span>
            <span className="text-xs text-gray-400">✏️ تغییر</span>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-red-500 hover:text-red-700 text-sm px-2"
            title="پاک کردن"
          >
            ✕
          </button>
        </div>
      ) : (
        <input
          type="text"
          placeholder={label || "جستجوی شرکت... (تایپ کنید)"}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
        />
      )}

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-auto">
          {/* Results */}
          {filtered.length > 0 ? (
            <div className="py-1">
              {filtered.slice(0, 20).map((company) => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => handleSelect(company)}
                  className="w-full px-3 py-2.5 text-right hover:bg-blue-50 transition flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-xs font-bold">
                      {company.name.charAt(0)}
                    </span>
                    <div className="text-right">
                      <div className="text-sm font-medium">{company.name}</div>
                      {company.phone && <div className="text-xs text-gray-400">{company.phone}</div>}
                    </div>
                  </div>
                  {company.address && <span className="text-xs text-gray-400 max-w-[120px] truncate">{company.address}</span>}
                </button>
              ))}
              {companies.length > 20 && !search && (
                <div className="px-3 py-2 text-xs text-gray-400 text-center">
                  و {companies.length - 20} مورد دیگر — جستجو کنید
                </div>
              )}
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-gray-500 text-sm">
              شرکتی یافت نشد
            </div>
          )}

          {/* Add New */}
          <div className="border-t bg-gray-50">
            {!showAddForm ? (
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(true);
                  setNewCompany({ ...newCompany, name: search });
                }}
                className="w-full px-3 py-2.5 text-blue-600 hover:bg-blue-100 text-sm font-medium flex items-center justify-center gap-2 transition"
              >
                <span>➕</span>
                <span>افزودن شرکت جدید {search && `"${search}"`}</span>
              </button>
            ) : (
              <div className="p-3 space-y-3 bg-white">
                <div className="text-sm font-bold text-gray-700">افزودن شرکت جدید</div>
                <input
                  type="text"
                  placeholder="نام شرکت *"
                  value={newCompany.name}
                  onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="تلفن"
                    value={newCompany.phone}
                    onChange={(e) => setNewCompany({ ...newCompany, phone: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ltr-input"
                  />
                  <input
                    type="email"
                    placeholder="ایمیل"
                    value={newCompany.email}
                    onChange={(e) => setNewCompany({ ...newCompany, email: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ltr-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="مسئول تماس"
                    value={newCompany.contactPerson}
                    onChange={(e) => setNewCompany({ ...newCompany, contactPerson: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="آدرس"
                    value={newCompany.address}
                    onChange={(e) => setNewCompany({ ...newCompany, address: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition"
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    onClick={handleAddNew}
                    disabled={saving || !newCompany.name}
                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {saving ? "..." : "ذخیره و انتخاب"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
