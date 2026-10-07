import { db } from "@/db";
import { letterAttachments, letters, workflowItems } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * واحدهای اجرایی که رونوشت «نامه رنج» در فروش قطعی دریافت می‌کنند:
 * برنامه‌ریزی درون‌سازمانی + برنامه‌ریزی برون‌سازمانی + آزمایشگاه
 */
export const RANGE_LETTER_DEPARTMENTS = [
  "برنامه ریزی درون سازمانی",
  "برنامه ریزی برون سازمانی",
  "آزمایشگاه",
] as const;

/** واحدهای دریافت‌کننده ارجاع «تاییدیه استعلام» (ضمیمه و خود نامه استعلام)
 *  طبق درخواست: وقتی فروش قطعی می‌شود، نامه استعلام (تاییدیه استعلام) برای
 *  «آزمایشگاه» و «برنامه ریزی برون سازمانی» ارجاع داده نمی‌شود — ارجاع
 *  خودکار فروش قطعی فقط رونوشت «نامه رنج» است و فروش قطعی به برنامه‌ریزی
 *  درون‌سازمانی اطلاع‌رسانی می‌شود. */
export const CONFIRM_REFER_DEPARTMENTS: readonly string[] = [];

/** همه واحدهای اجرایی هدف ارجاع خودکار فروش قطعی (برای تشخیص تکرار) */
export const EXECUTION_DEPARTMENTS = [...RANGE_LETTER_DEPARTMENTS] as const;

/** نگه‌داشته شده برای سازگاری با ایمپورت‌های قبلی */
export const EXTERNAL_EXECUTION_DEPARTMENTS = CONFIRM_REFER_DEPARTMENTS;

/** برچسب نوع پیوست نامه رنج */
export const RANGE_LETTER_TYPE = "نامه رنج";

/** اکشن‌های گردش کار مرتبط با ارجاع فروش قطعی به واحدهای اجرایی */
export const EXECUTION_REFER_ACTIONS = [
  "range_letter",
  "confirm_refer",
  "final_sale",
] as const;

/** نرمال‌سازی متن فارسی برای تطبیق نوع پیوست (نم‌فاصله/فاصله‌های متعدد) */
export function normalizeFaLabel(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** آیا نوع پیوست «نامه رنج» است؟ (مقاوم به تفاوت فاصله/نم‌فاصله) */
export function isRangeAttachmentType(value: string | null | undefined): boolean {
  return normalizeFaLabel(value) === normalizeFaLabel(RANGE_LETTER_TYPE);
}

interface ReferFinalSaleParams {
  letterId: number;
  letterNumber: string;
  /** پیش‌فاکتور تأییدشده (اختیاری) */
  proformaId?: number | null;
  fromUserId?: number | null;
  requestType?: string | null;
}

/**
 * ارجاع خودکار فروش قطعی به واحدهای اجرایی.
 *
 * - اگر نامه پیوست «نامه رنج» دارد → رونوشت به هر سه واحد:
 *   «برنامه‌ریزی درون‌سازمانی»، «برنامه‌ریزی برون‌سازمانی» و «آزمایشگاه».
 * - طبق درخواست جدید: «نامه استعلام» (تاییدیه استعلام) هنگام فروش قطعی به
 *   «آزمایشگاه» و «برنامه‌ریزی برون‌سازمانی» ارجاع داده نمی‌شود؛ بنابراین
 *   بدون نامه رنج، هیچ ارجاع خودکار نامه استعلام انجام نمی‌شود.
 * - حتماً باید داده‌ها از خود دیتابیس خوانده شوند تا فایل نامه رنج همراه ارجاع باشد.
 * - ایدم‌پوتنت: اگر ارجاع قبلاً ثبت شده باشد دوباره ایجاد نمی‌کند.
 * - خودترمیمی: اگر قبلاً «تاییدیه استعلام» ارجاع شده و حالا پیوست نامه رنج
 *   وجود دارد، ارجاع به «نامه رنج» ارتقا می‌یابد تا فایل همراه شود.
 *
 * @returns خلاصه اقدام انجام‌شده
 */
export async function referFinalSaleToExecutionDepartments(
  params: ReferFinalSaleParams
): Promise<{ action: string; departments: string[]; attachmentNames: string[] }> {
  const { letterId, letterNumber, proformaId = null, fromUserId = null, requestType } = params;

  // ۱) پیوست‌های فعلی نامه از دیتابیس (منبع حقیقت)
  const attachments = await db
    .select({
      attachmentType: letterAttachments.attachmentType,
      fileName: letterAttachments.fileName,
      filePath: letterAttachments.filePath,
    })
    .from(letterAttachments)
    .where(eq(letterAttachments.letterId, letterId));

  const rangeAttachments = attachments.filter((a) =>
    isRangeAttachmentType(a.attachmentType)
  );

  const hasRange = rangeAttachments.length > 0;

  // طبق درخواست: هنگام فروش قطعی، «نامه استعلام» (تاییدیه استعلام) برای
  // آزمایشگاه و واحد برنامه‌ریزی برون‌سازمانی ارجاع داده نمی‌شود؛ فقط
  // رونوشت «نامه رنج» ارجاع می‌شود. بنابراین نامه‌ای که نامه رنج ندارد،
  // هیچ ارجاع خودکاری (confirm_refer) دریافت نمی‌کند.
  if (!hasRange) {
    return { action: "skipped", departments: [], attachmentNames: [] };
  }

  const action = "range_letter";
  const targetDepartments: readonly string[] = RANGE_LETTER_DEPARTMENTS;
  const attachmentNames = rangeAttachments.map((a) => a.fileName);

  const comment = `رونوشت نامه رنج — فروش قطعی نامه ${letterNumber} — ${attachmentNames.join("، ") || "پیوست نامه"} جهت اقدام ارجاع شد`;

  // ۲) بررسی ارجاع‌های قبلی برای جلوگیری از تکرار + ارتقای تاییدیه → نامه رنج
  const existing = await db
    .select({
      id: workflowItems.id,
      toDepartment: workflowItems.toDepartment,
      action: workflowItems.action,
    })
    .from(workflowItems)
    .where(
      and(
        eq(workflowItems.letterId, letterId),
        inArray(workflowItems.toDepartment, [...EXECUTION_DEPARTMENTS]),
        inArray(workflowItems.action, [...EXECUTION_REFER_ACTIONS])
      )
    );

  if (hasRange) {
    // اگر ارجاع تاییدیه استعلام/فروش قطعی (بدون نامه رنج) قبلاً ثبت شده،
    // آن‌ها را به «نامه رنج» ارتقا بده تا فایل رنج همراه ارجاع باشد
    const upgradeTargets = existing.filter(
      (w) => w.action === "confirm_refer" || w.action === "final_sale"
    );
    for (const old of upgradeTargets) {
      await db
        .update(workflowItems)
        .set({
          action: "range_letter",
          comment,
          proformaId: proformaId ?? null,
          fromUserId: fromUserId ?? null,
          isRead: false,
        })
        .where(eq(workflowItems.id, old.id));
    }
  }

  const coveredDepartments = new Set(
    (hasRange
      ? existing
      : existing.filter((w) => w.action !== "final_sale")
    ).map((w) => normalizeFaLabel(w.toDepartment))
  );

  // ۳) برای هر واحدی که ارجاع ندارد، رکورد جدید با کامنت همراه فایل نامه رنج ثبت کن
  for (const department of targetDepartments) {
    if (coveredDepartments.has(normalizeFaLabel(department))) continue;
    await db.insert(workflowItems).values({
      letterId,
      proformaId,
      fromUserId,
      toDepartment: department,
      action,
      comment,
    });
  }

  return {
    action,
    departments: [...targetDepartments],
    attachmentNames,
  };
}

interface ReferSoldProformaParams {
  proformaId: number;
  proformaNumber: string;
  companyId: number;
  fromUserId?: number | null;
}

/**
 * فروش قطعی پیش‌فاکتور:
 * همه نامه‌های ثبت‌شده آن مشتری بررسی می‌شوند؛ برای هر نامه‌ای که
 * پیوست «نامه رنج» دارد، رونوشت به هر سه واحد اجرایی
 * (برنامه‌ریزی درون‌سازمانی، برنامه‌ریزی برون‌سازمانی، آزمایشگاه) ارسال می‌شود.
 *
 * - ایدم‌پوتنت: با تشخیص ارجاع‌های قبلی، رکورد تکراری ایجاد نمی‌شود.
 * - ارجاع‌های قبلیِ «تاییدیه استعلام»/«فروش قطعی» به «نامه رنج» ارتقا می‌یابند.
 *
 * @returns خلاصه اقدام (تعداد نامه‌های رنج و واحدهای پوشش‌داده‌شده)
 */
export async function referSoldProformaRangeLetters(
  params: ReferSoldProformaParams
): Promise<{
  rangeLetterCount: number;
  rangeLetterNumbers: string[];
  departments: string[];
}> {
  const { proformaId, proformaNumber, companyId, fromUserId = null } = params;

  if (!companyId) {
    return { rangeLetterCount: 0, rangeLetterNumbers: [], departments: [] };
  }

  // ۱) همه نامه‌های ثبت‌شده مشتری
  const customerLetters = await db
    .select({
      id: letters.id,
      letterNumber: letters.letterNumber,
    })
    .from(letters)
    .where(eq(letters.companyId, companyId));

  if (customerLetters.length === 0) {
    return { rangeLetterCount: 0, rangeLetterNumbers: [], departments: [] };
  }

  // ۲) پیوست‌های همه نامه‌های مشتری و تشخیص نامه‌های دارای «نامه رنج»
  const allAttachments = await db
    .select({
      letterId: letterAttachments.letterId,
      attachmentType: letterAttachments.attachmentType,
      fileName: letterAttachments.fileName,
    })
    .from(letterAttachments)
    .where(
      inArray(
        letterAttachments.letterId,
        customerLetters.map((l) => l.id)
      )
    );

  const rangeByLetter = new Map<number, string[]>();
  for (const att of allAttachments) {
    if (!isRangeAttachmentType(att.attachmentType)) continue;
    const list = rangeByLetter.get(att.letterId) ?? [];
    list.push(att.fileName);
    rangeByLetter.set(att.letterId, list);
  }

  const rangeLetters = customerLetters.filter((l) => rangeByLetter.has(l.id));

  // ۳) برای هر نامه رنج، رونوشت به هر سه واحد اجرایی (بدون تکرار)
  const coveredDepartments = new Set<string>();
  for (const letter of rangeLetters) {
    const names = rangeByLetter.get(letter.id) ?? [];
    const comment =
      `رونوشت نامه رنج — به مناسبت فروش قطعی پیش‌فاکتور شماره ${proformaNumber} ` +
      `(نامه ${letter.letterNumber}) — ${names.join("، ") || "پیوست نامه"} جهت اقدام ارجاع شد`;

    const existing = await db
      .select({
        id: workflowItems.id,
        toDepartment: workflowItems.toDepartment,
        action: workflowItems.action,
      })
      .from(workflowItems)
      .where(
        and(
          eq(workflowItems.letterId, letter.id),
          inArray(workflowItems.toDepartment, [...RANGE_LETTER_DEPARTMENTS]),
          inArray(workflowItems.action, [...EXECUTION_REFER_ACTIONS])
        )
      );

    // ارتقای ارجاع‌های تاییدیه استعلام/فروش قطعیِ قبلی به «نامه رنج»
    const upgradeTargets = existing.filter(
      (w) => w.action === "confirm_refer" || w.action === "final_sale"
    );
    for (const old of upgradeTargets) {
      await db
        .update(workflowItems)
        .set({
          action: "range_letter",
          comment,
          proformaId,
          fromUserId: fromUserId ?? null,
          isRead: false,
        })
        .where(eq(workflowItems.id, old.id));
    }

    const covered = new Set(existing.map((w) => normalizeFaLabel(w.toDepartment)));

    for (const department of RANGE_LETTER_DEPARTMENTS) {
      if (covered.has(normalizeFaLabel(department))) {
        coveredDepartments.add(department);
        continue;
      }
      await db.insert(workflowItems).values({
        letterId: letter.id,
        proformaId,
        fromUserId,
        toDepartment: department,
        action: "range_letter",
        comment,
      });
      coveredDepartments.add(department);
    }
  }

  return {
    rangeLetterCount: rangeLetters.length,
    rangeLetterNumbers: rangeLetters.map((l) => l.letterNumber),
    departments: [...coveredDepartments],
  };
}
