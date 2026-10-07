import { db } from "@/db";
import { settings } from "@/db/schema";
import { getProformaPrintData } from "@/lib/proforma-data";
import { buildProformaPrintHtml } from "@/lib/print-proforma";
import { buildVazirFontStyleTag, injectVazirFont } from "@/lib/vazir-font-embed";

/**
 * تولید بافر PDF پیش‌فاکتور با رندر headless Chrome — دقیقاً همان قالب چاپ
 */
export async function generateProformaPdfBuffer(
  proformaId: number,
  origin: string
): Promise<{ buffer: Buffer; proformaNumber: string } | null> {
  const [data, settingRows] = await Promise.all([
    getProformaPrintData(proformaId),
    db.select().from(settings),
  ]);
  if (!data) return null;

  const letterSettings: Record<string, string> = {};
  for (const s of settingRows) letterSettings[s.settingKey] = s.settingValue;

  const html = buildProformaPrintHtml(data, letterSettings, { baseHref: origin });

  // جاسازی فونت وزیرمتن به‌صورت base64 — بدون این، اگر «‎/fonts/vazirmatn.css»
  // به هر دلیلی در کروم headless به‌موقع بارگذاری نشود، متن PDF با فونت ساده
  // پیش‌فرض رندر می‌شود. با جاسازی مستقیم، فونت همیشه همراه سند است.
  const fontTag = await buildVazirFontStyleTag();
  const htmlFinal = injectVazirFont(html, fontTag);

  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(htmlFinal, { waitUntil: "load", timeout: 30000 });
    await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
    // صبر برای آماده شدن «همه» فونت‌ها — تا رندر PDF هیچ‌وقت با فونت جایگزین انجام نشود
    await page.evaluate(async () => {
      const d = document as Document & { fonts?: { ready: Promise<unknown> } };
      try {
        await d.fonts?.ready;
      } catch {}
      // اطمینان مضاعف: بارگذاری صریح همه وزن‌های مورد استفاده وزیرمتن
      const fontsAny = d.fonts as unknown as { load?: (f: string) => Promise<unknown> } | undefined;
      if (fontsAny?.load) {
        for (const w of [400, 500, 600, 700, 800, 900]) {
          try {
            await fontsAny.load(`${w} 12px Vazirmatn`);
          } catch {}
        }
      }
    });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    return { buffer: Buffer.from(pdfBuffer), proformaNumber: data.proformaNumber };
  } finally {
    await browser.close();
  }
}

/* ═══════════════════════════════════════════════════════════
   تنظیمات پیام‌رسان‌ها و روش‌های ارسال
   ═══════════════════════════════════════════════════════════ */

export const MESSENGERS = {
  bale: {
    label: "بله",
    method: "بله",
    settingKeys: ["bale_bot_token"],
    type: "bot" as const,
  },
  telegram: {
    label: "تلگرام",
    method: "تلگرام",
    settingKeys: ["telegram_bot_token"],
    type: "bot" as const,
  },
  eitaa: {
    label: "ایتا",
    method: "ایتا",
    settingKeys: ["eita_bot_token"],
    type: "bot" as const,
  },
  rubika: {
    label: "روبیکا",
    method: "روبیکا",
    settingKeys: ["rubika_bot_token"],
    type: "bot" as const,
  },
  whatsapp: {
    label: "واتساپ",
    method: "واتساپ",
    settingKeys: ["whatsapp_token", "whatsapp_phone_id"],
    type: "whatsapp" as const,
  },
  email: {
    label: "ایمیل",
    method: "ایمیل",
    settingKeys: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"],
    type: "email" as const,
  },
} as const;

export type MessengerKey = keyof typeof MESSENGERS;

/** تشخیص پیام‌رسان از روی طریقه ارتباط نامه */
export function detectMessenger(communicationMethod: string | null | undefined): MessengerKey | null {
  if (!communicationMethod) return null;
  const norm = communicationMethod.trim().toLowerCase();
  for (const [key, m] of Object.entries(MESSENGERS)) {
    const label = m.label.toLowerCase();
    if (norm.includes(label) || norm.includes(key)) return key as MessengerKey;
  }
  return null;
}

/**
 * بررسی دسترسی ربات تلگرام به چت، پیش از تولید PDF و ارسال فایل.
 * getChat همان محدودیت واقعی sendDocument را روی chat_id بررسی می‌کند.
 */
export async function verifyTelegramChat(
  token: string,
  chatId: string
): Promise<{ ok: true; chat?: unknown } | { ok: false; error: string }> {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim();
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${cleanToken}/getChat?chat_id=${encodeURIComponent(cleanChatId)}`,
      { method: "GET", signal: AbortSignal.timeout(20_000), cache: "no-store" }
    );
    const raw = await res.text();
    let json: { ok?: boolean; result?: unknown; description?: string; error_code?: number } = {};
    try {
      json = JSON.parse(raw) as typeof json;
    } catch {
      return { ok: false, error: `تلگرام پاسخ نامعتبر داد (HTTP ${res.status})` };
    }
    if (!res.ok || json.ok !== true) {
      return { ok: false, error: json.description || `خطای تلگرام (HTTP ${res.status})` };
    }
    return { ok: true, chat: json.result };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      ok: false,
      error: timeout
        ? "تلگرام تا ۲۰ ثانیه پاسخ نداد؛ اتصال سرور به Telegram API را بررسی کنید"
        : `ارتباط با تلگرام برقرار نشد: ${e instanceof Error ? e.message : "خطا"}`,
    };
  }
}

/* ═══════════════════════════════════════════════════════════
   توابع ارسال فایل برای هر پیام‌رسان
   ═══════════════════════════════════════════════════════════ */

async function sendViaBotApi(
  apiBase: string,
  token: string,
  chatId: string,
  pdf: Buffer,
  fileName: string,
  caption: string,
  label: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim();
  const fd = new FormData();
  fd.append("chat_id", cleanChatId);
  fd.append("caption", caption);
  fd.append("document", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), fileName);

  try {
    const res = await fetch(`${apiBase}/bot${cleanToken}/sendDocument`, {
      method: "POST",
      body: fd,
      signal: AbortSignal.timeout(60_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      return { ok: false, error: json.description || json.error || json.message || `${label} (کد ${res.status})` };
    }
    return { ok: true, result: json };
  } catch (e) {
    return { ok: false, error: `ارتباط با سرور ${label} برقرار نشد: ${e instanceof Error ? e.message : "خطا"}` };
  }
}

type EitaaApiResponse = {
  ok?: boolean;
  result?: unknown;
  description?: unknown;
  error?: unknown;
  message?: unknown;
  error_code?: unknown;
  status?: unknown;
};

/** استخراج امن و خوانای متن خطا از پاسخ‌های مختلف ایتایار */
function getEitaaError(json: EitaaApiResponse, rawBody: string, status: number): string {
  const nestedResult =
    json.result && typeof json.result === "object"
      ? (json.result as Record<string, unknown>)
      : null;
  const candidates: unknown[] = [
    json.description,
    json.error,
    json.message,
    typeof json.result === "string" ? json.result : undefined,
    nestedResult?.description,
    nestedResult?.error,
    nestedResult?.message,
  ];
  const detail = candidates.find((v) => typeof v === "string" && v.trim()) as string | undefined;
  if (detail) return detail.trim().slice(0, 700);

  // اگر سرور به‌جای JSON، HTML یا متن برگرداند، خلاصه‌ای امن از آن نمایش داده شود
  const raw = rawBody
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (raw) return raw.slice(0, 700);

  return `پاسخ نامعتبر یا بدون توضیح از سرور ایتایار (HTTP ${status})`;
}

async function sendViaEitaa(
  token: string,
  chatId: string,
  pdf: Buffer,
  fileName: string,
  caption: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim().replace(/^@/, "");
  const fd = new FormData();
  fd.append("chat_id", cleanChatId);
  fd.append("title", fileName);
  fd.append("caption", caption);
  fd.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), fileName);

  try {
    const res = await fetch(`https://eitaayar.ir/api/${cleanToken}/sendFile`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: fd,
      signal: AbortSignal.timeout(60_000),
    });
    const rawBody = await res.text();
    let json: EitaaApiResponse = {};
    try {
      json = JSON.parse(rawBody.replace(/^\uFEFF/, "")) as EitaaApiResponse;
    } catch {
      // در ادامه متن خام پاسخ برای خطای قابل‌فهم استفاده می‌شود
    }

    // طبق مستند رسمی ایتایار فقط ok:true نشان‌دهنده ارسال موفق است؛
    // این سرویس خطاهای منطقی را نیز معمولاً با HTTP 200 برمی‌گرداند.
    if (!res.ok || json.ok !== true) {
      return { ok: false, error: getEitaaError(json, rawBody, res.status) };
    }
    return { ok: true, result: json };
  } catch (e) {
    const message = e instanceof Error ? e.message : "خطای ناشناخته";
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      ok: false,
      error: timeout
        ? "سرور ایتایار تا ۶۰ ثانیه پاسخ نداد؛ چند دقیقه بعد دوباره تلاش کنید"
        : `ارتباط با سرور ایتایار برقرار نشد: ${message}`,
    };
  }
}

/**
 * ارسال فایل از طریق روبیکا — API نسخه ۳ (متفاوت از تلگرام)
 * فرآیند ۳ مرحله‌ای:
 *   ۱) requestSendFile → دریافت آدرس آپلود
 *   ۲) آپلود فایل به upload_url → دریافت file_id
 *   ۳) sendFile با JSON → ارسال فایل به چت
 */
async function sendViaRubika(
  token: string,
  chatId: string,
  pdf: Buffer,
  fileName: string,
  caption: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const api = async (endpoint: string, body: object) => {
    const res = await fetch(`https://botapi.rubika.ir/v3/${token}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  };

  try {
    // ─── مرحله ۱: دریافت آدرس آپلود ───
    const { res: r1, json: j1 } = await api("requestSendFile", { type: "File" });
    if (!r1.ok) return { ok: false, error: `روبیکا مرحله۱ کد ${r1.status}: ${JSON.stringify(j1)}` };
    const uploadUrl: string | undefined = j1.data?.upload_url || j1.upload_url;
    if (!uploadUrl) return { ok: false, error: `روبیکا مرحله۱ upload_url پیدا نشد: ${JSON.stringify(j1)}` };

    // ─── مرحله ۲: آپلود فایل به لینک دریافتی ───
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), fileName);
    const up = await fetch(uploadUrl, { method: "POST", body: fd });
    const upJson = await up.json().catch(() => ({}));
    if (!up.ok) return { ok: false, error: `روبیکا مرحله۲ آپلود کد ${up.status}: ${JSON.stringify(upJson)}` };
    const fileId: string | undefined = upJson.data?.file_id || upJson.file_id || upJson.data?.fileId || upJson.fileId;
    if (!fileId) return { ok: false, error: `روبیکا مرحله۲ file_id پیدا نشد: ${JSON.stringify(upJson)}` };

    // ─── مرحله ۳: ارسال فایل به مخاطب ───
    const { res: r3, json: j3 } = await api("sendFile", { chat_id: chatId, file_id: fileId, text: caption });
    // تشخیص خطاهای داخلی روبیکا (کد 200 ولی خطا در بدنه)
    const st3 = (j3.status || j3.status_code || "").toString().toUpperCase();
    if (!r3.ok || st3 !== "" && st3 !== "OK") {
      return { ok: false, error: `روبیکا مرحله۳ ارسال نشد (کد ${r3.status}): ${JSON.stringify(j3)}` };
    }
    if (!j3.data && !j3.message_id && st3 !== "OK") {
      return { ok: false, error: `روبیکا مرحله۳ ارسال نشد: ${JSON.stringify(j3)}` };
    }
    return { ok: true, result: j3 };
  } catch (e) {
    return { ok: false, error: `روبیکا خطای شبکه: ${e instanceof Error ? e.message : "خطا"}` };
  }
}

/** نسخه Graph API واتساپ — قابل تغییر از تنظیمات */
export const WHATSAPP_DEFAULT_API_VERSION = "v22.0";

/**
 * نرمال‌سازی شماره موبایل به فرمت بین‌المللی E.164 بدون + (مورد نیاز واتساپ)
 * پشتیبانی از: 09123456789 ، +989123456789 ، 00989123456789 ، ۰۹۱۲۳۴۵۶۷۸۹
 * @param defaultCountryCode کد کشور پیش‌فرض برای شماره‌های محلی (ایران = 98)
 */
export function normalizeWhatsAppNumber(raw: string, defaultCountryCode = "98"): string {
  if (!raw) return "";
  // تبدیل ارقام فارسی/عربی به انگلیسی
  let s = String(raw)
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .trim();

  const hadPlus = s.startsWith("+");
  // حذف همه کاراکترهای غیرعددی (فاصله، خط تیره، پرانتز و ...)
  s = s.replace(/\D/g, "");
  if (!s) return "";

  // 00 ابتدای شماره معادل + است (پیش‌شماره بین‌المللی)
  if (!hadPlus && s.startsWith("00")) {
    return s.slice(2);
  }
  // اگر با + آمده بود، همان شماره بین‌المللی است
  if (hadPlus) return s;
  // شماره محلی با 0 ابتدایی → جایگزینی با کد کشور
  if (s.startsWith("0")) {
    return defaultCountryCode + s.slice(1);
  }
  // اگر از قبل با کد کشور شروع شده باشد
  if (s.startsWith(defaultCountryCode)) return s;
  // شماره موبایل ایران بدون صفر (مثل 9123456789)
  if (defaultCountryCode === "98" && s.length === 10 && s.startsWith("9")) {
    return defaultCountryCode + s;
  }
  return s;
}

/** ترجمه کدهای خطای رایج واتساپ Cloud API به راهنمای فارسی */
function explainWhatsAppError(code: number | undefined, message: string, to: string): string {
  const base = message || "خطای نامشخص";
  switch (code) {
    case 131047:
      return `${base} — پنجره ۲۴ ساعته گفتگو بسته است. واتساپ اجازه ارسال فایل آزاد بعد از ۲۴ ساعت از آخرین پیام مشتری را نمی‌دهد؛ ابتدا از مشتری بخواهید یک پیام به شماره کسب‌وکار شما بفرستد یا از قالب (Template) تأییدشده استفاده کنید.`;
    case 131021:
      return `${base} — شماره «${to}» در فهرست شماره‌های مجاز تست ثبت نشده است. در حالت توسعه، شماره را در Meta Business → WhatsApp → API Setup به Recipient list اضافه کنید.`;
    case 131026:
      return `${base} — پیام قابل تحویل نیست؛ شماره «${to}» احتمالاً حساب واتساپ فعال ندارد یا شماره اشتباه است.`;
    case 131005:
    case 131050:
      return `${base} — مشتری اجازه دریافت پیام را نداده یا شماره کسب‌وکار شما را مسدود کرده است.`;
    case 131042:
      return `${base} — مشکل صورتحساب/پرداخت در حساب Meta Business؛ روش پرداخت معتبر را در Business Manager ثبت کنید.`;
    case 131045:
      return `${base} — شماره کسب‌وکار در Cloud API ثبت نهایی نشده است؛ مرحله Register Phone Number را کامل کنید.`;
    case 190:
      return `${base} — توکن دسترسی منقضی یا نامعتبر است. یک توکن دائمی از System User در Meta Business Suite بسازید (توکن‌های موقت بعد از ۲۴ ساعت باطل می‌شوند).`;
    case 130429:
    case 4:
      return `${base} — محدودیت نرخ ارسال واتساپ فعال شده است؛ کمی بعد دوباره تلاش کنید.`;
    case 100:
      return `${base} — پارامتر نامعتبر؛ Phone Number ID و فرمت شماره مقصد را بررسی کنید.`;
    default:
      return base;
  }
}

async function sendViaWhatsApp(
  token: string,
  phoneNumberId: string,
  to: string,
  pdf: Buffer,
  fileName: string,
  caption: string,
  apiVersion = WHATSAPP_DEFAULT_API_VERSION
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const cleanToken = token.trim();
  const cleanPhoneId = phoneNumberId.trim();
  const recipient = normalizeWhatsAppNumber(to);

  if (!recipient || recipient.length < 8) {
    return {
      ok: false,
      error: `شماره واتساپ «${to}» نامعتبر است. شماره را به‌صورت بین‌المللی وارد کنید (مثال: 989123456789 یا 09123456789).`,
    };
  }

  const base = `https://graph.facebook.com/${apiVersion}`;

  try {
    // ─── مرحله ۱: آپلود فایل PDF به سرور واتساپ ───
    const mediaForm = new FormData();
    mediaForm.append("messaging_product", "whatsapp");
    mediaForm.append("type", "application/pdf");
    mediaForm.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), fileName);

    const mediaRes = await fetch(`${base}/${cleanPhoneId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cleanToken}` },
      body: mediaForm,
      signal: AbortSignal.timeout(90_000),
    });
    const mediaJson = await mediaRes.json().catch(() => ({}));

    if (!mediaRes.ok || !mediaJson.id) {
      const err = mediaJson.error || {};
      return {
        ok: false,
        error: `آپلود فایل در واتساپ ناموفق: ${explainWhatsAppError(err.code, err.message || `HTTP ${mediaRes.status}`, recipient)}`,
      };
    }

    // ─── مرحله ۲: ارسال سند با ارجاع به media_id ───
    const msgRes = await fetch(`${base}/${cleanPhoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cleanToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "document",
        document: {
          id: mediaJson.id,
          filename: fileName,
          caption: caption.slice(0, 1024),
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const msgJson = await msgRes.json().catch(() => ({}));

    if (!msgRes.ok || msgJson.error) {
      const err = msgJson.error || {};
      return {
        ok: false,
        error: `ارسال واتساپ ناموفق: ${explainWhatsAppError(err.code, err.message || `HTTP ${msgRes.status}`, recipient)}`,
      };
    }

    return { ok: true, result: { ...msgJson, normalizedTo: recipient } };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      ok: false,
      error: timeout
        ? "سرور واتساپ در زمان مجاز پاسخ نداد؛ چند لحظه بعد دوباره تلاش کنید."
        : `ارتباط با سرور واتساپ برقرار نشد: ${e instanceof Error ? e.message : "خطا"}`,
    };
  }
}

async function sendViaEmail(
  smtp: { host: string; port: string; user: string; pass: string; from: string },
  to: string,
  pdf: Buffer,
  fileName: string,
  subject: string,
  caption: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: parseInt(smtp.port) || 587,
      secure: parseInt(smtp.port) === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const info = await transporter.sendMail({
      from: smtp.from || smtp.user,
      to,
      subject,
      text: caption,
      attachments: [{ filename: fileName, content: pdf, contentType: "application/pdf" }],
    });
    return { ok: true, result: { messageId: info.messageId } };
  } catch (e) {
    return { ok: false, error: `ارسال ایمیل ناموفق: ${e instanceof Error ? e.message : "خطا"}` };
  }
}

/** ارسال فایل PDF از طریق پیام‌رسان با تشخیص خودکار روش ارسال */
export async function sendPdfViaMessenger(
  messenger: MessengerKey,
  allSettings: Record<string, string>,
  chatId: string,
  pdf: Buffer,
  fileName: string,
  caption: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const m = MESSENGERS[messenger];

  switch (messenger) {
    case "bale":
      return sendViaBotApi("https://tapi.bale.ai", allSettings.bale_bot_token, chatId, pdf, fileName, caption, "بله");
    case "telegram":
      return sendViaBotApi("https://api.telegram.org", allSettings.telegram_bot_token, chatId, pdf, fileName, caption, "تلگرام");
    case "rubika":
      return sendViaRubika(allSettings.rubika_bot_token, chatId, pdf, fileName, caption);
    case "eitaa":
      return sendViaEitaa(allSettings.eita_bot_token, chatId, pdf, fileName, caption);
    case "whatsapp":
      return sendViaWhatsApp(
        allSettings.whatsapp_token,
        allSettings.whatsapp_phone_id,
        chatId,
        pdf,
        fileName,
        caption,
        allSettings.whatsapp_api_version?.trim() || WHATSAPP_DEFAULT_API_VERSION
      );
    case "email":
      return sendViaEmail(
        {
          host: allSettings.smtp_host || "",
          port: allSettings.smtp_port || "587",
          user: allSettings.smtp_user || "",
          pass: allSettings.smtp_pass || "",
          from: allSettings.smtp_from || "",
        },
        chatId,
        pdf,
        fileName,
        `پیش‌فاکتور ${fileName.replace(".pdf", "")}`,
        caption
      );
    default:
      return { ok: false, error: "پیام‌رسان ناشناخته" };
  }
}
