import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findDuplicateCompany, duplicateCompanyMessage } from "@/lib/duplicates";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    // به‌روزرسانی جزئی — فقط فیلدهایی که ارسال شده‌اند تغییر می‌کنند
    // (تا همگام‌سازی خودکار از فرم نامه، سایر اطلاعات شرکت را پاک نکند)
    // جلوگیری از تغییر نام به نامی که قبلاً (با/بدون فاصله) ثبت شده
    if (body.name !== undefined && String(body.name).trim()) {
      const dup = await findDuplicateCompany(String(body.name), parseInt(id));
      if (dup) {
        return NextResponse.json(
          { error: duplicateCompanyMessage(dup.name), duplicate: true, existing: dup },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    const fields = ["name", "phone", "fax", "email", "address", "contactPerson", "communicationMethod", "communicationId", "updatedBy"] as const;
    for (const f of fields) {
      if (body[f] !== undefined) {
        updateData[f] = body[f] === "" ? null : body[f];
      }
    }

    const result = await db
      .update(companies)
      .set(updateData)
      .where(eq(companies.id, parseInt(id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "شرکت یافت نشد" }, { status: 404 });
    }
    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.delete(companies).where(eq(companies.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
