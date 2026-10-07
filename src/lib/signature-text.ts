/**
 * متن رسمی امضای انتهای پیش‌فاکتور (خروجی PDF / چاپ / نمایش)
 *
 * طبق درخواست مدیریت، متن رسمی:
 *   «با سپاس فراوان
 *     شرکت بهینه سنجش آزما (بهسا)»
 * است. این متن دقیقاً در خط بالای «مهر و امضا» در انتهای پیش‌فاکتور قرار می‌گیرد
 * و از بخش تنظیمات (کلید company_signature) به‌راحتی قابل تغییر است.
 */
export const OFFICIAL_SIGNATURE =
  "با سپاس فراوان\nشرکت بهینه سنجش آزما (بهسا)";

/** کلید تنظیمات سراسری متن سپاس/امضا */
export const COMPANY_SIGNATURE_SETTING_KEY = "company_signature";

/**
 * متون قدیمی پیش‌فرض امضا که قبلاً در دیتابیس (انواع پیش‌فاکتور و
 * پیش‌فاکتورهای صادرشدهٔ قدیمی) ذخیره شده‌اند. اگر امضا دقیقاً یکی از
 * این‌ها باشد، به‌طور خودکار با متن رسمی جدید جایگزین می‌شود.
 */
const LEGACY_SIGNATURES = new Set([
  "با سپاس فراوان\nشرکت مهندسی بهینه سنجش (پارت آریا تحلیل گر)",
  "با سپاس فراوان — شرکت مهندسی بهینه سنجش (پارت آریا تحلیل گر)",
  "با تشکر و احترام\nمدیریت شرکت",
  "با تشکر و احترام\nمدیریت",
  "با تشکر و احترام",
  "با تشکر\nمدیریت شرکت",
  "با تشکر\nمدیریت",
  "با تشکر",
]);

/** خطوط تبریک قدیمی که به خط جدید «با سپاس فراوان» تبدیل می‌شوند */
const LEGACY_GREETING_LINES = new Set(["با تشکر و احترام", "با تشکر"]);

/**
 * متن رسمی مؤثر: اگر در تنظیمات «company_signature» مقداری ثبت شده باشد همان،
 * در غیر این‌صورت متن رسمی پیش‌فرض.
 */
export function resolveOfficialSignature(
  settingsMap?: Record<string, string> | null
): string {
  const fromSettings = (settingsMap?.[COMPANY_SIGNATURE_SETTING_KEY] ?? "")
    .replace(/\r/g, "")
    .trim();
  return fromSettings || OFFICIAL_SIGNATURE;
}

/**
 * نرمال‌سازی متن امضا:
 * - خالی یا متن‌های قدیمی پیش‌فرض → متن رسمی (از تنظیمات یا پیش‌فرض سیستم)
 * - در امضای سفارشی، خط تبریک قدیمی («با تشکر و احترام»/«با تشکر») → «با سپاس فراوان»
 *
 * @param raw متن ذخیره‌شده روی پیش‌فاکتور/نوع پیش‌فاکتور
 * @param official متن رسمی مؤثر (خروجی resolveOfficialSignature) — اختیاری
 */
export function normalizeSignatureText(
  raw: string | null | undefined,
  official?: string
): string {
  const effective = official && official.trim() ? official : OFFICIAL_SIGNATURE;
  const t = (raw ?? "").replace(/\r/g, "").trim();
  if (!t) return effective;
  if (LEGACY_SIGNATURES.has(t)) return effective;
  const lines = t.split("\n").map((line) =>
    LEGACY_GREETING_LINES.has(line.trim()) ? "با سپاس فراوان" : line
  );
  const joined = lines.join("\n").trim();
  return joined || effective;
}

/* ─────────────── حذف بند گارانتی ─────────────── */

/** آیا یک خط، بند گارانتی است؟ (با/بدون نقطه‌گذاری • - *) */
export function isWarrantyLine(line: string): boolean {
  const t = (line || "").trim();
  if (!t) return false;
  return t.includes("گارانتی");
}

/**
 * حذف کامل «بند گارانتی» از متون چندخطی پیش‌فاکتور (متن بعد از اقلام و ...).
 * هر خطی که واژه «گارانتی» داشته باشد حذف می‌شود؛ کاراکترهای بولتِ باقی‌مانده
 * روی خط خالی هم پاک می‌شوند.
 */
export function stripWarrantyLines(raw: string | null | undefined): string {
  const t = (raw ?? "").replace(/\r/g, "");
  if (!t) return "";
  return t
    .split("\n")
    .filter((line) => !isWarrantyLine(line))
    .map((line) => line.replace(/^[•\-\*ـ▪◦◾]+\s*$/, "")) // بولتِ تنهای باقی‌مانده
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
