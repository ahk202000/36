import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  proformaItems,
  proformaInvoices,
  proformaTypes,
  companies,
  equipment,
} from "@/db/schema";
import { eq, ne, desc, and, sql, SQL } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * جستجوی «سابقه تجهیزات» در پیش‌فاکتورهای همه مشتریان
 * برای پنل جستجوی سابقه در فرم صدور پیش‌فاکتور — یکی یا چند قلم از
 * نتایج را می‌توان مستقیم به لیست اقلام پیش‌فاکتور جاری اضافه کرد.
 *
 * GET /api/proforma/search-history
 *   ?q=...                 کلمه(های) جستجو در نام تجهیز / شرح / نام مشتری
 *   &excludeCompanyId=1    پیش‌فاکتورهای این مشتری از نتایج حذف می‌شوند (پیش‌فرض: بدون حذف)
 *   &excludeProformaId=5   پیش‌فاکتور در حال ویرایش از نتایج حذف می‌شود
 *   &limit=60              سقف تعداد نتایج (پیش‌فرض ۶۰، حداکثر ۲۰۰)
 *
 * بدون q → جدیدترین اقلام ثبت‌شده در کل سیستم برمی‌گردد.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q") || "").trim();
    const excludeCompanyIdRaw = sp.get("excludeCompanyId");
    const excludeProformaIdRaw = sp.get("excludeProformaId");
    const limitRaw = parseInt(sp.get("limit") || "60");
    const limit = Math.min(isNaN(limitRaw) ? 60 : Math.max(limitRaw, 1), 200);

    const conditions: SQL[] = [];

    // حذف سوابقِ مشتری فعلی (جستجو فقط در «مشتریان دیگر») — اختیاری
    if (excludeCompanyIdRaw && !isNaN(parseInt(excludeCompanyIdRaw))) {
      conditions.push(ne(proformaInvoices.companyId, parseInt(excludeCompanyIdRaw)));
    }
    // خودِ پیش‌فاکتور در حال ویرایش نباید در نتایج بیاید
    if (excludeProformaIdRaw && !isNaN(parseInt(excludeProformaIdRaw))) {
      conditions.push(ne(proformaInvoices.id, parseInt(excludeProformaIdRaw)));
    }

    // جستجوی چندکلمه‌ای: همه واژه‌ها باید در «نام تجهیز + شرح + نام مشتری» پیدا شوند
    const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const token of tokens) {
      const pattern = `%${token.replace(/[%_]/g, "")}%`;
      conditions.push(
        sql`(COALESCE(${equipment.name}, '') || ' ' || COALESCE(${proformaItems.description}, '') || ' ' || COALESCE(${companies.name}, '')) ILIKE ${pattern}`
      );
    }

    const rows = await db
      .select({
        // شناسه قلم — برای کلید انتخاب در پنل
        id: proformaItems.id,
        proformaId: proformaItems.proformaId,
        equipmentId: proformaItems.equipmentId,
        equipmentName: equipment.name,
        description: proformaItems.description,
        quantity: proformaItems.quantity,
        unitPrice: proformaItems.unitPrice,
        pointCount: proformaItems.pointCount,
        totalPrice: proformaItems.totalPrice,
        calibrationLocation: proformaItems.calibrationLocation,
        paramValues: proformaItems.paramValues,
        // اطلاعات پیش‌فاکتور و مشتریِ صاحب سابقه
        proformaNumber: proformaInvoices.proformaNumber,
        issueDate: proformaInvoices.issueDate,
        status: proformaInvoices.status,
        typeName: proformaTypes.name,
        companyId: proformaInvoices.companyId,
        companyName: companies.name,
      })
      .from(proformaItems)
      .innerJoin(proformaInvoices, eq(proformaItems.proformaId, proformaInvoices.id))
      .leftJoin(proformaTypes, eq(proformaInvoices.proformaTypeId, proformaTypes.id))
      .leftJoin(companies, eq(proformaInvoices.companyId, companies.id))
      .leftJoin(equipment, eq(proformaItems.equipmentId, equipment.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      // جدیدترین پیش‌فاکتورها ابتدا
      .orderBy(desc(proformaInvoices.id), desc(proformaItems.id))
      .limit(limit);

    return NextResponse.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("search-history error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
