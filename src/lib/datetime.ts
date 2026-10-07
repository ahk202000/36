/**
 * یکپارچه‌سازی نمایش تاریخ/ساعت فعالیت‌ها در سراسر سیستم.
 *
 * ایراد قبلی: ساعت فعالیت نامه‌ها در بعضی بخش‌ها درست و در بعضی بخش‌ها نادرست
 * نمایش داده می‌شد، چون:
 *  ۱) هر کامپوننت به شکلی متفاوت رشته زمانی دیتابیس را parse می‌کرد
 *     (بعضی با timeZone: "Asia/Tehran" و بعضی بدون مشخص‌کردن منطقه زمانی)؛
 *  ۲) رشته‌های بدون پسوند منطقه زمانی (مثل «2026-03-24T09:00:00») به‌جای UTC
 *     به‌عنوان زمان محلی مرورگر تفسیر می‌شدند.
 *
 * راه‌حل: همه خروجی‌های زمانی از یک تابع عبور می‌کنند؛ رشته بدون منطقه به‌عنوان
 * UTC تفسیر می‌شود و نمایش همیشه در منطقه «Asia/Tehran» انجام می‌گیرد.
 */

const TEHRAN_TZ = "Asia/Tehran";

/** تبدیل مقدار زمانی دیتابیس به Date — رشته بدون منطقه زمانی به‌عنوان UTC تلقی می‌شود */
export function parseDbDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  let s = String(value).trim();
  if (!s) return null;
  // اگر رشته هیچ پسوند منطقه‌ای (Z یا ±hh:mm) ندارد، UTC در نظر می‌گیریم
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    s = s.includes("T") ? `${s}Z` : `${s.replace(" ", "T")}Z`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** تاریخ شمسی (تهران) — خروجی نمونه: ۱۴۰۴/۰۱/۱۲ */
export function formatJalaliDate(value: Date | string | null | undefined): string {
  const d = parseDbDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("fa-IR", { timeZone: TEHRAN_TZ });
}

/** ساعت (تهران) — خروجی نمونه: ۱۴:۳۰ */
export function formatJalaliTime(value: Date | string | null | undefined): string {
  const d = parseDbDate(value);
  if (!d) return "";
  return d.toLocaleTimeString("fa-IR", { timeZone: TEHRAN_TZ, hour: "2-digit", minute: "2-digit" });
}

/** تاریخ + ساعت شمسی (تهران) به‌صورت یکجا */
export function formatJalaliDateTime(value: Date | string | null | undefined): string {
  const d = parseDbDate(value);
  if (!d) return "—";
  const date = d.toLocaleDateString("fa-IR", { timeZone: TEHRAN_TZ });
  const time = d.toLocaleTimeString("fa-IR", { timeZone: TEHRAN_TZ, hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`.trim();
}
