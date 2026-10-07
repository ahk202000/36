import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workflowItems, letters, proformaInvoices } from "@/db/schema";
import { eq, desc, and, or, ne, isNull, sql, type SQL } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * اعلان‌های زنگوله — هر ۱۵ ثانیه توسط هر کاربرِ آنلاین فراخوانی می‌شود.
 * نسخه قبلی کل جدول workflow_items را بدون فیلتر و LIMIT می‌خواند و
 * فیلتر را در حافظه انجام می‌داد؛ با رشد داده‌ها باعث کندی کل سیستم
 * (از جمله داشبورد) می‌شد. فیلتر و شمارش حالا کاملاً سمت دیتابیس انجام می‌شود.
 */
export async function GET(req: NextRequest) {
  try {
    const department = req.nextUrl.searchParams.get("department");
    const userId = req.nextUrl.searchParams.get("userId");
    const filterUserId = userId ? parseInt(userId) : NaN;

    // شرط‌ها — دقیقاً همان منطق قبلی: موارد ارجاع‌شده به واحد کاربر،
    // به‌جز مواردی که خودش فرستاده است.
    const conditions: SQL[] = [];
    if (department) conditions.push(eq(workflowItems.toDepartment, department));
    if (Number.isFinite(filterUserId)) {
      conditions.push(
        or(isNull(workflowItems.fromUserId), ne(workflowItems.fromUserId, filterUserId))!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: workflowItems.id,
          letterId: workflowItems.letterId,
          proformaId: workflowItems.proformaId,
          fromUserId: workflowItems.fromUserId,
          toDepartment: workflowItems.toDepartment,
          action: workflowItems.action,
          comment: workflowItems.comment,
          isRead: workflowItems.isRead,
          createdAt: workflowItems.createdAt,
          letterNumber: letters.letterNumber,
          proformaNumber: proformaInvoices.proformaNumber,
        })
        .from(workflowItems)
        .leftJoin(letters, eq(workflowItems.letterId, letters.id))
        .leftJoin(proformaInvoices, eq(workflowItems.proformaId, proformaInvoices.id))
        .where(whereClause)
        .orderBy(desc(workflowItems.createdAt))
        .limit(40),
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          unread: sql<number>`COUNT(*) FILTER (WHERE ${workflowItems.isRead} = false)::int`,
        })
        .from(workflowItems)
        .where(whereClause),
    ]);

    const unreadCount = Number(countRows[0]?.unread ?? 0);
    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json({ items: rows.slice(0, 20), unreadCount, total });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, markAll, department, userId } = body;

    if (markAll && (department || userId)) {
      const conditions: SQL[] = [];
      if (department) conditions.push(eq(workflowItems.toDepartment, department));
      if (userId) conditions.push(eq(workflowItems.toUserId, Number(userId)));
      await db
        .update(workflowItems)
        .set({ isRead: true })
        .where(conditions.length > 1 ? and(...conditions) : conditions[0]);
      return NextResponse.json({ success: true });
    }

    if (markAll) {
      return NextResponse.json({ error: "No department or userId for markAll" }, { status: 400 });
    }

    if (id) {
      await db.update(workflowItems).set({ isRead: true }).where(eq(workflowItems.id, id));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "No id or markAll" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
