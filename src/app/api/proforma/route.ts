import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  proformaInvoices,
  proformaItems,
  companies,
  proformaTypes,
  settings,
  priceHistory,
  letters,
  users,
} from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getNumberingContext, formatDocNumber, bumpSequence } from "@/lib/numbering";
import {
  computeProformaTotals,
  sumSelectedItems,
  totalsToDbValues,
  toNum,
  requiresNonZeroAmount,
  isZeroAmount,
  zeroAmountMessage,
} from "@/lib/proforma-calc";
import { buildLetterBasedBase } from "@/lib/proforma-number";
import { computeProformaExpiry } from "@/lib/expiry";

export async function GET(req: NextRequest) {
  try {
    // فیلتر بر اساس مشتری — مثلاً برای انتخاب پیش‌فاکتورهای همان مشتری
    // در فرم نامه «تاییدیه استعلام». بدون پارامتر، همان رفتار قبلی (همه رکوردها).
    const companyIdParam = req.nextUrl.searchParams.get("companyId");
    const companyId = companyIdParam ? parseInt(companyIdParam) : NaN;
    const statusParam = (req.nextUrl.searchParams.get("status") || "").trim();

    const whereParts = [] as ReturnType<typeof sql>[];
    if (Number.isFinite(companyId)) whereParts.push(sql`p.company_id = ${companyId}`);
    if (statusParam) whereParts.push(sql`p.status = ${statusParam}`);
    const whereSql = whereParts.length > 0 ? sql`WHERE ${sql.join(whereParts, sql` AND `)}` : sql``;

    // Use raw query for multiple joins to users table
    const result = await db.execute(sql`
      SELECT 
        p.id,
        p.proforma_number as "proformaNumber",
        p.base_number as "baseNumber",
        p.revision_no as "revisionNo",
        p.letter_seq as "letterSeq",
        p.proforma_type_id as "proformaTypeId",
        pt.name as "typeName",
        p.letter_id as "letterId",
        p.company_id as "companyId",
        c.name as "companyName",
        p.issue_date as "issueDate",
        p.validity_days as "validityDays",
        p.show_total as "showTotal",
        p.subtotal,
        p.total_amount as "totalAmount",
        p.status,
        p.created_by as "createdBy",
        p.updated_by as "updatedBy",
        p.approved_by as "approvedBy",
        p.created_at as "createdAt",
        p.updated_at as "updatedAt",
        COALESCE(NULLIF(p.communication_method, ''), l.communication_method) as "communicationMethod",
        COALESCE(NULLIF(p.communication_id, ''), l.communication_id) as "communicationId",
        cu.full_name as "createdByName",
        uu.full_name as "updatedByName",
        au.full_name as "approvedByName"
      FROM proforma_invoices p
      LEFT JOIN companies c ON p.company_id = c.id
      LEFT JOIN proforma_types pt ON p.proforma_type_id = pt.id
      LEFT JOIN letters l ON p.letter_id = l.id
      LEFT JOIN users cu ON p.created_by = cu.id
      LEFT JOIN users uu ON p.updated_by = uu.id
      LEFT JOIN users au ON p.approved_by = au.id
      ${whereSql}
      ORDER BY p.id DESC
    `);

    // ── وضعیت انقضای هر پیش‌فاکتور — «تاریخ انقضا = تاریخ صدور + مدت اعتبار»
    // سمت سرور محاسبه می‌شود تا «تاریخ امروزِ شمسی» در همه کلاینت‌ها یکسان باشد.
    const rows = result.rows.map((r) => {
      const exp = computeProformaExpiry(
        r.issueDate as string | null,
        r.validityDays as number | null
      );
      return { ...r, expiryDate: exp?.expiryDate ?? null, daysToExpiry: exp?.daysToExpiry ?? null, expiryState: exp?.state ?? null };
    });

    return NextResponse.json(rows);
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ---------------------------------------------------------
    // Generate proforma number
    // ---------------------------------------------------------

    let proformaNumber = "";
    // شماره فرعی پیش‌فاکتور داخل نامه (۱ = خود شماره نامه)
    let letterSeq = 1;

    // If linked to a letter, use letter number as proforma number
    if (body.letterId) {
      const letterRows = await db
        .select({
          letterNumber: letters.letterNumber,
        })
        .from(letters)
        .where(eq(letters.id, body.letterId));

      if (letterRows.length > 0) {
        // ─────────────────────────────────────────────────────────────
        // هنگام صدور، اولین پیش‌فاکتورِ نامه دقیقاً همان شماره نامه است.
        // اگر برای همین نامه قبلاً پیش‌فاکتور صادر شده باشد (مثلاً مشتری در یک
        // استعلام هم «کالیبراسیون» و هم «فروش» خواسته)، پیش‌فاکتور بعدی
        // پسوند فرعی می‌گیرد: 1404/0012 ← 1404/0012/2 ← 1404/0012/3
        // به این ترتیب شماره دبیرخانهٔ نامه هیچ‌گاه تغییر نمی‌کند.
        // پسوند اصلاحیه («e») فقط در مرحله ویرایشِ پیش‌فاکتور ارسال‌شده اضافه
        // می‌شود، نه هنگام صدور.
        // ─────────────────────────────────────────────────────────────
        const letterNumber = letterRows[0].letterNumber;
        const maxSeqRows = await db
          .select({ maxSeq: sql<number>`COALESCE(MAX(${proformaInvoices.letterSeq}), 0)` })
          .from(proformaInvoices)
          .where(eq(proformaInvoices.letterId, body.letterId));
        letterSeq = (Number(maxSeqRows[0]?.maxSeq) || 0) + 1;

        // تضمین یکتایی: اگر شماره‌ای (به هر دلیل) قبلاً استفاده شده، به شماره فرعی بعدی می‌رویم
        while (true) {
          const candidate = buildLetterBasedBase(letterNumber, letterSeq);
          const clash = await db
            .select({ id: proformaInvoices.id })
            .from(proformaInvoices)
            .where(eq(proformaInvoices.proformaNumber, candidate))
            .limit(1);
          if (clash.length === 0) {
            proformaNumber = candidate;
            break;
          }
          letterSeq += 1;
        }
      }
    }

    // If no letter or letter not found, generate proforma number
    if (!proformaNumber) {
      // شماره پیش‌فاکتور مستقل از نامه — بر اساس سال جاری شمسی
      // (با ریست خودکار شمارنده در تحویل سال)
      const ctx = await getNumberingContext("proforma", true);
      let seq = ctx.seq;

      // تولید شماره یکتا - اگر تکراری بود، به سراغ شماره بعدی برو
      let isUnique = false;
      while (!isUnique) {
        proformaNumber = formatDocNumber(ctx.format, seq, ctx.year);

        const existing = await db
          .select({ id: proformaInvoices.id })
          .from(proformaInvoices)
          .where(eq(proformaInvoices.proformaNumber, proformaNumber))
          .limit(1);

        if (existing.length === 0) {
          isUnique = true;
        } else {
          seq++;
        }
      }

      // Update sequence
      await bumpSequence(ctx, seq);
    }

    // ---------------------------------------------------------
    // Default texts from proforma type
    // ---------------------------------------------------------

    let textBefore = body.textBefore || "";
    let textAfter = body.textAfter || "";
    let textLastPage = body.textLastPage || "";
    let signatureText = body.signatureText || "";

    if (body.proformaTypeId && !body.textBefore) {
      const typeRows = await db
        .select()
        .from(proformaTypes)
        .where(
          eq(proformaTypes.id, body.proformaTypeId)
        );

      if (typeRows.length > 0) {
        textBefore =
          typeRows[0].defaultTextBefore || "";

        textAfter =
          typeRows[0].defaultTextAfter || "";

        textLastPage =
          typeRows[0].defaultTextLastPage || "";

        signatureText =
          typeRows[0].signatureText || "";
      }
    }

    // ---------------------------------------------------------
    // Get tax / insurance settings
    // ---------------------------------------------------------

    const taxRows = await db
      .select()
      .from(settings)
      .where(
        eq(settings.settingKey, "tax_percent")
      );

    const insRows = await db
      .select()
      .from(settings)
      .where(
        eq(settings.settingKey, "insurance_percent")
      );

    // درصدهای پیش‌فرض سیستم — فقط زمانی استفاده می‌شوند که کاربر مقداری نفرستاده باشد
    const defaultTaxPercent =
      taxRows.length > 0
        ? taxRows[0].settingValue
        : "10";

    const defaultInsurancePercent =
      insRows.length > 0
        ? insRows[0].settingValue
        : "0";

    // ── مدت اعتبار پیش‌فرض از تنظیمات ──────────────────────────────
    // ایراد قبلی: مدت اعتبار تنظیمات در فرم صدور پیش‌فاکتور اعمال نمی‌شد.
    const validityRows = await db
      .select()
      .from(settings)
      .where(eq(settings.settingKey, "validity_days"));
    const parsedValidity = parseInt(validityRows[0]?.settingValue || "");
    const defaultValidityDays =
      Number.isFinite(parsedValidity) && parsedValidity > 0 ? parsedValidity : 30;

    // ── نقش صادرکننده ─────────────────────────────────────────────
    // اگر مدیرعامل/ادمین مستقیماً پیش‌فاکتور صادر کند، تایید داخلی همان لحظه
    // لحاظ می‌شود (approved_by پر می‌شود) تا در قیف تبدیل داشبورد شمرده شود.
    let creatorIsInternalApprover = false;
    if (body.createdBy) {
      const creatorRows = await db
        .select({ role: users.role, permissions: users.permissions })
        .from(users)
        .where(eq(users.id, parseInt(String(body.createdBy))))
        .limit(1);
      const creatorRole = creatorRows[0]?.role || "";
      const creatorPerms = (creatorRows[0]?.permissions || {}) as Record<string, boolean>;
      creatorIsInternalApprover =
        creatorRole === "manager" ||
        creatorRole === "admin" ||
        creatorPerms.canApprove === true;
    }

    // ---------------------------------------------------------
    // Financial values — محاسبه سمت سرور با ترتیب صحیح:
    // جمع اقلام → کسر تخفیف → کسر بیمه → افزودن هزینه‌ها → ارزش افزوده (آخر)
    // ---------------------------------------------------------

    const itemsSubtotal =
      Array.isArray(body.items) && body.items.length > 0
        ? sumSelectedItems(body.items)
        : toNum(body.subtotal);

    const totals = computeProformaTotals({
      subtotal: itemsSubtotal,
      discountPercent: body.discountPercent ?? "0",
      insurancePercent:
        body.insurancePercent !== undefined && body.insurancePercent !== null
          ? body.insurancePercent
          : defaultInsurancePercent,
      travelCost: body.travelCost ?? "0",
      transportCost: body.transportCost ?? "0",
      taxPercent:
        body.taxPercent !== undefined && body.taxPercent !== null
          ? body.taxPercent
          : defaultTaxPercent,
    });

    const dbTotals = totalsToDbValues(totals);

    const requestedStatus = body.status || "draft";

    // پیش‌فاکتور با مبلغ صفر نباید وارد چرخه تایید/ارسال شود
    if (requiresNonZeroAmount(requestedStatus) && isZeroAmount(totals.totalAmount)) {
      return NextResponse.json(
        { error: zeroAmountMessage(requestedStatus) },
        { status: 400 }
      );
    }

    const {
      subtotal,
      discountPercent,
      discountAmount,
      taxPercent,
      taxAmount,
      insurancePercent,
      insuranceAmount,
      travelCost,
      transportCost,
      totalAmount,
    } = dbTotals;

    // ---------------------------------------------------------
    // Optional pricing controls
    // ---------------------------------------------------------

    const globalMultiplierPercent =
      body.globalMultiplierPercent || null;

    const targetAmount =
      body.targetAmount || null;

    // ---------------------------------------------------------
    // Insert proforma
    // ---------------------------------------------------------

    const result = await db
      .insert(proformaInvoices)
      .values({
        proformaNumber,

        // اصل‌شماره هنگام صدور ثبت می‌شود تا اصلاحیه‌های بعدی دقیقاً
        // یک‌پله‌ای اضافه شوند (۱ ← ۱e ← ۱e2) — رفع ایراد پرش شماره نسخه
        baseNumber: proformaNumber,
        revisionNo: 0,
        // شماره فرعی داخل نامه (برای چند پیش‌فاکتور از یک نامه)
        letterSeq,

        proformaTypeId:
          body.proformaTypeId,

        letterId:
          body.letterId || null,

        companyId:
          body.companyId,

        communicationMethod:
          body.communicationMethod?.trim() || null,

        communicationId:
          body.communicationId?.trim() || null,

        issueDate:
          body.issueDate,

        validityDays:
          body.validityDays || defaultValidityDays,

        showTotal:
          body.showTotal !== undefined
            ? body.showTotal
            : true,

        subtotal,

        discountPercent,

        discountAmount,

        taxPercent,

        taxAmount,

        insurancePercent,

        insuranceAmount,

        travelCost,

        transportCost,

        totalAmount,

        textBefore,

        textAfter,

        textLastPage,

        signatureText,

        proformaDescription:
          body.proformaDescription || null,

        status: requestedStatus,

        createdBy:
          body.createdBy || null,

        // صدور مستقیم توسط مدیرعامل/ادمین/کاربر دارای مجوز تایید = تایید داخلی همان لحظه
        // (در قیف تبدیل داشبورد شمرده می‌شود حتی اگر وضعیت پیش‌نویس بماند)
        approvedBy:
          creatorIsInternalApprover && body.createdBy
            ? parseInt(String(body.createdBy))
            : (body.approvedBy || null),

        globalMultiplierPercent,

        targetAmount,
      })
      .returning();

    // ---------------------------------------------------------
    // Insert proforma items
    // ---------------------------------------------------------

    if (
      body.items &&
      Array.isArray(body.items)
    ) {
      for (const item of body.items) {
        await db
          .insert(proformaItems)
          .values({
            proformaId:
              result[0].id,

            equipmentId:
              item.equipmentId || null,

            description:
              item.description,

            quantity:
              item.quantity || "1",

            unitPrice:
              item.unitPrice || "0",

            pointCount:
              item.pointCount || null,

            totalPrice:
              item.totalPrice || "0",

            rowOrder:
              item.rowOrder || 0,

            isSelected:
              item.isSelected !== undefined
                ? item.isSelected
                : true,

            calibrationLocation:
              item.calibrationLocation || null,

            paramValues:
              item.paramValues || null,
          });

        // -----------------------------------------------------
        // Save price history
        // -----------------------------------------------------

        if (
          item.equipmentId &&
          body.companyId
        ) {
          await db
            .insert(priceHistory)
            .values({
              equipmentId:
                item.equipmentId,

              companyId:
                body.companyId,

              proformaId:
                result[0].id,

              unitPrice:
                item.unitPrice || "0",

              pointCount:
                item.pointCount || null,

              quantity:
                item.quantity || "1",

              priceDate:
                body.issueDate,
            });
        }
      }
    }

    // ---------------------------------------------------------
    // Return created proforma
    // ---------------------------------------------------------

    return NextResponse.json(
      result[0]
    );
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : "Unknown error";

    console.error(
      "POST /api/proforma error:",
      error
    );

    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}