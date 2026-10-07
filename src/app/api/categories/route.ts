import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { equipmentCategories } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db.select().from(equipmentCategories).orderBy(desc(equipmentCategories.id));
    return NextResponse.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await db.insert(equipmentCategories).values(body).returning();
    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
