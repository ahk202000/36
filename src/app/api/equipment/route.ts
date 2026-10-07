import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { equipment, equipmentCategories } from "@/db/schema";
import { eq, desc, ilike } from "drizzle-orm";
import { findDuplicateEquipment, duplicateEquipmentMessage } from "@/lib/duplicates";

const selectFields = {
  id: equipment.id,
  name: equipment.name,
  categoryId: equipment.categoryId,
  categoryName: equipmentCategories.name,
  parentEquipmentId: equipment.parentEquipmentId,
  description: equipment.description,
  unitPrice: equipment.unitPrice,
  pricePerPoint: equipment.pricePerPoint,
  calibrationLocation: equipment.calibrationLocation,
  imagePath: equipment.imagePath,
};

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get("search") || "";

    const rows = search
      ? await db.select(selectFields).from(equipment).leftJoin(equipmentCategories, eq(equipment.categoryId, equipmentCategories.id)).where(ilike(equipment.name, `%${search}%`)).orderBy(desc(equipment.id))
      : await db.select(selectFields).from(equipment).leftJoin(equipmentCategories, eq(equipment.categoryId, equipmentCategories.id)).orderBy(desc(equipment.id));

    return NextResponse.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "نام تجهیز الزامی است" }, { status: 400 });
    }

    // جلوگیری از ثبت تجهیز تکراری (بدون توجه به فاصله/نیم‌فاصله)
    const dup = await findDuplicateEquipment(name);
    if (dup) {
      return NextResponse.json(
        { error: duplicateEquipmentMessage(dup.name), duplicate: true, existing: dup },
        { status: 409 }
      );
    }

    const result = await db.insert(equipment).values({
      name,
      categoryId: body.categoryId ? parseInt(body.categoryId) : null,
      parentEquipmentId: body.parentEquipmentId ? parseInt(body.parentEquipmentId) : null,
      description: body.description || null,
      unitPrice: body.unitPrice || "0",
      pricePerPoint: body.pricePerPoint || false,
      calibrationLocation: body.calibrationLocation || null,
      imagePath: body.imagePath || null,
    }).returning();
    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
