import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proformaInvoices, proformaItems, proformaTypes, equipment } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * سوابق پیش‌فاکتورهای یک مشتری همراه با اقلامشان
 * برای بخش «سوابق مشتری» و «کپی اقلام» در فرم صدور پیش‌فاکتور
 * GET /api/proforma/copy-items?companyId=1[&excludeId=5]
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    const excludeId = req.nextUrl.searchParams.get("excludeId");

    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const cid = parseInt(companyId);
    if (isNaN(cid)) {
      return NextResponse.json({ error: "companyId must be a number" }, { status: 400 });
    }

    // پیش‌فاکتورهای قبلی این مشتری (جدیدترین اول)
    const proformas = await db
      .select({
        id: proformaInvoices.id,
        proformaNumber: proformaInvoices.proformaNumber,
        typeName: proformaTypes.name,
        issueDate: proformaInvoices.issueDate,
        status: proformaInvoices.status,
        showTotal: proformaInvoices.showTotal,
        totalAmount: proformaInvoices.totalAmount,
      })
      .from(proformaInvoices)
      .leftJoin(proformaTypes, eq(proformaInvoices.proformaTypeId, proformaTypes.id))
      .where(eq(proformaInvoices.companyId, cid))
      .orderBy(desc(proformaInvoices.id))
      .limit(30);

    // در حالت ویرایش، خود پیش‌فاکتور جاری را از سوابق حذف می‌کنیم
    const filtered = excludeId
      ? proformas.filter((p) => p.id !== parseInt(excludeId))
      : proformas;

    if (filtered.length === 0) {
      return NextResponse.json([]);
    }

    // واکشی همه اقلام در یک کوئری و گروه‌بندی در حافظه
    const allItems = await db
      .select({
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
        rowOrder: proformaItems.rowOrder,
      })
      .from(proformaItems)
      .leftJoin(equipment, eq(proformaItems.equipmentId, equipment.id))
      .where(inArray(proformaItems.proformaId, filtered.map((p) => p.id)))
      .orderBy(proformaItems.rowOrder);

    const itemsByProforma = new Map<number, typeof allItems>();
    for (const it of allItems) {
      const list = itemsByProforma.get(it.proformaId) || [];
      list.push(it);
      itemsByProforma.set(it.proformaId, list);
    }

    const result = filtered.map((p) => ({
      ...p,
      items: itemsByProforma.get(p.id) || [],
    }));

    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("copy-items error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
