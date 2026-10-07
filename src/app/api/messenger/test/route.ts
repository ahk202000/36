import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { MESSENGERS, normalizeWhatsAppNumber, WHATSAPP_DEFAULT_API_VERSION, type MessengerKey } from "@/lib/proforma-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * تست اتصال و بررسی سلامت توکن پیام‌رسان
 * POST /api/messenger/test
 * body: { messenger: "eitaa" | "telegram" | "bale" | "rubika", chatId?: string, token?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messenger = body.messenger as MessengerKey;
    const testChatId = body.chatId ? String(body.chatId).trim().replace(/^@/, "") : "";

    if (!messenger || !MESSENGERS[messenger]) {
      return NextResponse.json({ error: "پیام‌رسان نامعتبر است" }, { status: 400 });
    }

    // خواندن تنظیمات ذخیره‌شده
    const settingRows = await db.select().from(settings);
    const settingMap: Record<string, string> = {};
    for (const s of settingRows) settingMap[s.settingKey] = s.settingValue;

    // خواندن توکن از بدنه یا تنظیمات
    let token = body.token?.trim();
    if (!token) {
      token = settingMap[MESSENGERS[messenger].settingKeys[0]]?.trim();
    }

    if (!token) {
      return NextResponse.json({ error: `توکن ${MESSENGERS[messenger].label} وارد نشده است` }, { status: 400 });
    }

    // ─── تست واتساپ (Cloud API) ───
    if (messenger === "whatsapp") {
      const phoneNumberId = (body.phoneNumberId?.trim() || settingMap.whatsapp_phone_id?.trim() || "");
      if (!phoneNumberId) {
        return NextResponse.json({ error: "Phone Number ID واتساپ وارد نشده است" }, { status: 400 });
      }
      const apiVersion = settingMap.whatsapp_api_version?.trim() || WHATSAPP_DEFAULT_API_VERSION;

      // بررسی صحت توکن و شماره کسب‌وکار
      const infoRes = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }
      );
      const infoJson = await infoRes.json().catch(() => ({}));
      if (!infoRes.ok || infoJson.error) {
        const err = infoJson.error || {};
        const hint = err.code === 190
          ? " — توکن منقضی یا نامعتبر است؛ یک توکن دائمی از System User بسازید."
          : err.code === 100
            ? " — Phone Number ID را بررسی کنید."
            : "";
        return NextResponse.json(
          { error: `${err.message || `خطای واتساپ (HTTP ${infoRes.status})`}${hint}` },
          { status: 400 }
        );
      }

      const businessInfo = `${infoJson.verified_name || "کسب‌وکار"} (${infoJson.display_phone_number || phoneNumberId})`;

      // اگر شماره تست داده شده، پیام متنی تست ارسال می‌شود
      if (testChatId) {
        const recipient = normalizeWhatsAppNumber(testChatId);
        if (!recipient || recipient.length < 8) {
          return NextResponse.json(
            { error: `شماره «${testChatId}» نامعتبر است. نمونه معتبر: 09123456789 یا 989123456789` },
            { status: 400 }
          );
        }
        const sendRes = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipient,
            type: "text",
            text: { preview_url: false, body: "✅ پیام تست اتصال سیستم بازرگانی به واتساپ با موفقیت ارسال شد." },
          }),
          signal: AbortSignal.timeout(30_000),
        });
        const sendJson = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok || sendJson.error) {
          const err = sendJson.error || {};
          const hint = err.code === 131047
            ? " — پنجره ۲۴ ساعته بسته است؛ ابتدا مشتری باید یک پیام به شماره کسب‌وکار شما بفرستد."
            : err.code === 131021
              ? " — شماره در فهرست شماره‌های مجاز تست ثبت نشده است."
              : "";
          return NextResponse.json(
            { error: `${err.message || `ارسال ناموفق (HTTP ${sendRes.status})`}${hint}` },
            { status: 400 }
          );
        }
        return NextResponse.json({
          ok: true,
          message: `اتصال برقرار شد و پیام تست به شماره ${recipient} ارسال شد. (${businessInfo})`,
        });
      }

      return NextResponse.json({
        ok: true,
        bot: infoJson,
        message: `اتصال به واتساپ برقرار شد — ${businessInfo}${infoJson.quality_rating ? ` | کیفیت: ${infoJson.quality_rating}` : ""}`,
      });
    }

    // ─── تست ایتا ───
    if (messenger === "eitaa") {
      // اگر چت‌آیدی برای تست ارسال شده، پیام تست ارسال می‌کنیم
      if (testChatId) {
        const fd = new FormData();
        fd.append("chat_id", testChatId);
        fd.append("text", "✅ پیام تست اتصال سیستم بازرگانی به ایتا با موفقیت ارسال شد.");
        const res = await fetch(`https://eitaayar.ir/api/${token}/sendMessage`, {
          method: "POST",
          body: fd,
          signal: AbortSignal.timeout(20_000),
        });
        const raw = await res.text();
        let json: { ok?: boolean; description?: string; result?: unknown; error?: string } = {};
        try {
          json = JSON.parse(raw);
        } catch {
          // fallback
        }
        if (json.ok === true || (res.ok && !json.error && !json.description)) {
          return NextResponse.json({
            ok: true,
            message: `پیام تست با موفقیت به شناسه «${testChatId}» در ایتا ارسال شد.`,
          });
        } else {
          return NextResponse.json(
            { error: json.description || json.error || `خطا در ارسال پیام تست (HTTP ${res.status})` },
            { status: 400 }
          );
        }
      }

      // در غیر این صورت متد getMe را برای بررسی صحت توکن فراخوانی می‌کنیم
      try {
        const res = await fetch(`https://eitaayar.ir/api/${token}/getMe`, {
          method: "GET",
          signal: AbortSignal.timeout(15_000),
        });
        const json = await res.json().catch(() => ({}));
        if (json.ok === true && json.result) {
          const bot = json.result;
          return NextResponse.json({
            ok: true,
            bot: {
              name: [bot.first_name, bot.last_name].filter(Boolean).join(" ") || "ربات ایتا",
              username: bot.username || "",
              id: bot.id,
            },
            message: `اتصال به ایتا با موفقیت برقرار شد (نام ربات: ${bot.first_name || bot.username || bot.id})`,
          });
        }
      } catch {
        // ممکن است getMe در برخی سرورها فیلتر باشد
      }

      return NextResponse.json({
        ok: true,
        message: "توکن ایتا ثبت شد. برای اطمینان می‌توانید با وارد کردن شناسه چت، پیام تست بفرستید.",
      });
    }

    // ─── تست تلگرام ───
    if (messenger === "telegram") {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: AbortSignal.timeout(15_000),
      });
      const json = await res.json().catch(() => ({}));
      if (json.ok && json.result) {
        return NextResponse.json({
          ok: true,
          bot: json.result,
          message: `اتصال به تلگرام برقرار شد (نام ربات: @${json.result.username})`,
        });
      }
      return NextResponse.json(
        { error: json.description || `خطای تلگرام (HTTP ${res.status})` },
        { status: 400 }
      );
    }

    // ─── تست بله ───
    if (messenger === "bale") {
      const res = await fetch(`https://tapi.bale.ai/bot${token}/getMe`, {
        signal: AbortSignal.timeout(15_000),
      });
      const json = await res.json().catch(() => ({}));
      if (json.ok && json.result) {
        return NextResponse.json({
          ok: true,
          bot: json.result,
          message: `اتصال به بازوی بله برقرار شد (نام بازو: @${json.result.username || json.result.first_name})`,
        });
      }
      return NextResponse.json(
        { error: json.description || `خطای بله (HTTP ${res.status})` },
        { status: 400 }
      );
    }

    // ─── تست روبیکا ───
    if (messenger === "rubika") {
      const res = await fetch(`https://botapi.rubika.ir/v3/${token}/getMe`, {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
      });
      const json = await res.json().catch(() => ({}));
      const bot = json.data?.bot || json.result?.bot || json.bot;
      if (bot) {
        return NextResponse.json({
          ok: true,
          bot,
          message: `اتصال به بات روبیکا برقرار شد (عنوان: ${bot.bot_title || bot.username || "بات روبیکا"})`,
        });
      }
      return NextResponse.json(
        { error: json.description || json.message || `خطای روبیکا (HTTP ${res.status})` },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "پیام‌رسان پشتیبانی نمی‌شود" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `خطا در تست اتصال: ${msg}` }, { status: 500 });
  }
}
