import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contracts, companies, contractFiles } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { ensureContractFilesTable } from "@/lib/contract-files";

interface ContractFilePayload {
  fileName: string;
  filePath: string;
  fileSize?: number | null;
}

/**
 * فایل‌های هر قرارداد = رکوردهای جدول contract_files + فایل قدیمی تکی (سازگاری با داده‌های قبلی)
 * نکته مهم: اگر جدول contract_files هنوز در دیتابیس ساخته نشده باشد (دیتابیس قدیمی)،
 * خواندن آن در try/catch قرار می‌گیرد تا ذخیره/نمایش قرارداد متوقف نشود و
 * فایل‌های قدیمیِ تک‌فایله همچنان کار کنند. اسکریپت sql/fix-updates.sql
 * جدول را می‌سازد و داده‌های قدیمی را منتقل می‌کند.
 */
async function attachFiles(rows: Array<{ id: number; filePath: string | null; fileName: string | null }>) {
  const ids = rows.map((r) => r.id);
  const filesByContract = new Map<number, Array<{ id: number; fileName: string; filePath: string; fileSize: number | null }>>();
  if (ids.length > 0) {
    try {
      // خودترمیمی: اگر جدول هنوز ساخته نشده باشد، همین‌جا ساخته می‌شود تا
      // خطای «contract_files وجود ندارد» هیچ‌گاه به کاربر نمایش داده نشود.
      await ensureContractFilesTable();
      const fRows = await db
        .select()
        .from(contractFiles)
        .where(inArray(contractFiles.contractId, ids));
      for (const f of fRows) {
        const list = filesByContract.get(f.contractId) ?? [];
        list.push({ id: f.id, fileName: f.fileName, filePath: f.filePath, fileSize: f.fileSize });
        filesByContract.set(f.contractId, list);
      }
    } catch (err) {
      console.warn("contract_files table unavailable (run sql/fix-updates.sql):", err);
    }
  }
  return rows.map((r) => {
    const files = filesByContract.get(r.id) ?? [];
    // سازگاری: اگر قرارداد فایل قدیمی تکی دارد که هنوز به contract_files منتقل نشده
    if (r.filePath && r.fileName && !files.some((f) => f.filePath === r.filePath)) {
      files.push({ id: -r.id, fileName: r.fileName, filePath: r.filePath, fileSize: null });
    }
    return { ...r, files };
  });
}

/** درج چند فایل برای یک قرارداد — خطای جدول نبودن بلعیده نمی‌شود ولی قرارداد از بین نمی‌رود */
async function insertContractFiles(
  contractId: number,
  files: ContractFilePayload[],
  createdBy: number | null
): Promise<string | null> {
  if (files.length === 0) return null;
  try {
    // خودترمیمی: جدول فایل‌ها اگر وجود نداشته باشد همین‌جا ساخته می‌شود؛
    // قبلاً در دیتابیس‌های بدون migration قرارداد ذخیره می‌شد ولی پیام خطای
    // «فایل‌ها ثبت نشدند» به کاربر نشان داده می‌شد (ذخیره با خطای ظاهری).
    await ensureContractFilesTable();
    for (const f of files) {
      await db.insert(contractFiles).values({
        contractId,
        fileName: f.fileName,
        filePath: f.filePath,
        fileSize: f.fileSize ?? null,
        createdBy,
      });
    }
    return null;
  } catch (err) {
    console.error("insertContractFiles failed:", err);
    return "فایل‌های قرارداد ثبت نشدند — لطفاً دوباره تلاش کنید";
  }
}

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    const baseQuery = {
      id: contracts.id,
      companyId: contracts.companyId,
      companyName: companies.name,
      contractNumber: contracts.contractNumber,
      title: contracts.title,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
      description: contracts.description,
      filePath: contracts.filePath,
      fileName: contracts.fileName,
      isActive: contracts.isActive,
      createdAt: contracts.createdAt,
    };

    const rows = companyId
      ? await db.select(baseQuery).from(contracts).leftJoin(companies, eq(contracts.companyId, companies.id)).where(eq(contracts.companyId, parseInt(companyId))).orderBy(desc(contracts.id))
      : await db.select(baseQuery).from(contracts).leftJoin(companies, eq(contracts.companyId, companies.id)).orderBy(desc(contracts.id));

    const withFiles = await attachFiles(rows);
    return NextResponse.json(withFiles);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const files: ContractFilePayload[] = Array.isArray(body.files)
      ? body.files.filter((f: ContractFilePayload) => f && f.fileName && f.filePath)
      : [];
    // فایل تکی قدیمی (سازگاری با کلاینت‌های قبلی)
    if (files.length === 0 && body.filePath && body.fileName) {
      files.push({ fileName: body.fileName, filePath: body.filePath, fileSize: body.fileSize ?? null });
    }

    const result = await db.insert(contracts).values({
      companyId: parseInt(body.companyId),
      contractNumber: body.contractNumber,
      title: body.title || null,
      startDate: body.startDate,
      endDate: body.endDate,
      description: body.description || null,
      // اولین فایل در ستون‌های قدیمی هم نگه‌داری می‌شود تا گزارش‌های قبلی کار کنند
      filePath: files[0]?.filePath || null,
      fileName: files[0]?.fileName || null,
      isActive: body.isActive !== undefined ? body.isActive : true,
      createdBy: body.createdBy || null,
    }).returning();

    const contractId = result[0].id;
    // ثبت همه فایل‌ها (امکان اضافه کردن چند فایل به یک قرارداد)
    const filesWarning = await insertContractFiles(contractId, files, body.createdBy || null);

    const [withFiles] = await attachFiles(result);
    return NextResponse.json(filesWarning ? { ...withFiles, filesWarning } : withFiles);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
