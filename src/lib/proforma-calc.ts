/**
 * محاسبات مالی پیش‌فاکتور — منبع واحد حقیقت (Single Source of Truth)
 *
 * ترتیب صحیح محاسبه (مطابق رویه مالی شرکت):
 *   ۱) جمع اقلام (فقط ردیف‌های انتخاب‌شده)
 *   ۲) کسر تخفیف          →  جمع خالص اقلام
 *   ۳) کسر بیمه            →  بیمه روی «جمع اقلام پس از تخفیف» محاسبه و از آن کم می‌شود
 *   ۴) افزودن هزینه‌ها      →  ایاب و ذهاب + هزینه سفر (بیمه روی هزینه‌ها اعمال نمی‌شود)
 *   ۵) ارزش افزوده (آخرین مرحله) → روی «جمع پس از بیمه + هزینه‌ها»
 *   ۶) جمع کل = جمع قبل از ارزش افزوده + ارزش افزوده
 */

export function toNum(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

/** گرد کردن به ۲ رقم اعشار (سازگار با numeric(18,2) در دیتابیس) */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface ProformaTotalsInput {
  subtotal?: number | string | null;
  discountPercent?: number | string | null;
  insurancePercent?: number | string | null;
  travelCost?: number | string | null;
  transportCost?: number | string | null;
  taxPercent?: number | string | null;
}

export interface ProformaTotals {
  /** جمع اقلام */
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  /** جمع اقلام پس از تخفیف — مبنای محاسبه بیمه */
  afterDiscount: number;
  insurancePercent: number;
  /** مبلغ بیمه (کسر می‌شود) */
  insuranceAmount: number;
  /** جمع اقلام پس از تخفیف و کسر بیمه */
  netAfterInsurance: number;
  travelCost: number;
  transportCost: number;
  /** مجموع هزینه‌های افزوده (ایاب و ذهاب + سفر) */
  extraCosts: number;
  /** جمع قبل از ارزش افزوده — مبنای محاسبه ارزش افزوده */
  beforeTax: number;
  taxPercent: number;
  taxAmount: number;
  /** جمع کل نهایی */
  totalAmount: number;
}

/** محاسبه کامل مبالغ پیش‌فاکتور با ترتیب صحیح */
export function computeProformaTotals(input: ProformaTotalsInput): ProformaTotals {
  const subtotal = round2(Math.max(0, toNum(input.subtotal)));

  const discountPercent = Math.max(0, toNum(input.discountPercent));
  const discountAmount = round2((subtotal * discountPercent) / 100);
  const afterDiscount = round2(subtotal - discountAmount);

  // ۳) بیمه بلافاصله بعد از جمع اقلام (پس از تخفیف) کسر می‌شود
  const insurancePercent = Math.max(0, toNum(input.insurancePercent));
  const insuranceAmount = round2((afterDiscount * insurancePercent) / 100);
  const netAfterInsurance = round2(afterDiscount - insuranceAmount);

  // ۴) سپس هزینه‌ها جمع می‌شوند
  const travelCost = Math.max(0, round2(toNum(input.travelCost)));
  const transportCost = Math.max(0, round2(toNum(input.transportCost)));
  const extraCosts = round2(travelCost + transportCost);
  const beforeTax = round2(netAfterInsurance + extraCosts);

  // ۵) ارزش افزوده در آخرین مرحله روی جمع نهایی محاسبه می‌شود
  const taxPercent = Math.max(0, toNum(input.taxPercent));
  const taxAmount = round2((beforeTax * taxPercent) / 100);

  const totalAmount = round2(beforeTax + taxAmount);

  return {
    subtotal,
    discountPercent,
    discountAmount,
    afterDiscount,
    insurancePercent,
    insuranceAmount,
    netAfterInsurance,
    travelCost,
    transportCost,
    extraCosts,
    beforeTax,
    taxPercent,
    taxAmount,
    totalAmount,
  };
}

export interface CalcLineItem {
  totalPrice?: number | string | null;
  isSelected?: boolean | null;
}

/** جمع اقلام انتخاب‌شده */
export function sumSelectedItems(items: CalcLineItem[] | null | undefined): number {
  if (!Array.isArray(items)) return 0;
  return round2(
    items
      .filter((i) => i.isSelected === undefined || i.isSelected === null || i.isSelected === true)
      .reduce((sum, i) => sum + toNum(i.totalPrice), 0)
  );
}

/** مقادیر آماده ذخیره در دیتابیس (رشته‌ای مطابق ستون‌های numeric) */
export function totalsToDbValues(t: ProformaTotals) {
  return {
    subtotal: t.subtotal.toFixed(2),
    discountPercent: t.discountPercent.toFixed(2),
    discountAmount: t.discountAmount.toFixed(2),
    insurancePercent: t.insurancePercent.toFixed(2),
    insuranceAmount: t.insuranceAmount.toFixed(2),
    travelCost: t.travelCost.toFixed(2),
    transportCost: t.transportCost.toFixed(2),
    taxPercent: t.taxPercent.toFixed(2),
    taxAmount: t.taxAmount.toFixed(2),
    totalAmount: t.totalAmount.toFixed(2),
  };
}

/* ─────────────── قاعده مبلغ صفر — فقط در آخرین مرحله ─────────────── */

/**
 * محدودیت مبلغ صفر فقط در «آخرین مرحله» یعنی لحظه تایید نهایی اعمال می‌شود.
 * مراحل قبلی (پیش‌نویس، ذخیره، ارسال به مدیریت جهت قیمت‌گذاری) آزادند تا
 * کارشناس بتواند پیش‌فاکتور را بدون قیمت ثبت و برای تعیین قیمت ارسال کند.
 */
export const FINAL_APPROVAL_STATUS = "approved";

export function requiresNonZeroAmount(status?: string | null): boolean {
  return status === FINAL_APPROVAL_STATUS;
}

/** پیام خطای فارسی برای تایید نهایی با مبلغ صفر */
export function zeroAmountMessage(_status?: string | null): string {
  return "مبلغ نهایی پیش‌فاکتور صفر است — «تایید نهایی» با مبلغ صفر مجاز نیست. لطفاً ابتدا قیمت اقلام را وارد یا اصلاح کنید.";
}

/** حداقل مبلغ قابل قبول برای تایید (ریال) */
export const MIN_APPROVAL_AMOUNT = 1;

export function isZeroAmount(total: number | string | null | undefined): boolean {
  return toNum(total) < MIN_APPROVAL_AMOUNT;
}

/* ───────── قاعده «ردیف صفر» — بازدارنده در تایید نهایی ───────── */

export interface ZeroCheckLineItem {
  totalPrice?: number | string | null;
  isSelected?: boolean | null;
  description?: string | null;
  rowOrder?: number | null;
}

export interface ZeroAmountRowInfo {
  /** شماره ردیف نمایشی (۱-مبنا) بر اساس ترتیب ردیف‌ها */
  rowNo: number;
  description: string;
}

/**
 * ردیف‌های انتخاب‌شده‌ای که مبلغشان صفر است را برمی‌گرداند.
 * ردیف‌های غیرفعال (isSelected=false) بخشی از سند نیستند و بررسی نمی‌شوند.
 * این قاعده «بازدارنده» است: در «تایید نهایی» پیش‌فاکتور اگر حتی یک ردیف
 * تجهیزات مبلغ صفر داشته باشد، تایید متوقف می‌شود.
 */
export function findZeroAmountRows(
  items: ZeroCheckLineItem[] | null | undefined
): ZeroAmountRowInfo[] {
  if (!Array.isArray(items)) return [];
  const rows: ZeroAmountRowInfo[] = [];
  let rowNo = 0;
  for (const item of items) {
    if (item.isSelected === undefined || item.isSelected === null || item.isSelected === true) {
      rowNo += 1;
      if (isZeroAmount(item.totalPrice)) {
        rows.push({
          rowNo,
          description: (item.description || "").trim(),
        });
      }
    }
  }
  return rows;
}

/** پیام خطای فارسی برای ردیف‌های دارای مبلغ صفر در تایید نهایی */
export function zeroRowsMessage(rows: ZeroAmountRowInfo[]): string {
  if (rows.length === 0) return "";
  const list = rows
    .slice(0, 10)
    .map((r) => `ردیف ${r.rowNo}${r.description ? ` (${r.description.slice(0, 60)})` : ""}`)
    .join("، ");
  const more = rows.length > 10 ? ` و ${rows.length - 10} ردیف دیگر` : "";
  return `«تایید نهایی» مجاز نیست — مبلغ ${rows.length} ردیف از تجهیزات صفر است (${list}${more}). لطفاً ابتدا قیمت‌گذاری این ردیف‌ها را انجام و ذخیره کنید؛ در غیر این صورت تایید نهایی مسدود است.`;
}
