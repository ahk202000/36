import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { normalizeNameKey } from "@/lib/utils";
import { companies } from "@/db/schema";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// نگاشت سرفصل‌های پذیرفته‌شده (فارسی/انگلیسی/ی و ک عربی هم پشتیبانی می‌شود)
const COLUMN_MAP: Record<string, string[]> = {
  name: ["نام شرکت", "نام", "شرکت", "نام مشتری", "مشتری", "company", "name", "companyname", "company_name", "customer"],
  phone: ["تلفن", "تلفن شرکت", "تلفن ثابت", "تلفن تماس", "موبایل", "شماره تماس", "تماس", "phone", "tel", "telephone", "mobile"],
  fax: ["فکس", "fax"],
  email: ["ایمیل", "پست الکترونیک", "email", "e-mail", "mail"],
  contactPerson: ["مسئول", "رابط", "نام مسئول", "فرد رابط", "مسئول ارتباط", "contactperson", "contact_person", "contact", "manager"],
  address: ["آدرس", "نشانی", "address"],
};

// نرمال‌سازی سرفصل: ی/ک عربی → فارسی، حروف کوچک
function normalizeHeader(h: string): string {
  return String(h || "")
    .trim()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .toLowerCase();
}

function findColumnMapping(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
      if (map[field] !== undefined) continue;
      if (aliases.some((a) => normalizeHeader(a) === norm)) {
        map[field] = idx;
      }
    }
  });
  return map;
}

function cellToString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * دانلود قالب نمونه اکسل برای درون‌ریزی
 * GET /api/companies/import
 */
export async function GET() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["نام شرکت", "تلفن", "فکس", "ایمیل", "مسئول", "آدرس"],
    ["شرکت نمونه پارس", "021-12345678", "021-12345679", "info@example.ir", "آقای رضایی", "تهران، خیابان آزادی"],
  ]);
  ws["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 26 }, { wch: 18 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "مشتریان");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent("قالب-مشتریان.xlsx"),
    },
  });
}

/**
 * درون‌ریزی گروهی مشتریان از فایل اکسل/CSV
 * POST /api/companies/import  (multipart: file)
 * خروجی: گزارش تعداد درج‌شده، تکراری و خطاها
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "فایلی ارسال نشده است" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let workbook: XLSX.WorkBook;
    try {
      const fileName = (file.name || "").toLowerCase();
      if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
        // فایل‌های متنی: ابتدا UTF-8 (با/بدون BOM) — در غیر این صورت windows-1256
        // تا سرفصل‌های فارسی CSV به‌درستی خوانده شوند (بدون به‌هم‌ریختگی حروف).
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch {
          text = new TextDecoder("windows-1256").decode(buffer);
        }
        text = text.replace(/^\uFEFF/, "");
        workbook = XLSX.read(text, { type: "string" });
      } else {
        workbook = XLSX.read(buffer, { type: "buffer" });
      }
    } catch {
      return NextResponse.json({ error: "فایل قابل خواندن نیست — فرمت باید Excel (.xlsx/.xls) یا CSV باشد" }, { status: 400 });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      return NextResponse.json({ error: "هیچ برگه‌ای در فایل یافت نشد" }, { status: 400 });
    }

    // به‌صورت آرایه‌ای از سطرها می‌خوانیم تا روی سرفصل کنترل کامل داشته باشیم
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    if (rows.length < 2) {
      return NextResponse.json({ error: "فایل فقط سرفصل دارد یا خالی است" }, { status: 400 });
    }

    const headers = (rows[0] as unknown[]).map((h) => String(h ?? ""));
    const colMap = findColumnMapping(headers);

    if (colMap.name === undefined) {
      return NextResponse.json(
        { error: "ستون «نام شرکت» یافت نشد — سرفصل باید شامل: نام شرکت، تلفن، فکس، ایمیل، مسئول، آدرس باشد", headers },
        { status: 400 }
      );
    }

    // فهرست نام‌های موجود در دیتابیس — برای جلوگیری از تکراری
    const existing = await db.select({ name: companies.name }).from(companies);
    const existingNames = new Set(existing.map((c) => normalizeNameKey(c.name)));

    const createdBy = req.nextUrl.searchParams.get("userId");
    let inserted = 0;
    let duplicates = 0;
    let invalid = 0;
    const errors: Array<{ row: number; reason: string }> = [];
    const seenInFile = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      const rowNum = i + 1;
      const get = (field: string) => {
        const idx = colMap[field];
        return idx === undefined ? null : cellToString(row[idx]);
      };

      const name = get("name");
      if (!name) {
        // سطر کاملاً خالی را رد می‌کنیم بدون خطا
        const isEmpty = row.every((c) => cellToString(c) === null);
        if (!isEmpty) {
          invalid++;
          errors.push({ row: rowNum, reason: "نام شرکت خالی است" });
        }
        continue;
      }

      const nameNorm = normalizeNameKey(name);
      if (existingNames.has(nameNorm) || seenInFile.has(nameNorm)) {
        duplicates++;
        continue;
      }

      try {
        await db.insert(companies).values({
          name: name.trim(),
          phone: get("phone"),
          fax: get("fax"),
          email: get("email"),
          address: get("address"),
          contactPerson: get("contactPerson"),
          createdBy: createdBy ? parseInt(createdBy) : null,
        });
        inserted++;
        seenInFile.add(nameNorm);
      } catch (e) {
        invalid++;
        errors.push({ row: rowNum, reason: e instanceof Error ? e.message : "خطای ناشناخته" });
      }
    }

    return NextResponse.json({
      total: rows.length - 1,
      inserted,
      duplicates,
      invalid,
      errors: errors.slice(0, 50),
      detectedColumns: headers.filter((_, idx) => Object.values(colMap).includes(idx)),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Import error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
