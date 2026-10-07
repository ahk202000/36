import { NextResponse } from "next/server";
import { db } from "@/db";
import { letters } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getNumberingContext, formatDocNumber } from "@/lib/numbering";

export const dynamic = "force-dynamic";

/**
 * پیش‌نمایش شماره نامه بعدی — بر اساس سال جاری شمسی.
 * GET /api/letters/next-number → { letterNumber, year, seq, format }
 * (بدون تغییر در دیتابیس؛ شمارنده فقط هنگام ثبت واقعی نامه افزایش می‌یابد)
 */
export async function GET() {
  try {
    const ctx = await getNumberingContext("letter", false);
    let seq = ctx.seq;
    let letterNumber = formatDocNumber(ctx.format, seq, ctx.year);
    for (let i = 0; i < 10000; i++) {
      const clash = await db
        .select({ id: letters.id })
        .from(letters)
        .where(eq(letters.letterNumber, letterNumber))
        .limit(1);
      if (clash.length === 0) break;
      seq += 1;
      letterNumber = formatDocNumber(ctx.format, seq, ctx.year);
    }
    return NextResponse.json({
      letterNumber,
      year: ctx.year,
      seq,
      format: ctx.format,
      rolledOver: ctx.rolledOver,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
