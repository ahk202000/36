import moment from "jalali-moment";

// تبدیل اعداد انگلیسی به فارسی
export function toPersianDigits(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return "";
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return str.toString().replace(/[0-9]/g, (d) => persianDigits[parseInt(d)]);
}

// تبدیل اعداد فارسی به انگلیسی
export function toEnglishDigits(str: string): string {
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  let result = str;
  for (let i = 0; i < 10; i++) {
    result = result.replace(new RegExp(persianDigits[i], "g"), i.toString());
    result = result.replace(new RegExp(arabicDigits[i], "g"), i.toString());
  }
  return result;
}

export function toJalali(date?: Date | string | null): string {
  if (!date) return moment().locale("fa").format("jYYYY/jMM/jDD");
  return moment(date).locale("fa").format("jYYYY/jMM/jDD");
}

export function currentJalaliYear(): number {
  return parseInt(moment().locale("fa").format("jYYYY"));
}

// فرمت قیمت بدون اعشار - ۰۰ بعد از اعشار حذف می‌شود
export function formatPrice(num: number | string | null | undefined): string {
  if (num === null || num === undefined || num === "") return "۰";
  const n = typeof num === "string" ? parseFloat(num) : num;
  if (isNaN(n)) return "۰";
  // رند به نزدیکترین ریال و بدون اعشار
  return Math.round(n).toLocaleString("fa-IR");
}

export function formatNumber(num: number | string | null | undefined): string {
  if (num === null || num === undefined) return "۰";
  const n = typeof num === "string" ? parseFloat(num) : num;
  if (isNaN(n)) return "۰";
  return Math.round(n).toLocaleString("fa-IR");
}

// فرمت تعداد/مقدار — صفرهای اضافی اعشار (مثل ۱.۰۰) نمایش داده نمی‌شود
export function formatQuantity(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "۰";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "۰";
  const out = Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, "");
  return toPersianDigits(out);
}

export function formatPriceWithUnit(num: number | string | null | undefined, unit = "ریال"): string {
  return `${formatPrice(num)} ${unit}`;
}

/**
 * فرمت «درصد» برای خروجی چاپ/PDF —
 * صفرهای اضافه اعشار (مثل ۱۰.۰۰ یا ۰۰) حذف می‌شود و اگر مقدار صفر/نامعتبر باشد
 * رشته خالی برمی‌گردد تا چیزی مثل «ارزش افزوده (۰۰%)» در سند دیده نشود.
 */
export function formatPercentValue(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "string" ? parseFloat(toEnglishDigits(v.trim())) : v;
  if (!isFinite(n) || n === 0) return "";
  const rounded = parseFloat(n.toFixed(2));
  if (rounded === 0) return "";
  return String(rounded);
}

/**
 * پسوند درصد داخل پرانتز — اگر درصد صفر/خالی باشد هیچ چیزی چاپ نمی‌شود.
 * مثال: percentSuffix("10.00") → " (۱۰%)"  |  percentSuffix("0.00") → ""
 */
export function percentSuffix(v: number | string | null | undefined, persian = true): string {
  const s = formatPercentValue(v);
  if (!s) return "";
  return ` (${persian ? toPersianDigits(s) : s}%)`;
}

/**
 * نرمال‌سازی مقدار قیمت برای فیلدهای ورودی.
 * ستون‌های numeric(18,2) پستگرس مقادیر را به صورت "1500000.00" برمی‌گردانند؛
 * اگر این رشته مستقیم داخل ورودیِ جداکننده هزارگان برود، نقطه اعشار حذف شده
 * و عدد دو رقم بزرگ‌تر نمایش داده می‌شود. این تابع همیشه عدد صحیح ریالی برمی‌گرداند.
 */
export function normalizePriceValue(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "0";
  const s = toEnglishDigits(String(v)).replace(/,/g, "").trim();
  if (s === "" || s === "-") return "0";
  const n = parseFloat(s);
  if (isNaN(n) || !isFinite(n)) return "0";
  return String(Math.round(n));
}

/** نرمال‌سازی تعداد/مقدار — حذف صفرهای اضافیِ اعشار مثل "1.00" → "1" */
export function normalizeQuantityValue(v: number | string | null | undefined, fallback = "1"): string {
  if (v === null || v === undefined || v === "") return fallback;
  const s = toEnglishDigits(String(v)).replace(/,/g, "").trim();
  if (s === "") return fallback;
  const n = parseFloat(s);
  if (isNaN(n) || !isFinite(n)) return fallback;
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(4)));
}

/**
 * ساخت لینک قابل‌مشاهده برای فایل ذخیره‌شده در سیستم.
 * مسیرهای قدیمی (uploads/... یا بدون اسلش ابتدایی) به روت سرو فایل تبدیل می‌شوند
 * تا فایل‌های قرارداد/پیوست همیشه «قابل مشاهده» باشند.
 */
export function storedFileHref(p: string | null | undefined): string {
  if (!p) return "";
  const s = String(p).trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/api/files/")) return s;
  const stripped = s.replace(/^\/+/, "").replace(/^uploads\//i, "");
  return `/api/files/${stripped.split("/").map(encodeURIComponent).join("/")}`;
}

export function generateLetterNumber(format: string, sequence: number, year: number): string {
  return format
    .replace(/\{YEAR\}/g, year.toString())
    .replace(/\{SEQ\}/g, sequence.toString().padStart(4, "0"))
    .replace(/\{NUM\}/g, sequence.toString());
}

/**
 * نمایش شماره سند (نامه/پیش‌فاکتور) در قالب‌های HTML.
 * شماره‌هایی مثل «PF-1404-0012» در متن راست‌به‌چپ به‌خاطر خط تیره جابه‌جا
 * نمایش داده می‌شوند؛ با ایزوله‌کردن جهت (LTR) ترتیب اجزا حفظ می‌شود.
 */
export function ltrNumberHtml(v: string | number | null | undefined, persian = true): string {
  if (v === null || v === undefined || v === "") return "";
  const text = persian ? toPersianDigits(v) : String(v);
  return `<bdi dir="ltr" style="unicode-bidi:isolate;direction:ltr;display:inline-block;">${text}</bdi>`;
}

/**
 * نرمال‌سازی نام برای تشخیص تکراری بودن مشتری/تجهیز.
 * «آدورا طب»، «آدوراطب»، «آدورا‌طب» (نیم‌فاصله) و «ادورا طب» همگی یکسان تلقی می‌شوند.
 */
export function normalizeNameKey(input: string | null | undefined): string {
  if (!input) return "";
  let s = toEnglishDigits(String(input));
  s = s
    // یکسان‌سازی حروف عربی/فارسی
    .replace(/[يئى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[أإآ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ة/g, "ه")
    // حذف اعراب و علائم
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    // حذف همه فاصله‌ها، نیم‌فاصله‌ها و کاراکترهای جداکننده
    .replace(/[\s\u200c\u200b\u200d\u200e\u200f\u00a0_\-–—.،,؛;:()\[\]{}«»"'`]/g, "")
    .toLowerCase();
  return s;
}

// ── مدیریت لیست «نوع درخواست» و «طریقه ارتباط» ──
// 📍 مکان افزودن/حذف گزینه‌ها همین‌جاست — فقط همین فایل را ویرایش کنید
// و گزینه جدید را به آرایه مربوطه اضافه کنید؛ دیگر نیازی به تغییر فایل دیگری نیست.
// توجه: مقدار «تاییدیه استعلام» برای باکس تاییدیه فروش سیستمی است — آن را حذف نکنید.
export const REQUEST_TYPES = [
  "استعلام",
  "تاییدیه استعلام",
  "پیش فاکتور",
  "درخواست تعمیرات",
  "درخواست کالیبراسیون",
  "سایر",
];

export const COMMUNICATION_METHODS = [
  "بله",
  "ایمیل",
  "تلفن",
  "فکس",
  "حضوری",
  "واتساپ",
  "سایر",
];

export const ATTACHMENT_TYPES = [
  "تاییدیه استعلام",
  "نامه اصلی",
  "استعلام",
  "مدرک فنی",
  "سایر",
];

export const PROFORMA_TYPE_CODES = [
  { code: "calibration", name: "کالیبراسیون" },
  { code: "qualification", name: "احراز کیفیت" },
  { code: "thermal_mapping", name: "نقشه دمایی" },
  { code: "calibration_sale", name: "فروش" },
  { code: "repair", name: "تعمیرات" },
  { code: "setad", name: "سامانه ستاد" },
  { code: "other", name: "سایر" },
];

export const DEPARTMENTS = [
  "مدیریت",
  "واحد بازرگانی",
  "واحد فنی",
  "واحد مالی",
  "دبیرخانه",
];

export const CALIBRATION_LOCATIONS = [
  "سایت مشتری",
  "آزمایشگاه بهسا",
  "سایت مشتری -آزمایشگاه بهسا",
];

export const PROFORMA_STATUS_LABELS: Record<string, string> = {
  draft: "پیش‌نویس",
  pending: "در انتظار تایید",
  approved: "تایید شده",
  rejected: "رد شده",
  revised: "نیاز به اصلاح",
  correction_send: "اصلاح و ارسال",
  ready_to_send: "آماده ارسال به مشتری",
  sent: "ارسال شده به مشتری",
  final_sale: "فروش قطعی",
  archived: "بایگانی",
};
