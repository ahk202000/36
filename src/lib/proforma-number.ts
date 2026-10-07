/**
 * قواعد شماره‌گذاری پیش‌فاکتور — نسخه واحد و مشترک
 *
 * ۱) صدور از روی نامه:
 *    - اولین پیش‌فاکتورِ یک نامه دقیقاً «شماره نامه» را می‌گیرد:      1404/0012
 *    - پیش‌فاکتور دوم، سوم و ... همان نامه (مثلاً وقتی مشتری در یک
 *      استعلام هم کالیبراسیون و هم فروش خواسته) پسوند فرعی می‌گیرند:  1404/0012/2 ، 1404/0012/3
 *    → شماره دبیرخانهٔ نامه هرگز دست نمی‌خورد و رویه شماره‌گذاری نامه‌ها به‌هم نمی‌ریزد.
 *
 * ۲) اصلاحیه (ویرایش پیش‌فاکتورِ ارسال‌شده):
 *    - اصلاحیه اول:  <اصل‌شماره>e        مثال: 1404/0012e   یا 1404/0012/2e
 *    - اصلاحیه دوم:  <اصل‌شماره>e2       مثال: 1404/0012e2
 *    - اصلاحیه سوم:  <اصل‌شماره>e3 ...
 *    → «اصل‌شماره» (base_number) ثابت می‌ماند و فقط شماره نسخه (revision_no) یک پله زیاد می‌شود.
 */

export const REVISION_SUFFIX = "e";
export const LETTER_SUB_SEPARATOR = "/";

/** ساخت شماره پایه پیش‌فاکتور بر اساس شماره نامه و شماره فرعی داخل نامه */
export function buildLetterBasedBase(letterNumber: string, letterSeq: number): string {
  const seq = Math.max(1, Math.floor(letterSeq || 1));
  return seq === 1 ? letterNumber : `${letterNumber}${LETTER_SUB_SEPARATOR}${seq}`;
}

/** ساخت شماره نمایشی پیش‌فاکتور با توجه به شماره نسخه (اصلاحیه) */
export function buildRevisedNumber(baseNumber: string, revisionNo: number): string {
  const rev = Math.max(0, Math.floor(revisionNo || 0));
  if (rev === 0) return baseNumber;
  if (rev === 1) return `${baseNumber}${REVISION_SUFFIX}`;
  return `${baseNumber}${REVISION_SUFFIX}${rev}`;
}

/** آیا این پیش‌فاکتور «اصلاحی» است؟ (برای عنوان PDF/چاپ) */
export function isRevisedProforma(input: { revisionNo?: number | string | null; proformaNumber?: string | null }): boolean {
  const rev = Number(input.revisionNo ?? 0);
  if (!Number.isNaN(rev) && rev > 0) return true;
  // سازگاری با رکوردهای قدیمی که revision_no ندارند ولی پسوند اصلاحیه دارند
  const num = (input.proformaNumber || "").trim();
  return new RegExp(`\\d${REVISION_SUFFIX}\\d*$`).test(num);
}

/** عنوان سند بر اساس وضعیت اصلاحیه */
export function proformaTitle(input: { revisionNo?: number | string | null; proformaNumber?: string | null }): string {
  return isRevisedProforma(input) ? "پیش فاکتور اصلاحی" : "پیش فاکتور";
}
