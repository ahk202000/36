"use client";

import { useState, useEffect, useRef } from "react";
import moment from "jalali-moment";

export function getTodayJalali(): string {
  try {
    return moment().locale("fa").format("jYYYY/jMM/jDD");
  } catch {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  }
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
];

function parseJalali(dateStr: string): { jy: number; jm: number; jd: number } | null {
  if (!dateStr || !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split("/").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { jy: y, jm: m, jd: d };
}

function jalaliToMoment(jy: number, jm: number, jd: number) {
  try {
    return moment.from(`${jy}/${jm}/${jd}`, "fa", "jYYYY/jM/jD");
  } catch {
    return moment();
  }
}

export default function PersianDatePicker({ value, onChange, placeholder, className }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [viewYear, setViewYear] = useState(1404);
  const [viewMonth, setViewMonth] = useState(1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync input with value prop
  useEffect(() => {
    setInputValue(value);
    const parsed = parseJalali(value);
    if (parsed) {
      setViewYear(parsed.jy);
      setViewMonth(parsed.jm);
    }
  }, [value]);

  // Init view from value or today
  useEffect(() => {
    const parsed = parseJalali(value);
    if (parsed) {
      setViewYear(parsed.jy);
      setViewMonth(parsed.jm);
    } else {
      try {
        const now = moment().locale("fa");
        const jy = parseInt(now.format("jYYYY"));
        const jm = parseInt(now.format("jM"));
        setViewYear(jy);
        setViewMonth(jm);
      } catch {}
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(val)) {
      onChange(val);
      const p = parseJalali(val);
      if (p) {
        setViewYear(p.jy);
        setViewMonth(p.jm);
      }
    } else if (val === "") {
      onChange("");
    }
  };

  const selectDate = (jy: number, jm: number, jd: number) => {
    const str = `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
    setInputValue(str);
    onChange(str);
    setIsOpen(false);
  };

  const setToday = () => {
    const today = getTodayJalali();
    setInputValue(today);
    onChange(today);
    const p = parseJalali(today);
    if (p) {
      setViewYear(p.jy);
      setViewMonth(p.jm);
    }
    setIsOpen(false);
  };

  // Generate calendar days
  const renderCalendar = () => {
    const firstDayMoment = jalaliToMoment(viewYear, viewMonth, 1);
    let firstWeekDay = 0;
    try {
      // moment weekday: 0=Saturday? Check jalali-moment behavior
      // In jalali-moment with fa locale, week starts Saturday
      // We map to our WEEKDAYS which starts Saturday (ش)
      const dow = firstDayMoment.day(); // 0=Sunday, 6=Saturday in Gregorian, but jalali-moment may adjust
      // For Jalali, we want Saturday=0
      // day() returns 0-6 where 0=Sunday, 6=Saturday
      // So Saturday (6) should be 0, Sunday (0) should be 1, etc.
      firstWeekDay = (dow + 1) % 7;
    } catch {
      firstWeekDay = 0;
    }

    let daysInMonth = 30;
    try {
      daysInMonth = moment.jDaysInMonth(viewYear, viewMonth - 1);
    } catch {
      daysInMonth = viewMonth <= 6 ? 31 : viewMonth <= 11 ? 30 : 29;
    }

    const days: (number | null)[] = [];
    for (let i = 0; i < firstWeekDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);

    const selected = parseJalali(value);

    return (
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-xs font-bold text-gray-500 py-1">
            {w}
          </div>
        ))}
        {days.map((d, idx) => {
          if (d === null) return <div key={"empty-" + idx} />;
          const isSelected = selected && selected.jy === viewYear && selected.jm === viewMonth && selected.jd === d;
          const isToday = (() => {
            try {
              const today = getTodayJalali();
              const t = parseJalali(today);
              return t && t.jy === viewYear && t.jm === viewMonth && t.jd === d;
            } catch { return false; }
          })();
          return (
            <button
              key={d}
              type="button"
              onClick={() => selectDate(viewYear, viewMonth, d)}
              className={`w-8 h-8 rounded-full text-sm flex items-center justify-center transition ${
                isSelected
                  ? "bg-blue-600 text-white"
                  : isToday
                  ? "bg-blue-100 text-blue-700 font-bold"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
    );
  };

  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex gap-1">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder || "1404/01/01"}
          className={className || "flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"}
          dir="ltr"
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg transition shrink-0"
        >
          📅
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full mt-2 left-0 bg-white border border-gray-200 rounded-xl shadow-xl p-4 min-w-[300px]">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full">
              ›
            </button>
            <div className="font-bold text-sm flex items-center gap-2">
              <span>{MONTHS[viewMonth - 1]}</span>
              <span>{viewYear}</span>
            </div>
            <button type="button" onClick={nextMonth} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full">
              ‹
            </button>
          </div>

          {renderCalendar()}

          <div className="flex gap-2 mt-4 pt-3 border-t">
            <button
              type="button"
              onClick={setToday}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 transition"
            >
              امروز
            </button>
            <button
              type="button"
              onClick={() => { setInputValue(""); onChange(""); setIsOpen(false); }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              پاک کردن
            </button>
          </div>
          <div className="text-xs text-gray-400 text-center mt-2">فرمت: YYYY/MM/DD</div>
        </div>
      )}
    </div>
  );
}
