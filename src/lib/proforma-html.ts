import { db } from "@/db";
import {
  proformaItems,
  equipment,
  settings,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { buildItemDescription } from "@/lib/print-proforma";
import { proformaTitle } from "@/lib/proforma-number";
import { isSimplifiedProforma } from "@/lib/proforma-type";
import {
  normalizeSignatureText,
  resolveOfficialSignature,
  stripWarrantyLines,
} from "@/lib/signature-text";
import { ltrNumberHtml, toPersianDigits, percentSuffix } from "@/lib/utils";
import { buildVazirFontStyleTag, injectVazirFont } from "@/lib/vazir-font-embed";

export interface ProformaHtmlResult {
  html: string;
  proformaNumber: string;
  issueDate: string;
  companyName: string;
}

/**
 * تولید HTML چاپ/خروجی پیش‌فاکتور (سمت سرور)
 * هم برای آرشیو (save-pdf) و هم برای دانلود مستقیم (download) استفاده می‌شود
 */
export async function generateProformaHtml(proformaId: number): Promise<ProformaHtmlResult | null> {
  // واکشی تنظیمات سربرگ و ته‌برگ
  const settingRows = await db.select().from(settings);
  const cfg: Record<string, string> = {};
  for (const s of settingRows) cfg[s.settingKey] = s.settingValue;
  const headerImg = cfg.header_image || "";
  const footerImg = cfg.footer_image || "";
  const stampImg = cfg.stamp_image || "";
  const headerHeight = cfg.header_height || "2";
  const footerHeight = cfg.footer_height || "1";
  // متن رسمی سپاس/امضا — از تنظیمات (company_signature) قابل تغییر است
  const officialSignature = resolveOfficialSignature(cfg);

  // واکشی اطلاعات کامل پیش‌فاکتور + اطلاعات ارتباط (نوع ارتباط، شناسه، تلفن، فکس، ایمیل)
  const result = await db.execute(sql`
    SELECT
      p.id,
      p.proforma_number as "proformaNumber",
      p.revision_no as "revisionNo",
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
      p.status,
      c.name as "companyName",
      c.phone as "companyPhone",
      c.fax as "companyFax",
      c.email as "companyEmail",
      l.communication_method as "communicationMethod",
      l.communication_id as "communicationId",
      l.phone as "letterPhone",
      l.fax as "letterFax",
      pt.name as "typeName"
    FROM proforma_invoices p
    LEFT JOIN companies c ON p.company_id = c.id
    LEFT JOIN proforma_types pt ON p.proforma_type_id = pt.id
    LEFT JOIN letters l ON p.letter_id = l.id
    WHERE p.id = ${proformaId}
  `);

  if (result.rows.length === 0) return null;

  const data = result.rows[0] as Record<string, unknown>;

  // واکشی اقلام
  const items = await db
    .select({
      id: proformaItems.id,
      equipmentId: proformaItems.equipmentId,
      equipmentName: equipment.name,
      description: proformaItems.description,
      quantity: proformaItems.quantity,
      unitPrice: proformaItems.unitPrice,
      pointCount: proformaItems.pointCount,
      totalPrice: proformaItems.totalPrice,
      isSelected: proformaItems.isSelected,
      calibrationLocation: proformaItems.calibrationLocation,
      paramValues: proformaItems.paramValues,
    })
    .from(proformaItems)
    .leftJoin(equipment, eq(proformaItems.equipmentId, equipment.id))
    .where(eq(proformaItems.proformaId, proformaId));

  // ─── تابع کمکی فارسی‌سازی ───
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  const pn = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    return String(v).replace(/[0-9]/g, (d) => persianDigits[parseInt(d)]);
  };
  const fp = (num: unknown): string => {
    if (num === null || num === undefined || num === "") return "۰";
    const n = typeof num === "string" ? parseFloat(num) : Number(num);
    if (isNaN(n)) return "۰";
    return Math.round(n).toLocaleString("fa-IR");
  };

  // فرمت تعداد بدون اعشار اضافی
  const fq = (v: unknown): string => {
    if (v === null || v === undefined) return pn("0");
    const n = typeof v === "string" ? parseFloat(v as string) : Number(v);
    if (isNaN(n)) return pn("0");
    return pn(Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, ""));
  };

  // ── پیش‌فاکتورهای «نامه ستاد» و «فروش»: ستون «محل کالیبره» و «شرایط و
  // ضوابط» (صفحه آخر) حذف می‌شود و مهر و امضا و نام شرکت دقیقاً زیر آخرین
  // مطلب (زیر جمع کل) می‌آید ──
  const isSetad = isSimplifiedProforma(data.typeName as string | null);

  // ─── ساخت HTML ───
  const rowsHtml = items.map((it, idx) => {
    const desc = buildItemDescription(it);
    const calibLoc = it.calibrationLocation || "-";
    return `<tr>
      <td>${pn(idx + 1)}</td>
      <td style="text-align:right;">${desc}</td>
      <td>${fq(it.quantity)}</td>
      <td>${it.pointCount ? pn(it.pointCount) : "-"}</td>
      <td>${fp(it.unitPrice)}</td>
      <td>${fp(it.totalPrice)}</td>
      ${isSetad ? "" : `<td>${calibLoc}</td>`}
    </tr>`;
  }).join("");

  // عنوان سند: «پیش فاکتور» یا — در صورت اصلاح پس از ارسال — «پیش فاکتور اصلاحی»
  const docTitle = proformaTitle({ revisionNo: data.revisionNo as number | null, proformaNumber: data.proformaNumber as string });
  // بند گارانتی کلاً از خروجی حذف می‌شود (حتی اگر در دیتابیس مانده باشد)
  const safeTextAfter = stripWarrantyLines(data.textAfter as string | null);

  const html = `<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
<title>${docTitle} ${toPersianDigits(data.proformaNumber as string)}</title>
<link href="/fonts/vazirmatn.css" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Vazirmatn','Vazir',Tahoma,sans-serif;direction:rtl;font-size:12px;color:#222;line-height:1.8;}
  .content{padding:15px 30px;}
  .badge{text-align:center;font-size:13px;font-weight:700;margin-bottom:10px;padding:5px;border-radius:6px;background:#dcfce7;color:#166534;border:1px solid #86efac;}
  table{width:100%;border-collapse:collapse;margin:10px 0;}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:center;font-size:11px;}
  th{background:#f1f5f9;font-weight:700;font-size:10px;}
  .hdr{display:flex;justify-content:space-between;gap:20px;margin-bottom:12px;background:#f8fafc;padding:12px 16px;border-radius:8px;border:1px solid #e2e8f0;}
  .hdr p{margin:3px 0;font-size:12px;}
  .totals{max-width:360px;margin-right:auto;margin-top:6px;border:1px solid #cbd5e1;padding:12px;border-radius:8px;}
  .totals .row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;}
  .totals .grand{font-weight:900;border-top:2px solid #333;margin-top:6px;padding-top:6px;font-size:14px;}
  .txt-block{white-space:pre-wrap;margin:8px 0;padding:10px;border-radius:6px;font-size:11px;line-height:1.9;}
  .print-btn{position:fixed;bottom:20px;left:20px;z-index:9999;padding:12px 28px;background:#4f46e5;color:white;border:none;border-radius:12px;cursor:pointer;font-size:14px;font-weight:bold;font-family:Vazirmatn,Tahoma;box-shadow:0 4px 14px rgba(79,70,229,.35);}
  @page{margin-top:${headerImg ? `${parseFloat(headerHeight) * 37.8}px` : "15px"};margin-bottom:${footerImg ? `${parseFloat(footerHeight) * 37.8}px` : "15px"};margin-left:15px;margin-right:15px;}
  ${headerImg ? `.page-header{position:fixed;top:0;left:0;right:0;height:${parseFloat(headerHeight) * 37.8}px;} .page-header img{width:100%;height:100%;object-fit:contain;}` : ""}
  ${footerImg ? `.page-footer{position:fixed;bottom:0;left:0;right:0;height:${parseFloat(footerHeight) * 37.8}px;} .page-footer img{width:100%;height:100%;object-fit:contain;}` : ""}
  @media print{.no-print{display:none!important;}}
  @media screen{.page-header,.page-footer{position:relative;}.content{padding:10px 20px;}}
</style></head><body>
${headerImg ? `<div class="page-header"><img src="${headerImg}" /></div>` : ""}
${footerImg ? `<div class="page-footer"><img src="${footerImg}" /></div>` : ""}
<div class="content">
<div class="hdr">
  <div>
    <p><strong>شرکت:</strong> ${data.companyName || ""}</p>
    <p><strong>تاریخ:</strong> ${pn(data.issueDate)}</p>
    <p><strong>اعتبار:</strong> ${pn(data.validityDays || 30)} روز</p>
    <p><strong>تلفن:</strong> ${pn(data.letterPhone || data.companyPhone || "-")}</p>
    <p><strong>فکس:</strong> ${pn(data.letterFax || data.companyFax || "-")}</p>
  </div>
  <!-- عنوان «پیش فاکتور» — وسط باکس اطلاعات، بین نام شرکت و شماره -->
  <div style="display:flex;align-items:center;justify-content:center;padding:0 14px;">
    <span style="font-size:22px;font-weight:900;color:#4f46e5;letter-spacing:2px;white-space:nowrap;">${docTitle}</span>
  </div>
  <div>
    <p><strong>شماره:</strong> ${ltrNumberHtml(data.proformaNumber as string)}</p>
    <p><strong>نوع:</strong> ${data.typeName || ""}</p>
    <p><strong>نوع ارتباط:</strong> ${data.communicationMethod ? `${pn(data.communicationMethod)}${data.communicationId ? ` (شناسه: ${pn(data.communicationId)})` : ""}` : "-"}</p>
    <p><strong>ایمیل:</strong> ${data.companyEmail ? `<span dir="ltr">${pn(data.companyEmail)}</span>` : "-"}</p>
  </div>
</div>
${data.textBefore ? `<div style="margin:14px 0;"><h4 style="font-size:12px;font-weight:700;margin-bottom:6px;color:#4f46e5;">📄 سربرگ پیش‌فاکتور</h4><div class="txt-block" style="background:#f0f4ff;border-right:3px solid #6366f1;margin:0;">${pn(data.textBefore)}</div></div>` : ""}
<table><thead><tr>
  <th>ردیف</th><th>شرح</th><th>تعداد</th><th>نقطه</th><th>قیمت واحد</th><th>مبلغ کل</th>${isSetad ? "" : "<th>محل کالیبره</th>"}
</tr></thead><tbody>${rowsHtml}</tbody></table>
${data.showTotal ? `<div class="totals">
  <div class="row"><span>جمع اقلام:</span><span>${fp(data.subtotal)} ریال</span></div>
  ${parseFloat(String(data.discountAmount || "0")) > 0 ? `<div class="row" style="color:#dc2626;"><span>تخفیف${percentSuffix(String(data.discountPercent ?? ""))}:</span><span>-${fp(data.discountAmount)}</span></div>` : ""}
  ${parseFloat(String(data.insuranceAmount || "0")) > 0 ? `<div class="row" style="color:#ea580c;"><span>بیمه${percentSuffix(String(data.insurancePercent ?? ""))}:</span><span>-${fp(data.insuranceAmount)}</span></div>` : ""}
  ${parseFloat(String(data.travelCost || "0")) > 0 ? `<div class="row"><span>ایاب و ذهاب:</span><span>${fp(data.travelCost)}</span></div>` : ""}
  ${parseFloat(String(data.transportCost || "0")) > 0 ? `<div class="row"><span>هزینه سفر:</span><span>${fp(data.transportCost)}</span></div>` : ""}
  ${parseFloat(String(data.taxAmount || "0")) > 0 ? `<div class="row" style="color:#2563eb;"><span>ارزش افزوده${percentSuffix(String(data.taxPercent ?? ""))}:</span><span>${fp(data.taxAmount)}</span></div>` : ""}
  <div class="row grand"><span>جمع کل:</span><span>${fp(data.totalAmount)} ریال</span></div>
</div>` : ""}
${safeTextAfter ? `<div style="margin:14px 0;"><h4 style="font-size:12px;font-weight:700;margin-bottom:6px;color:#b45309;">📋 شرایط و توضیحات</h4><div class="txt-block" style="background:#fffbeb;border:1px solid #fde68a;margin:0;">${pn(safeTextAfter)}</div></div>` : ""}
${!isSetad && data.textLastPage ? `<div style="page-break-before:always;margin:14px 0;"><h4 style="font-size:14px;font-weight:900;margin-bottom:8px;color:#166534;">📄 ته‌برگ / شرایط عمومی</h4><div class="txt-block" style="background:#f0fdf4;border:1px solid #bbf7d0;margin:0;">${pn(data.textLastPage)}</div></div>` : ""}
 ${(stampImg || true) ? `
<!-- مهر و امضا با «اندازه اصلیِ واقعیِ فایل» (بدون هیچ تغییر ابعادی): همیشه در «آخرین صفحه» سند، در تمامی حالات.
     اگر «ته‌برگ / صفحه آخر» وجود داشته باشد، مهر در همان صفحه آخر و زیر متن
     شرایط عمومی می‌آید؛ در غیر این‌صورت بلافاصله زیر آخرین مطلب سند قرار
     می‌گیرد. در هر دو حالت مهر هرگز در صفحه‌ای قبل از صفحه آخر نیست.
     متن سپاس دقیقاً در خط بالای «مهر و امضا» قرار می‌گیرد (وسط‌چین) و متن رسمی
     از تنظیمات (company_signature) خوانده می‌شود. -->
<div dir="rtl" style="display:flex;flex-direction:column;align-items:center;text-align:center;margin-top:1em;padding:0 6px;page-break-inside:avoid;break-inside:avoid;">
  <div dir="rtl" style="white-space:pre-wrap;font-size:12.5px;font-weight:700;line-height:1.9;direction:rtl;unicode-bidi:isolate;text-align:center;margin-bottom:2px;">${pn(normalizeSignatureText(data.signatureText as string | null, officialSignature))}</div>
  ${stampImg ? `<img src="${stampImg}" alt="stamp" style="width:auto;height:auto;max-width:100%;display:block;margin:0 auto;" />` : ""}
</div>` : ""}
</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ چاپ / ذخیره PDF</button>
</body></html>`;

  // جاسازی فونت وزیرمتن به‌صورت base64 داخل خودِ فایل، تا خروجی دانلودی/آرشیوی
  // بدون وابستگی به سرور یا اینترنت همیشه با فونت وزیر باز شود و هیچ‌وقت روی
  // فونت ساده پیش‌فرض نیفتد.
  const fontTag = await buildVazirFontStyleTag();
  const htmlWithFont = injectVazirFont(html, fontTag);

  return {
    html: htmlWithFont,
    proformaNumber: String(data.proformaNumber || proformaId),
    issueDate: String(data.issueDate || ""),
    companyName: String(data.companyName || ""),
  };
}
