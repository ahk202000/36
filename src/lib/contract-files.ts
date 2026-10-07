import { pool } from "@/db";

/**
 * خودترمیمی جدول «contract_files».
 *
 * ایراد گزارش‌شده: هنگام ذخیره قرارداد، اگر جدول فایل‌های قرارداد (contract_files)
 * در دیتابیس ساخته نشده بود (دیتابیس‌های قدیمی قبل از این به‌روزرسانی)، قرارداد
 * ذخیره می‌شد ولی پیام خطا/هشدار «فایل‌ها ثبت نشدند — اسکریپت sql/fix-updates.sql
 * را اجرا کنید» به کاربر نمایش داده می‌شد؛ یعنی عملاً ذخیره انجام شده بود ولی
 * کاربر پیام خطا می‌دید.
 *
 * راه‌حل: به‌جای نیاز به اجرای دستی اسکریپت، قبل از اولین استفاده از جدول،
 * خودمان با CREATE TABLE IF NOT EXISTS آن را می‌سازیم (ایدمپوتنت) و نتیجه
 * را در حافظه کش می‌کنیم تا در هر درخواست تکرار نشود.
 */

let ensured: Promise<void> | null = null;

export async function ensureContractFilesTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS contract_files (
          id SERIAL PRIMARY KEY,
          contract_id INTEGER NOT NULL REFERENCES contracts(id),
          file_name VARCHAR(500) NOT NULL,
          file_path VARCHAR(1000) NOT NULL,
          file_size INTEGER,
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS contract_files_contract_id_idx ON contract_files (contract_id)`
      );
    })().catch((err) => {
      // در صورت شکست، تلاش بعدی دوباره انجام شود
      ensured = null;
      throw err;
    });
  }
  return ensured;
}
