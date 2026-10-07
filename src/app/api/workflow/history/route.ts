import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workflowItems, users, letters, proformaInvoices, proformaTypes, companies } from "@/db/schema";
import { eq, sql, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

/**
 * گردش کار کامل یک سند (نامه یا پیش‌فاکتور) — برای دکمه «جزئیات» کارتابل‌ها.
 *
 * درخواست: «توی کارتابل مدیریت دکمه‌ای ایجاد گردد به‌عنوان جزئیات که گردش کار
 * مربوط به آن نامه و پیش‌فاکتور را مشاهده کند» و همین نیاز در کارتابل دبیرخانه.
 *
 * GET /api/workflow/history?letterId=12  یا  ?proformaId=34
 * اگر هر دو داده شود، همه رویدادهای مرتبط با نامه «و» پیش‌فاکتور برمی‌گردد.
 */
export async function GET(req: NextRequest) {
  try {
    const letterIdParam = req.nextUrl.searchParams.get("letterId");
    const proformaIdParam = req.nextUrl.searchParams.get("proformaId");
    const letterId = letterIdParam ? parseInt(letterIdParam) : null;
    const proformaId = proformaIdParam ? parseInt(proformaIdParam) : null;

    if (!letterId && !proformaId) {
      return NextResponse.json({ error: "شناسه نامه یا پیش‌فاکتور الزامی است" }, { status: 400 });
    }

    const toUser = alias(users, "to_user_hist");

    const conditions: string[] = [];
    if (letterId) conditions.push(`w.letter_id = ${letterId}`);
    if (proformaId) conditions.push(`w.proforma_id = ${proformaId}`);
    const whereClause = `(${conditions.join(" OR ")})`;

    const result = await db.execute(sql.raw(`
      SELECT
        w.id,
        w.letter_id as "letterId",
        w.proforma_id as "proformaId",
        w.action,
        w.comment,
        w.to_department as "toDepartment",
        w.is_read as "isRead",
        w.done_status as "doneStatus",
        w.done_at as "doneAt",
        w.created_at as "createdAt",
        fu.full_name as "fromUserName",
        tu.full_name as "toUserName",
        du.full_name as "doneByName",
        l.letter_number as "letterNumber",
        p.proforma_number as "proformaNumber"
      FROM workflow_items w
      LEFT JOIN users fu ON fu.id = w.from_user_id
      LEFT JOIN users tu ON tu.id = w.to_user_id
      LEFT JOIN users du ON du.id = w.done_by
      LEFT JOIN letters l ON l.id = w.letter_id
      LEFT JOIN proforma_invoices p ON p.id = w.proforma_id
      WHERE ${whereClause}
      ORDER BY w.created_at ASC, w.id ASC
    `));

    return NextResponse.json(result.rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
