import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { letters, letterAttachments } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { referFinalSaleToExecutionDepartments } from "@/lib/referrals";
import { getNumberingContext, formatDocNumber, bumpSequence, type NumberingContext } from "@/lib/numbering";


export async function GET(req: NextRequest) {
  try {
    // فیلترهای اختیاری — در فرم نامه «تاییدیه استعلام» فقط نامه‌های قطعی‌شده‌ی
    // همان مشتری لازم است تا پیش‌فاکتورهای تکراری پیشنهاد داده نشوند.
    const companyIdParam = req.nextUrl.searchParams.get("companyId");
    const companyId = companyIdParam ? parseInt(companyIdParam) : NaN;
    const isFinalConfirmedParam = req.nextUrl.searchParams.get("isFinalConfirmed");

    const whereParts = [] as ReturnType<typeof sql>[];
    if (Number.isFinite(companyId)) whereParts.push(sql`l.company_id = ${companyId}`);
    if (isFinalConfirmedParam === "true") whereParts.push(sql`l.is_final_confirmed = true`);
    if (isFinalConfirmedParam === "false") whereParts.push(sql`l.is_final_confirmed = false`);
    const whereSql = whereParts.length > 0 ? sql`WHERE ${sql.join(whereParts, sql` AND `)}` : sql``;

    // Use raw query for multiple joins to same table
    const rows = await db.execute(sql`
      SELECT 
        l.id,
        l.letter_number as "letterNumber",
        l.company_id as "companyId",
        c.name as "companyName",
        l.registration_date as "registrationDate",
        l.letter_date as "letterDate",
        l.customer_letter_date as "customerLetterDate",
        l.customer_letter_number as "customerLetterNumber",
        l.request_type as "requestType",
        l.communication_method as "communicationMethod",
        l.communication_id as "communicationId",
        l.description,
        l.phone,
        l.fax,
        l.contact_person as "contactPerson",
        l.referral_department as "referralDepartment",
        l.save_path as "savePath",
        l.status,
        l.is_final_confirmed as "isFinalConfirmed",
        l.final_confirmed_at as "finalConfirmedAt",
        l.confirmed_proforma_id as "confirmedProformaId",
        l.created_by as "createdBy",
        l.updated_by as "updatedBy",
        l.created_at as "createdAt",
        l.updated_at as "updatedAt",
        cu.full_name as "createdByName",
        uu.full_name as "updatedByName"
      FROM letters l
      LEFT JOIN companies c ON l.company_id = c.id
      LEFT JOIN users cu ON l.created_by = cu.id
      LEFT JOIN users uu ON l.updated_by = uu.id
      ${whereSql}
      ORDER BY l.id DESC
    `);
    return NextResponse.json(rows.rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** یافتن اولین شماره یکتا از شمارنده به بعد (جلوگیری از شماره تکراری) */
async function nextUniqueLetterNumber(ctx: NumberingContext): Promise<{ letterNumber: string; seq: number }> {
  let seq = ctx.seq;
  // حداکثر ۱۰هزار تلاش — عملاً در اولین یا دومین تلاش پیدا می‌شود
  for (let i = 0; i < 10000; i++) {
    const candidate = formatDocNumber(ctx.format, seq, ctx.year);
    const clash = await db
      .select({ id: letters.id })
      .from(letters)
      .where(eq(letters.letterNumber, candidate))
      .limit(1);
    if (clash.length === 0) return { letterNumber: candidate, seq };
    seq += 1;
  }
  return { letterNumber: formatDocNumber(ctx.format, seq, ctx.year), seq };
}

// Get next letter number preview
export async function HEAD() {
  try {
    // پیش‌نمایش: بدون نوشتن در دیتابیس، اما با سال جاری و ریست سالانه
    const ctx = await getNumberingContext("letter", false);
    const { letterNumber } = await nextUniqueLetterNumber(ctx);

    return new NextResponse(null, {
      headers: {
        "X-Next-Letter-Number": encodeURIComponent(letterNumber),
        "X-Next-Letter-Year": String(ctx.year),
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // تعیین ارجاع هنگام ثبت نامه الزامی است
    if (!body.referralDepartment || !String(body.referralDepartment).trim()) {
      return NextResponse.json(
        { error: "تعیین ارجاع هنگام ثبت نامه الزامی است" },
        { status: 400 }
      );
    }

    // شماره نامه بر اساس سال جاری شمسی (با ریست خودکار شمارنده در سال جدید)
    const ctx = await getNumberingContext("letter", true);
    const { letterNumber, seq } = await nextUniqueLetterNumber(ctx);

    // Insert letter
    const result = await db
      .insert(letters)
      .values({
        letterNumber,
        companyId: body.companyId || null,
        registrationDate: body.registrationDate,
        letterDate: body.letterDate,
        customerLetterDate: body.customerLetterDate || null,
        customerLetterNumber: body.customerLetterNumber || null,
        requestType: body.requestType,
        communicationMethod: body.communicationMethod || null,
        communicationId: body.communicationId || null,
        description: body.description || null,
        phone: body.phone || null,
        fax: body.fax || null,
        contactPerson: body.contactPerson || null,
        referralDepartment: body.referralDepartment || null,
        savePath: body.savePath || (body.attachments && body.attachments[0]?.filePath) || null,
        status: "received",
        isFinalConfirmed: body.isFinalConfirmed || false,
        finalConfirmedAt: body.isFinalConfirmed ? new Date() : null,
        finalConfirmedBy: body.isFinalConfirmed ? body.finalConfirmedBy : null,
        confirmedProformaId: body.confirmedProformaId || null,
        createdBy: body.createdBy || null,
      })
      .returning();

    // Insert attachments if provided
    if (body.attachments && Array.isArray(body.attachments) && body.attachments.length > 0) {
      for (const att of body.attachments) {
        await db.insert(letterAttachments).values({
          letterId: result[0].id,
          attachmentType: att.attachmentType || "سایر",
          fileName: att.fileName,
          filePath: att.filePath || body.savePath || `/${letterNumber}/${att.fileName}`,
        });
      }
    }

    // Update sequence
    await bumpSequence(ctx, seq);

    // ── ارجاع خودکار فروش قطعی — سمت سرور تا پیوست نامه رنج همیشه همراه باشد ──
    if (result[0].isFinalConfirmed) {
      try {
        await referFinalSaleToExecutionDepartments({
          letterId: result[0].id,
          letterNumber: result[0].letterNumber,
          proformaId: result[0].confirmedProformaId ?? null,
          fromUserId: result[0].finalConfirmedBy ?? result[0].createdBy ?? null,
          requestType: result[0].requestType,
        });
      } catch (referralError) {
        console.error("ارجاع خودکار فروش قطعی ناموفق بود:", referralError);
      }
    }

    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
