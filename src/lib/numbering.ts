import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentJalaliYear, generateLetterNumber } from "@/lib/utils";

/**
 * ── شماره‌گذاری نامه / پیش‌فاکتور بر اساس «سال جاری شمسی» ──
 *
 * ایراد قبلی: سال به صورت ثابت (1404) در کد نوشته شده بود و تنظیمات فقط با
 * شرط `year = 1404` خوانده می‌شد؛ در نتیجه در سال جدید هم شماره‌ها با سال قبل
 * صادر می‌شدند و اگر سالِ رکورد تنظیمات با آن عدد ثابت فرق داشت، فرمت/شمارنده
 * اصلاً خوانده نمی‌شد و مقدار پیش‌فرض کد استفاده می‌شد.
 *
 * رفتار جدید:
 *  - فرمت و شمارنده فقط با «کلید» خوانده می‌شوند (کلید در جدول settings یکتاست).
 *  - سال از تاریخ سیستم (تقویم جلالی) محاسبه می‌شود.
 *  - اگر سالِ ذخیره‌شده روی شمارنده با سال جاری فرق داشته باشد (تحویل سال)،
 *    شمارنده به‌صورت خودکار از ۱ شروع شده و سال آن به‌روز می‌شود.
 */

export type NumberingKind = "letter" | "proforma";

const KEYS: Record<NumberingKind, { format: string; sequence: string; defaultFormat: string }> = {
  letter: { format: "letter_format", sequence: "letter_sequence", defaultFormat: "{YEAR}/{SEQ}" },
  proforma: { format: "proforma_format", sequence: "proforma_sequence", defaultFormat: "PF-{YEAR}-{SEQ}" },
};

export interface NumberingContext {
  year: number;
  format: string;
  /** شماره بعدی که باید استفاده شود (بعد از اعمال تحویل سال) */
  seq: number;
  /** رکورد شمارنده در جدول تنظیمات (در صورت وجود) */
  seqRowId: number | null;
  /** آیا با شروع سال جدید، شمارنده ریست شده است؟ */
  rolledOver: boolean;
}

/**
 * خواندن فرمت و شمارنده. اگر `persist` فعال باشد، در صورت تحویل سال، ریست
 * شمارنده و سال جدید در دیتابیس ذخیره می‌شود (برای پیش‌نمایش false بفرستید).
 */
export async function getNumberingContext(kind: NumberingKind, persist = true): Promise<NumberingContext> {
  const keys = KEYS[kind];
  const year = currentJalaliYear();

  const [seqRows, fmtRows] = await Promise.all([
    db.select().from(settings).where(eq(settings.settingKey, keys.sequence)).limit(1),
    db.select().from(settings).where(eq(settings.settingKey, keys.format)).limit(1),
  ]);

  const format = fmtRows.length > 0 && fmtRows[0].settingValue.trim() ? fmtRows[0].settingValue.trim() : keys.defaultFormat;

  let seq = 1;
  let seqRowId: number | null = null;
  let rolledOver = false;

  if (seqRows.length > 0) {
    seqRowId = seqRows[0].id;
    const storedYear = seqRows[0].year;
    seq = parseInt(seqRows[0].settingValue) || 1;

    // تحویل سال: شمارنده از ۱ شروع می‌شود
    if (storedYear !== null && storedYear !== undefined && storedYear !== year) {
      rolledOver = true;
      seq = 1;
      if (persist) {
        await db
          .update(settings)
          .set({ settingValue: "1", year, updatedAt: new Date() })
          .where(eq(settings.id, seqRowId));
      }
    } else if ((storedYear === null || storedYear === undefined) && persist) {
      // سال روی رکورد ثبت نشده بود — سال جاری را ثبت می‌کنیم
      await db.update(settings).set({ year, updatedAt: new Date() }).where(eq(settings.id, seqRowId));
    }
  } else if (persist) {
    // رکورد شمارنده وجود ندارد — یک‌بار ساخته می‌شود تا از این به بعد قابل مدیریت باشد
    const created = await db
      .insert(settings)
      .values({ settingKey: keys.sequence, settingValue: "1", year })
      .returning();
    seqRowId = created[0]?.id ?? null;
  }

  // سال روی رکورد فرمت هم به‌روز نگه داشته می‌شود (فقط جنبه نمایشی دارد)
  if (persist && fmtRows.length > 0 && fmtRows[0].year !== year) {
    await db.update(settings).set({ year, updatedAt: new Date() }).where(eq(settings.id, fmtRows[0].id));
  }

  return { year, format, seq, seqRowId, rolledOver };
}

/** تولید شماره از روی فرمت ({YEAR}, {SEQ}, {NUM}) */
export function formatDocNumber(format: string, seq: number, year: number): string {
  return generateLetterNumber(format, seq, year);
}

/** ذخیره شمارنده بعدی */
export async function bumpSequence(ctx: NumberingContext, usedSeq: number) {
  if (ctx.seqRowId === null) return;
  await db
    .update(settings)
    .set({ settingValue: (usedSeq + 1).toString(), year: ctx.year, updatedAt: new Date() })
    .where(eq(settings.id, ctx.seqRowId));
}
