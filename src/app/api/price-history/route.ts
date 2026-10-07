import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { priceHistory, equipment, companies, proformaInvoices } from "@/db/schema";
import { eq, and, desc, ne, or, isNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const equipmentId = req.nextUrl.searchParams.get("equipmentId");
    const companyId = req.nextUrl.searchParams.get("companyId");
    // پیش‌فاکتور جاری نباید در سوابق قیمت خودش نمایش داده شود
    const excludeProformaIdRaw = req.nextUrl.searchParams.get("excludeProformaId");
    const excludeProformaId =
      excludeProformaIdRaw && !isNaN(parseInt(excludeProformaIdRaw))
        ? parseInt(excludeProformaIdRaw)
        : null;

    if (!equipmentId || !companyId) {
      return NextResponse.json([]);
    }

    const rows = await db
      .select({
        id: priceHistory.id,
        equipmentId: priceHistory.equipmentId,
        equipmentName: equipment.name,
        companyId: priceHistory.companyId,
        companyName: companies.name,
        proformaId: priceHistory.proformaId,
        proformaNumber: proformaInvoices.proformaNumber,
        unitPrice: priceHistory.unitPrice,
        pointCount: priceHistory.pointCount,
        quantity: priceHistory.quantity,
        priceDate: priceHistory.priceDate,
        createdAt: priceHistory.createdAt,
      })
      .from(priceHistory)
      .leftJoin(equipment, eq(priceHistory.equipmentId, equipment.id))
      .leftJoin(companies, eq(priceHistory.companyId, companies.id))
      .leftJoin(proformaInvoices, eq(priceHistory.proformaId, proformaInvoices.id))
      .where(
        and(
          eq(priceHistory.equipmentId, parseInt(equipmentId)),
          eq(priceHistory.companyId, parseInt(companyId)),
          // سوابق متعلق به پیش‌فاکتور جاری حذف می‌شوند
          // (ردیف‌های بدون proformaId همچنان نمایش داده می‌شوند)
          ...(excludeProformaId !== null
            ? [
                or(
                  isNull(priceHistory.proformaId),
                  ne(priceHistory.proformaId, excludeProformaId)
                ),
              ]
            : [])
        )
      )
      .orderBy(desc(priceHistory.createdAt));

    // حذف سوابق تکراری بر اساس proformaId و unitPrice
    const uniqueRows: typeof rows = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.proformaId || 0}-${row.unitPrice}-${row.pointCount || 0}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRows.push(row);
      }
    }

    return NextResponse.json(uniqueRows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
