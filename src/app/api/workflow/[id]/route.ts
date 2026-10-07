import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workflowItems, proformaInvoices } from "@/db/schema";
import { eq } from "drizzle-orm";

/** نرمال‌سازی نام واحد (ی/ک عربی، نیم‌فاصله، فاصله‌های اضافی) */
const normFa = (s: string | null | undefined) =>
  (s || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ").replace(/\s+/g, " ").trim();

/**
 * وضعیت‌های پیش‌فاکتور که در آن‌ها «انجام شد» در کارتابل مدیریت مجاز است:
 * approved (تایید نهایی — توسط مدیریت یا تایید نهایی توسط بازرگانی)،
 * rejected (رد)، final_sale (نهایی شده / فروش قطعی)
 */
const STATUSES_ALLOWING_DONE = ["approved", "rejected", "final_sale"];

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    // ── محدودیت ثبت «انجام شد» در کارتابل مدیریت ──
    // فقط زمانی مجاز است که پیش‌فاکتور مرتبط نهایی شده باشد:
    // تایید نهایی / تایید نهایی توسط بازرگانی (approved)، رد (rejected) یا فروش قطعی (final_sale)
    if (body.doneStatus === "done") {
      const rows = await db
        .select({
          proformaId: workflowItems.proformaId,
          toDepartment: workflowItems.toDepartment,
        })
        .from(workflowItems)
        .where(eq(workflowItems.id, parseInt(id)))
        .limit(1);

      const wf = rows[0];
      if (wf?.proformaId && normFa(wf.toDepartment) === "مدیریت") {
        const pf = await db
          .select({ status: proformaInvoices.status })
          .from(proformaInvoices)
          .where(eq(proformaInvoices.id, wf.proformaId))
          .limit(1);
        const status = pf[0]?.status || "";
        if (!STATUSES_ALLOWING_DONE.includes(status)) {
          return NextResponse.json(
            {
              error:
                "ثبت «انجام شد» فقط پس از نهایی شدن پیش‌فاکتور ممکن است: تایید نهایی، تایید نهایی توسط بازرگانی، رد یا فروش قطعی. وضعیت فعلی پیش‌فاکتور هنوز نهایی نشده است.",
              proformaStatus: status,
            },
            { status: 409 }
          );
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.isRead !== undefined) updateData.isRead = body.isRead;
    if (body.doneStatus !== undefined) updateData.doneStatus = body.doneStatus;
    if (body.doneBy !== undefined) updateData.doneBy = body.doneBy;
    // زمان ثبت وضعیت همیشه سمت سرور تعیین می‌شود تا ساعت فعالیت در همه بخش‌ها یکسان باشد
    if (body.doneAt !== undefined) updateData.doneAt = new Date(body.doneAt);
    else if (body.doneStatus !== undefined) updateData.doneAt = new Date();
    if (body.note !== undefined) updateData.note = body.note;

    const result = await db
      .update(workflowItems)
      .set(updateData)
      .where(eq(workflowItems.id, parseInt(id)))
      .returning();
    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
