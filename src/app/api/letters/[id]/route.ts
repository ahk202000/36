import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { letters, companies, letterAttachments, proformaInvoices, workflowItems, users } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { referFinalSaleToExecutionDepartments } from "@/lib/referrals";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // Use raw query for multiple joins to same table (users)
    const result = await db.execute(sql`
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
        l.final_confirmed_by as "finalConfirmedBy",
        l.confirmed_proforma_id as "confirmedProformaId",
        l.created_by as "createdBy",
        l.updated_by as "updatedBy",
        l.created_at as "createdAt",
        l.updated_at as "updatedAt",
        cu.full_name as "createdByName",
        uu.full_name as "updatedByName",
        fu.full_name as "finalConfirmedByName"
      FROM letters l
      LEFT JOIN companies c ON l.company_id = c.id
      LEFT JOIN users cu ON l.created_by = cu.id
      LEFT JOIN users uu ON l.updated_by = uu.id
      LEFT JOIN users fu ON l.final_confirmed_by = fu.id
      WHERE l.id = ${parseInt(id)}
    `);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const attachments = await db
      .select()
      .from(letterAttachments)
      .where(eq(letterAttachments.letterId, parseInt(id)));

    // Get related proformas for this letter (پرونده)
    const proformas = await db
      .select({
        id: proformaInvoices.id,
        proformaNumber: proformaInvoices.proformaNumber,
        revisionNo: proformaInvoices.revisionNo,
        letterSeq: proformaInvoices.letterSeq,
        issueDate: proformaInvoices.issueDate,
        status: proformaInvoices.status,
        totalAmount: proformaInvoices.totalAmount,
      })
      .from(proformaInvoices)
      .where(eq(proformaInvoices.letterId, parseInt(id)))
      .orderBy(desc(proformaInvoices.id));

    // Get workflow history
    const workflow = await db
      .select()
      .from(workflowItems)
      .where(eq(workflowItems.letterId, parseInt(id)))
      .orderBy(desc(workflowItems.createdAt));

    return NextResponse.json({ ...result.rows[0], attachments, proformas, workflow });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    // Check if finalConfirmed status is changing
    const existingLetter = await db.select().from(letters).where(eq(letters.id, parseInt(id)));
    const wasFinalConfirmed = existingLetter.length > 0 ? existingLetter[0].isFinalConfirmed : false;
    const isFinalConfirmedNow = body.isFinalConfirmed || false;
    
    const result = await db
      .update(letters)
      .set({
        companyId: body.companyId,
        registrationDate: body.registrationDate,
        letterDate: body.letterDate,
        customerLetterDate: body.customerLetterDate,
        customerLetterNumber: body.customerLetterNumber,
        requestType: body.requestType,
        communicationMethod: body.communicationMethod,
        communicationId: body.communicationId,
        description: body.description,
        phone: body.phone,
        fax: body.fax,
        contactPerson: body.contactPerson,
        referralDepartment: body.referralDepartment,
        savePath: body.savePath,
        status: body.status,
        isFinalConfirmed: isFinalConfirmedNow,
        // Only set finalConfirmedAt when transitioning to confirmed
        finalConfirmedAt: isFinalConfirmedNow && !wasFinalConfirmed ? new Date() : (isFinalConfirmedNow ? existingLetter[0]?.finalConfirmedAt : null),
        finalConfirmedBy: isFinalConfirmedNow ? (body.finalConfirmedBy || existingLetter[0]?.finalConfirmedBy) : null,
        confirmedProformaId: body.confirmedProformaId || existingLetter[0]?.confirmedProformaId || null,
        updatedBy: body.updatedBy || null,
        updatedAt: new Date(),
      })
      .where(eq(letters.id, parseInt(id)))
      .returning();

    // Handle attachments if provided
    if (body.attachments && Array.isArray(body.attachments)) {
      // Delete old and insert new? Simple approach: delete all and re-insert
      await db.delete(letterAttachments).where(eq(letterAttachments.letterId, parseInt(id)));
      for (const att of body.attachments) {
        await db.insert(letterAttachments).values({
          letterId: parseInt(id),
          attachmentType: att.attachmentType || "سایر",
          fileName: att.fileName,
          filePath: att.filePath || body.savePath || `/${result[0].letterNumber}/${att.fileName}`,
        });
      }
    }

    // ── ارجاع خودکار فروش قطعی — سمت سرور تا پیوست نامه رنج همیشه همراه باشد ──
    // (فایل از خود دیتابیس خوانده می‌شود؛ به مقادیر سمت کلاینت اتکا نیست)
    if (isFinalConfirmedNow) {
      try {
        await referFinalSaleToExecutionDepartments({
          letterId: parseInt(id),
          letterNumber: result[0].letterNumber,
          proformaId: result[0].confirmedProformaId ?? null,
          fromUserId: body.finalConfirmedBy || body.updatedBy || null,
          requestType: result[0].requestType,
        });
      } catch (referralError) {
        // شکست ارجاع نباید ذخیره نامه را فایل کند — خطا ثبت و جریان ادامه می‌یابد
        console.error("ارجاع خودکار فروش قطعی ناموفق بود:", referralError);
      }
    }

    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
