import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contracts, contractFiles } from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { ensureContractFilesTable } from "@/lib/contract-files";

interface ContractFilePayload {
  fileName: string;
  filePath: string;
  fileSize?: number | null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const contractId = parseInt(id);
    const body = await req.json();

    // ۱) به‌روزرسانی فیلدهای قرارداد — توجه: بدون ارسال filePath/fileName در بدنه،
    //    فایل‌های قبلی دست‌نخورده می‌مانند (ایراد قبلی: ویرایش قرارداد فایل را پاک می‌کرد).
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.companyId !== undefined) patch.companyId = body.companyId;
    if (body.contractNumber !== undefined) patch.contractNumber = body.contractNumber;
    if (body.title !== undefined) patch.title = body.title || null;
    if (body.startDate !== undefined) patch.startDate = body.startDate;
    if (body.endDate !== undefined) patch.endDate = body.endDate;
    if (body.description !== undefined) patch.description = body.description || null;
    if (body.updatedBy !== undefined) patch.updatedBy = body.updatedBy;
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    if (body.filePath !== undefined) patch.filePath = body.filePath || null;
    if (body.fileName !== undefined) patch.fileName = body.fileName || null;

    const result = await db
      .update(contracts)
      .set(patch)
      .where(eq(contracts.id, contractId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "قرارداد یافت نشد" }, { status: 404 });
    }

    // ۲) حذف فایل‌های خواسته‌شده (عملیات روی contract_files خطاپذیر است تا
    //    ویرایش قرارداد روی دیتابیس قدیمی بدون این جدول هم کار کند)
    const removeFileIds: number[] = Array.isArray(body.removeFileIds)
      ? body.removeFileIds.map((n: unknown) => parseInt(String(n))).filter((n: number) => Number.isFinite(n))
      : [];
    if (removeFileIds.length > 0) {
      try {
        await db
          .delete(contractFiles)
          .where(and(eq(contractFiles.contractId, contractId), inArray(contractFiles.id, removeFileIds)));
      } catch (err) {
        console.warn("contract_files delete failed:", err);
      }
      // اگر فایل قدیمی تکی حذف شد (id منفی = فایل قدیمی)، ستون‌های قدیمی هم پاک شوند
      if (removeFileIds.includes(-contractId)) {
        await db.update(contracts).set({ filePath: null, fileName: null }).where(eq(contracts.id, contractId));
      }
    }

    // ۳) افزودن فایل‌های جدید (چند فایل همزمان)
    let filesWarning: string | null = null;
    const newFiles: ContractFilePayload[] = Array.isArray(body.files)
      ? body.files.filter((f: ContractFilePayload) => f && f.fileName && f.filePath)
      : [];
    if (newFiles.length > 0) {
      try {
        for (const f of newFiles) {
          await db.insert(contractFiles).values({
            contractId,
            fileName: f.fileName,
            filePath: f.filePath,
            fileSize: f.fileSize ?? null,
            createdBy: body.updatedBy || null,
          });
        }
        // اگر قبلاً هیچ فایلی روی قرارداد نبود، اولین فایل جدید در ستون‌های قدیمی هم ثبت شود
        if (!result[0].filePath) {
          await db
            .update(contracts)
            .set({ filePath: newFiles[0].filePath, fileName: newFiles[0].fileName })
            .where(eq(contracts.id, contractId));
          result[0].filePath = newFiles[0].filePath;
          result[0].fileName = newFiles[0].fileName;
        }
      } catch (err) {
        console.error("contract_files insert failed:", err);
        filesWarning = "فایل‌ها ثبت نشدند — لطفاً اسکریپت sql/fix-updates.sql را روی دیتابیس اجرا کنید";
        // سازگاری: در نبود جدول، اولین فایل در ستون‌های تک‌فایله قدیمی ذخیره می‌شود
        if (!result[0].filePath) {
          await db
            .update(contracts)
            .set({ filePath: newFiles[0].filePath, fileName: newFiles[0].fileName })
            .where(eq(contracts.id, contractId));
          result[0].filePath = newFiles[0].filePath;
          result[0].fileName = newFiles[0].fileName;
        }
      }
    }

    // ۴) همگام‌سازی ستون‌های تک‌فایله قدیمی با وضعیت نهایی فایل‌ها:
    //    اگر فایلی که ستون‌های قدیمی به آن اشاره می‌کردند حذف شده باشد، ستون‌ها به
    //    اولین فایل باقی‌مانده (یا null در صورت نبود فایل) اشاره می‌کنند — در غیر این
    //    صورت فایل حذف‌شده از مسیر سازگاری قدیمی دوباره در لیست ظاهر می‌شد.
    if (body.filePath === undefined) {
      try {
        const remaining = await db
          .select({ filePath: contractFiles.filePath, fileName: contractFiles.fileName })
          .from(contractFiles)
          .where(eq(contractFiles.contractId, contractId));
        const current = await db
          .select({ filePath: contracts.filePath })
          .from(contracts)
          .where(eq(contracts.id, contractId))
          .limit(1);
        const curPath = current[0]?.filePath || null;
        const stillValid = !!curPath && remaining.some((f) => f.filePath === curPath);
        if (!stillValid) {
          const first = remaining[0] || null;
          await db
            .update(contracts)
            .set({ filePath: first?.filePath || null, fileName: first?.fileName || null })
            .where(eq(contracts.id, contractId));
          result[0].filePath = first?.filePath || null;
          result[0].fileName = first?.fileName || null;
        }
      } catch (err) {
        console.warn("legacy file column sync failed:", err);
      }
    }

    return NextResponse.json(filesWarning ? { ...result[0], filesWarning } : result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const contractId = parseInt(id);
    try {
      await db.delete(contractFiles).where(eq(contractFiles.contractId, contractId));
    } catch (err) {
      console.warn("contract_files delete failed (table may not exist yet):", err);
    }
    await db.delete(contracts).where(eq(contracts.id, contractId));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
