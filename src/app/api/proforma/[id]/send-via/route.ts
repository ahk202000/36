import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings, workflowItems, proformaInvoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getProformaPrintData } from "@/lib/proforma-data";
import { generateProformaPdfBuffer, sendPdfViaMessenger, verifyTelegramChat, normalizeWhatsAppNumber, detectMessenger, MESSENGERS } from "@/lib/proforma-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * ارسال خودکار فایل PDF پیش‌فاکتور از طریق پیام‌رسان (بله/تلگرام/ایتا)
 * بر اساس طریقه ارتباط ثبت‌شده در نامه مرتبط با پیش‌فاکتور
 *
 * POST /api/proforma/[id]/send-via
 */
/** اعتبارسنجی فرمت chat_id روبیکا (b0/g0/u0/c0 + ۱۰+ کاراکتر) */
function isValidRubikaChatId(chatId: string | null | undefined): boolean {
  if (!chatId) return false;
  const t = String(chatId).trim();
  return /^[bguc]0[A-Za-z0-9]{8,}$/i.test(t);
}

/** افزودن راهنمای فارسی به خطاهای رایج API ایتایار بدون حذف متن اصلی سرویس */
function explainEitaaError(error: string, chatId: string): string {
  const e = error.toLowerCase();
  let hint = "";

  if (/token|توکن|unauthor|auth/.test(e)) {
    hint = "توکن ایتایار نامعتبر یا منقضی است؛ توکن را در تنظیمات پیام‌رسان‌ها دوباره ثبت کنید.";
  } else if (/credit|اعتبار|limit|quota/.test(e)) {
    hint = "اعتبار ارسال برنامه ایتایار کافی نیست؛ موجودی/اعتبار ارسال را در پنل ایتایار بررسی کنید.";
  } else if (/chat|user|شناسه|کاربر|recipient|access|دسترسی|start|block|not found|یافت نشد/.test(e)) {
    hint = `شناسه «${chatId}» را بررسی کنید. برای ارسال به کاربر، مشتری باید ابتدا ربات/برنامه ایتا را Start کرده و دسترسی ارسال داده باشد؛ برای کانال، شناسه را بدون @ وارد کنید.`;
  }

  return hint ? `${error} — ${hint}` : `${error} — شناسه ارتباط و دسترسی مخاطب به ربات را بررسی کنید؛ کاربر باید ابتدا ربات ایتا را Start کرده باشد.`;
}

/** تبدیل خطاهای رایج Telegram Bot API به راهنمای عملی */
function explainTelegramError(error: string, chatId: string): string {
  const e = error.toLowerCase();
  if (e.includes("chat not found")) {
    return `چت تلگرام با شناسه «${chatId}» برای این ربات پیدا نشد. شماره موبایل یا یوزرنیم شخصی به‌عنوان chat_id معتبر نیست؛ مشتری باید ابتدا همان ربات تلگرام را Start کند و یک پیام بفرستد، سپس شناسه عددی او را از «چت‌های اخیر تلگرام» در فرم نامه انتخاب کنید. برای گروه/کانال نیز ربات باید عضو باشد (و برای کانال مدیر باشد).`;
  }
  if (e.includes("bot was blocked") || e.includes("forbidden")) {
    return `ربات تلگرام اجازه ارسال به «${chatId}» را ندارد؛ کاربر ربات را مسدود کرده یا ربات عضو/مدیر گروه یا کانال نیست.`;
  }
  if (e.includes("unauthorized") || e.includes("invalid token")) {
    return "توکن ربات تلگرام نامعتبر یا منقضی است؛ توکن BotFather را در تنظیمات پیام‌رسان‌ها دوباره ثبت کنید.";
  }
  return `${error} — شناسه چت و دسترسی ربات تلگرام را بررسی کنید.`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proformaId = parseInt(id);
  if (isNaN(proformaId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    // واکشی پیش‌فاکتور + اطلاعات ارتباط از نامه
    const data = await getProformaPrintData(proformaId);
    if (!data) {
      return NextResponse.json({ error: "پیش‌فاکتور یافت نشد" }, { status: 404 });
    }

    const method = data.communicationMethod?.trim();
    const chatId = data.communicationId?.trim();

    if (!method) {
      return NextResponse.json(
        { error: data.letterId
          ? "طریقه ارتباط در نامه مرتبط ثبت نشده است — ابتدا نامه را کامل کنید"
          : "روش ارتباط در پیش‌فاکتور مستقیم ثبت نشده است — پیش‌فاکتور را ویرایش و بخش «اطلاعات ارسال پیش‌فاکتور» را تکمیل کنید" },
        { status: 400 }
      );
    }

    const messenger = detectMessenger(method);
    if (!messenger) {
      return NextResponse.json(
        { error: `طریقه ارتباط «${method}» برای ارسال خودکار پشتیبانی نمی‌شود — پیام‌رسان‌های مجاز: بله، تلگرام، ایتا` },
        { status: 400 }
      );
    }

    if (!chatId) {
      return NextResponse.json(
        { error: data.letterId
          ? `شناسه ارتباط برای «${method}» در نامه ثبت نشده است — آیدی چت مشتری لازم است`
          : `شناسه ارتباط برای «${method}» در پیش‌فاکتور مستقیم ثبت نشده است — بخش «اطلاعات ارسال پیش‌فاکتور» را تکمیل کنید` },
        { status: 400 }
      );
    }

    // پیش‌اعتبارسنجی فرمت chat_id روبیکا (با b0/g0/u0/c0 شروع می‌شود)
    if (messenger === "rubika" && !isValidRubikaChatId(chatId)) {
      return NextResponse.json(
        {
          error: `شناسه ارتباط «${chatId}» برای روبیکا نامعتبر است — چت‌آیدی روبیکا باید فرمت b0... / g0... / u0... / c0... داشته باشد (نه شماره تلفن یا یوزرنیم). روبیکا INVALID_INPUT برمی‌گرداند.\n\nبرای یافتن آیدی درست: سوار شدن به مشتری بگویید اول یک بار پیام به ربات بفرستد، سپس از تنظیمات → «آیدی‌های اخیر روبیکا» آن را بردارید.`,
        },
        { status: 400 }
      );
    }

    // خواندن توکن ربات از تنظیمات
    const settingRows = await db.select().from(settings);
    const settingMap: Record<string, string> = {};
    for (const s of settingRows) settingMap[s.settingKey] = s.settingValue;

    // بررسی تنظیمات لازم برای این پیام‌رسان
    const requiredKeys = MESSENGERS[messenger].settingKeys;
    const missing = requiredKeys.filter((k) => !settingMap[k]?.trim());
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `تنظیمات ${MESSENGERS[messenger].label} ناقص است — از بخش تنظیمات → پیام‌رسان‌ها مقادیر زیر را وارد کنید: ${missing.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // پیش‌اعتبارسنجی chat_id تلگرام قبل از صرف زمان برای تولید PDF
    if (messenger === "telegram") {
      const verification = await verifyTelegramChat(settingMap.telegram_bot_token, chatId);
      if (!verification.ok) {
        return NextResponse.json(
          { error: `ارسال از طریق تلگرام ناموفق بود: ${explainTelegramError(verification.error, chatId)}` },
          { status: 400 }
        );
      }
    }

    // پیش‌اعتبارسنجی شماره واتساپ قبل از صرف زمان برای تولید PDF
    if (messenger === "whatsapp") {
      const normalized = normalizeWhatsAppNumber(chatId);
      if (!normalized || normalized.length < 8 || !/^\d+$/.test(normalized)) {
        return NextResponse.json(
          {
            error: `ارسال از طریق واتساپ ناموفق بود: شماره «${chatId}» معتبر نیست. شماره موبایل مشتری را به‌صورت بین‌المللی وارد کنید — نمونه‌های معتبر: 09123456789 یا 989123456789 یا +98 912 345 6789`,
          },
          { status: 400 }
        );
      }
    }

    // تولید PDF
    const pdf = await generateProformaPdfBuffer(proformaId, req.nextUrl.origin);
    if (!pdf) {
      return NextResponse.json({ error: "خطا در تولید PDF" }, { status: 500 });
    }

    const safeNumber = pdf.proformaNumber.replace(/[\/\\]/g, "-");
    const fileName = `PF-${safeNumber}.pdf`;
    const caption = `پیش‌فاکتور شماره ${pdf.proformaNumber}\n${data.companyName || ""}`;

    // ارسال فایل
    const sendResult = await sendPdfViaMessenger(messenger, settingMap, chatId, pdf.buffer, fileName, caption);

    if (!sendResult.ok) {
      let errMsg = sendResult.error || "";
      if (messenger === "rubika" && errMsg.includes("INVALID_INPUT")) {
        errMsg = `روبیکا ورودی را نامعتبر تشخیص داد (INVALID_INPUT) — چت‌آیدی «${chatId}» را بررسی کنید: باید فرمت b0.../g0.../u0.../c0... داشته باشد و از پیام یک کاربر به ربات گرفته شده باشد (نه شماره تلفن). برای یافتن آیدی از تنظیمات → «آیدی‌های اخیر روبیکا» کمک بگیرید.`;
      }
      if (messenger === "eitaa") {
        errMsg = explainEitaaError(errMsg, chatId);
      }
      if (messenger === "telegram") {
        errMsg = explainTelegramError(errMsg, chatId);
      }
      return NextResponse.json(
        { error: `ارسال از طریق ${MESSENGERS[messenger].label} ناموفق بود: ${errMsg}` },
        { status: 502 }
      );
    }

    // به‌روزرسانی وضعیت پیش‌فاکتور به «ارسال شده»
    await db
      .update(proformaInvoices)
      .set({ status: "sent", updatedAt: new Date() })
      .where(eq(proformaInvoices.id, proformaId));

    // ثبت در گردش کار
    await db.insert(workflowItems).values({
      proformaId,
      toDepartment: "دبیرخانه",
      action: "auto_sent",
      comment: `ارسال خودکار از طریق ${MESSENGERS[messenger].label} به شناسه ${chatId}`,
    });

    return NextResponse.json({
      success: true,
      messenger: MESSENGERS[messenger].label,
      chatId,
      fileName,
      status: "sent",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Send-via error:", msg);
    return NextResponse.json({ error: `خطا در ارسال: ${msg}` }, { status: 500 });
  }
}
