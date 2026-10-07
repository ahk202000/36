import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { normalizeNameKey } from "@/lib/utils";
import { equipment, equipmentCategories } from "@/db/schema";
import * as XLSX from "xlsx";
import { toEnglishDigits } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// نگاشت سرفصل‌های پذیرفته‌شده
const COLUMN_MAP: Record<string, string[]> = {
  name: ["نام تجهیز", "نام", "تجهیز", "عنوان", "name", "equipment", "equipment_name", "equipmentname", "title"],
  category: ["دسته‌بندی", "دسته بندی", "دسته", "گروه", "category", "group", "category_name", "categoryname"],
  unitPrice: ["قیمت واحد", "قیمت واحد (ریال)", "قیمت", "تعرفه", "نرخ", "مبلغ", "unit_price", "price", "unitprice", "rate", "cost"],
  pricePerPoint: ["قیمت هر نقطه", "قیمت هر نقطه (بله/خیر)", "نقطه‌ای", "تجهیز نقطه‌ای", "نقطه ای", "price_per_point", "priceperpoint", "per_point", "point", "is_point"],
  calibrationLocation: ["محل کالیبراسیون", "محل کالیبره", "محل", "موقعیت", "calibration_location", "location", "calibrationlocation"],
  description: ["توضیحات", "شرح", "مشخصات", "description", "desc", "details", "notes"],
};

function normalizeHeader(h: string): string {
  return String(h || "")
    .trim()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
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

function parsePrice(v: unknown): string {
  if (v === null || v === undefined) return "0";
  const str = toEnglishDigits(String(v)).replace(/[,،\s_]/g, "");
  const num = parseFloat(str);
  return isNaN(num) || num < 0 ? "0" : Math.round(num).toString();
}

function parseBoolean(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return ["بله", "دارد", "true", "yes", "1", "۱", "y"].includes(s);
}

/**
 * دانلود قالب نمونه اکسل برای درون‌ریزی تجهیزات
 * GET /api/equipment/import
 */
export async function GET() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["نام تجهیز", "دسته‌بندی", "قیمت واحد (ریال)", "قیمت هر نقطه (بله/خیر)", "محل کالیبراسیون", "توضیحات"],
    ["انکوباتور دمای پایین ۵۳ لیتری", "انکوباتور", "25000000", "خیر", "سایت مشتری", "کالیبراسیون در ۹ نقطه دمایی"],
    ["دماسنج شیشه‌ای مایع در شیشه", "دماسنج", "8500000", "بله", "آزمایشگاه بهسا", "قیمت برای هر نقطه دمایی محاسبه می‌شود"],
    ["گیج فشار عقربه‌ای تا ۱۰۰ بار", "فشارسنج", "12000000", "خیر", "سایت مشتری -آزمایشگاه بهسا", ""],
  ]);
  ws["!cols"] = [{ wch: 35 }, { wch: 18 }, { wch: 20 }, { wch: 24 }, { wch: 28 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "تجهیزات");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent("قالب-تجهیزات.xlsx"),
    },
  });
}

/**
 * درون‌ریزی گروهی تجهیزات از فایل اکسل/CSV
 * POST /api/equipment/import (multipart: file)
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

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    if (rows.length < 2) {
      return NextResponse.json({ error: "فایل فقط سرفصل دارد یا خالی است" }, { status: 400 });
    }

    const headers = (rows[0] as unknown[]).map((h) => String(h ?? ""));
    const colMap = findColumnMapping(headers);

    if (colMap.name === undefined) {
      return NextResponse.json(
        {
          error: "ستون «نام تجهیز» یافت نشد — سرفصل باید شامل: نام تجهیز، دسته‌بندی، قیمت واحد، قیمت هر نقطه، محل کالیبراسیون، توضیحات باشد",
          headers,
        },
        { status: 400 }
      );
    }

    // واکشی تجهیزات موجود برای جلوگیری از تکرار
    const existingEq = await db.select({ name: equipment.name }).from(equipment);
    const existingNames = new Set(existingEq.map((e) => normalizeNameKey(e.name)));

    // واکشی دسته‌بندی‌های موجود
    const existingCats = await db.select().from(equipmentCategories);
    const categoryMap = new Map<string, number>();
    for (const c of existingCats) {
      categoryMap.set(normalizeNameKey(c.name), c.id);
    }

    let inserted = 0;
    let duplicates = 0;
    let invalid = 0;
    let createdCategoriesCount = 0;
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
        const isEmpty = row.every((c) => cellToString(c) === null);
        if (!isEmpty) {
          invalid++;
          errors.push({ row: rowNum, reason: "نام تجهیز خالی است" });
        }
        continue;
      }

      const nameNorm = normalizeNameKey(name);
      if (existingNames.has(nameNorm) || seenInFile.has(nameNorm)) {
        duplicates++;
        continue;
      }

      // تعیین یا ایجاد دسته‌بندی
      let categoryId: number | null = null;
      const catName = get("category");
      if (catName) {
        const catNorm = normalizeNameKey(catName).toLowerCase();
        if (categoryMap.has(catNorm)) {
          categoryId = categoryMap.get(catNorm)!;
        } else {
          // ایجاد دسته‌بندی جدید به طور خودکار
          try {
            const newCat = await db
              .insert(equipmentCategories)
              .values({ name: catName.trim() })
              .returning();
            categoryId = newCat[0].id;
            categoryMap.set(catNorm, categoryId);
            createdCategoriesCount++;
          } catch {
            categoryId = null;
          }
        }
      }

      try {
        await db.insert(equipment).values({
          name: name.trim(),
          categoryId,
          unitPrice: parsePrice(get("unitPrice")),
          pricePerPoint: parseBoolean(get("pricePerPoint")),
          calibrationLocation: get("calibrationLocation"),
          description: get("description"),
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
      createdCategoriesCount,
      errors: errors.slice(0, 50),
      detectedColumns: headers.filter((_, idx) => Object.values(colMap).includes(idx)),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Equipment import error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
