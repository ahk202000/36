"use client";

import { useState, useEffect, useRef } from "react";

interface Param {
  id: number;
  paramName: string;
  paramUnit: string | null;
  categoryName?: string | null;
}

interface Props {
  value: string;
  onSelect: (paramName: string, paramUnit?: string | null) => void;
  categoryId?: number | null;
  placeholder?: string;
}

const COMMON_PARAMS = [
  { name: "نقطه دمایی", unit: "نقطه" },
  { name: "نقطه رطوبتی", unit: "نقطه" },
  { name: "نقطه فشار", unit: "نقطه" },
  { name: "اندازه", unit: "عدد" },
  { name: "پارامتر", unit: "پارامتر" },
  { name: "نقطه کالیبراسیون", unit: "نقطه" },
  { name: "نقطه آزمون", unit: "نقطه" },
  { name: "کانال", unit: "کانال" },
  { name: "سنسور", unit: "عدد" },
  { name: "نقطه میانی", unit: "نقطه" },
];

export default function ParamSearch({ value, onSelect, categoryId, placeholder }: Props) {
  const [search, setSearch] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [categoryParams, setCategoryParams] = useState<Param[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newParam, setNewParam] = useState({ name: "", unit: "" });
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    if (categoryId) {
      fetch(`/api/equipment-params?categoryId=${categoryId}`)
        .then((r) => r.json())
        .then(setCategoryParams)
        .catch(() => {});
    } else {
      fetch("/api/equipment-params")
        .then((r) => r.json())
        .then(setCategoryParams)
        .catch(() => {});
    }
  }, [categoryId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowAddForm(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allParams: Param[] = [
    ...categoryParams,
    ...COMMON_PARAMS.filter(
      (cp) => !categoryParams.some((p) => p.paramName === cp.name)
    ).map((cp, idx) => ({
      id: 90000 + idx,
      paramName: cp.name,
      paramUnit: cp.unit,
      categoryName: "پیشنهادی",
    })),
  ];

  const filtered = search.trim()
    ? allParams.filter((p) => p.paramName.includes(search))
    : allParams.slice(0, 10);

  const handleSelect = (paramName: string, unit?: string | null) => {
    onSelect(paramName, unit);
    setSearch(paramName);
    setIsOpen(false);
    setShowAddForm(false);
  };

  const handleAddNew = async () => {
    if (!newParam.name.trim()) return;
    // If categoryId exists, save to DB
    if (categoryId) {
      try {
        const res = await fetch("/api/equipment-params", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId,
            paramName: newParam.name,
            paramUnit: newParam.unit || null,
          }),
        });
        const created = await res.json();
        setCategoryParams((prev) => [created, ...prev]);
      } catch {}
    }
    onSelect(newParam.name, newParam.unit || null);
    setSearch(newParam.name);
    setNewParam({ name: "", unit: "" });
    setShowAddForm(false);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
          onSelect(e.target.value);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder || "جستجوی پارامتر... (مثلا: نقطه دمایی)"}
        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
      />

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-auto">
          {filtered.length > 0 ? (
            <div className="py-1">
              {filtered.slice(0, 12).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p.paramName, p.paramUnit)}
                  className="w-full px-3 py-2 text-right hover:bg-indigo-50 transition flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="text-sm font-medium">{p.paramName}</span>
                    {p.paramUnit && <span className="text-xs text-gray-400 mr-2">({p.paramUnit})</span>}
                  </div>
                  {p.categoryName && <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{p.categoryName}</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-center text-gray-400 text-sm">پارامتری یافت نشد</div>
          )}

          <div className="border-t bg-gray-50">
            {!showAddForm ? (
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(true);
                  setNewParam({ name: search, unit: "" });
                }}
                className="w-full px-3 py-2 text-indigo-600 hover:bg-indigo-50 text-sm font-medium flex items-center justify-center gap-2"
              >
                ➕ افزودن پارامتر جدید {search && `"${search}"`}
              </button>
            ) : (
              <div className="p-3 space-y-2 bg-white">
                <div className="text-xs font-bold text-gray-700">افزودن پارامتر جدید</div>
                <input
                  type="text"
                  placeholder="نام پارامتر *"
                  value={newParam.name}
                  onChange={(e) => setNewParam({ ...newParam, name: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                />
                <input
                  type="text"
                  placeholder="واحد (مثلا: نقطه، عدد)"
                  value={newParam.unit}
                  onChange={(e) => setNewParam({ ...newParam, unit: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowAddForm(false)} className="flex-1 px-3 py-1.5 border rounded text-sm">انصراف</button>
                  <button type="button" onClick={handleAddNew} className="flex-1 bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">ذخیره</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
