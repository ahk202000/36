import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { equipment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findDuplicateEquipment, duplicateEquipmentMessage } from "@/lib/duplicates";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const name = String(body?.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "نام تجهیز الزامی است" }, { status: 400 });
    }

    // جلوگیری از تغییر نام به نامی که قبلاً (با/بدون فاصله) ثبت شده
    const dup = await findDuplicateEquipment(name, parseInt(id));
    if (dup) {
      return NextResponse.json(
        { error: duplicateEquipmentMessage(dup.name), duplicate: true, existing: dup },
        { status: 409 }
      );
    }

    const result = await db
      .update(equipment)
      .set({
        name,
        categoryId: body.categoryId ? parseInt(body.categoryId) : null,
        description: body.description || null,
        unitPrice: body.unitPrice || "0",
        pricePerPoint: body.pricePerPoint || false,
        calibrationLocation: body.calibrationLocation || null,
        imagePath: body.imagePath || null,
      })
      .where(eq(equipment.id, parseInt(id)))
      .returning();
    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.delete(equipment).where(eq(equipment.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
