import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { letters, companies } from "@/db/schema";
import { eq, desc, and, isNotNull, ne, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * آخرین اطلاعات تماس ثبت‌شده برای یک مشتری
 * ترکیبی از: آخرین نامه‌ها و پیش‌فاکتورهای مستقیم + کارت شرکت (پشتیبان)
 *
 * برای هر فیلد، آخرین مقدار غیرخالی ثبت‌شده برگردانده می‌شود.
 * GET /api/companies/[id]/last-contact
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const companyId = parseInt(id);
    if (isNaN(companyId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    // آخرین مقدار غیرخالی هر فیلد از میان نامه‌های این مشتری
    const result = await db.execute(sql`
      SELECT
        (SELECT contact_person FROM (
          SELECT contact_person, updated_at FROM letters
            WHERE company_id = ${companyId} AND contact_person IS NOT NULL AND contact_person <> ''
          UNION ALL
          SELECT contact_person, updated_at FROM companies
            WHERE id = ${companyId} AND contact_person IS NOT NULL AND contact_person <> ''
        ) AS contact_sources ORDER BY updated_at DESC NULLS LAST LIMIT 1) AS "contactPerson",
        (SELECT phone FROM (
          SELECT phone, updated_at FROM letters
            WHERE company_id = ${companyId} AND phone IS NOT NULL AND phone <> ''
          UNION ALL
          SELECT phone, updated_at FROM companies
            WHERE id = ${companyId} AND phone IS NOT NULL AND phone <> ''
        ) AS phone_sources ORDER BY updated_at DESC NULLS LAST LIMIT 1) AS "phone",
        (SELECT fax FROM (
          SELECT fax, updated_at FROM letters
            WHERE company_id = ${companyId} AND fax IS NOT NULL AND fax <> ''
          UNION ALL
          SELECT fax, updated_at FROM companies
            WHERE id = ${companyId} AND fax IS NOT NULL AND fax <> ''
        ) AS fax_sources ORDER BY updated_at DESC NULLS LAST LIMIT 1) AS "fax",
        (SELECT communication_method FROM (
          SELECT communication_method, updated_at FROM letters
            WHERE company_id = ${companyId} AND communication_method IS NOT NULL AND communication_method <> ''
          UNION ALL
          SELECT communication_method, updated_at FROM proforma_invoices
            WHERE company_id = ${companyId} AND communication_method IS NOT NULL AND communication_method <> ''
          UNION ALL
          SELECT communication_method, updated_at FROM companies
            WHERE id = ${companyId} AND communication_method IS NOT NULL AND communication_method <> ''
        ) AS communication_sources ORDER BY updated_at DESC NULLS LAST LIMIT 1) AS "communicationMethod",
        (SELECT communication_id FROM (
          SELECT communication_id, updated_at FROM letters
            WHERE company_id = ${companyId} AND communication_id IS NOT NULL AND communication_id <> ''
          UNION ALL
          SELECT communication_id, updated_at FROM proforma_invoices
            WHERE company_id = ${companyId} AND communication_id IS NOT NULL AND communication_id <> ''
          UNION ALL
          SELECT communication_id, updated_at FROM companies
            WHERE id = ${companyId} AND communication_id IS NOT NULL AND communication_id <> ''
        ) AS communication_sources ORDER BY updated_at DESC NULLS LAST LIMIT 1) AS "communicationId",
        (SELECT referral_department FROM letters
          WHERE company_id = ${companyId} AND referral_department IS NOT NULL AND referral_department <> ''
          ORDER BY id DESC LIMIT 1) AS "referralDepartment",
        (SELECT count(*) FROM letters WHERE company_id = ${companyId}) AS "letterCount",
        (SELECT count(*) FROM proforma_invoices
          WHERE company_id = ${companyId} AND communication_method IS NOT NULL AND communication_method <> '') AS "directProformaContactCount"
    `);

    const fromLetters = (result.rows[0] || {}) as Record<string, unknown>;

    // اطلاعات کارت شرکت — به‌عنوان پشتیبان وقتی نامه‌ای مقدار نداشته
    const companyRow = await db
      .select({
        contactPerson: companies.contactPerson,
        phone: companies.phone,
        fax: companies.fax,
        email: companies.email,
        address: companies.address,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const comp = companyRow[0] || {};

    const pick = (letterVal: unknown, compVal: unknown): string | null => {
      const l = letterVal ? String(letterVal).trim() : "";
      if (l) return l;
      const c = compVal ? String(compVal).trim() : "";
      return c || null;
    };

    return NextResponse.json({
      contactPerson: pick(fromLetters.contactPerson, comp.contactPerson),
      phone: pick(fromLetters.phone, comp.phone),
      fax: pick(fromLetters.fax, comp.fax),
      email: comp.email || null,
      address: comp.address || null,
      communicationMethod: fromLetters.communicationMethod ? String(fromLetters.communicationMethod) : null,
      communicationId: fromLetters.communicationId ? String(fromLetters.communicationId) : null,
      referralDepartment: fromLetters.referralDepartment ? String(fromLetters.referralDepartment) : null,
      letterCount: Number(fromLetters.letterCount || 0),
      directProformaContactCount: Number(fromLetters.directProformaContactCount || 0),
      // منبع اطلاعات ارتباط می‌تواند نامه یا پیش‌فاکتور مستقیم باشد
      source: Number(fromLetters.directProformaContactCount || 0) > 0
        ? "letters_or_direct_proformas"
        : Number(fromLetters.letterCount || 0) > 0
          ? "letters"
          : "company",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("last-contact error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
