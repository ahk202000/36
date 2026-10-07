import * as jalaali from "jalaali-js";

/**
 * محاسبه وضعیت انقضای پیش‌فاکتور بر اساس «تاریخ صدور شمسی + مدت اعتبار (روز)».
 *
 * - issueDate به فرمت «۱۴۰۴/۰۵/۱۲» (ارقام انگلیسی) در دیتابیس ذخیره می‌شود.
 * - daysToExpiry: تعداد روزهای باقی‌مانده تا انقضا (منفی یعنی منقضی شده).
 * - state:
 *    ok       → بیش از ۳ روز مانده
 *    expiring → ۰ تا ۳ روز مانده («در حال انقضا» — مثلاً ۱ روز به اتمام)
 *    expired  → منقضی شده
 */
export type ExpiryState = "ok" | "expiring" | "expired";

export interface ExpiryInfo {
  expiryDate: string; // تاریخ انقضا شمسی YYYY/MM/DD
  daysToExpiry: number;
  state: ExpiryState;
}

/** چند روز مانده تا انقضا به‌عنوان «در حال انقضا» علامت بخورد (مثلاً ۱ روز مانده) */
export const EXPIRY_WARNING_DAYS = 3;

const JALALI_RE = /^\s*(\d{3,4})[/-](\d{1,2})[/-](\d{1,2})\s*$/;

function parseJalali(dateStr: string | null | undefined): { jy: number; jm: number; jd: number } | null {
  if (!dateStr) return null;
  const m = JALALI_RE.exec(String(dateStr));
  if (!m) return null;
  const jy = parseInt(m[1]);
  const jm = parseInt(m[2]);
  const jd = parseInt(m[3]);
  if (!jalaali.isValidJalaaliDate(jy, jm, jd)) return null;
  return { jy, jm, jd };
}

function jalaliToUtcMs(jy: number, jm: number, jd: number): number {
  const g = jalaali.toGregorian(jy, jm, jd);
  return Date.UTC(g.gy, g.gm - 1, g.gd);
}

function msToJalaliParts(ms: number): { jy: number; jm: number; jd: number } {
  const d = new Date(ms);
  return jalaali.toJalaali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function formatJalali(j: { jy: number; jm: number; jd: number }): string {
  const mm = String(j.jm).padStart(2, "0");
  const dd = String(j.jd).padStart(2, "0");
  return `${j.jy}/${mm}/${dd}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeProformaExpiry(
  issueDate: string | null | undefined,
  validityDays: number | null | undefined
): ExpiryInfo | null {
  const parsed = parseJalali(issueDate);
  const days = Number(validityDays ?? 0);
  if (!parsed || !Number.isFinite(days) || days <= 0) return null;

  const issueMs = jalaliToUtcMs(parsed.jy, parsed.jm, parsed.jd);
  const expiryMs = issueMs + days * DAY_MS;

  // «امروز» شمسی — صحت محاسبه به‌ازای تاریخ صدورهای شمسی تضمین می‌شود
  const now = new Date();
  const todayJ = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const todayMs = jalaliToUtcMs(todayJ.jy, todayJ.jm, todayJ.jd);

  const daysToExpiry = Math.round((expiryMs - todayMs) / DAY_MS);
  const state: ExpiryState =
    daysToExpiry < 0 ? "expired" : daysToExpiry <= EXPIRY_WARNING_DAYS ? "expiring" : "ok";

  return {
    expiryDate: formatJalali(msToJalaliParts(expiryMs)),
    daysToExpiry,
    state,
  };
}
