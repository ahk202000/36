import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { equipmentParams, equipmentCategories, equipment } from "@/db/schema";
import { eq, or, and, isNull, asc, desc, sql } from "drizzle-orm";

const baseFields = {
  id: equipmentParams.id,
  categoryId: equipmentParams.categoryId,
  equipmentId: equipmentParams.equipmentId,
  paramName: equipmentParams.paramName,
  paramUnit: equipmentParams.paramUnit,
  sortOrder: equipmentParams.sortOrder,
  categoryName: equipmentCategories.name,
};

export async function GET(req: NextRequest) {
  try {
    const categoryId = req.nextUrl.searchParams.get("categoryId");
    const equipmentId = req.nextUrl.searchParams.get("equipmentId");

    // پارامترهای یک تجهیز: پارامترهای اختصاصی + پارامترهای دسته‌بندی آن
    if (equipmentId) {
      const eqId = parseInt(equipmentId);
      const eqRow = await db
        .select({ categoryId: equipment.categoryId })
        .from(equipment)
        .where(eq(equipment.id, eqId))
        .limit(1);

      const catId = eqRow[0]?.categoryId ?? null;

      const rows = await db
        .select(baseFields)
        .from(equipmentParams)
        .leftJoin(equipmentCategories, eq(equipmentParams.categoryId, equipmentCategories.id))
        .where(
          catId
            ? or(
                eq(equipmentParams.equipmentId, eqId),
                and(eq(equipmentParams.categoryId, catId), isNull(equipmentParams.equipmentId))
              )
            : eq(equipmentParams.equipmentId, eqId)
        )
        .orderBy(asc(equipmentParams.sortOrder), asc(equipmentParams.id));

      return NextResponse.json(rows);
    }

    if (categoryId) {
      const rows = await db
        .select(baseFields)
        .from(equipmentParams)
        .leftJoin(equipmentCategories, eq(equipmentParams.categoryId, equipmentCategories.id))
        .where(eq(equipmentParams.categoryId, parseInt(categoryId)))
        .orderBy(asc(equipmentParams.sortOrder), desc(equipmentParams.id));
      return NextResponse.json(rows);
    }

    const rows = await db
      .select(baseFields)
      .from(equipmentParams)
      .leftJoin(equipmentCategories, eq(equipmentParams.categoryId, equipmentCategories.id))
      .orderBy(asc(equipmentParams.sortOrder), desc(equipmentParams.id));
    return NextResponse.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // محاسبه ترتیب بعدی برای پارامترهای همان تجهیز/دسته
    let sortOrder = body.sortOrder ?? 0;
    if (sortOrder === 0) {
      const scope = body.equipmentId
        ? eq(equipmentParams.equipmentId, parseInt(body.equipmentId))
        : body.categoryId
        ? eq(equipmentParams.categoryId, parseInt(body.categoryId))
        : undefined;
      if (scope) {
        const maxRow = await db
          .select({ maxOrder: sql<number>`COALESCE(MAX(${equipmentParams.sortOrder}), 0)::int` })
          .from(equipmentParams)
          .where(scope);
        sortOrder = Number(maxRow[0]?.maxOrder || 0) + 1;
      }
    }

    const result = await db
      .insert(equipmentParams)
      .values({
        categoryId: body.categoryId ? parseInt(body.categoryId) : null,
        equipmentId: body.equipmentId ? parseInt(body.equipmentId) : null,
        paramName: body.paramName,
        paramUnit: body.paramUnit || null,
        sortOrder,
      })
      .returning();
    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
