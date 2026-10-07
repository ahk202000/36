import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  proformaInvoices,
  proformaItems,
  companies,
  proformaTypes,
  priceHistory,
  equipment,
  letters,
  workflowItems,
  users,
} from "@/db/schema";
import { eq, sql, and, or, isNull, inArray } from "drizzle-orm";
import {
  computeProformaTotals,
  sumSelectedItems,
  totalsToDbValues,
  toNum,
  requiresNonZeroAmount,
  isZeroAmount,
  zeroAmountMessage,
  findZeroAmountRows,
  zeroRowsMessage,
} from "@/lib/proforma-calc";
import { referSoldProformaRangeLetters } from "@/lib/referrals";
import { buildRevisedNumber } from "@/lib/proforma-number";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
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
        c.phone as "companyPhone",
        c.fax as "companyFax",
        c.email as "companyEmail",
        COALESCE(NULLIF(p.communication_method, ''), l.communication_method) as "communicationMethod",
        COALESCE(NULLIF(p.communication_id, ''), l.communication_id) as "communicationId",
        l.phone as "letterPhone",
        l.fax as "letterFax",
        l.contact_person as "letterContactPerson",
        p.issue_date as "issueDate",
        p.validity_days as "validityDays",
        p.show_total as "showTotal",
        p.subtotal,
        p.discount_percent as "discountPercent",
        p.discount_amount as "discountAmount",
        p.tax_percent as "taxPercent",
        p.tax_amount as "taxAmount",
        p.insurance_percent as "insurancePercent",
        p.insurance_amount as "insuranceAmount",
        p.travel_cost as "travelCost",
        p.transport_cost as "transportCost",
        p.total_amount as "totalAmount",
        COALESCE(NULLIF(p.text_before, ''), pt.default_text_before, '') as "textBefore",
        COALESCE(NULLIF(p.text_after, ''), pt.default_text_after, '') as "textAfter",
        COALESCE(NULLIF(p.text_last_page, ''), pt.default_text_last_page, '') as "textLastPage",
        COALESCE(NULLIF(p.signature_text, ''), pt.signature_text, '') as "signatureText",
        pt.default_text_before as "typeDefaultTextBefore",
        pt.default_text_after as "typeDefaultTextAfter",
        pt.default_text_last_page as "typeDefaultTextLastPage",
        pt.signature_text as "typeSignatureText",
        p.status,
        p.proforma_description as "proformaDescription",
        p.manager_comment as "managerComment",
        p.global_multiplier_percent as "globalMultiplierPercent",
        p.target_amount as "targetAmount",
        p.created_by as "createdBy",
        p.updated_by as "updatedBy",
        p.approved_by as "approvedBy",
        p.created_at as "createdAt",
        p.updated_at as "updatedAt",
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
      WHERE p.id = ${parseInt(id)}
    `);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const items = await db
      .select({
        id: proformaItems.id,
        proformaId: proformaItems.proformaId,
        equipmentId: proformaItems.equipmentId,
        equipmentName: equipment.name,
        description: proformaItems.description,
        quantity: proformaItems.quantity,
        unitPrice: proformaItems.unitPrice,
        pointCount: proformaItems.pointCount,
        totalPrice: proformaItems.totalPrice,
        rowOrder: proformaItems.rowOrder,
        isSelected: proformaItems.isSelected,
        multiplierPercent: proformaItems.multiplierPercent,
        calibrationLocation: proformaItems.calibrationLocation,
        paramValues: proformaItems.paramValues,
      })
      .from(proformaItems)
      .leftJoin(equipment, eq(proformaItems.equipmentId, equipment.id))
      .where(eq(proformaItems.proformaId, parseInt(id)));

    return NextResponse.json({ ...result.rows[0], items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const proformaIdNum = parseInt(id);
    const body = await req.json();

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    const fields = [
      "proformaTypeId", "companyId", "communicationMethod", "communicationId", "issueDate", "validityDays", "showTotal",
      "subtotal", "discountPercent", "discountAmount", "taxPercent", "taxAmount",
      "insurancePercent", "insuranceAmount", "travelCost", "transportCost",
      "totalAmount", "textBefore", "textAfter", "textLastPage", "signatureText",
      "status", "proformaDescription", "managerComment", "globalMultiplierPercent", "targetAmount", "approvedBy", "updatedBy",
    ];

    for (const f of fields) {
      if (body[f] !== undefined) {
        updateData[f] = body[f];
      }
    }

    // ─────────────────────────────────────────────────────────────
    // محاسبه مجدد مبالغ سمت سرور با ترتیب صحیح:
    // جمع اقلام → کسر تخفیف → کسر بیمه → افزودن هزینه‌ها → ارزش افزوده (آخرین مرحله)
    // ─────────────────────────────────────────────────────────────
    const currentRows = await db
      .select()
      .from(proformaInvoices)
      .where(eq(proformaInvoices.id, proformaIdNum))
      .limit(1);

    if (currentRows.length === 0) {
      return NextResponse.json({ error: "پیش‌فاکتور یافت نشد" }, { status: 404 });
    }
    const current = currentRows[0];

    // ── قفل ویرایش پس از ارسال به مدیریت ──
    // درخواست: «پیش‌فاکتور وقتی به مدیریت ارسال می‌شود نباید بشود ویرایش کرد؛
    // بعد از دستور مدیریت قابلیت ویرایش داشته باشد.»
    // تا وقتی وضعیت «pending» است، تغییر محتوا (اقلام/مبالغ/متون) برای کاربران
    // غیرمدیر مسدود است؛ تغییر وضعیت (تصمیم مدیریت) و قیمت‌گذاری مدیر آزاد است.
    if (current.status === "pending") {
      const contentFields = [
        "items", "subtotal", "discountPercent", "insurancePercent",
        "travelCost", "transportCost", "taxPercent",
        "proformaTypeId", "companyId", "issueDate", "validityDays", "showTotal",
        "textBefore", "textAfter", "textLastPage", "signatureText",
        "proformaDescription", "communicationMethod", "communicationId",
      ];
      const contentRequested = contentFields.some((f) => body[f] !== undefined);
      if (contentRequested) {
        let actorRole = "";
        const actorId = Number(body.updatedBy);
        if (Number.isFinite(actorId) && actorId > 0) {
          const actorRows = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, actorId))
            .limit(1);
          actorRole = actorRows[0]?.role || "";
        }
        if (actorRole !== "manager" && actorRole !== "admin") {
          return NextResponse.json(
            { error: "این پیش‌فاکتور به مدیریت ارسال شده و تا صدور دستور مدیریت قابل ویرایش نیست." },
            { status: 409 }
          );
        }
      }
    }

    const financialTouched = [
      "subtotal", "discountPercent", "insurancePercent",
      "travelCost", "transportCost", "taxPercent", "items",
    ].some((f) => body[f] !== undefined);

    const pick = (key: keyof typeof current, bodyKey: string) =>
      body[bodyKey] !== undefined && body[bodyKey] !== null
        ? body[bodyKey]
        : current[key];

    // اقلام مؤثر پس از این درخواست — هم برای محاسبه جمع، هم برای کنترل «ردیف صفر»
    let effectiveItems: Array<{
      totalPrice: number | string | null;
      isSelected: boolean | null;
      description?: string | null;
      rowOrder?: number | null;
    }> | null = null;

    let itemsSubtotal: number;
    if (Array.isArray(body.items)) {
      effectiveItems = body.items;
      itemsSubtotal = sumSelectedItems(body.items);
    } else if (body.subtotal !== undefined) {
      itemsSubtotal = toNum(body.subtotal);
    } else {
      const existingItems = await db
        .select({
          totalPrice: proformaItems.totalPrice,
          isSelected: proformaItems.isSelected,
          description: proformaItems.description,
          rowOrder: proformaItems.rowOrder,
        })
        .from(proformaItems)
        .where(eq(proformaItems.proformaId, proformaIdNum))
        .orderBy(proformaItems.rowOrder);
      effectiveItems = existingItems.length > 0 ? existingItems : null;
      itemsSubtotal = existingItems.length > 0
        ? sumSelectedItems(existingItems)
        : toNum(current.subtotal);
    }

    const totals = computeProformaTotals({
      subtotal: itemsSubtotal,
      discountPercent: pick("discountPercent", "discountPercent"),
      insurancePercent: pick("insurancePercent", "insurancePercent"),
      travelCost: pick("travelCost", "travelCost"),
      transportCost: pick("transportCost", "transportCost"),
      taxPercent: pick("taxPercent", "taxPercent"),
    });

    if (financialTouched) {
      Object.assign(updateData, totalsToDbValues(totals));
    }

    // مبلغ صفر بازدارنده است: تغییر وضعیت به تایید/ارسال/فروش قطعی با مبلغ صفر مجاز نیست
    const nextStatus = body.status as string | undefined;
    if (requiresNonZeroAmount(nextStatus) && isZeroAmount(totals.totalAmount)) {
      return NextResponse.json(
        { error: zeroAmountMessage(nextStatus) },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    // بازدارنده «ردیف صفر» در تایید نهایی:
    // اگر حتی یک ردیف تجهیزاتِ انتخاب‌شده مبلغ صفر داشته باشد،
    // تایید نهایی پیش‌فاکتور متوقف می‌شود (درخواست ۴۰۰ با فهرست ردیف‌ها).
    // ردیف‌های غیرفعال بخشی از سند نیستند و بررسی نمی‌شوند.
    // ─────────────────────────────────────────────────────────────
    if (requiresNonZeroAmount(nextStatus)) {
      let rowsForCheck = effectiveItems;
      if (!rowsForCheck) {
        rowsForCheck = await db
          .select({
            totalPrice: proformaItems.totalPrice,
            isSelected: proformaItems.isSelected,
            description: proformaItems.description,
            rowOrder: proformaItems.rowOrder,
          })
          .from(proformaItems)
          .where(eq(proformaItems.proformaId, proformaIdNum))
          .orderBy(proformaItems.rowOrder);
      }
      const zeroRows = findZeroAmountRows(rowsForCheck);
      if (zeroRows.length > 0) {
        return NextResponse.json(
          { error: zeroRowsMessage(zeroRows), zeroRows },
          { status: 400 }
        );
      }
    }

    // ─────────────────────────────────────────────────────────────
    // نسخه‌بندی شماره پیش‌فاکتور — فقط پس از «ارسال به مشتری»
    // هنگام صدور، شماره پیش‌فاکتور دقیقاً با شماره نامه یکی است و تغییر نمی‌کند.
    // اما هرگاه پیش‌فاکتورِ «ارسال‌شده» اصلاح شود (تغییر اقلام/مبالغ/متون)،
    // شماره آن پسوند نسخه می‌گیرد: ۱ ← ۱-۱ ← ۱-۲ و ...
    // تغییرات صرفِ وضعیت (تایید/ارسال/فروش قطعی) نسخه جدید ایجاد نمی‌کند.
    // ─────────────────────────────────────────────────────────────
    const contentTouched =
      Array.isArray(body.items) ||
      financialTouched ||
      [
        "proformaTypeId",
        "companyId",
        "issueDate",
        "validityDays",
        "showTotal",
        "textBefore",
        "textAfter",
        "textLastPage",
        "signatureText",
        "proformaDescription",
        "communicationMethod",
        "communicationId",
      ].some((f) => body[f] !== undefined);

    let revisedTo: string | null = null;

    if (current.status === "sent" && contentTouched) {
      // ─────────────────────────────────────────────────────────────
      // رفع ایراد «پرش شماره نسخه»:
      // روش قبلی پسوند عددی انتهای شماره را حذف و سپس با LIKE روی کل
      // جدول جست‌وجو می‌کرد؛ در نتیجه پیش‌فاکتورهای بی‌ربط با پیشوند
      // مشترک (مثلاً PF-1404-0001 تا PF-1404-0051) در محاسبه نسخه لحاظ
      // می‌شدند و شماره اصلاحیه یک‌باره چند پله جلو می‌پرید.
      // روش صحیح: هر رکورد «اصل‌شماره» (base_number) و «شماره نسخه»
      // (revision_no) خودش را دارد و هر اصلاحیه دقیقاً یک پله اضافه
      // می‌کند: 104 ← 104-1 ← 104-2 ← ...
      // ─────────────────────────────────────────────────────────────
      let base = current.baseNumber;
      if (!base) {
        // سازگاری با رکوردهای قدیمی (پیش از افزودن base_number):
        // برای پیش‌فاکتور متصل به نامه، شماره نامه مبناست؛ در غیر
        // این‌صورت شماره فعلی بدون حذف هیچ پسوندی مبنا قرار می‌گیرد.
        base = current.proformaNumber;
        if (current.letterId) {
          const letterRows = await db
            .select({ letterNumber: letters.letterNumber })
            .from(letters)
            .where(eq(letters.id, current.letterId))
            .limit(1);
          if (letterRows.length > 0 && letterRows[0].letterNumber) {
            base = letterRows[0].letterNumber;
          }
        }
      }

      // هر اصلاحیه فقط «یک» نسخه اضافه می‌کند.
      // قاعده پسوند اصلاحیه: اصلاحیه اول «e»، اصلاحیه دوم «e2»، سوم «e3» و ...
      //   1404/0012  ←  1404/0012e  ←  1404/0012e2
      //   1404/0012/2  ←  1404/0012/2e  (پیش‌فاکتور دومِ همان نامه)
      let nextRev = (current.revisionNo ?? 0) + 1;
      let candidate = buildRevisedNumber(base, nextRev);

      // تضمین یکتایی شماره: اگر سند دیگری همین شماره را دارد،
      // به نزدیک‌ترین شماره آزاد بعدی می‌رویم
      while (true) {
        const clash = await db
          .select({ id: proformaInvoices.id })
          .from(proformaInvoices)
          .where(eq(proformaInvoices.proformaNumber, candidate))
          .limit(1);
        if (clash.length === 0 || clash[0].id === proformaIdNum) break;
        nextRev += 1;
        candidate = buildRevisedNumber(base, nextRev);
      }

      revisedTo = candidate;
      updateData.proformaNumber = candidate;
      updateData.baseNumber = base;
      updateData.revisionNo = nextRev;

      // نسخه اصلاح‌شده اسناد قبلی نیست؛ باید دوباره چرخه تایید/ارسال را طی کند
      if (body.status === undefined) {
        updateData.status = "draft";
        updateData.approvedBy = null;
      }
    }

    const result = await db
      .update(proformaInvoices)
      .set(updateData)
      .where(eq(proformaInvoices.id, parseInt(id)))
      .returning();

    // Update items if provided
    if (body.items && Array.isArray(body.items)) {
      // Delete old items
      await db.delete(proformaItems).where(eq(proformaItems.proformaId, parseInt(id)));
      // سوابق قیمت قبلیِ همین پیش‌فاکتور هم حذف می‌شوند تا با هر بار ذخیره
      // رکوردهای تکراری انباشته نشوند
      await db.delete(priceHistory).where(eq(priceHistory.proformaId, parseInt(id)));

      for (const item of body.items) {
        await db.insert(proformaItems).values({
          proformaId: parseInt(id),
          equipmentId: item.equipmentId || null,
          description: item.description,
          quantity: item.quantity || "1",
          unitPrice: item.unitPrice || "0",
          pointCount: item.pointCount || null,
          totalPrice: item.totalPrice || "0",
          rowOrder: item.rowOrder || 0,
          isSelected: item.isSelected !== undefined ? item.isSelected : true,
          multiplierPercent: item.multiplierPercent || null,
          calibrationLocation: item.calibrationLocation || null,
          paramValues: item.paramValues || null,
        });

        // Save price history
        if (item.equipmentId && result[0].companyId) {
          await db.insert(priceHistory).values({
            equipmentId: item.equipmentId,
            companyId: result[0].companyId,
            proformaId: parseInt(id),
            unitPrice: item.unitPrice || "0",
            pointCount: item.pointCount || null,
            quantity: item.quantity || "1",
            priceDate: result[0].issueDate,
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // فروش قطعی پیش‌فاکتور:
    // اگر نامه‌های ثبت‌شده این مشتری «نامه رنج» داشته باشند، رونوشت آن‌ها
    // به‌صورت خودکار برای «برنامه‌ریزی درون‌سازمانی»، «برنامه‌ریزی
    // برون‌سازمانی» و «آزمایشگاه» ارسال می‌شود (بدون ثبت تکراری).
    // شکست ارجاع نباید ذخیره پیش‌فاکتور را فایل کند.
    // ─────────────────────────────────────────────────────────────
    let soldReferral: Awaited<
      ReturnType<typeof referSoldProformaRangeLetters>
    > | null = null;
    if (
      body.status === "final_sale" &&
      current.status !== "final_sale" &&
      result[0]?.companyId
    ) {
      try {
        soldReferral = await referSoldProformaRangeLetters({
          proformaId: proformaIdNum,
          proformaNumber: result[0].proformaNumber,
          companyId: result[0].companyId,
          fromUserId: (body.updatedBy as number | undefined) ?? null,
        });
      } catch (referralError) {
        console.error("رونوشت خودکار نامه رنج در فروش قطعی ناموفق بود:", referralError);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // بستن خودکار ارجاع‌های باز مرتبط با چرخه تصمیمِ همین پیش‌فاکتور:
    // وقتی تکلیف پیش‌فاکتور مشخص می‌شود (تایید نهایی / رد / نیاز به اصلاح /
    // اصلاح و تایید / فروش قطعی)، ارجاع‌های بازِ چرخه تصمیم در «همه»
    // کارتابل‌ها — مدیریت، واحد بازرگانی، دبیرخانه و... — نباید «باز»
    // بمانند؛ وضعیتشان به‌صورت خودکار به «انجام شد» (یا «انجام نشد» برای
    // رد) تغییر می‌کند تا کارتابل بازرگانی و سایر واحدها وضعیت واقعی را
    // نشان دهند. ارجاع‌های عملیاتی (فروش قطعی/تاییدیه استعلام/نامه رنج)
    // که کار فیزیکی می‌خواهند و ارسال نامه‌ها دست نمی‌خورند، چون ارجاعِ
    // جدید تصمیم بعد از این PUT ساخته می‌شود و باز می‌ماند.
    // ─────────────────────────────────────────────────────────────
    if (
      nextStatus &&
      ["approved", "rejected", "revised", "correction_send", "final_sale"].includes(nextStatus)
    ) {
      try {
        await db
          .update(workflowItems)
          .set({
            doneStatus: nextStatus === "rejected" ? "not_done" : "done",
            doneBy: (body.approvedBy as number | undefined) ?? (body.updatedBy as number | undefined) ?? null,
            doneAt: new Date(),
          })
          .where(
            and(
              eq(workflowItems.proformaId, proformaIdNum),
              inArray(workflowItems.action, [
                "submit",
                "refer",
                "approved",
                "rejected",
                "revised",
                "correction_send",
              ]),
              or(isNull(workflowItems.doneStatus), eq(workflowItems.doneStatus, "pending"))
            )
          );
      } catch (closeErr) {
        console.error("بستن خودکار ارجاع‌های باز پیش‌فاکتور ناموفق بود:", closeErr);
      }
    }

    // اگر نسخه جدید ثبت شد (اصلاح پس از ارسال)، شماره جدید به فراخوان اطلاع داده می‌شود
    const payload: Record<string, unknown> = revisedTo
      ? { ...result[0], revisedTo }
      : { ...result[0] };
    if (soldReferral && soldReferral.rangeLetterCount > 0) {
      payload.soldReferral = soldReferral;
    }
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
