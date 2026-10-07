import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db.select().from(settings);
    return NextResponse.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, settingValue, year } = body;
    const patch: { settingValue?: string; year?: number | null; updatedAt: Date } = { updatedAt: new Date() };
    if (settingValue !== undefined) patch.settingValue = String(settingValue);
    if (year !== undefined) {
      const y = year === null || year === "" ? null : parseInt(String(year));
      patch.year = y === null || Number.isNaN(y) ? null : y;
    }
    const result = await db
      .update(settings)
      .set(patch)
      .where(eq(settings.id, id))
      .returning();
    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { settingKey, settingValue, year } = body;
    const result = await db
      .insert(settings)
      .values({ settingKey, settingValue, year: year || null })
      .returning();
    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
