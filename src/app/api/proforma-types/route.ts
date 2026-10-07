import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proformaTypes } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db.select().from(proformaTypes);
    return NextResponse.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await db
      .update(proformaTypes)
      .set({
        defaultTextBefore: body.defaultTextBefore,
        defaultTextAfter: body.defaultTextAfter,
        defaultTextLastPage: body.defaultTextLastPage,
        signatureText: body.signatureText,
      })
      .where(eq(proformaTypes.id, body.id))
      .returning();
    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
