"use client";

import { formatPrice, normalizeNameKey } from "@/lib/utils";

import { useState, useEffect, useRef } from "react";

interface EquipmentItem {
  id: number;
  name: string;
  categoryName: string | null;
  parentEquipmentId?: number | null;
  unitPrice: string;
  pricePerPoint: boolean;
  imagePath?: string | null;
}

interface Category {
  id: number;
  name: string;
}

interface Props {
  value: number | null;
  onSelect: (equipment: EquipmentItem | null) => void;
  onSelectMultiple?: (items: EquipmentItem[]) => void;
  equipmentList: EquipmentItem[];
  onEquipmentAdded: () => void;
}

export default function EquipmentSearch({ value, onSelect, onSelectMultiple, equipmentList, onEquipmentAdded }: Props) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newEquip, setNewEquip] = useState({ name: "", categoryId: "", unitPrice: "0", pricePerPoint: false, parentId: "" });
  const [saving, setSaving] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Get selected equipment name
  const selectedEquip = equipmentList.find((e) => e.id === value);

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then(setCategories).catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter equipment based on search — تطبیق نرمال‌شده تا تفاوت فاصله/نیم‌فاصله
  // و حروف عربی/فارسی (ي/ی، ك/ک) باعث پنهان‌شدن موارد مشابه نشود
  const searchKey = normalizeNameKey(search);
  const filtered = search.trim()
    ? equipmentList.filter((e) => {
        const nameKey = normalizeNameKey(e.name);
        return (
          nameKey.includes(searchKey) ||
          e.name.includes(search) ||
          (e.categoryName && e.categoryName.includes(search))
        );
      })
    : equipmentList;

  // ── جلوگیری از ثبت تجهیز تکراری در فرم «افزودن تجهیز جدید» ──
  // با هر تغییر نام، موارد مشابه موجود به‌صورت زنده پیشنهاد داده می‌شود تا
  // کاربر به‌جای ساخت تجهیز تکراری، همان تجهیز موجود را انتخاب کند.
  const typedKey = normalizeNameKey(newEquip.name);
  const exactDup = typedKey
    ? equipmentList.find((e) => normalizeNameKey(e.name) === typedKey) || null
    : null;
  const similarList =
    typedKey.length >= 2 && !exactDup
      ? equipmentList
          .filter((e) => {
            const k = normalizeNameKey(e.name);
            return k !== typedKey && (k.includes(typedKey) || typedKey.includes(k));
          })
          .slice(0, 5)
      : [];

  // Find sub-equipment (children where parentEquipmentId == equip.id)
  const getSubEquipment = (parentId: number) =>
    equipmentList.filter((e) => e.parentEquipmentId === parentId);

  const handleSelect = (equip: EquipmentItem) => {
    const children = getSubEquipment(equip.id);
    if (children.length > 0 && onSelectMultiple) {
      // Ask user if they want to add all sub-equipment automatically
      const names = children.map((c) => c.name).join("، ");
      const addAll = confirm(
        `تجهیز "${equip.name}" دارای ${children.length} زیرمجموعه است:\n${names}\n\nآیا می‌خواهید همه آن‌ها بصورت خودکار اضافه شوند؟`
      );
      if (addAll) {
        onSelectMultiple([equip, ...children]);
        setSearch("");
        setIsOpen(false);
        return;
      }
    }
    onSelect(equip);
    setSearch("");
    setIsOpen(false);
  };

  const handleClear = () => {
    onSelect(null);
    setSearch("");
  };

  const handleAddNew = async () => {
    if (!newEquip.name) return;
    // جلوگیری از ارسال درخواست برای نام تکراری — همان تجهیز موجود انتخاب می‌شود
    if (exactDup) {
      handleSelect(exactDup);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newEquip.name,
          categoryId: newEquip.categoryId ? parseInt(newEquip.categoryId) : null,
          parentEquipmentId: newEquip.parentId ? parseInt(newEquip.parentId) : null,
          unitPrice: newEquip.unitPrice || "0",
          pricePerPoint: newEquip.pricePerPoint,
        }),
      });
      const created = await res.json();
      if (!res.ok || created?.error) {
        // تجهیز تکراری یا خطای اعتبارسنجی — در صورت تکراری بودن، همان مورد موجود انتخاب می‌شود
        if (res.status === 409 && created?.existing) {
          const existingInList = equipmentList.find((e) => e.id === created.existing.id);
          alert(created?.error || "این تجهیز قبلاً ثبت شده است");
          if (existingInList) {
            setShowAddForm(false);
            handleSelect(existingInList);
          }
          setSaving(false);
          return;
        }
        alert(created?.error || "خطا در افزودن تجهیز");
        setSaving(false);
        return;
      }
      setNewEquip({ name: "", categoryId: "", unitPrice: "0", pricePerPoint: false, parentId: "" });
      setShowAddForm(false);
      onEquipmentAdded();
      // Auto-select the new equipment
      onSelect({
        id: created.id,
        name: created.name,
        categoryName: null,
        unitPrice: created.unitPrice || "0",
        pricePerPoint: created.pricePerPoint || false,
      });
      setIsOpen(false);
    } catch {
      alert("خطا در افزودن تجهیز");
    }
    setSaving(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      {/* Selected Value Display / Search Input */}
      {selectedEquip && !isOpen ? (
        <div className="flex items-center gap-2">
           <div
            onClick={() => setIsOpen(true)}
            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm bg-white cursor-pointer hover:border-blue-400 transition flex items-center justify-between"
          >
            <span>{selectedEquip.name}</span>
            <span className="text-xs text-gray-400">{formatPrice(selectedEquip.unitPrice)} ریال</span>
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
          placeholder="جستجوی تجهیز... (تایپ کنید)"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      )}

      {/* Dropdown — باز شدن رو به بالا، بدون اسکرول */}
      {isOpen && (
        <div className="absolute z-[9999] bottom-full left-0 right-0 mb-1 bg-white border border-gray-300 rounded-lg shadow-2xl">
          {/* Results */}
          {filtered.length > 0 ? (
            <div className="py-1">
              {filtered.filter(e => !e.parentEquipmentId).slice(0, 20).map((equip) => {
                const children = getSubEquipment(equip.id);
                return (
                <button
                  key={equip.id}
                  type="button"
                  onClick={() => handleSelect(equip)}
                  className="w-full px-3 py-2.5 text-right hover:bg-blue-50 transition flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {equip.imagePath && (
                      <img src={equip.imagePath} alt="" className="w-8 h-8 rounded object-cover border" />
                    )}
                    <div>
                      <span className="text-sm font-medium">{equip.name}</span>
                      {equip.pricePerPoint && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded mr-1">نقطه‌ای</span>
                      )}
                      {children.length > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded mr-1">+{children.length} زیرمجموعه</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-green-600 whitespace-nowrap">
                    {formatPrice(equip.unitPrice)} ریال
                  </span>
                </button>
                );
              })}
              {filtered.length > 20 && (
                <div className="px-3 py-2 text-xs text-gray-400 text-center">
                  و {filtered.length - 20} مورد دیگر...
                </div>
              )}
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-gray-500 text-sm">
              تجهیزی یافت نشد
            </div>
          )}

          {/* Add New Button */}
          <div className="border-t">
            {!showAddForm ? (
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(true);
                  setNewEquip({ ...newEquip, name: search });
                }}
                className="w-full px-3 py-2.5 text-blue-600 hover:bg-blue-50 text-sm font-medium flex items-center justify-center gap-2 transition"
              >
                <span>➕</span>
                <span>افزودن تجهیز جدید {search && `"${search}"`}</span>
              </button>
            ) : (
              <div className="p-3 bg-gray-50 space-y-3">
                <div className="text-sm font-medium text-gray-700 mb-2">افزودن تجهیز جدید</div>
                <input
                  type="text"
                  placeholder="نام تجهیز *"
                  value={newEquip.name}
                  onChange={(e) => setNewEquip({ ...newEquip, name: e.target.value })}
                  className={`w-full px-2 py-1.5 border rounded text-sm focus:ring-2 outline-none ${
                    exactDup
                      ? "border-red-400 focus:ring-red-500 bg-red-50"
                      : "border-gray-300 focus:ring-blue-500"
                  }`}
                />
                {/* هشدار تکراری بودن — ثبت تجهیز با نام مشابه ممکن نیست */}
                {exactDup && (
                  <div className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-2 text-xs text-red-700">
                    <div className="font-black mb-1">⛔ این تجهیز تکراری است</div>
                    <p className="leading-5">
                      تجهیزی با نام «{exactDup.name}» قبلاً ثبت شده (تفاوت فاصله/نیم‌فاصله نادیده گرفته می‌شود).
                    </p>
                    <button
                      type="button"
                      onClick={() => handleSelect(exactDup)}
                      className="mt-1.5 w-full bg-red-600 text-white rounded-lg px-2 py-1.5 font-bold hover:bg-red-700 transition"
                    >
                      ✓ انتخاب همان تجهیز موجود
                    </button>
                  </div>
                )}
                {/* پیشنهاد موارد مشابه — برای جلوگیری از ثبت تکراری با اسم نزدیک */}
                {!exactDup && similarList.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs">
                    <div className="font-black text-amber-800 mb-1.5">⚠️ موارد مشابه موجود است — شاید منظورتان یکی از این‌هاست:</div>
                    <div className="space-y-1">
                      {similarList.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelect(s)}
                          className="w-full flex items-center justify-between gap-2 bg-white border border-amber-200 rounded-lg px-2 py-1.5 hover:bg-amber-100 transition text-right"
                        >
                          <span className="font-bold text-gray-800 truncate">{s.name}</span>
                          <span className="text-green-700 whitespace-nowrap">{formatPrice(s.unitPrice)} ریال</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newEquip.categoryId}
                    onChange={(e) => setNewEquip({ ...newEquip, categoryId: e.target.value })}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">دسته‌بندی</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="قیمت واحد (ریال)"
                    value={newEquip.unitPrice}
                    onChange={(e) => setNewEquip({ ...newEquip, unitPrice: e.target.value })}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <select
                    value={newEquip.parentId}
                    onChange={(e) => setNewEquip({ ...newEquip, parentId: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">زیرمجموعه کدام تجهیز؟ (اختیاری)</option>
                    {equipmentList.filter(e => !e.parentEquipmentId).map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">مثلا: سختی سنج رومیزی زیرمجموعه سختی سنج</p>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newEquip.pricePerPoint}
                    onChange={(e) => setNewEquip({ ...newEquip, pricePerPoint: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span>قیمت بر اساس نقطه/پارامتر</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-100 transition"
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    onClick={handleAddNew}
                    disabled={saving || !newEquip.name || !!exactDup}
                    title={exactDup ? "این تجهیز قبلاً ثبت شده — همان مورد موجود را انتخاب کنید" : undefined}
                    className={`flex-1 px-3 py-1.5 rounded text-sm transition disabled:opacity-50 ${
                      exactDup
                        ? "bg-gray-400 text-white cursor-not-allowed"
                        : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                  >
                    {saving ? "..." : exactDup ? "تکراری — قابل ثبت نیست" : "ذخیره و انتخاب"}
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
