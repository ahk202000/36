import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proformaInvoices, proformaItems, equipment, letters, priceHistory } from "@/db/schema";
import { eq, desc, inArray, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const cid = parseInt(companyId);

    // حالت سبک: واکشی اقلام یک پیش‌فاکتور خاص (با کلیک روی لیست)
    const proformaIdParam = req.nextUrl.searchParams.get("proformaId");
    if (proformaIdParam) {
      const items = await db
        .select({
          id: proformaItems.id,
          description: proformaItems.description,
          equipmentName: equipment.name,
          quantity: proformaItems.quantity,
          unitPrice: proformaItems.unitPrice,
          pointCount: proformaItems.pointCount,
          totalPrice: proformaItems.totalPrice,
        })
        .from(proformaItems)
        .leftJoin(equipment, eq(proformaItems.equipmentId, equipment.id))
        .where(eq(proformaItems.proformaId, parseInt(proformaIdParam)))
        .orderBy(proformaItems.rowOrder);
      return NextResponse.json({ items });
    }

    // Proformas for this customer — بدون اقلام تا لیست سنگین نشود
    const proformas = await db
      .select({
        id: proformaInvoices.id,
        proformaNumber: proformaInvoices.proformaNumber,
        letterId: proformaInvoices.letterId,
        issueDate: proformaInvoices.issueDate,
        status: proformaInvoices.status,
        showTotal: proformaInvoices.showTotal,
        subtotal: proformaInvoices.subtotal,
        totalAmount: proformaInvoices.totalAmount,
        taxPercent: proformaInvoices.taxPercent,
        discountPercent: proformaInvoices.discountPercent,
      })
      .from(proformaInvoices)
      .where(eq(proformaInvoices.companyId, cid))
      .orderBy(desc(proformaInvoices.id));

    // فقط تعداد اقلام هر پیش‌فاکتور با یک کوئری گروهی
    const countByProforma = new Map<number, number>();
    if (proformas.length > 0) {
      const counts = await db
        .select({
          proformaId: proformaItems.proformaId,
          cnt: sql<number>`count(*)::int`,
        })
        .from(proformaItems)
        .where(inArray(proformaItems.proformaId, proformas.map((p) => p.id)))
        .groupBy(proformaItems.proformaId);
      for (const c of counts) countByProforma.set(c.proformaId, Number(c.cnt));
    }

    const proformaDetails = proformas.map((p) => ({
      ...p,
      itemCount: countByProforma.get(p.id) || 0,
    }));

    // Letters for this customer
    const customerLetters = await db
      .select({
        id: letters.id,
        letterNumber: letters.letterNumber,
        letterDate: letters.letterDate,
        registrationDate: letters.registrationDate,
        requestType: letters.requestType,
        status: letters.status,
        isFinalConfirmed: letters.isFinalConfirmed,
        finalConfirmedAt: letters.finalConfirmedAt,
      })
      .from(letters)
      .where(eq(letters.companyId, cid))
      .orderBy(desc(letters.id));
    
    // Letters with final confirmation = actual sales
    const confirmedSalesLetters = customerLetters.filter(l => l.isFinalConfirmed);

    // Equipment price history for this customer - distinct equipment
    const history = await db
      .select({
        id: priceHistory.id,
        equipmentId: priceHistory.equipmentId,
        equipmentName: equipment.name,
        unitPrice: priceHistory.unitPrice,
        pointCount: priceHistory.pointCount,
        quantity: priceHistory.quantity,
        priceDate: priceHistory.priceDate,
        proformaId: priceHistory.proformaId,
      })
      .from(priceHistory)
      .leftJoin(equipment, eq(priceHistory.equipmentId, equipment.id))
      .where(eq(priceHistory.companyId, cid))
      .orderBy(desc(priceHistory.createdAt));

    // Aggregate: per equipment latest price and count
    const equipmentSummary = new Map<number, { name: string | null; count: number; latestPrice: string; latestDate: string; allPrices: typeof history }>();
    for (const h of history) {
      if (!h.equipmentId) continue;
      if (!equipmentSummary.has(h.equipmentId)) {
        equipmentSummary.set(h.equipmentId, {
          name: h.equipmentName,
          count: 1,
          latestPrice: h.unitPrice,
          latestDate: h.priceDate,
          allPrices: [h],
        });
      } else {
        const s = equipmentSummary.get(h.equipmentId)!;
        s.count += 1;
        s.allPrices.push(h);
      }
    }

    // Totals
    const totalProformas = proformas.length;
    const totalAmountAll = proformas.reduce((sum, p) => sum + parseFloat(p.totalAmount || "0"), 0);
    const approvedCount = proformas.filter((p) => p.status === "approved").length;
    const pendingCount = proformas.filter((p) => p.status === "pending").length;

    // Calculate confirmed sales total (from proformas linked to confirmed letters)
    const confirmedLetterIds = new Set(confirmedSalesLetters.map(l => l.id));
    const confirmedProformas = proformas.filter(p => p.letterId && confirmedLetterIds.has(p.letterId));
    const confirmedSalesAmount = confirmedProformas.reduce((sum, p) => sum + parseFloat(p.totalAmount || "0"), 0);
    
    return NextResponse.json({
      proformas: proformaDetails,
      letters: customerLetters,
      confirmedSalesLetters,
      priceHistory: history,
      equipmentSummary: Array.from(equipmentSummary.entries()).map(([equipmentId, data]) => ({
        equipmentId,
        ...data,
      })),
      stats: {
        totalProformas,
        totalLetters: customerLetters.length,
        totalAmountAll,
        approvedCount,
        pendingCount,
        // New: Actual sales stats based on final confirmation
        confirmedSalesCount: confirmedSalesLetters.length,
        confirmedSalesAmount,
        confirmedProformasCount: confirmedProformas.length,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
