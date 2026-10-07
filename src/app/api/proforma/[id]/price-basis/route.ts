import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * مبنای قیمت‌گذاری هر قلم پیش‌فاکتور — برای نمای مدیریتی
 *
 * برای هر قلم مشخص می‌کند قیمت واحد بر چه اساسی وارد شده است:
 *  1) سابقه قیمت همین تجهیز برای همین مشتری (پیش‌فاکتور قبلی) — با شماره و تاریخ
 *  2) تعرفه پایه ثبت‌شده روی خود تجهیز
 *  3) ورود دستی (بدون سابقه و متفاوت با تعرفه)
 *
 * GET /api/proforma/[id]/price-basis
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const proformaId = parseInt(id);
    if (isNaN(proformaId)) {
      return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
    }

    const result = await db.execute(sql`
      WITH cur AS (
        SELECT id, company_id, issue_date FROM proforma_invoices WHERE id = ${proformaId}
      ),
      items AS (
        SELECT
          i.id            AS item_id,
          i.equipment_id  AS equipment_id,
          i.unit_price    AS unit_price,
          i.point_count   AS point_count
        FROM proforma_items i
        WHERE i.proforma_id = ${proformaId}
      )
      SELECT
        it.item_id                       AS "itemId",
        it.equipment_id                  AS "equipmentId",
        it.unit_price                    AS "unitPrice",
        e.unit_price                     AS "equipmentBasePrice",
        e.price_per_point                AS "pricePerPoint",
        prev.unit_price                  AS "prevUnitPrice",
        prev.price_date                  AS "prevPriceDate",
        prev.proforma_number             AS "prevProformaNumber",
        prev.point_count                 AS "prevPointCount"
      FROM items it
      LEFT JOIN equipment e ON e.id = it.equipment_id
      LEFT JOIN LATERAL (
        SELECT ph.unit_price, ph.price_date, ph.point_count, p.proforma_number
        FROM price_history ph
        LEFT JOIN proforma_invoices p ON p.id = ph.proforma_id
        WHERE ph.equipment_id = it.equipment_id
          AND ph.company_id   = (SELECT company_id FROM cur)
          AND (ph.proforma_id IS NULL OR ph.proforma_id <> ${proformaId})
        ORDER BY ph.created_at DESC
        LIMIT 1
      ) prev ON TRUE
    `);

    const toNum = (v: unknown) => {
      const n = parseFloat(String(v ?? ""));
      return isNaN(n) ? null : n;
    };

    const basis = (result.rows as Array<Record<string, unknown>>).map((row) => {
      const unitPrice = toNum(row.unitPrice) ?? 0;
      const prevPrice = toNum(row.prevUnitPrice);
      const basePrice = toNum(row.equipmentBasePrice);

      // اولویت ۱: سابقه قیمت همین مشتری
      if (prevPrice !== null && prevPrice > 0) {
        const diff = unitPrice - prevPrice;
        const diffPercent = prevPrice > 0 ? (diff / prevPrice) * 100 : 0;
        return {
          itemId: Number(row.itemId),
          equipmentId: row.equipmentId ? Number(row.equipmentId) : null,
          source: "history" as const,
          label: "سابقه همین مشتری",
          referenceNumber: row.prevProformaNumber ? String(row.prevProformaNumber) : null,
          referenceDate: row.prevPriceDate ? String(row.prevPriceDate) : null,
          referencePrice: String(prevPrice),
          currentPrice: String(unitPrice),
          diff: String(diff),
          diffPercent: Number(diffPercent.toFixed(1)),
          isSame: Math.abs(diff) < 0.5,
        };
      }

      // اولویت ۲: تعرفه پایه ثبت‌شده روی تجهیز
      if (basePrice !== null && basePrice > 0) {
        const diff = unitPrice - basePrice;
        const diffPercent = basePrice > 0 ? (diff / basePrice) * 100 : 0;
        const isSame = Math.abs(diff) < 0.5;
        return {
          itemId: Number(row.itemId),
          equipmentId: row.equipmentId ? Number(row.equipmentId) : null,
          source: isSame ? ("catalog" as const) : ("manual_over_catalog" as const),
          label: isSame ? "تعرفه پایه تجهیز" : "ورود دستی (نسبت به تعرفه)",
          referenceNumber: null,
          referenceDate: null,
          referencePrice: String(basePrice),
          currentPrice: String(unitPrice),
          diff: String(diff),
          diffPercent: Number(diffPercent.toFixed(1)),
          isSame,
        };
      }

      // اولویت ۳: بدون هیچ مرجع
      return {
        itemId: Number(row.itemId),
        equipmentId: row.equipmentId ? Number(row.equipmentId) : null,
        source: "manual" as const,
        label: "ورود دستی",
        referenceNumber: null,
        referenceDate: null,
        referencePrice: null,
        currentPrice: String(unitPrice),
        diff: null,
        diffPercent: null,
        isSame: false,
      };
    });

    return NextResponse.json({ basis });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
