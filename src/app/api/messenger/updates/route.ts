import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings, letters, companies, proformaInvoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MESSENGERS, type MessengerKey } from "@/lib/proforma-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CompanyCommunicationLink = {
  communicationId: string | null;
  communicationMethod: string | null;
  companyId: number;
  companyName: string;
  contactPerson: string | null;
  updatedAt: Date | null;
};

/** ارتباطات ثبت‌شده شرکت‌ها در نامه‌ها و پیش‌فاکتورهای مستقیم */
async function getCompanyCommunicationLinks(): Promise<CompanyCommunicationLink[]> {
  const [letterLinks, directProformaLinks] = await Promise.all([
    db
      .select({
        communicationId: letters.communicationId,
        communicationMethod: letters.communicationMethod,
        companyId: companies.id,
        companyName: companies.name,
        contactPerson: letters.contactPerson,
        updatedAt: letters.updatedAt,
      })
      .from(letters)
      .innerJoin(companies, eq(letters.companyId, companies.id)),
    db
      .select({
        communicationId: proformaInvoices.communicationId,
        communicationMethod: proformaInvoices.communicationMethod,
        companyId: companies.id,
        companyName: companies.name,
        contactPerson: companies.contactPerson,
        updatedAt: proformaInvoices.updatedAt,
      })
      .from(proformaInvoices)
      .innerJoin(companies, eq(proformaInvoices.companyId, companies.id)),
  ]);
  return [...letterLinks, ...directProformaLinks];
}

/**
 * واکشی آیدی‌های چت اخیر از ربات — برای پیدا کردن شناسه چت مشتری‌ها
 * GET /api/messenger/updates?messenger=bale|telegram|rubika|eitaa
 */
export async function GET(req: NextRequest) {
  try {
    const messengerParam = req.nextUrl.searchParams.get("messenger") as MessengerKey | null;
    const supportedMessengers: MessengerKey[] = ["bale", "telegram", "rubika", "eitaa"];
    if (!messengerParam || !supportedMessengers.includes(messengerParam)) {
      return NextResponse.json({ error: "messenger نامعتبر است (bale, telegram, rubika, eitaa)" }, { status: 400 });
    }

    const m = MESSENGERS[messengerParam];
    const settingRows = await db.select().from(settings);
    const settingMap: Record<string, string> = {};
    for (const s of settingRows) settingMap[s.settingKey] = s.settingValue;

    const token = settingMap[m.settingKeys[0]]?.trim() || "";
    // فهرست ایتا از سوابق داخلی ساخته می‌شود و برای نمایش به توکن نیاز ندارد
    if (!token && messengerParam !== "eitaa") {
      return NextResponse.json({ error: `توکن ${m.label} تنظیم نشده است` }, { status: 400 });
    }

    // فراخوانی getUpdates برای بله/تلگرام
    let res: Response;
    let json: Record<string, unknown> = {};

    if (messengerParam === "rubika") {
      // ساختار رسمی روبیکا: chat_id در Update و متن در new_message قرار دارد
      res = await fetch(`https://botapi.rubika.ir/v3/${token}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      json = await res.json().catch(() => ({})) as Record<string, unknown>;
      const rubikaStatus = String(json.status || json.status_code || "").toUpperCase();
      if (!res.ok || (rubikaStatus && rubikaStatus !== "OK")) {
        return NextResponse.json(
          { error: json.message || json.description || `خطای روبیکا (کد ${res.status})` },
          { status: 502 }
        );
      }

      type RubikaChatInfo = {
        id: string;
        name: string;
        username?: string;
        type?: string;
        lastMessage?: string;
        lastMessageAt?: number;
        senderId?: string;
      };
      const chats = new Map<string, RubikaChatInfo>();
      const asRecord = (value: unknown): Record<string, unknown> | undefined =>
        value && typeof value === "object" && !Array.isArray(value)
          ? value as Record<string, unknown>
          : undefined;
      const arrayFrom = (value: unknown): Array<Record<string, unknown>> =>
        Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : [];

      // API در نسخه‌های مختلف آرایه را در result/data/updates یا result.updates برمی‌گرداند
      const resultObj = asRecord(json.result);
      const dataObj = asRecord(json.data);
      const updates = [
        ...arrayFrom(json.result),
        ...arrayFrom(json.data),
        ...arrayFrom(json.updates),
        ...arrayFrom(resultObj?.updates),
        ...arrayFrom(dataObj?.updates),
      ];

      for (const raw of updates) {
        const event = asRecord(raw.update) || raw;
        const inline = asRecord(raw.inline_message) || asRecord(event.inline_message);
        const message =
          asRecord(event.new_message) ||
          asRecord(event.updated_message) ||
          asRecord(event.message) ||
          inline;
        const id = String(event.chat_id || inline?.chat_id || message?.chat_id || raw.chat_id || "").trim();
        if (!id) continue;
        const text = String(message?.text || message?.caption || "").replace(/\s+/g, " ").trim().slice(0, 300);
        const time = Number(message?.time || message?.date || 0) || undefined;
        const existing = chats.get(id);
        const isNewer = !!text && (!existing?.lastMessageAt || !time || time >= existing.lastMessageAt);
        chats.set(id, {
          id,
          name: existing?.name || id,
          username: existing?.username,
          type: existing?.type,
          lastMessage: isNewer ? text : existing?.lastMessage,
          lastMessageAt: isNewer ? time : existing?.lastMessageAt,
          senderId: String(message?.sender_id || inline?.sender_id || existing?.senderId || "") || undefined,
        });
      }

      // نام و نوع واقعی هر مخاطب از متد رسمی getChat روبیکا
      await Promise.all(Array.from(chats.values()).map(async (item) => {
        try {
          const chatRes = await fetch(`https://botapi.rubika.ir/v3/${token}/getChat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: item.id }),
            signal: AbortSignal.timeout(10_000),
            cache: "no-store",
          });
          const chatJson = await chatRes.json().catch(() => ({})) as Record<string, unknown>;
          const chatResult = asRecord(chatJson.result);
          const chatData = asRecord(chatJson.data);
          const chat =
            asRecord(chatJson.chat) ||
            asRecord(chatResult?.chat) ||
            asRecord(chatData?.chat) ||
            chatResult ||
            chatData;
          if (!chatRes.ok || !chat) return;
          const name = [chat.first_name, chat.last_name, chat.title].filter(Boolean).map(String).join(" ").trim();
          chats.set(item.id, {
            ...item,
            name: name || (chat.username ? `@${String(chat.username)}` : item.name),
            username: chat.username ? String(chat.username) : item.username,
            type: chat.chat_type ? String(chat.chat_type) : item.type,
          });
        } catch {
          // در نبود getChat، شناسه و آخرین پیام همچنان قابل استفاده‌اند
        }
      }));

      // نام/لینک بات برای راهنمای شروع گفتگو
      let botUsername: string | undefined;
      let botShareUrl: string | undefined;
      try {
        const meRes = await fetch(`https://botapi.rubika.ir/v3/${token}/getMe`, {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          cache: "no-store",
        });
        const meJson = await meRes.json().catch(() => ({})) as Record<string, unknown>;
        const meResult = asRecord(meJson.result);
        const meData = asRecord(meJson.data);
        const bot = asRecord(meJson.bot) || asRecord(meResult?.bot) || asRecord(meData?.bot) || meResult || meData;
        if (bot) {
          botUsername = bot.username ? String(bot.username) : undefined;
          botShareUrl = bot.share_url ? String(bot.share_url) : undefined;
        }
      } catch {
        // اطلاعات بات اختیاری است
      }

      // تطبیق chat_id با شرکت‌هایی که قبلاً برای روش ارتباط روبیکا ثبت شده‌اند
      const linkedCompanies = new Map<string, Map<number, string>>();
      const companyLinks = await getCompanyCommunicationLinks();
      for (const link of companyLinks) {
        const method = String(link.communicationMethod || "").trim().toLowerCase();
        if (!method.includes("روبیکا") && !method.includes("rubika")) continue;
        const id = String(link.communicationId || "").trim();
        if (!id) continue;
        if (!linkedCompanies.has(id)) linkedCompanies.set(id, new Map());
        linkedCompanies.get(id)!.set(link.companyId, link.companyName);
      }

      const chatList = Array.from(chats.values()).map((chat) => ({
        ...chat,
        linkedCompanies: Array.from(linkedCompanies.get(chat.id)?.entries() || []).map(([id, name]) => ({ id, name })),
      }));

      return NextResponse.json({
        messenger: m.label,
        botUsername,
        botShareUrl,
        chats: chatList,
        note: chatList.length === 0
          ? "هیچ پیام روبیکایی برای بات ثبت نشده — مشتری باید بات را شروع کند و نام شرکت را پیام بدهد"
          : undefined,
      });
    }

    // ایتایار API دریافت پیام‌های ورودی ندارد؛ فهرست قابل اتکا از سوابق داخلی سیستم ساخته می‌شود
    if (messengerParam === "eitaa") {
      type EitaaDirectoryChat = {
        id: string;
        name: string;
        type: string;
        lastMessage?: string;
        lastUsedAt?: number;
        linkedCompanies: Array<{ id: number; name: string }>;
      };
      const directory = new Map<string, EitaaDirectoryChat>();
      const companyLinks = await getCompanyCommunicationLinks();

      for (const link of companyLinks) {
        const method = String(link.communicationMethod || "").trim().toLowerCase();
        if (!method.includes("ایتا") && !method.includes("eitaa") && !method.includes("eita")) continue;
        const id = String(link.communicationId || "").trim().replace(/^@/, "");
        if (!id) continue;
        const existing = directory.get(id);
        const linkedCompanies = existing?.linkedCompanies ? [...existing.linkedCompanies] : [];
        if (!linkedCompanies.some((company) => company.id === link.companyId)) {
          linkedCompanies.push({ id: link.companyId, name: link.companyName });
        }
        const usedAt = link.updatedAt ? new Date(link.updatedAt).getTime() : 0;
        const isLatest = !existing?.lastUsedAt || usedAt >= existing.lastUsedAt;
        directory.set(id, {
          id,
          name: linkedCompanies.map((company) => company.name).join("، "),
          type: "ثبت‌شده",
          lastMessage: isLatest && link.contactPerson
            ? `مسئول مرتبط در آخرین نامه: ${link.contactPerson}`
            : existing?.lastMessage,
          lastUsedAt: Math.max(existing?.lastUsedAt || 0, usedAt),
          linkedCompanies,
        });
      }

      const chats = Array.from(directory.values())
        .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
        .map(({ lastUsedAt: _lastUsedAt, ...chat }) => chat);

      return NextResponse.json({
        messenger: m.label,
        providerSupportsUpdates: false,
        chats,
        note: chats.length === 0
          ? "هنوز شناسه ایتایی در نامه‌ها ثبت نشده است. شناسه را از پنل ایتایار وارد و نامه را ذخیره کنید؛ دفعات بعد نام شرکت کنار آن نمایش داده می‌شود."
          : "ایتایار دریافت پیام‌های ورودی را ارائه نمی‌دهد؛ این فهرست از شناسه‌های ثبت‌شده در نامه‌های سیستم ساخته شده است.",
      });
    }

    let url: string;
    if (messengerParam === "bale") {
      url = `https://tapi.bale.ai/bot${token}/getUpdates`;
    } else if (messengerParam === "telegram") {
      url = `https://api.telegram.org/bot${token}/getUpdates`;
    } else {
      return NextResponse.json({
        messenger: m.label,
        note: "ایتا API مشاهده آیدی‌ها ندارد — شناسه چت را از داخل ایتا کپی کنید",
        chats: [],
      });
    }

    res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    json = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (!res.ok || json.ok === false) {
      return NextResponse.json(
        { error: json.description || `خطای ${m.label} (کد ${res.status})` },
        { status: 502 }
      );
    }

    // استخراج آیدی‌های یکتا همراه با اطلاعاتی که به تشخیص مشتری کمک می‌کند
    type ChatInfo = {
      id: string;
      name: string;
      username?: string;
      type?: string;
      lastMessage?: string;
      lastMessageAt?: number;
    };
    const chats = new Map<string, ChatInfo>();
    const pushChat = (
      chat: Record<string, unknown> | undefined,
      message?: Record<string, unknown>,
      sender?: Record<string, unknown>
    ) => {
      if (chat?.id === undefined || chat?.id === null) return;
      const id = String(chat.id).trim();
      if (!id) return;
      const usernameValue = chat.username || sender?.username;
      const username = usernameValue ? String(usernameValue).trim() : undefined;
      const name = [
        chat.first_name || sender?.first_name,
        chat.last_name || sender?.last_name,
        chat.title,
      ]
        .filter(Boolean)
        .map(String)
        .join(" ")
        .trim();
      const existing = chats.get(id);
      const messageAt = Number(message?.date || 0) || undefined;
      const textValue = message?.text || message?.caption;
      const lastMessage = textValue ? String(textValue).replace(/\s+/g, " ").trim().slice(0, 300) : undefined;
      const isNewerMessage = !!lastMessage && (!existing?.lastMessageAt || !messageAt || messageAt >= existing.lastMessageAt);

      chats.set(id, {
        id,
        name: name || (username ? `@${username}` : existing?.name || id),
        username: username || existing?.username,
        type: chat.type ? String(chat.type) : existing?.type,
        lastMessage: isNewerMessage ? lastMessage : existing?.lastMessage,
        lastMessageAt: isNewerMessage ? messageAt : existing?.lastMessageAt,
      });
    };

    const updatesArr = Array.isArray(json.result) ? json.result : Array.isArray(json.data) ? json.data : [];
    for (const update of updatesArr as Array<Record<string, unknown>>) {
      const msg = (update.message || update.edited_message || update.channel_post || update.edited_channel_post) as
        | Record<string, unknown>
        | undefined;
      pushChat(
        msg?.chat as Record<string, unknown> | undefined,
        msg,
        msg?.from as Record<string, unknown> | undefined
      );

      const callback = update.callback_query as Record<string, unknown> | undefined;
      const callbackMessage = callback?.message as Record<string, unknown> | undefined;
      pushChat(
        callbackMessage?.chat as Record<string, unknown> | undefined,
        callbackMessage,
        callback?.from as Record<string, unknown> | undefined
      );

      const membership = (update.my_chat_member || update.chat_member || update.chat_join_request) as
        | Record<string, unknown>
        | undefined;
      pushChat(
        membership?.chat as Record<string, unknown> | undefined,
        undefined,
        membership?.from as Record<string, unknown> | undefined
      );
    }

    // تکمیل نام/نوع چت با متد رسمی getChat تلگرام یا بله
    const botApiBase = messengerParam === "bale" ? "https://tapi.bale.ai" : "https://api.telegram.org";
    await Promise.all(Array.from(chats.values()).map(async (item) => {
      try {
        const chatRes = await fetch(
          `${botApiBase}/bot${token}/getChat?chat_id=${encodeURIComponent(item.id)}`,
          { signal: AbortSignal.timeout(10_000), cache: "no-store" }
        );
        const chatJson = (await chatRes.json().catch(() => ({}))) as {
          ok?: boolean;
          result?: Record<string, unknown>;
        };
        const chat = chatJson.ok ? chatJson.result : undefined;
        if (!chat) return;
        const name = [chat.first_name, chat.last_name, chat.title]
          .filter(Boolean)
          .map(String)
          .join(" ")
          .trim();
        chats.set(item.id, {
          ...item,
          name: name || (chat.username ? `@${String(chat.username)}` : item.name),
          username: chat.username ? String(chat.username) : item.username,
          type: chat.type ? String(chat.type) : item.type,
        });
      } catch {
        // اطلاعات موجود در getUpdates همچنان قابل استفاده است
      }
    }));

    // نام کاربری ربات/بازو برای نمایش راهنمای شروع گفتگو
    let botUsername: string | undefined;
    try {
      const meRes = await fetch(`${botApiBase}/bot${token}/getMe`, {
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      const meJson = (await meRes.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: { username?: string };
      };
      if (meJson.ok && meJson.result?.username) botUsername = meJson.result.username;
    } catch {
      // نبود نام کاربری مانع نمایش فهرست چت‌ها نمی‌شود
    }

    // اتصال شناسه‌های چت به شرکت‌هایی که قبلاً در نامه‌های سیستم ثبت شده‌اند
    const normalizeId = (value: unknown) =>
      String(value ?? "")
        .trim()
        .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    const linkedCompanies = new Map<string, Map<number, string>>();
    const companyLinks = await getCompanyCommunicationLinks();

    for (const link of companyLinks) {
      const method = String(link.communicationMethod || "").trim().toLowerCase();
      const belongsToMessenger =
        messengerParam === "telegram"
          ? method.includes("تلگرام") || method.includes("telegram")
          : messengerParam === "bale"
            ? method.includes("بله") || method.includes("bale")
            : false;
      if (!belongsToMessenger) continue;
      const id = normalizeId(link.communicationId);
      if (!id) continue;
      if (!linkedCompanies.has(id)) linkedCompanies.set(id, new Map());
      linkedCompanies.get(id)!.set(link.companyId, link.companyName);
    }

    const chatList = Array.from(chats.values()).map((chat) => ({
      ...chat,
      linkedCompanies: Array.from(linkedCompanies.get(normalizeId(chat.id))?.entries() || []).map(
        ([id, name]) => ({ id, name })
      ),
    }));

    return NextResponse.json({
      messenger: m.label,
      botUsername,
      providerSupportsUpdates: true,
      chats: chatList,
      note: chats.size === 0
        ? `هیچ پیامی برای ${messengerParam === "bale" ? "این بازو" : "این ربات"} ثبت نشده — مشتری باید ابتدا ${botUsername ? `به @${botUsername} پیام /start بفرستد` : messengerParam === "bale" ? "بازو را شروع کند و یک پیام بفرستد" : "ربات را Start کند و یک پیام بفرستد"}`
        : undefined,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `خطا: ${msg}` }, { status: 500 });
  }
}
