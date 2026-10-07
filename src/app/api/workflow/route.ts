import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workflowItems, users, letters, proformaInvoices, companies, proformaItems, letterAttachments, equipment } from "@/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { isRangeAttachmentType } from "@/lib/referrals";

export async function GET(req: NextRequest) {
  try {
    const dept = req.nextUrl.searchParams.get("department");
    const userId = req.nextUrl.searchParams.get("userId");
    const filterDept = dept || undefined;
    const filterUserId = userId ? parseInt(userId) : undefined;

    // نام گیرنده و تغییردهنده وضعیت — تا در کارتابل مدیریت مشخص باشد
    // ارجاع برای چه کسی است و «انجام شد/نشد» را چه کسی ثبت کرده است.
    const toUser = alias(users, "to_user");
    const doneByUser = alias(users, "done_by_user");
    // مشتریِ نامه — تا در کارتابل برای «هر نامه» اسم مشتری نمایش داده شود،
    // حتی اگر ارجاع فقط به نامه متصل باشد و هنوز پیش‌فاکتوری نداشته باشد.
    const letterCompany = alias(companies, "letter_company");

    // Build query with joins to get details + company name
    const query = db
      .select({
        id: workflowItems.id,
        letterId: workflowItems.letterId,
        proformaId: workflowItems.proformaId,
        fromUserId: workflowItems.fromUserId,
        fromUserName: users.fullName,
        toUserId: workflowItems.toUserId,
        toUserName: toUser.fullName,
        toDepartment: workflowItems.toDepartment,
        action: workflowItems.action,
        comment: workflowItems.comment,
        isRead: workflowItems.isRead,
        doneStatus: workflowItems.doneStatus,
        doneBy: workflowItems.doneBy,
        doneByName: doneByUser.fullName,
        note: workflowItems.note,
        doneAt: workflowItems.doneAt,
        createdAt: workflowItems.createdAt,
        letterNumber: letters.letterNumber,
        // نوع درخواست و شرکت نامه — برای نمایش دکمه «صدور پیش‌فاکتور» روی نامه‌های «استعلام»
        letterRequestType: letters.requestType,
        letterCompanyId: letters.companyId,
        letterStatus: letters.status,
        proformaNumber: proformaInvoices.proformaNumber,
        // دستور مهندس (مدیریت): آخرین تصمیم ثبت‌شده روی پیش‌فاکتور — تایید/رد/نیاز به اصلاح/...
        // همراه با متن دستور، تا در کارتابل مدیریت کنار هر مورد دیده شود.
        proformaStatus: proformaInvoices.status,
        proformaManagerComment: proformaInvoices.managerComment,
        // نام مشتری: اولویت با مشتری پیش‌فاکتور است؛ اگر ارجاع فقط نامه بود،
        // مشتریِ همان نامه نمایش داده می‌شود تا کارتابل همیشه اسم مشتری داشته باشد.
        companyName: sql<string | null>`COALESCE(${companies.name}, ${letterCompany.name})`,
      })
      .from(workflowItems)
      .leftJoin(users, eq(workflowItems.fromUserId, users.id))
      .leftJoin(toUser, eq(workflowItems.toUserId, toUser.id))
      .leftJoin(doneByUser, eq(workflowItems.doneBy, doneByUser.id))
      .leftJoin(letters, eq(workflowItems.letterId, letters.id))
      .leftJoin(proformaInvoices, eq(workflowItems.proformaId, proformaInvoices.id))
      .leftJoin(companies, eq(proformaInvoices.companyId, companies.id))
      .leftJoin(letterCompany, eq(letters.companyId, letterCompany.id))
      .orderBy(desc(workflowItems.createdAt));

    const rawRows = await query;

    // تعداد پیش‌فاکتورهای صادرشده برای هر نامه (برای نمایش در کنار دکمه «صدور پیش‌فاکتور»)
    const letterIds = Array.from(new Set(rawRows.map((r) => r.letterId).filter((v): v is number => typeof v === "number")));
    const proformaCountByLetter = new Map<number, number>();
    if (letterIds.length > 0) {
      const countRows = await db
        .select({
          letterId: proformaInvoices.letterId,
          cnt: sql<number>`COUNT(*)`,
        })
        .from(proformaInvoices)
        .where(inArray(proformaInvoices.letterId, letterIds))
        .groupBy(proformaInvoices.letterId);
      for (const c of countRows) {
        if (c.letterId !== null) proformaCountByLetter.set(c.letterId, Number(c.cnt) || 0);
      }
    }
    const rows = rawRows.map((r) => ({
      ...r,
      letterProformaCount: r.letterId ? proformaCountByLetter.get(r.letterId) ?? 0 : 0,
    }));

    // ── اطلاعات تکمیلی (نسخه دسته‌ای — بدون کوئری N+1) ──
    // قبلاً برای «هر» ردیف فروش قطعی/تاییدیه/نامه رنج تا ۳ کوئری جدا زده می‌شد؛
    // با چند صد ردیف، لود کارتابل و اعلان‌ها چند ثانیه طول می‌کشید.
    // حالا همه داده‌های موردنیاز با چند کوئری گروهی خوانده و در حافظه سرهم می‌شود.
    type ItemRow = {
      id: number;
      equipmentName: string | null;
      description: string;
      quantity: string | null;
      calibrationLocation: string | null;
    };
    type AttRow = { fileName: string; filePath: string; attachmentType: string };

    const SPECIAL_ACTIONS = new Set(["final_sale", "confirm_refer", "range_letter"]);
    const specialRows = rows.filter((r) => SPECIAL_ACTIONS.has(r.action) && (r.proformaId || r.letterId));

    // ۱) برای ردیف‌های بدون proformaId، پیش‌فاکتور تاییدشده یا آخرین پیش‌فاکتور نامه
    const missingPfLetterIds = Array.from(
      new Set(
        specialRows
          .filter((r) => !r.proformaId && r.letterId)
          .map((r) => r.letterId as number)
      )
    );
    const resolvedPfByLetter = new Map<number, number>();
    if (missingPfLetterIds.length > 0) {
      const letterRows = await db
        .select({ id: letters.id, confirmedProformaId: letters.confirmedProformaId })
        .from(letters)
        .where(inArray(letters.id, missingPfLetterIds));
      for (const l of letterRows) {
        if (l.confirmedProformaId) resolvedPfByLetter.set(l.id, l.confirmedProformaId);
      }
      const stillMissing = missingPfLetterIds.filter((id) => !resolvedPfByLetter.has(id));
      if (stillMissing.length > 0) {
        // آخرین پیش‌فاکتور هر نامه — مرتب‌شده نزولی؛ اولین رخدادِ هر نامه = آخرین پیش‌فاکتور آن
        const pfRows = await db
          .select({ id: proformaInvoices.id, letterId: proformaInvoices.letterId })
          .from(proformaInvoices)
          .where(inArray(proformaInvoices.letterId, stillMissing))
          .orderBy(desc(proformaInvoices.id));
        for (const p of pfRows) {
          if (p.letterId != null && !resolvedPfByLetter.has(p.letterId)) {
            resolvedPfByLetter.set(p.letterId, p.id);
          }
        }
      }
    }

    // ۲) شناسه نهایی پیش‌فاکتور هر ردیف ویژه
    const allResolvedPfIds = new Set<number>();
    for (const r of specialRows) {
      const pid = r.proformaId ?? (r.letterId ? resolvedPfByLetter.get(r.letterId) ?? null : null);
      if (pid) allResolvedPfIds.add(pid);
    }

    // ۳) شماره و مشتری پیش‌فاکتورهای پیداشده — یک کوئری
    const pfInfoById = new Map<number, { num: string; company: string | null }>();
    if (allResolvedPfIds.size > 0) {
      const pfRows = await db
        .select({
          id: proformaInvoices.id,
          num: proformaInvoices.proformaNumber,
          company: companies.name,
        })
        .from(proformaInvoices)
        .leftJoin(companies, eq(proformaInvoices.companyId, companies.id))
        .where(inArray(proformaInvoices.id, Array.from(allResolvedPfIds)));
      for (const p of pfRows) pfInfoById.set(p.id, { num: p.num, company: p.company });
    }

    // ۴) اقلام همه پیش‌فاکتورها — یک کوئری (مرتب بر اساس ردیف)
    const itemsByPf = new Map<number, ItemRow[]>();
    if (allResolvedPfIds.size > 0) {
      const itemRows = await db
        .select({
          proformaId: proformaItems.proformaId,
          id: proformaItems.id,
          equipmentName: equipment.name,
          description: proformaItems.description,
          quantity: proformaItems.quantity,
          calibrationLocation: proformaItems.calibrationLocation,
        })
        .from(proformaItems)
        .leftJoin(equipment, eq(proformaItems.equipmentId, equipment.id))
        .where(inArray(proformaItems.proformaId, Array.from(allResolvedPfIds)))
        .orderBy(proformaItems.rowOrder);
      for (const it of itemRows) {
        const list = itemsByPf.get(it.proformaId) || [];
        list.push({
          id: it.id,
          equipmentName: it.equipmentName,
          description: it.description,
          quantity: it.quantity,
          calibrationLocation: it.calibrationLocation,
        });
        itemsByPf.set(it.proformaId, list);
      }
    }

    // ۵) پیوست‌های نامه‌های مرتبط — یک کوئری
    const specialLetterIds = Array.from(
      new Set(specialRows.map((r) => r.letterId).filter((v): v is number => typeof v === "number"))
    );
    const attsByLetter = new Map<number, AttRow[]>();
    if (specialLetterIds.length > 0) {
      const attRows = await db
        .select({
          letterId: letterAttachments.letterId,
          fileName: letterAttachments.fileName,
          filePath: letterAttachments.filePath,
          attachmentType: letterAttachments.attachmentType,
        })
        .from(letterAttachments)
        .where(inArray(letterAttachments.letterId, specialLetterIds));
      for (const a of attRows) {
        const list = attsByLetter.get(a.letterId) || [];
        list.push({ fileName: a.fileName, filePath: a.filePath, attachmentType: a.attachmentType });
        attsByLetter.set(a.letterId, list);
      }
    }

    // ۶) سرهم‌بندی نهایی بدون کوئری اضافه
    const enrichedRows = rows.map((r) => {
      // آیا «خودِ ردیف گردش‌کار» به پیش‌فاکتور متصل است؟ (قبل از هر بازیابی از روی نامه)
      // کارتابل مدیریت «فقط پیش‌فاکتور» است و باید ردیف‌های نامه‌محور (مانند نامه رنج)
      // را حذف کند — حتی اگر بالادست برایشان proformaId بازیابی شده باشد.
      const hadProformaDoc = r.proformaId != null;
      // فروش قطعی و تاییدیه استعلام → اقلام پیش‌فاکتور (فقط تعداد و محل کالیبره، بدون مبلغ)
      if (SPECIAL_ACTIONS.has(r.action) && (r.proformaId || r.letterId)) {
        // اگر ارجاع بدون proformaId ثبت شده باشد، پیش‌فاکتور تاییدشده/آخرین پیش‌فاکتور
        // همان نامه بازیابی می‌شود تا «اقلام + شماره پیش‌فاکتور» همیشه به کارشناس برسد.
        const resolvedProformaId =
          r.proformaId ?? (r.letterId ? resolvedPfByLetter.get(r.letterId) ?? null : null);
        const info = resolvedProformaId ? pfInfoById.get(resolvedProformaId) : undefined;
        const resolvedProformaNumber = info?.num ?? r.proformaNumber;
        const resolvedCompanyName = r.companyName ?? info?.company ?? null;
        const itemsRes = resolvedProformaId ? itemsByPf.get(resolvedProformaId) ?? [] : [];

        // پیوست‌های نامه مرتبط — همیشه از دیتابیس خوانده می‌شود تا فایل نامه رنج همراه باشد
        let attachments: AttRow[] | null = null;
        if (r.letterId) {
          const atts = attsByLetter.get(r.letterId) ?? [];
          if (r.action === "range_letter") {
            // در ارجاع «نامه رنج» اولویت با همان پیوست نامه رنج است (تطبیق مقاوم به فاصله/نم‌فاصله).
            // اگر نوع پیوست دقیقاً «نامه رنج» ثبت نشده بود، همه پیوست‌های نامه همراه می‌شوند تا
            // کارشناس برنامه‌ریزی برون/آزمایشگاه در هر حال فایل را ببیند.
            const rangeOnly = atts.filter((a) => isRangeAttachmentType(a.attachmentType));
            const scoped = rangeOnly.length > 0 ? rangeOnly : atts;
            attachments = scoped.length > 0 ? scoped : null;
          } else {
            attachments = atts.length > 0 ? atts : null;
          }
        }
        return {
          ...r,
          hadProformaDoc,
          proformaId: resolvedProformaId ?? r.proformaId,
          proformaNumber: resolvedProformaNumber,
          companyName: resolvedCompanyName,
          itemCount: itemsRes.length,
          proformaItems: itemsRes,
          attachments,
        };
      }
      return { ...r, hadProformaDoc, itemCount: null, proformaItems: null, attachments: null };
    });

    // نرمال‌سازی نام واحد فارسی (ی/ک عربی، نیم‌فاصله و فاصله‌های اضافی) تا
    // مقایسه واحد گیرنده همیشه درست انجام شود — مثلاً «مدیریت» و «مدیریت ـ»
    const normFa = (s?: string | null) =>
      (s || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ").replace(/\s+/g, " ").trim();
    const MANAGEMENT_DEPT = "مدیریت";

    // Filter: فقط آیتم‌هایی که به کاربر یا واحدش ارجاع شده
    // کارتابل مدیریت: یا واحد کاربر «مدیریت» است یا نقش او مدیر/ادمین
    let isManagementKartabl = normFa(filterDept) === MANAGEMENT_DEPT;
    if (!isManagementKartabl && filterUserId) {
      const me = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, filterUserId))
        .limit(1);
      const role = me[0]?.role || "";
      if (role === "manager" || role === "admin") isManagementKartabl = true;
    }
    let filtered = enrichedRows;
    if (filterDept || filterUserId) {
      filtered = enrichedRows.filter((r) => {
        // رفع ایراد کارتابل مدیریت: برای واحد «مدیریت» قانون «حذف موارد ارسالی خودت»
        // اعمال نمی‌شود؛ چون مدیر باید «همه» انواع فعالیت‌های رسیده به مدیریت را ببیند
        // (ارسال برای تایید، ارجاع، تاییدیه استعلام و...) حتی اگر خودش فرستنده باشد.
        // این همان دلیلی بود که در فیلتر «نوع فعالیت» فقط «ارجاع» دیده می‌شد.
        if (!isManagementKartabl && filterUserId && r.fromUserId === filterUserId) return false;
        // به کاربر خاص ارجاع شده
        if (filterUserId && r.toUserId === filterUserId) return true;
        // به واحد کاربر ارجاع شده (مقایسه نرمال‌شده در برابر ی/ک عربی و نیم‌فاصله)
        if (filterDept && normFa(r.toDepartment) === normFa(filterDept)) return true;
        return false;
      });
    }

    // ── کارتابل مدیر: «فقط پیش‌فاکتور» و برای هر پیش‌فاکتور فقط «آخرین کار انجام‌شده» ──
    // درخواست مدیر: کارتابل مدیریت باید ساده باشد —
    //  ۱) نامه‌ها (از جمله «نامه رنج» و ارجاع‌های نامه‌محور) اصلاً وارد کارتابل نمی‌شوند؛
    //     فقط ردیف‌هایی می‌مانند که سندشان «پیش‌فاکتور» است.
    //  ۲) دستورها/ارجاع‌های متعدد یک پیش‌فاکتور تکرار نمی‌شوند؛ «آخرین اقدام ثبت‌شده
    //     روی همان پیش‌فاکتور» کافی است و دستورهای خودِ مدیر از طریق ownActions به همان
    //     ردیف متصل می‌شوند (سابقه کامل همچنان در جزئیات/پرونده سند موجود است).
    // نکته: enrichedRows بر اساس createdAt نزولی مرتب است، پس اولین رخدادِ هر
    // پیش‌فاکتور همان «آخرین کار انجام‌شده» روی آن است.
    if (isManagementKartabl) {
      // نماینده هر پیش‌فاکتور = «آخرین اقدام ورودی به کارتابل مدیریت» روی آن
      // پیش‌فاکتور. دستورهای خودِ مدیر (که به واحدهای دیگر ارجاع شده‌اند) ردیف
      // نمی‌سازند و فقط از طریق ownActions در «روند» همان ردیف دیده می‌شوند.
      const newestByPf = new Map<number, (typeof enrichedRows)[number]>();
      for (const r of filtered) {
        if (r.proformaId == null) continue;
        // فقط ردیف‌های «پیش‌فاکتورمحور» — ردیف‌های نامه‌محور (نامه رنج و…)
        // به‌عنوان نماینده پیش‌فاکتور در کارتابل مدیریت انتخاب نمی‌شوند.
        if (!r.hadProformaDoc || r.action === "range_letter") continue;
        if (!newestByPf.has(r.proformaId)) newestByPf.set(r.proformaId, r);
      }
      filtered = Array.from(newestByPf.values()).sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    }

    // ── دستورهای صادره توسط خودِ کاربر (مدیر) ──
    // درخواست: دستوری که مدیر می‌دهد نباید «اعلان/ردیف جدید» بسازد؛ باید در همان
    // ردیفِ روندِ همان نامه / پیش‌فاکتور دیده شود. بنابراین این دستورها به‌صورت
    // آرایه‌ی `ownActions` به ردیف همان سند چسبانده می‌شوند (نه ردیف مستقل).
    type OwnAction = {
      id: number;
      action: string;
      comment: string | null;
      createdAt: Date | string | null;
      toDepartment: string | null;
      toUserName: string | null;
      letterId: number | null;
      proformaId: number | null;
    };
    const ownActions: OwnAction[] = filterUserId
      ? (
          await db
            .select({
              id: workflowItems.id,
              action: workflowItems.action,
              comment: workflowItems.comment,
              createdAt: workflowItems.createdAt,
              toDepartment: workflowItems.toDepartment,
              toUserName: toUser.fullName,
              letterId: workflowItems.letterId,
              proformaId: workflowItems.proformaId,
            })
            .from(workflowItems)
            .leftJoin(toUser, eq(workflowItems.toUserId, toUser.id))
            .where(eq(workflowItems.fromUserId, filterUserId))
            .orderBy(desc(workflowItems.createdAt))
        ).map((a) => ({ ...a }))
      : [];

    const docKeys = (r: { letterId: number | null; proformaId: number | null }) => {
      const keys: string[] = [];
      if (r.letterId) keys.push(`L${r.letterId}`);
      if (r.proformaId) keys.push(`P${r.proformaId}`);
      return keys;
    };
    const ownByKey = new Map<string, OwnAction[]>();
    for (const a of ownActions) {
      // در کارتابل مدیریت فقط «دستورهای پیش‌فاکتورمحورِ خود مدیر» در روند می‌آید؛
      // دستورهایی که مدیر روی «نامه» داده اصلاً به کارتابل متصل نمی‌شوند.
      const keys = isManagementKartabl ? (a.proformaId ? [`P${a.proformaId}`] : []) : docKeys(a);
      for (const k of keys) {
        const list = ownByKey.get(k);
        if (list) list.push(a);
        else ownByKey.set(k, [a]);
      }
    }

    const attachOwn = <T extends { id: number; letterId: number | null; proformaId: number | null }>(r: T) => {
      const seen = new Set<number>();
      const list: OwnAction[] = [];
      // در کارتابل مدیریت اتصال دستورها فقط از راه کلید پیش‌فاکتور انجام می‌شود
      const keys = isManagementKartabl ? (r.proformaId ? [`P${r.proformaId}`] : []) : docKeys(r);
      for (const k of keys) {
        for (const a of ownByKey.get(k) || []) {
          if (a.id === r.id || seen.has(a.id)) continue;
          seen.add(a.id);
          list.push(a);
        }
      }
      list.sort((x, y) => new Date(y.createdAt || 0).getTime() - new Date(x.createdAt || 0).getTime());
      return { ...r, ownActions: list };
    };

    // ردیف‌های ورودی کارتابل + دستورهای خود کاربر روی همان سند
    type KartablRow = (typeof filtered)[number] & { ownActions: OwnAction[]; selfIssued?: boolean };
    let withOwn: KartablRow[] = filtered.map(attachOwn) as unknown as KartablRow[];

    // اگر مدیر روی سندی دستور داده که آن سند اصلاً در کارتابل ورودی‌اش نیست،
    // برای «همان سند» یک ردیف پرونده‌ای ساخته می‌شود (یک ردیف به ازای هر سند،
    // نه به ازای هر دستور) تا هم در فیلتر «نوع فعالیت» دیده شود و هم سابقه‌اش
    // در پرونده مشتری کامل باشد.
    if (isManagementKartabl && filterUserId && ownActions.length > 0) {
      const coveredKeys = new Set<string>();
      for (const r of withOwn) for (const k of docKeys(r)) coveredKeys.add(k);

      // نمونه‌ی اطلاعات سند از میان همه ردیف‌های گردش کار
      const templateByKey = new Map<string, (typeof enrichedRows)[number]>();
      for (const r of enrichedRows) {
        for (const k of docKeys(r)) if (!templateByKey.has(k)) templateByKey.set(k, r);
      }

      const addedKeys = new Set<string>();
      const extras: KartablRow[] = [];
      for (const a of ownActions) {
        // کارتابل مدیریت «فقط پیش‌فاکتور» است — دستورهایی که مدیر روی «نامه» صادر
        // کرده ردیف مستقل نمی‌سازند (در جزئیات/پرونده همان نامه باقی می‌مانند).
        if (a.proformaId == null) continue;
        const keys = docKeys(a);
        if (keys.length === 0) continue;
        if (keys.some((k) => coveredKeys.has(k) || addedKeys.has(k))) continue;
        const tpl = keys.map((k) => templateByKey.get(k)).find(Boolean);
        if (!tpl) continue;
        for (const k of keys) addedKeys.add(k);
        const base = attachOwn({ ...tpl, id: a.id }) as unknown as KartablRow;
        extras.push({
          ...base,
          id: a.id,
          action: a.action,
          comment: a.comment,
          toDepartment: a.toDepartment,
          toUserName: a.toUserName,
          createdAt: a.createdAt,
          isRead: true, // دستور صادره توسط خودِ کاربر «جدید/خوانده‌نشده» نیست
          ownActions: [a, ...base.ownActions.filter((x) => x.id !== a.id)],
          selfIssued: true,
        } as unknown as KartablRow);
      }
      if (extras.length > 0) {
        withOwn = [...withOwn, ...extras].sort(
          (x, y) => new Date(y.createdAt || 0).getTime() - new Date(x.createdAt || 0).getTime()
        );
      }
    }

    filtered = withOwn as unknown as typeof filtered;

    // If no filter, return all (only for admin)
    if (!filterDept && !filterUserId) {
      return NextResponse.json(enrichedRows);
    }

    // Also include items with no toDepartment/toUserId? For kartabl we show only assigned to dept/user
    // Additionally, fetch letters directly referred to department (without workflow) for completeness
    if (filterDept) {
      try {
        const deptLetters = await db
          .select({
            id: letters.id,
            letterNumber: letters.letterNumber,
            companyName: companies.name,
            letterDate: letters.letterDate,
            requestType: letters.requestType,
            referralDepartment: letters.referralDepartment,
            status: letters.status,
            createdAt: letters.createdAt,
          })
          .from(letters)
          .leftJoin(companies, eq(letters.companyId, companies.id))
          .where(eq(letters.referralDepartment, filterDept))
          .orderBy(desc(letters.id));

        // Merge: if workflow empty but letters exist, we still show letters via workflow-like entries
        // For API, we return both workflow and direct letters if workflow filtered is empty?
        // We'll return workflow filtered plus a flag for direct letters
        // Instead, return workflow plus direct letters as separate field if needed
        // For simplicity, if workflow filtered is empty, we can fetch direct letters as workflow
        // (کارتابل مدیریت «فقط پیش‌فاکتور» است؛ ارجاع مستقیم نامه برای مدیریت ردیف نمی‌سازد)
        if (filtered.length === 0 && deptLetters.length > 0 && !isManagementKartabl) {
          // تعداد پیش‌فاکتورهای هر نامه برای ارجاع‌های مستقیم
          const directIds = deptLetters.slice(0, 10).map((l) => l.id);
          const directCounts = new Map<number, number>();
          if (directIds.length > 0) {
            const cRows = await db
              .select({ letterId: proformaInvoices.letterId, cnt: sql<number>`COUNT(*)` })
              .from(proformaInvoices)
              .where(inArray(proformaInvoices.letterId, directIds))
              .groupBy(proformaInvoices.letterId);
            for (const c of cRows) if (c.letterId !== null) directCounts.set(c.letterId, Number(c.cnt) || 0);
          }
          // Create synthetic workflow entries for direct referrals
          const synthetic = deptLetters.slice(0, 10).map((l) => ({
            id: 100000 + l.id,
            letterId: l.id,
            proformaId: null,
            fromUserId: null,
            fromUserName: null,
            toUserId: null,
            toDepartment: filterDept,
            action: "refer",
            comment: `ارجاع مستقیم - ${l.requestType}`,
            isRead: false,
            createdAt: l.createdAt,
            letterNumber: l.letterNumber,
            letterRequestType: l.requestType,
            letterCompanyId: null,
            letterStatus: l.status,
            letterProformaCount: directCounts.get(l.id) ?? 0,
            proformaNumber: null,
            companyName: l.companyName,
          }));
          filtered = synthetic as typeof filtered;
        }
      } catch {}
    }

    return NextResponse.json(filtered);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await db
      .insert(workflowItems)
      .values({
        letterId: body.letterId || null,
        proformaId: body.proformaId || null,
        fromUserId: body.fromUserId || null,
        toUserId: body.toUserId || null,
        toDepartment: body.toDepartment || null,
        action: body.action,
        comment: body.comment || null,
      })
      .returning();
    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
