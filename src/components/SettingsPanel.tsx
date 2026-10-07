"use client";

import { useState, useEffect, useRef } from "react";
import type { UserInfo } from "@/app/page";
import { toPersianDigits, REQUEST_TYPES, COMMUNICATION_METHODS, generateLetterNumber, currentJalaliYear } from "@/lib/utils";
import { OFFICIAL_SIGNATURE, COMPANY_SIGNATURE_SETTING_KEY } from "@/lib/signature-text";

interface Setting {
  id: number;
  settingKey: string;
  settingValue: string;
  year: number | null;
}

interface ProformaType {
  id: number;
  name: string;
  code: string;
  defaultTextBefore: string | null;
  defaultTextAfter: string | null;
  defaultTextLastPage: string | null;
  signatureText: string | null;
}

interface Props {
  user: UserInfo;
}

const settingLabels: Record<string, string> = {
  letter_format: "فرمت شماره نامه",
  letter_sequence: "شماره فعلی نامه",
  proforma_format: "فرمت شماره پیش فاکتور",
  proforma_sequence: "شماره فعلی پیش فاکتور",
  tax_percent: "درصد ارزش افزوده",
  insurance_percent: "درصد بیمه",
  save_path: "مسیر پایه ذخیره فایل‌ها",
  header_image: "تصویر سربرگ (بالای صفحه)",
  footer_image: "تصویر ته‌برگ (پایین صفحه)",
  stamp_image: "تصویر مهر و امضا",
  company_signature: "متن سپاس و امضا (خط بالای مهر و امضا)",
  header_height: "ارتفاع سربرگ (سانتی‌متر)",
  footer_height: "ارتفاع ته‌برگ (سانتی‌متر)",
};

export default function SettingsPanel({ user }: Props) {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [types, setTypes] = useState<ProformaType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<ProformaType | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  // لیست‌های فرم نامه (نوع درخواست و طریقه ارتباط)
  const [reqTypesText, setReqTypesText] = useState<string | null>(null);
  const [commMethodsText, setCommMethodsText] = useState<string | null>(null);
  
  const headerInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/proforma-types").then((r) => r.json()),
    ]).then(([s, t]) => {
      // اضافه کردن تنظیمات پیش‌فرض اگر وجود نداشته باشند
      const defaultSettings = [
        // شماره‌گذاری و درصدهای پیش‌فرض (اگر در دیتابیس نباشند ساخته می‌شوند)
        { settingKey: "letter_format", settingValue: "{YEAR}/{SEQ}", year: null },
        { settingKey: "letter_sequence", settingValue: "1", year: null },
        { settingKey: "proforma_format", settingValue: "PF-{YEAR}-{SEQ}", year: null },
        { settingKey: "proforma_sequence", settingValue: "1", year: null },
        { settingKey: "tax_percent", settingValue: "10", year: null },
        { settingKey: "insurance_percent", settingValue: "0", year: null },
        { settingKey: "header_image", settingValue: "", year: null },
        { settingKey: "footer_image", settingValue: "", year: null },
        { settingKey: "stamp_image", settingValue: "", year: null },
        { settingKey: COMPANY_SIGNATURE_SETTING_KEY, settingValue: OFFICIAL_SIGNATURE, year: null },
        { settingKey: "header_height", settingValue: "2", year: null },
        { settingKey: "footer_height", settingValue: "1", year: null },
        // تنظیمات قالب چاپ
        { settingKey: "print_primary_color", settingValue: "#4f46e5", year: null },
        { settingKey: "print_header_bg", settingValue: "#f8fafc", year: null },
        { settingKey: "print_show_text_before", settingValue: "1", year: null },
        { settingKey: "print_show_text_after", settingValue: "1", year: null },
        { settingKey: "print_show_signature", settingValue: "1", year: null },
        { settingKey: "print_show_last_page", settingValue: "1", year: null },
        { settingKey: "print_col_quantity", settingValue: "1", year: null },
        { settingKey: "print_col_point", settingValue: "1", year: null },
        { settingKey: "print_col_unit_price", settingValue: "1", year: null },
        { settingKey: "print_col_total", settingValue: "1", year: null },
        { settingKey: "print_col_calib", settingValue: "1", year: null },
        // لیست‌های انتخابی فرم نامه
        { settingKey: "request_types", settingValue: JSON.stringify(REQUEST_TYPES), year: null },
        { settingKey: "communication_methods", settingValue: JSON.stringify(COMMUNICATION_METHODS), year: null },
        // توکن‌های ربات پیام‌رسان‌ها
        { settingKey: "bale_bot_token", settingValue: "", year: null },
        { settingKey: "telegram_bot_token", settingValue: "", year: null },
        { settingKey: "eita_bot_token", settingValue: "", year: null },
        { settingKey: "rubika_bot_token", settingValue: "", year: null },
        { settingKey: "whatsapp_token", settingValue: "", year: null },
        { settingKey: "whatsapp_phone_id", settingValue: "", year: null },
        { settingKey: "whatsapp_api_version", settingValue: "v22.0", year: null },
        // SMTP برای ارسال ایمیل
        { settingKey: "smtp_host", settingValue: "", year: null },
        { settingKey: "smtp_port", settingValue: "587", year: null },
        { settingKey: "smtp_user", settingValue: "", year: null },
        { settingKey: "smtp_pass", settingValue: "", year: null },
        { settingKey: "smtp_from", settingValue: "", year: null },
      ];
      
      const existingKeys = s.map((x: Setting) => x.settingKey);
      const missing = defaultSettings.filter(d => !existingKeys.includes(d.settingKey));
      
      setSettings([...s, ...missing.map((m, i) => ({ ...m, id: -i - 1 }))]);
      setTypes(t);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // مقداردهی اولیه ویرایشگرهای لیست فرم نامه (قبل از هر return زودهنگام)
  useEffect(() => {
    if (loading) return;
    setReqTypesText((prev) => (prev !== null ? prev : parseListFn("request_types", REQUEST_TYPES).join("\n")));
    setCommMethodsText((prev) => (prev !== null ? prev : parseListFn("communication_methods", COMMUNICATION_METHODS).join("\n")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, settings.length]);

  // تجزیه آرایه JSON از کیلید تنظیمات (با fallback)
  function parseListFn(key: string, fallback: string[]): string[] {
    try {
      const s = settings.find((x) => x.settingKey === key);
      const v = s?.settingValue || "";
      if (!v) return fallback;
      const a = JSON.parse(v);
      return Array.isArray(a) && a.length > 0 ? a.map(String) : fallback;
    } catch {
      return fallback;
    }
  }

  const getSetting = (key: string): string => {
    const s = settings.find(x => x.settingKey === key);
    return s?.settingValue || "";
  };

  const currentYear = currentJalaliYear();

  const updateSetting = async (settingKey: string, settingValue: string, year?: number | null) => {
    const existing = settings.find(s => s.settingKey === settingKey);
    
    if (existing && existing.id > 0) {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(year !== undefined ? { id: existing.id, settingValue, year } : { id: existing.id, settingValue }),
      });
      setSettings(settings.map((s) => (s.id === existing.id ? { ...s, settingValue, ...(year !== undefined ? { year } : {}) } : s)));
    } else {
      // ایجاد تنظیم جدید
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settingKey, settingValue, year: year ?? null }),
      });
      const newSetting = await res.json();
      setSettings(settings.map(s => s.settingKey === settingKey ? newSetting : s));
    }
  };

  const handleFileUpload = async (file: File, settingKey: string) => {
    setUploading(settingKey);
    try {
      // خواندن ابعاد تصویر برای محاسبه خودکار ارتفاع
      const dimensions = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 2480, h: 300 });
        img.src = URL.createObjectURL(file);
      });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "settings");
      
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      
      if (res.ok) {
        const data = await res.json();
        await updateSetting(settingKey, data.path || data.filePath);

        if (settingKey === "header_image" || settingKey === "footer_image") {
          // محاسبه خودکار ارتفاع بر حسب سانتی‌متر (عرض A4 = 21cm)
          const heightCm = (21 * (dimensions.h / dimensions.w)).toFixed(1);
          if (settingKey === "header_image") {
            await updateSetting("header_height", heightCm);
          } else {
            await updateSetting("footer_height", heightCm);
          }
          alert(`فایل آپلود شد ✓\nارتفاع خودکار: ${heightCm} سانتی‌متر`);
        } else {
          // مهر و امضا: تصویر دست‌نخورده و با همان اندازه واقعی خودش ذخیره و چاپ می‌شود
          alert("فایل آپلود شد ✓\nتصویر مهر و امضا دقیقاً با همان «اندازه اصلیِ واقعی» خودش و بدون هیچ تغییر ابعادی، در چاپ و خروجی PDF قرار می‌گیرد.");
        }
      } else {
        alert("خطا در آپلود فایل");
      }
    } catch (e) {
      alert("خطا در آپلود");
    }
    setUploading(null);
  };

  const saveType = async () => {
    if (!selectedType) return;
    setSaving(true);
    await fetch("/api/proforma-types", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selectedType),
    });
    setTypes(types.map((t) => (t.id === selectedType.id ? selectedType : t)));
    setSaving(false);
    alert("ذخیره شد");
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto" />
      </div>
    );
  }

  const generalSettings = settings.filter(s =>
    !["header_image", "footer_image", "stamp_image", "header_height", "footer_height", COMPANY_SIGNATURE_SETTING_KEY, "request_types", "communication_methods", "bale_bot_token", "telegram_bot_token", "eita_bot_token", "rubika_bot_token", "whatsapp_token", "whatsapp_phone_id", "whatsapp_api_version", "smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"].includes(s.settingKey) &&
    !s.settingKey.startsWith("print_")
  );

  // ذخیره لیست‌های فرم نامه — در دیتابیس ذخیره می‌شود؛ نیازی به build مجدد نیست
  const saveFormList = async (key: "request_types" | "communication_methods", text: string, label: string) => {
    const lines = text.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
    if (lines.length === 0) {
      alert(`${label} نمی‌تواند خالی باشد`);
      return;
    }
    // گزینه سیستمی تاییدیه فروش حذف نشود
    if (key === "request_types" && !lines.includes("تاییدیه استعلام")) {
      lines.push("تاییدیه استعلام");
      alert("گزینه «تاییدیه استعلام» برای قابلیت تاییدیه فروش لازم است و به لیست اضافه شد.");
    }
    await updateSetting(key, JSON.stringify(lines));
    const w = window as unknown as { showToast?: (m: string) => void };
    const msg = `${label} ذخیره شد — فرم نامه بلافاصله گزینه‌های جدید را نشان می‌دهد`;
    if (w.showToast) {
      w.showToast(msg);
    } else {
      alert(msg);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">تنظیمات سیستم</h1>

      {/* General Settings */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-bold text-lg mb-4">تنظیمات عمومی</h2>
        <div className="space-y-4">
          {generalSettings.map((s) => {
            const isFormat = s.settingKey === "letter_format" || s.settingKey === "proforma_format";
            const isSequence = s.settingKey === "letter_sequence" || s.settingKey === "proforma_sequence";
            const seqKey = s.settingKey === "letter_format" ? "letter_sequence" : "proforma_sequence";
            const seqVal = parseInt(getSetting(seqKey)) || 1;
            const preview = isFormat ? generateLetterNumber(s.settingValue || "", seqVal, currentYear) : "";
            const hasDash = isFormat && /-/.test(s.settingValue || "");
            const yearMismatch = isSequence && s.year !== null && s.year !== undefined && s.year !== currentYear;
            return (
              <div key={s.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="w-48 text-sm font-medium text-gray-700">
                    {settingLabels[s.settingKey] || s.settingKey}
                  </label>
                  <input
                    type="text"
                    dir={isFormat || isSequence ? "ltr" : undefined}
                    value={s.settingValue}
                    onChange={(e) => setSettings(settings.map((x) => (x.id === s.id ? { ...x, settingValue: e.target.value } : x)))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none max-w-xs"
                  />
                  {isSequence && (
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      سال شمارنده:
                      <input
                        type="number"
                        dir="ltr"
                        value={s.year ?? ""}
                        placeholder={String(currentYear)}
                        onChange={(e) => setSettings(settings.map((x) => (x.id === s.id ? { ...x, year: e.target.value === "" ? null : parseInt(e.target.value) } : x)))}
                        className="w-24 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </label>
                  )}
                  <button
                    onClick={() => updateSetting(s.settingKey, s.settingValue, isSequence ? (s.year ?? currentYear) : undefined)}
                    className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                  >
                    ذخیره
                  </button>
                  {isFormat && (
                    <span className="text-xs text-gray-500">
                      پیش‌نمایش شماره بعدی: <bdi dir="ltr" className="font-bold text-gray-800">{toPersianDigits(preview)}</bdi>
                    </span>
                  )}
                </div>
                {yearMismatch && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mr-52 max-w-xl">
                    ⚠️ سال این شمارنده ({toPersianDigits(s.year as number)}) با سال جاری ({toPersianDigits(currentYear)}) فرق دارد؛ با ثبت اولین سند در سال جدید، شمارنده به‌صورت خودکار از ۱ شروع و سال آن به‌روز می‌شود.
                  </p>
                )}
                {hasDash && (
                  <p className="text-xs text-gray-500 mr-52 max-w-xl">
                    ℹ️ استفاده از خط تیره (-) در فرمت مجاز است؛ شماره‌ها در فرم‌ها و خروجی PDF به‌صورت چپ‌به‌راست نمایش داده می‌شوند تا ترتیب اجزا جابه‌جا نشود.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 text-xs text-gray-400 space-y-1">
          <p>فرمت‌های قابل استفاده: {"{YEAR}"} - سال، {"{SEQ}"} - شماره (با صفر)، {"{NUM}"} - شماره (بدون صفر)</p>
          <p>📅 سال جاری شمسی سیستم: <strong className="text-gray-700">{toPersianDigits(currentYear)}</strong> — مقدار {"{YEAR}"} همیشه از تاریخ روز محاسبه می‌شود و در ابتدای هر سال شمارنده‌ها به‌صورت خودکار از ۱ شروع می‌شوند.</p>
          <p>🛡️ «درصد بیمه» و «درصد ارزش افزوده» به‌عنوان مقدار پیش‌فرض در فرم صدور پیش‌فاکتور جدید اعمال می‌شوند (اگر درصد بیمه بزرگ‌تر از صفر باشد، گزینه بیمه به‌صورت خودکار فعال می‌شود).</p>
        </div>
      </div>

      {/* لیست‌های انتخابی فرم نامه — نوع درخواست و طریقه ارتباط */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-bold text-lg mb-1">📋 گزینه‌های فرم نامه</h2>
        <p className="text-sm text-gray-500 mb-1">این لیست‌ها در فرم «ثبت نامه جدید» نمایش داده می‌شوند.</p>
        <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-4 inline-block">
          ✅ پس از ذخیره، فرم نامه بلافاصله به‌روز می‌شود — دیگر نیازی به ویرایش کد و build مجدد نیست
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">نوع درخواست (هر خط یک گزینه)</label>
            <textarea
              value={reqTypesText ?? ""}
              onChange={(e) => setReqTypesText(e.target.value)}
              rows={8}
              dir="auto"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm leading-7 bg-gray-50 focus:bg-white transition"
              placeholder={REQUEST_TYPES.join("\n")}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">⚠️ گزینه «تاییدیه استعلام» برای قابلیت تاییدیه فروش لازم است</span>
              <button
                onClick={() => saveFormList("request_types", reqTypesText ?? "", "نوع درخواست")}
                className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition font-bold"
              >
                ذخیره
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">طریقه ارتباط (هر خط یک گزینه)</label>
            <textarea
              value={commMethodsText ?? ""}
              onChange={(e) => setCommMethodsText(e.target.value)}
              rows={8}
              dir="auto"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm leading-7 bg-gray-50 focus:bg-white transition"
              placeholder={COMMUNICATION_METHODS.join("\n")}
            />
            <div className="flex items-center justify-end mt-2">
              <button
                onClick={() => saveFormList("communication_methods", commMethodsText ?? "", "طریقه ارتباط")}
                className="bg-emerald-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-emerald-700 transition font-bold"
              >
                ذخیره
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* تنظیمات پیام‌رسان‌ها — ارسال خودکار پیش‌فاکتور */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-bold text-lg mb-1">🤖 پیام‌رسان‌ها (ارسال خودکار پیش‌فاکتور)</h2>
        <p className="text-sm text-gray-500 mb-2">
          تنظیمات زیر را کامل کنید تا پیش‌فاکتورهای تاییدشده به‌طور خودکار از طریق پیام‌رسان یا ایمیل به مشتری ارسال شوند.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1 mb-5">
          <p>📌 <strong>راهنمای کلی:</strong></p>
          <p>۱. در نامه مشتری، «طریقه ارتباط» را روی پیام‌رسان یا ایمیل مربوطه تنظیم کنید</p>
          <p>۲. «شناسه ارتباط» وابسته به روش است: تلگرام/بله = شناسه عددی چت، ایتا/روبیکا = شناسه مخصوص سرویس، واتساپ = شماره بین‌المللی، ایمیل = آدرس ایمیل</p>
          <p>۳. در تلگرام، شماره موبایل یا یوزرنیم شخصی chat_id نیست؛ مشتری باید ابتدا همان ربات را Start کند و یک پیام بفرستد</p>
          <p>۴. سپس در پنل «ارسال پیش‌فاکتور» دکمه «ارسال با ...» ظاهر می‌شود</p>
        </div>

        {/* ── ربات‌های ساده (بله، تلگرام، ایتا، روبیکا) ── */}
        <h3 className="text-sm font-black text-gray-700 mb-3 border-r-4 border-sky-500 pr-2">📱 ربات‌های پیام‌رسان</h3>
        <div className="space-y-4 mb-6">
          {[
            { key: "bale_bot_token", messenger: "bale", label: "توکن ربات بله", placeholder: "از @BotFather بله دریافت کنید" },
            { key: "telegram_bot_token", messenger: "telegram", label: "توکن ربات تلگرام", placeholder: "از @BotFather تلگرام دریافت کنید" },
            { key: "eita_bot_token", messenger: "eitaa", label: "توکن ربات ایتا", placeholder: "از پنل eitaayar.ir دریافت کنید (مثال: bot12345:...)" },
            { key: "rubika_bot_token", messenger: "rubika", label: "توکن ربات روبیکا", placeholder: "از botapi.rubika.ir دریافت کنید" },
          ].map((m) => (
            <div key={m.key} className="flex flex-wrap items-center gap-3 bg-gray-50/60 p-3 rounded-xl border border-gray-100">
              <label className="w-36 text-sm font-bold text-gray-700 shrink-0">{m.label}</label>
              <input
                type="password"
                defaultValue={getSetting(m.key)}
                onBlur={(e) => updateSetting(m.key, e.target.value)}
                placeholder={m.placeholder}
                dir="ltr"
                className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-sm font-mono bg-white"
              />
              <span className={`text-xs font-bold shrink-0 ${getSetting(m.key) ? "text-emerald-600" : "text-gray-400"}`}>
                {getSetting(m.key) ? "✓ فعال" : "تنظیم نشده"}
              </span>
              <button
                type="button"
                onClick={async () => {
                  const token = getSetting(m.key);
                  if (!token) {
                    alert(`ابتدا توکن ${m.label} را در کادر وارد کرده و ذخیره کنید.`);
                    return;
                  }
                  try {
                    let testChatId = "";
                    if (m.messenger === "eitaa") {
                      const ans = prompt("برای ارسال پیام تست در ایتا، شناسه کاربر یا کانال را وارد کنید (اختیاری):", "");
                      if (ans !== null) testChatId = ans.trim();
                    }
                    const res = await fetch("/api/messenger/test", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ messenger: m.messenger, token, chatId: testChatId }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                      alert(`✅ ${data.message}`);
                    } else {
                      alert(`❌ خطا: ${data.error || "اتصال ناموفق بود"}`);
                    }
                  } catch {
                    alert("خطا در برقراری ارتباط با سرور");
                  }
                }}
                className="px-3 py-1.5 rounded-lg border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs font-bold transition shrink-0"
              >
                🔌 تست اتصال
              </button>
            </div>
          ))}
        </div>

        {/* راهنمای کوتاه ایتا */}
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4 mb-6 text-xs text-orange-950 space-y-2">
          <p className="font-black text-sm text-orange-800 flex items-center gap-1.5">
            <span>💡</span> راهنمای ارسال پیش‌فاکتور از طریق ایتا:
          </p>
          <ol className="list-decimal list-inside space-y-1 pr-1 text-gray-700 leading-6">
            <li><strong>ثبت توکن:</strong> توکنی که از سایت ایتایار (<code dir="ltr" className="bg-white/80 px-1.5 py-0.5 rounded text-orange-700 font-mono">eitaayar.ir</code>) دریافت کرده‌اید را در کادر «توکن ربات ایتا» وارد کنید و دکمه «تست اتصال» را بزنید.</li>
            <li><strong>شناسه ارسال:</strong>
              <ul className="list-disc list-inside mr-4 mt-0.5 space-y-0.5 text-gray-600">
                <li>برای ارسال به <strong>کانال</strong>: ربات را ادمین کانال کنید و آیدی کانال را <u>بدون @</u> در شناسه ارتباط وارد کنید (مثال: <code dir="ltr" className="font-mono">my_channel</code>).</li>
                <li>برای ارسال به <strong>مشتری/کاربر</strong>: مشتری باید ابتدا برنامه/بات ایتا را باز کرده و دکمه شروع (Start) را زده باشد؛ سپس شناسه عددی او را در شناسه ارتباط وارد کنید.</li>
              </ul>
            </li>
            <li><strong>ارسال:</strong> در فرم نامه یا پیش‌فاکتور طریقه ارتباط را «ایتا» بگذارید؛ پیش‌فاکتور پس از تأیید در بخش «ارسال پیش‌فاکتور» با یک کلیک فرستاده می‌شود.</li>
          </ol>
        </div>

        {/* ── واتساپ Business API ── */}
        <h3 className="text-sm font-black text-gray-700 mb-3 border-r-4 border-green-500 pr-2">💬 واتساپ (Business Cloud API)</h3>
        <div className="space-y-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="w-40 text-sm font-bold text-gray-700 shrink-0">Access Token</label>
            <input
              type="password"
              defaultValue={getSetting("whatsapp_token")}
              onBlur={(e) => updateSetting("whatsapp_token", e.target.value)}
              placeholder="توکن Meta Business"
              dir="ltr"
              className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm font-mono"
            />
            <span className={`text-xs font-bold ${getSetting("whatsapp_token") ? "text-emerald-600" : "text-gray-400"}`}>
              {getSetting("whatsapp_token") ? "✓" : "—"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="w-40 text-sm font-bold text-gray-700 shrink-0">Phone Number ID</label>
            <input
              type="text"
              defaultValue={getSetting("whatsapp_phone_id")}
              onBlur={(e) => updateSetting("whatsapp_phone_id", e.target.value)}
              placeholder="شناسه عددی شماره در Meta (نه خود شماره)"
              dir="ltr"
              className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm font-mono"
            />
            <span className={`text-xs font-bold ${getSetting("whatsapp_phone_id") ? "text-emerald-600" : "text-gray-400"}`}>
              {getSetting("whatsapp_phone_id") ? "✓" : "—"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="w-40 text-sm font-bold text-gray-700 shrink-0">نسخه Graph API</label>
            <input
              type="text"
              defaultValue={getSetting("whatsapp_api_version")}
              onBlur={(e) => updateSetting("whatsapp_api_version", e.target.value)}
              placeholder="v22.0 (پیش‌فرض)"
              dir="ltr"
              className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm font-mono"
            />
            <button
              type="button"
              onClick={async () => {
                const token = getSetting("whatsapp_token");
                const phoneNumberId = getSetting("whatsapp_phone_id");
                if (!token || !phoneNumberId) {
                  alert("ابتدا Access Token و Phone Number ID واتساپ را وارد و ذخیره کنید.");
                  return;
                }
                try {
                  const ans = prompt("برای ارسال پیام تست، شماره موبایل مقصد را وارد کنید (اختیاری):", "");
                  const res = await fetch("/api/messenger/test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      messenger: "whatsapp",
                      token,
                      phoneNumberId,
                      chatId: ans === null ? "" : ans.trim(),
                    }),
                  });
                  const data = await res.json();
                  alert(data.ok ? `✅ ${data.message}` : `❌ خطا: ${data.error || "اتصال ناموفق بود"}`);
                } catch {
                  alert("خطا در برقراری ارتباط با سرور");
                }
              }}
              className="px-3 py-1.5 rounded-lg border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 text-xs font-bold transition"
            >
              🔌 تست اتصال واتساپ
            </button>
          </div>
        </div>

        {/* راهنمای واتساپ */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 mb-6 text-xs space-y-2">
          <p className="font-black text-sm text-green-800 flex items-center gap-1.5"><span>💡</span> راهنمای ارسال پیش‌فاکتور با واتساپ:</p>
          <ol className="list-decimal list-inside space-y-1 pr-1 text-gray-700 leading-6">
            <li><strong>Access Token:</strong> از <code dir="ltr" className="bg-white/80 px-1.5 py-0.5 rounded text-green-700 font-mono">Meta Business Suite → System User</code> یک توکن <u>دائمی</u> بسازید. توکن‌های موقت داشبورد بعد از ۲۴ ساعت باطل می‌شوند.</li>
            <li><strong>Phone Number ID:</strong> از مسیر <code dir="ltr" className="bg-white/80 px-1.5 py-0.5 rounded text-green-700 font-mono">Meta Developer → WhatsApp → API Setup</code> بردارید. این یک شناسه عددی است، نه خود شماره تلفن.</li>
            <li><strong>شناسه ارتباط مشتری:</strong> شماره موبایل مشتری در فیلد «شناسه ارتباط». فرمت‌های <code dir="ltr" className="font-mono">09123456789</code>، <code dir="ltr" className="font-mono">989123456789</code> و <code dir="ltr" className="font-mono">+98 912 345 6789</code> همگی به‌صورت خودکار به فرمت استاندارد تبدیل می‌شوند.</li>
            <li>
              <strong className="text-amber-700">قانون ۲۴ ساعته واتساپ:</strong> ارسال فایل آزاد فقط تا ۲۴ ساعت بعد از آخرین پیام مشتری مجاز است. اگر این پنجره بسته باشد خطای <code dir="ltr" className="font-mono">131047</code> می‌گیرید؛ راه‌حل: از مشتری بخواهید یک پیام به شماره کسب‌وکار شما بفرستد.
            </li>
            <li><strong>حالت تست:</strong> در حساب توسعه، شماره مقصد باید در Recipient list متا ثبت شده باشد، وگرنه خطای <code dir="ltr" className="font-mono">131021</code> دریافت می‌کنید.</li>
          </ol>
        </div>

        {/* ── SMTP ایمیل ── */}
        <h3 className="text-sm font-black text-gray-700 mb-3 border-r-4 border-purple-500 pr-2">📧 ارسال با ایمیل (SMTP)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="flex items-center gap-3">
            <label className="w-28 text-sm font-bold text-gray-700 shrink-0">سرور SMTP</label>
            <input
              type="text"
              defaultValue={getSetting("smtp_host")}
              onBlur={(e) => updateSetting("smtp_host", e.target.value)}
              placeholder="mail.example.com"
              dir="ltr"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-28 text-sm font-bold text-gray-700 shrink-0">پورت</label>
            <input
              type="text"
              defaultValue={getSetting("smtp_port")}
              onBlur={(e) => updateSetting("smtp_port", e.target.value)}
              placeholder="587"
              dir="ltr"
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="text-xs text-gray-400">۴۶۵=SSL، ۵۸۷=TLS</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-28 text-sm font-bold text-gray-700 shrink-0">نام کاربری</label>
            <input
              type="text"
              defaultValue={getSetting("smtp_user")}
              onBlur={(e) => updateSetting("smtp_user", e.target.value)}
              placeholder="user@example.com"
              dir="ltr"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-28 text-sm font-bold text-gray-700 shrink-0">رمز عبور</label>
            <input
              type="password"
              defaultValue={getSetting("smtp_pass")}
              onBlur={(e) => updateSetting("smtp_pass", e.target.value)}
              placeholder="••••••••"
              dir="ltr"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex items-center gap-3 md:col-span-2">
            <label className="w-28 text-sm font-bold text-gray-700 shrink-0">از آدرس</label>
            <input
              type="text"
              defaultValue={getSetting("smtp_from")}
              onBlur={(e) => updateSetting("smtp_from", e.target.value)}
              placeholder="noreply@example.com"
              dir="ltr"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-4">💡 شناسه ارتباط در نامه = آدرس ایمیل مشتری</p>

        {/* پیدا کردن آیدی‌های چت */}
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs font-bold text-gray-600 mb-2">🔎 پیدا کردن آیدی چت مشتری‌ها:</p>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "bale", label: "بله", directoryOnly: false },
              { key: "telegram", label: "تلگرام", directoryOnly: false },
              { key: "rubika", label: "روبیکا", directoryOnly: false },
              { key: "eitaa", label: "ایتا", directoryOnly: true },
            ].map((m) => (
              <button
                key={m.key}
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/messenger/updates?messenger=${m.key}`);
                    const json = await res.json();
                    if (json.error) {
                      alert(json.error);
                    } else if (json.chats && json.chats.length > 0) {
                      const list = json.chats.map((c: {
                        id: string;
                        name: string;
                        username?: string;
                        lastMessage?: string;
                        linkedCompanies?: Array<{ id: number; name: string }>;
                      }) => {
                        const profile = `${c.name}${c.username ? ` (@${c.username})` : ""}`;
                        const company = c.linkedCompanies?.length
                          ? `شرکت: ${c.linkedCompanies.map((item) => item.name).join("، ")}`
                          : "هنوز به شرکتی متصل نشده";
                        const lastMessage = c.lastMessage
                          ? `${m.directoryOnly ? "اطلاعات ثبت‌شده" : "آخرین پیام"}: ${c.lastMessage}`
                          : "";
                        return `${profile}\nشناسه: ${c.id}\n${company}${lastMessage ? `\n${lastMessage}` : ""}`;
                      }).join("\n\n──────────\n\n");
                      const heading = m.directoryOnly ? "شناسه‌های ثبت‌شده" : "آیدی‌های اخیر";
                      alert(`${heading} ${m.label}:\n\n${list}${json.note ? `\n\nتوضیح: ${json.note}` : ""}`);
                    } else {
                      alert(json.note || `${m.directoryOnly ? "هیچ شناسه‌ای" : "هیچ پیامی"} برای ${m.label} ثبت نشده است`);
                    }
                  } catch {
                    alert("خطا در دریافت آیدی‌ها");
                  }
                }}
                className="bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 px-3 py-1.5 rounded-lg text-xs font-bold transition"
              >
                {m.directoryOnly ? "شناسه‌های ثبت‌شده" : "آیدی‌های اخیر"} {m.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-5 text-gray-500">
            بله، تلگرام و روبیکا از پیام‌های ورودی بات خوانده می‌شوند. ایتایار API دریافت پیام ورودی ندارد؛ بنابراین شناسه‌های ایتا از نامه‌های قبلی و شرکت‌های ثبت‌شده در همین سیستم نمایش داده می‌شوند.
          </p>
        </div>
      </div>

      {/* Header/Footer Settings */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-bold text-lg mb-4">🖼️ تنظیمات سربرگ و ته‌برگ PDF</h2>
        <p className="text-sm text-gray-500 mb-4">این تصاویر در خروجی PDF پیش‌فاکتورها استفاده می‌شوند.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Header Image */}
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="font-bold text-gray-700">سربرگ (بالای صفحه)</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">ارتفاع:</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="5"
                  value={getSetting("header_height") || "2"}
                  onChange={(e) => {
                    setSettings(settings.map(s => s.settingKey === "header_height" ? { ...s, settingValue: e.target.value } : s));
                  }}
                  onBlur={(e) => updateSetting("header_height", e.target.value)}
                  className="w-16 px-2 py-1 border rounded text-center text-sm"
                />
                <span className="text-xs text-gray-500">cm</span>
              </div>
            </div>
            {getSetting("header_image") ? (
              <div className="relative">
                <img 
                  src={getSetting("header_image")} 
                  alt="Header" 
                  className="w-full h-20 object-contain bg-gray-50 rounded"
                />
                <button
                  onClick={() => updateSetting("header_image", "")}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs"
                >
                  ×
                </button>
              </div>
            ) : (
              <div 
                onClick={() => headerInputRef.current?.click()}
                className="h-20 bg-gray-50 rounded flex items-center justify-center cursor-pointer hover:bg-gray-100 transition"
              >
                <span className="text-gray-400 text-sm">
                  {uploading === "header_image" ? "در حال آپلود..." : "کلیک برای آپلود"}
                </span>
              </div>
            )}
            <input
              ref={headerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "header_image")}
            />
          </div>

          {/* Footer Image */}
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="font-bold text-gray-700">ته‌برگ (پایین صفحه)</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">ارتفاع:</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="5"
                  value={getSetting("footer_height") || "1"}
                  onChange={(e) => {
                    setSettings(settings.map(s => s.settingKey === "footer_height" ? { ...s, settingValue: e.target.value } : s));
                  }}
                  onBlur={(e) => updateSetting("footer_height", e.target.value)}
                  className="w-16 px-2 py-1 border rounded text-center text-sm"
                />
                <span className="text-xs text-gray-500">cm</span>
              </div>
            </div>
            {getSetting("footer_image") ? (
              <div className="relative">
                <img 
                  src={getSetting("footer_image")} 
                  alt="Footer" 
                  className="w-full h-16 object-contain bg-gray-50 rounded"
                />
                <button
                  onClick={() => updateSetting("footer_image", "")}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs"
                >
                  ×
                </button>
              </div>
            ) : (
              <div 
                onClick={() => footerInputRef.current?.click()}
                className="h-16 bg-gray-50 rounded flex items-center justify-center cursor-pointer hover:bg-gray-100 transition"
              >
                <span className="text-gray-400 text-sm">
                  {uploading === "footer_image" ? "در حال آپلود..." : "کلیک برای آپلود"}
                </span>
              </div>
            )}
            <input
              ref={footerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "footer_image")}
            />
          </div>

          {/* Stamp/Signature Image */}
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 md:col-span-2">
            <label className="font-bold text-gray-700 block mb-3">مهر و امضا</label>
            {getSetting("stamp_image") ? (
              <div className="relative inline-block max-w-full">
                {/* پیش‌نمایش با همان «اندازه اصلیِ واقعیِ فایل» — دقیقاً همان چیزی که
                    در چاپ و خروجی PDF خواهید دید؛ هیچ تغییر ابعادی اعمال نمی‌شود */}
                <img
                  src={getSetting("stamp_image")}
                  alt="Stamp"
                  className="max-w-full h-auto bg-gray-50 rounded"
                />
                <button
                  onClick={() => updateSetting("stamp_image", "")}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs"
                >
                  ×
                </button>
              </div>
            ) : (
              <div 
                onClick={() => stampInputRef.current?.click()}
                className="h-24 w-48 bg-gray-50 rounded flex items-center justify-center cursor-pointer hover:bg-gray-100 transition"
              >
                <span className="text-gray-400 text-sm">
                  {uploading === "stamp_image" ? "در حال آپلود..." : "کلیک برای آپلود"}
                </span>
              </div>
            )}
            <input
              ref={stampInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "stamp_image")}
            />
            <p className="text-xs text-gray-400 mt-2">این تصویر در انتهای سند (چاپ و خروجی PDF) دقیقاً با همان «اندازه اصلیِ واقعیِ فایل» نمایش داده می‌شود؛ هیچ‌گونه تغییر ابعاد، کوچک‌نمایی یا برشی اعمال نمی‌شود.</p>
          </div>

          {/* متن سپاس و امضا — دقیقاً خط بالای مهر و امضا در پیش‌فاکتور */}
          <div className="border-2 border-indigo-200 bg-indigo-50/50 rounded-xl p-4 md:col-span-2">
            <label className="font-bold text-indigo-800 block mb-1">✍️ متن سپاس و امضا (دقیقاً خط بالای «مهر و امضا» در پیش‌فاکتور)</label>
            <p className="text-xs text-gray-500 mb-3">
              این متن در انتهای همه پیش‌فاکتورها (مشاهده، چاپ و PDF) دقیقاً در خط بالای مهر و امضا، به‌صورت وسط‌چین درج می‌شود.
              برای تغییر نام شرکت، همین‌جا را ویرایش و ذخیره کنید.
            </p>
            <textarea
              dir="rtl"
              rows={2}
              value={getSetting(COMPANY_SIGNATURE_SETTING_KEY) || OFFICIAL_SIGNATURE}
              onChange={(e) => {
                const v = e.target.value;
                setSettings((prev) => {
                  const exists = prev.some((s) => s.settingKey === COMPANY_SIGNATURE_SETTING_KEY);
                  return exists
                    ? prev.map((s) => (s.settingKey === COMPANY_SIGNATURE_SETTING_KEY ? { ...s, settingValue: v } : s))
                    : [...prev, { id: -999, settingKey: COMPANY_SIGNATURE_SETTING_KEY, settingValue: v, year: null }];
                });
              }}
              className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-center font-bold text-gray-800 leading-7"
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={async () => {
                  await updateSetting(COMPANY_SIGNATURE_SETTING_KEY, getSetting(COMPANY_SIGNATURE_SETTING_KEY) || OFFICIAL_SIGNATURE);
                  const w = window as unknown as { showToast?: (m: string) => void };
                  if (w.showToast) w.showToast("متن سپاس و امضا ذخیره شد");
                  else alert("متن سپاس و امضا ذخیره شد ✓");
                }}
                className="bg-indigo-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-indigo-700 transition font-bold"
              >
                ذخیره متن سپاس
              </button>
              <button
                onClick={async () => {
                  await updateSetting(COMPANY_SIGNATURE_SETTING_KEY, OFFICIAL_SIGNATURE);
                  alert("به متن پیش‌فرض بازگشت ✓");
                }}
                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-2 rounded-lg"
                title={OFFICIAL_SIGNATURE}
              >
                بازگشت به پیش‌فرض
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Proforma Type Texts */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="font-bold text-lg mb-4">متون پیش‌فرض انواع پیش فاکتور</h2>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
          {types.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedType(t)}
              className={`px-4 py-2 rounded-lg text-sm transition ${
                selectedType?.id === t.id ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {selectedType && (
          <div className="space-y-4 border-t pt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">متن قبل از اقلام</label>
              <textarea
                rows={4}
                value={selectedType.defaultTextBefore || ""}
                onChange={(e) => setSelectedType({ ...selectedType, defaultTextBefore: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">متن بعد از اقلام</label>
              <textarea
                rows={4}
                value={selectedType.defaultTextAfter || ""}
                onChange={(e) => setSelectedType({ ...selectedType, defaultTextAfter: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">متن امضا</label>
              <textarea
                rows={3}
                value={selectedType.signatureText || ""}
                onChange={(e) => setSelectedType({ ...selectedType, signatureText: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">صفحه آخر</label>
              <textarea
                rows={4}
                value={selectedType.defaultTextLastPage || ""}
                onChange={(e) => setSelectedType({ ...selectedType, defaultTextLastPage: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              onClick={saveType}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl font-medium transition disabled:opacity-50"
            >
              {saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
            </button>
          </div>
        )}
      </div>

      {/* ── طراح بصری قالب چاپ ── */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-bold text-lg mb-1">🎨 طراح بصری قالب چاپ</h2>
        <p className="text-sm text-gray-500 mb-5">رنگ‌ها، بخش‌ها و ستون‌های خروجی چاپ/PDF را همین‌جا تنظیم کنید — پیش‌نمایش زنده پایین صفحه.</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* کنترل‌ها */}
          <div className="space-y-6">
            {/* رنگ‌ها */}
            <div>
              <h3 className="font-bold text-gray-700 mb-3">رنگ‌ها</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">رنگ اصلی (عنوان و دکمه)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={getSetting("print_primary_color") || "#4f46e5"}
                      onChange={(e) => updateSetting("print_primary_color", e.target.value)}
                      className="w-12 h-10 border border-gray-300 rounded-lg cursor-pointer"
                    />
                    <input
                      type="text"
                      value={getSetting("print_primary_color") || "#4f46e5"}
                      onChange={(e) => updateSetting("print_primary_color", e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">پس‌زمینه باکس اطلاعات</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={getSetting("print_header_bg") || "#f8fafc"}
                      onChange={(e) => updateSetting("print_header_bg", e.target.value)}
                      className="w-12 h-10 border border-gray-300 rounded-lg cursor-pointer"
                    />
                    <input
                      type="text"
                      value={getSetting("print_header_bg") || "#f8fafc"}
                      onChange={(e) => updateSetting("print_header_bg", e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* بخش‌ها */}
            <div>
              <h3 className="font-bold text-gray-700 mb-3">بخش‌های نمایشی</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "print_show_text_before", label: "سربرگ متنی" },
                  { key: "print_show_text_after", label: "شرایط و توضیحات" },
                  { key: "print_show_signature", label: "امضا" },
                  { key: "print_show_last_page", label: "ته‌برگ (صفحه آخر)" },
                ].map((s) => (
                  <label key={s.key} className="flex items-center gap-2 cursor-pointer bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={getSetting(s.key) !== "0"}
                      onChange={(e) => updateSetting(s.key, e.target.checked ? "1" : "0")}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span className="text-sm text-gray-700">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* ستون‌های جدول اقلام */}
            <div>
              <h3 className="font-bold text-gray-700 mb-3">ستون‌های جدول اقلام</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { key: "print_col_quantity", label: "تعداد" },
                  { key: "print_col_point", label: "نقطه/پارامتر" },
                  { key: "print_col_unit_price", label: "قیمت واحد" },
                  { key: "print_col_total", label: "مبلغ کل" },
                  { key: "print_col_calib", label: "محل کالیبره" },
                ].map((s) => (
                  <label key={s.key} className="flex items-center gap-2 cursor-pointer bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={getSetting(s.key) !== "0"}
                      onChange={(e) => updateSetting(s.key, e.target.checked ? "1" : "0")}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span className="text-sm text-gray-700">{s.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">ستون‌های «ردیف» و «شرح» همیشه ثابت هستند.</p>
            </div>
          </div>

          {/* پیش‌نمایش زنده */}
          <div>
            <h3 className="font-bold text-gray-700 mb-3">پیش‌نمایش زنده</h3>
            <div className="border border-gray-300 rounded-xl overflow-hidden shadow-inner bg-white" dir="rtl">
              {/* سربرگ تصویری (اگر تنظیم شده) */}
              {getSetting("header_image") && (
                <div className="border-b border-gray-200 bg-gray-50 p-1">
                  <img src={getSetting("header_image")} alt="سربرگ" className="w-full object-contain" style={{ maxHeight: `${(parseFloat(getSetting("header_height") || "2") * 30)}px` }} />
                </div>
              )}
              {/* عنوان */}
              <div className="text-center font-bold text-lg py-3" style={{ color: getSetting("print_primary_color") || "#4f46e5" }}>
                پیش فاکتور
              </div>
              {/* باکس اطلاعات */}
              <div className="mx-3 mb-2 flex justify-between text-xs p-3 rounded-lg border border-gray-200" style={{ background: getSetting("print_header_bg") || "#f8fafc" }}>
                <div>
                  <p><strong>شرکت:</strong> شرکت نمونه</p>
                  <p><strong>تاریخ:</strong> ۱۴۰۴/۰۳/۲۰</p>
                  <p><strong>اعتبار:</strong> ۳۰ روز</p>
                </div>
                <div>
                  <p><strong>شماره:</strong> PF-1404-0001</p>
                  <p><strong>نوع:</strong> کالیبراسیون</p>
                </div>
              </div>
              {/* جدول */}
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 py-1.5 px-2">ردیف</th>
                    <th className="border border-gray-300 py-1.5 px-2">شرح</th>
                    {getSetting("print_col_quantity") !== "0" && <th className="border border-gray-300 py-1.5 px-2">تعداد</th>}
                    {getSetting("print_col_point") !== "0" && <th className="border border-gray-300 py-1.5 px-2">نقطه</th>}
                    {getSetting("print_col_unit_price") !== "0" && <th className="border border-gray-300 py-1.5 px-2">قیمت واحد</th>}
                    {getSetting("print_col_total") !== "0" && <th className="border border-gray-300 py-1.5 px-2">مبلغ کل</th>}
                    {getSetting("print_col_calib") !== "0" && <th className="border border-gray-300 py-1.5 px-2">محل کالیبره</th>}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 py-1.5 px-2 text-center">۱</td>
                    <td className="border border-gray-300 py-1.5 px-2">آون</td>
                    {getSetting("print_col_quantity") !== "0" && <td className="border border-gray-300 py-1.5 px-2 text-center">۲</td>}
                    {getSetting("print_col_point") !== "0" && <td className="border border-gray-300 py-1.5 px-2 text-center">۳</td>}
                    {getSetting("print_col_unit_price") !== "0" && <td className="border border-gray-300 py-1.5 px-2 text-center">۱٬۰۰۰٬۰۰۰</td>}
                    {getSetting("print_col_total") !== "0" && <td className="border border-gray-300 py-1.5 px-2 text-center">۶٬۰۰۰٬۰۰۰</td>}
                    {getSetting("print_col_calib") !== "0" && <td className="border border-gray-300 py-1.5 px-2 text-center">آزمایشگاه</td>}
                  </tr>
                </tbody>
              </table>
              {/* بخش‌های متنی */}
              {getSetting("print_show_text_before") !== "0" && (
                <div className="mx-3 my-2 p-2 rounded text-[11px] bg-blue-50" style={{ borderRight: `3px solid ${getSetting("print_primary_color") || "#4f46e5"}` }}>
                  متن سربرگ...
                </div>
              )}
              {getSetting("print_show_text_after") !== "0" && (
                <div className="mx-3 my-2 p-2 rounded text-[11px] bg-amber-50 border border-amber-200">شرایط و توضیحات...</div>
              )}
              {getSetting("print_show_signature") !== "0" && (
                <div className="mx-3 my-2 p-2 text-[11px] text-left">امضا...</div>
              )}
              {getSetting("print_show_last_page") !== "0" && (
                <div className="mx-3 my-2 p-2 rounded text-[11px] bg-green-50 border border-green-200">ته‌برگ (صفحه آخر)...</div>
              )}
              {/* دکمه نمونه */}
              <div className="text-center py-3">
                <span className="inline-block text-white text-xs font-bold px-5 py-2 rounded-lg" style={{ background: getSetting("print_primary_color") || "#4f46e5" }}>
                  🖨️ چاپ
                </span>
              </div>
              {/* ته‌برگ تصویری (اگر تنظیم شده) */}
              {getSetting("footer_image") && (
                <div className="border-t border-gray-200 bg-gray-50 p-1">
                  <img src={getSetting("footer_image")} alt="ته‌برگ" className="w-full object-contain" style={{ maxHeight: `${(parseFloat(getSetting("footer_height") || "1") * 30)}px` }} />
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              💡 سربرگ و ته‌برگ تصویری از بخش «تنظیمات سربرگ و ته‌برگ PDF» (بالا) آپلود می‌شوند. در خروجی چاپ، فضای کافی برایشان رزرو می‌شود تا متن روی آن‌ها نیفتد.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
