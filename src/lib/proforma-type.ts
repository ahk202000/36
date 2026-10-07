/**
 * تشخیص نوع پیش‌فاکتور «نامه ستاد» (سامانه ستاد)
 *
 * پیش‌فاکتورهایی که نوعشان «ستاد» است قالب چاپ متفاوتی دارند:
 * - ستون «محل کالیبره» حذف می‌شود
 * - «متن سوم / صفحه آخر» (ته‌برگ شرایط عمومی) چاپ نمی‌شود
 * - فقط مهر و امضا و نام شرکت دقیقاً زیر آخرین مطلب می‌آید
 *
 * تشخیص بر اساس کد نوع (setad) یا وجود واژه «ستاد» در نام نوع است تا
 * با دیتابیس‌هایی که نام را «سامانه ستاد» یا «نامه ستاد» ثبت کرده‌اند کار کند.
 */
export function isSetadProforma(
  typeName?: string | null,
  typeCode?: string | null
): boolean {
  const code = (typeCode || "").trim().toLowerCase();
  if (code === "setad") return true;
  const name = normalizeFaTypeName(typeName);
  return name.includes("ستاد");
}

/** نرمال‌سازی نام نوع (ی/ک عربی، نیم‌فاصله، فاصله‌های اضافی) */
function normalizeFaTypeName(typeName?: string | null): string {
  return (typeName || "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/‌/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * تشخیص نوع پیش‌فاکتور «فروش»
 *
 * درخواست: نوع قبلی «خرید» به «فروش» تغییر نام یافته است و قالب چاپ آن
 * مانند نامه ستاد ساده است:
 * - ستون «محل کالیبره» ندارد
 * - «شرایط و ضوابط» (صفحه آخر) چاپ نمی‌شود
 * - مهر و امضا دقیقاً زیر آخرین خط (زیر جمع کل) می‌آید
 *
 * تشخیص بر اساس کد (calibration_sale) یا وجود واژه «فروش»/«خرید» (سازگاری با
 * دیتابیس‌های قدیمی) در نام نوع.
 */
export function isSaleProforma(
  typeName?: string | null,
  typeCode?: string | null
): boolean {
  const code = (typeCode || "").trim().toLowerCase();
  if (code === "calibration_sale") return true;
  const name = normalizeFaTypeName(typeName);
  return name.includes("فروش") || name.includes("خرید");
}

/**
 * قالب «ساده‌شده» چاپ — نامه ستاد یا فروش:
 * بدون ستون محل کالیبره و بدون صفحه «شرایط و ضوابط»؛
 * مهر و امضا دقیقاً زیر آخرین مطلب (جمع کل) می‌آید.
 */
export function isSimplifiedProforma(
  typeName?: string | null,
  typeCode?: string | null
): boolean {
  return isSetadProforma(typeName, typeCode) || isSaleProforma(typeName, typeCode);
}
