/**
 * سازنده HTML چاپ/خروجی پیش‌فاکتور — نسخه مشترک و واحد
 * هم صفحه مشاهده و هم پنل ارسال از این یک تابع استفاده می‌کنند
 * تا خروجی همیشه «دقیقاً یکسان» باشد.
 */
import { formatPrice, toPersianDigits, ltrNumberHtml, percentSuffix } from "@/lib/utils";
import { proformaTitle } from "@/lib/proforma-number";
import { isSimplifiedProforma } from "@/lib/proforma-type";
import {
  normalizeSignatureText,
  resolveOfficialSignature,
  stripWarrantyLines,
} from "@/lib/signature-text";

export interface PrintItemRow {
  description: string;
  equipmentName: string | null;
  quantity: string;
  unitPrice: string;
  pointCount: number | null;
  totalPrice: string;
  isSelected?: boolean;
  multiplierPercent?: string | null;
  paramValues?: unknown;
  calibrationLocation?: string | null;
}

export interface PrintProformaData {
  letterId?: number | null;
  proformaNumber: string;
  /** شماره نسخه اصلاحیه (۰ = صدور اولیه) — برای عنوان «پیش فاکتور اصلاحی» */
  revisionNo?: number | string | null;
  issueDate: string;
  validityDays: number | null;
  showTotal: boolean;
  subtotal: string;
  discountPercent: string;
  discountAmount: string;
  taxPercent: string;
  taxAmount: string;
  insurancePercent: string;
  insuranceAmount: string;
  travelCost: string;
  transportCost: string;
  totalAmount: string;
  textBefore: string | null;
  textAfter: string | null;
  textLastPage: string | null;
  signatureText: string | null;
  companyName: string | null;
  typeName: string | null;
  companyPhone?: string | null;
  companyFax?: string | null;
  companyEmail?: string | null;
  communicationMethod?: string | null;
  communicationId?: string | null;
  letterPhone?: string | null;
  letterFax?: string | null;
  items: PrintItemRow[];
}

export interface PrintBuildOptions {
  /** جایگزینی اقلام (مثلاً حالت ویرایش قیمت‌ها) */
  items?: PrintItemRow[];
  /** متن جمع کل جایگزین (مثلاً جمع محاسبه‌شده در حالت ویرایش) */
  totalText?: string;
  /** مبدأ مطلق برای تبدیل مسیرهای نسبی تصاویر (فقط سمت سرور/headless) */
  baseHref?: string;
}

// فرمت عدد تعداد — بدون اعشار اگر عدد صحیح باشد
const fmtQty = (v: string | number | null | undefined) => {
  if (v === null || v === undefined) return "۰";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "۰";
  return toPersianDigits(Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, ""));
};

// مطلق کردن مسیر تصاویر برای لود صحیح در پنجره چاپ
const absUrl = (p: string) => {
  if (!p) return "";
  if (p.startsWith("http")) return p;
  return typeof window !== "undefined" && window.location?.origin ? window.location.origin + p : p;
};

interface StoredParam {
  paramId?: number | null;
  name?: string;
  unit?: string | null;
  count?: string | number;
}

/**
 * ساخت شرح ردیف همراه با «همه» پارامترها
 * مثال: چمبر تست دما و رطوبت — هر نقطه دمایی ×۹ • هر نقطه رطوبت ×۳
 */
export function buildItemDescription(item: {
  description?: string;
  equipmentName?: string | null;
  paramValues?: unknown;
}): string {
  const baseName = item.equipmentName || item.description || "";
  const pv = item.paramValues as
    | { params?: StoredParam[]; paramName?: string; paramUnit?: string | null; pointCount?: unknown }
    | null
    | undefined;

  // حالت جدید: چند پارامتر ذخیره‌شده
  if (pv?.params && Array.isArray(pv.params) && pv.params.length > 0) {
    const parts = pv.params
      .filter((p) => p && p.name)
      .map((p) => {
        const cnt = parseInt(String(p.count ?? "")) || 0;
        return cnt > 1 ? `${p.name} ×${toPersianDigits(cnt)}` : String(p.name);
      });
    if (parts.length > 0) {
      return `${baseName} — ${parts.join(" • ")}`;
    }
  }

  // حالت قدیمی: تک پارامتر
  if (pv?.paramName) {
    const cnt = parseInt(String(pv.pointCount ?? "")) || 0;
    const single = cnt > 1 ? `${pv.paramName} ×${toPersianDigits(cnt)}` : String(pv.paramName);
    return `${baseName} — ${single}`;
  }

  return item.description || baseName;
}

export function buildProformaPrintHtml(
  data: PrintProformaData,
  letterSettings: Record<string, string>,
  opts?: PrintBuildOptions
): string {
  const headerImg = absUrl(letterSettings.header_image || "");
  const footerImg = absUrl(letterSettings.footer_image || "");
  const stampImg = absUrl(letterSettings.stamp_image || "");

    const pn = (v: string | number | null | undefined) => toPersianDigits(v);
    // عنوان سند: «پیش فاکتور» — و پس از اصلاح (نسخه ≥ ۱) «پیش فاکتور اصلاحی»
    const docTitle = proformaTitle({ revisionNo: data.revisionNo, proformaNumber: data.proformaNumber });
    const currentItems = opts?.items ?? data.items;
    const totalVal = opts?.totalText ?? formatPrice(data.totalAmount);
    // متن رسمی سپاس/امضا — از تنظیمات (company_signature) قابل تغییر است
    const officialSignature = resolveOfficialSignature(letterSettings);
    // بند گارانتی کلاً از خروجی حذف می‌شود (حتی اگر در دیتابیس مانده باشد)
    const safeTextAfter = stripWarrantyLines(data.textAfter);

    // ── پیش‌فاکتورهای «نامه ستاد» و «فروش»: قالب ساده‌شده ──
    // ستون «محل کالیبره» و «شرایط و ضوابط» (صفحه آخر) حذف می‌شود و مهر و امضا
    // و نام شرکت دقیقاً زیر آخرین مطلب (زیر جمع کل) می‌آید.
    const isSetad = isSimplifiedProforma(data.typeName);

    // ── تنظیمات قالب چاپ (قابل شخصی‌سازی از بخش تنظیمات) ──
    const primaryColor = letterSettings.print_primary_color || "#4f46e5";
    const headerBg = letterSettings.print_header_bg || "#f8fafc";
    const showTextBefore = letterSettings.print_show_text_before !== "0";
    const showTextAfter = letterSettings.print_show_text_after !== "0";
    const showSignature = letterSettings.print_show_signature !== "0";
    // «صفحه آخر» در نامه ستاد هرگز چاپ نمی‌شود
    const showLastPage = letterSettings.print_show_last_page !== "0" && !isSetad;
    const colQuantity = letterSettings.print_col_quantity !== "0";
    const colPoint = letterSettings.print_col_point !== "0";
    const colUnitPrice = letterSettings.print_col_unit_price !== "0";
    const colTotal = letterSettings.print_col_total !== "0";
    // ستون «محل کالیبره» در نامه ستاد حذف می‌شود
    const colCalib = letterSettings.print_col_calib !== "0" && !isSetad;

    const rows = currentItems.map((it, idx) => {
      const desc = buildItemDescription(it);
      const calibLoc = (it as unknown as { calibrationLocation?: string | null }).calibrationLocation || "-";
      return `<tr>
        <td>${pn(idx + 1)}</td>
        <td style="text-align:right;">${desc}</td>
        ${colQuantity ? `<td>${fmtQty(it.quantity)}</td>` : ""}
        ${colPoint ? `<td>${it.pointCount ? pn(it.pointCount) : "-"}</td>` : ""}
        ${colUnitPrice ? `<td>${formatPrice(it.unitPrice)}</td>` : ""}
        ${colTotal ? `<td>${formatPrice(it.totalPrice)}</td>` : ""}
        ${colCalib ? `<td>${calibLoc}</td>` : ""}
      </tr>`;
    }).join("");

    // ─── مقادیر ثابت مارجین (سانتی‌متر) ───
    const HEADER_MARGIN_CM = 3;  // 3 سانت از بالا برای هدر
    const FOOTER_MARGIN_CM = 5;  // 5 سانت از پایین برای فوتر

    // هدر و فوتر پیش‌فرض (اگر تصویر نباشد)
    const defaultHeaderHtml = `
      <div style="
        height: ${HEADER_MARGIN_CM}cm;
        background: linear-gradient(135deg, ${primaryColor} 0%, #8b5cf6 100%);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 30px;
        color: white;
      ">
        <div style="text-align: right;">
          <div style="font-size: 11px; opacity: 0.9;">شماره: ${ltrNumberHtml(data.proformaNumber)}</div>
        </div>
        <div style="text-align: left;">
          <div style="font-size: 12px;">تاریخ: ${pn(data.issueDate)}</div>
          <div style="font-size: 11px; opacity: 0.9;">اعتبار: ${pn(data.validityDays || 30)} روز</div>
        </div>
      </div>
    `;

    const defaultFooterHtml = `
      <div style="
        height: ${FOOTER_MARGIN_CM}cm;
        background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 15px 30px;
        border-top: 2px solid ${primaryColor};
      ">
        <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
          این پیش فاکتور توسط سیستم صدور پیش فاکتور تولید شده است
        </div>
        <div style="font-size: 10px; color: #94a3b8;">
          تلفن: ۰۲۱-۸۸۸۸۸۸۸۸ | فکس: ۰۲۱-۸۸۸۸۸۸۸۹
        </div>
        <div style="
          margin-top: 10px;
          padding: 5px 15px;
          background: ${primaryColor};
          color: white;
          border-radius: 20px;
          font-size: 10px;
        ">
          صفحه <span class="pageNumber"></span> از <span class="totalPages"></span>
        </div>
      </div>
    `;

    return `<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
${opts?.baseHref ? `<base href="${opts.baseHref}">` : ""}<title>${docTitle} ${pn(data.proformaNumber)}</title>
<link href="/fonts/vazirmatn.css" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{
    font-family:'Vazirmatn','Vazir',Tahoma,sans-serif;
    direction:rtl;font-size:12px;color:#222;line-height:1.8;
  }

  /* ═══════════════════════════════════════════════════
     ترفند جدول: مرورگر thead و tfoot رو خودش
     در هر صفحه چاپ تکرار می‌کنه.
     هدر/فوتر واقعی با position:fixed رسم می‌شن.
     thead/tfoot فقط فضای خالی رزرو می‌کنن.
     ═══════════════════════════════════════════════════ */
  @page { size:A4; margin:0; }

  /* ── هدر بصری: چسبیده بالای هر صفحه ── */
  .print-header-visual{
    position:fixed;
    top:0; left:0; right:0;
    height:${HEADER_MARGIN_CM}cm;
    z-index:1000;
  }
  .print-header-visual img{
    width:100%; height:auto;
    display:block;
  }

  /* ── فوتر بصری: چسبیده پایین هر صفحه، عکس از پایین پر می‌شه ── */
  .print-footer-visual{
    position:fixed;
    bottom:0; left:0; right:0;
    height:${FOOTER_MARGIN_CM}cm;
    z-index:1000;
    display:flex;
    flex-direction:column;
    justify-content:flex-end;
  }
  .print-footer-visual img{
    width:100%; height:auto;
    display:block;
  }

  /* ── جدول لایه‌ای: thead/tfoot فضا رزرو می‌کنن ── */
  .layout-table{
    width:100%;
    border-collapse:collapse;
    border:none !important;
  }
  .layout-table>thead>tr>td,
  .layout-table>tfoot>tr>td,
  .layout-table>tbody>tr>td{
    border:none !important;
    padding:0 !important;
  }
  /* فضای خالی هدر — مرورگر در هر صفحه تکرار می‌کنه */
  .header-spacer{ height:${HEADER_MARGIN_CM}cm; }
  /* فضای خالی فوتر — مرورگر در هر صفحه تکرار می‌کنه */
  .footer-spacer{ height:${FOOTER_MARGIN_CM}cm; }

  /* ── محتوا ── */
  .content{ padding:8px 25px; }

  /* ── استایل جدول داده‌ها ── */
  .data-table{width:100%;border-collapse:collapse;margin:10px 0;}
  .data-table th,.data-table td{border:1px solid #cbd5e1;padding:6px 8px;text-align:center;font-size:11px;}
  .data-table th{background:#f1f5f9;font-weight:700;font-size:10px;}

  .info-box{
    display:flex;justify-content:space-between;gap:20px;
    margin-bottom:12px;background:${headerBg};
    padding:12px 16px;border-radius:8px;border:1px solid #e2e8f0;
  }
  .info-box p{margin:3px 0;font-size:12px;}
  .accent{color:${primaryColor};}
  .accent-border{border-right:3px solid ${primaryColor};}
  .totals{max-width:360px;margin-right:auto;margin-top:6px;border:1px solid #cbd5e1;padding:12px;border-radius:8px;background:#fafafa;}
  .totals .row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;}
  .totals .grand{font-weight:900;border-top:2px solid #333;margin-top:6px;padding-top:6px;font-size:14px;color:${primaryColor};}
  .txt-block{white-space:pre-wrap;margin:8px 0;padding:10px;border-radius:6px;font-size:11px;line-height:1.9;}
  .badge{text-align:center;font-size:13px;font-weight:700;margin-bottom:10px;padding:5px;border-radius:6px;background:#dcfce7;color:#166534;border:1px solid #86efac;}

  /* ── بلوک مهر و امضا در انتهای سند ──
     متن سپاس («با سپاس فراوان — شرکت بهینه سنجش آزما (بهسا)») دقیقاً در خط
     بالای مهر و امضا قرار می‌گیرد و هر دو وسط‌چین‌اند. */
  .sign-block{
    display:flex;flex-direction:column;align-items:center;text-align:center;
    margin-top:1em; /* در همه انواع پیش‌فاکتور: دقیقاً یک خط پایین‌تر از آخرین نوشته */
    padding:0 6px;
    page-break-inside:avoid;break-inside:avoid;
  }
  /* متن امضا: جهت‌دار و وسط‌چین — پرانتزها و کاراکترهای خنثی
     (مانند «(بهسا)») هرگز در جهت مخالف رندر نمی‌شوند */
  .sign-text{white-space:pre-wrap;font-size:12.5px;font-weight:700;line-height:1.9;
    direction:rtl;unicode-bidi:isolate;text-align:center;margin-bottom:2px;}
  /* مهر و امضا — دقیقاً با «اندازه اصلیِ واقعیِ فایل» (ابعاد ذاتی تصویر) نمایش
     داده می‌شود و هیچ تغییر ابعادی اعمال نمی‌شود؛ اندازه در چاپ و خروجی PDF
     با اندازه واقعی فایل یکسان است. max-width فقط نگه‌دارنده‌ای برای جلوگیری از
     بیرون‌زدگی از صفحه در تصاویر غیرمعمولِ بزرگ است و در اندازه‌های معمول
     هیچ اثری روی اندازه ندارد. */
  .stamp-img{width:auto;height:auto;max-width:100%;display:block;margin:0 auto;}

  .no-print{display:none;}
  @media print{
    .no-print{display:none !important;}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
</style></head><body>

<!-- ══ هدر بصری (position:fixed → روی هر صفحه رسم می‌شه) ══ -->
<div class="print-header-visual">
  ${headerImg
    ? `<img src="${headerImg}" alt="header" />`
    : defaultHeaderHtml}
</div>

<!-- ══ فوتر بصری (position:fixed → روی هر صفحه رسم می‌شه) ══ -->
<div class="print-footer-visual">
  ${footerImg
    ? `<img src="${footerImg}" alt="footer" />`
    : defaultFooterHtml}
</div>

<!-- ══ جدول لایه‌ای: thead/tfoot فضا رزرو می‌کنن ══ -->
<table class="layout-table">
  <thead><tr><td><div class="header-spacer"></div></td></tr></thead>
  <tfoot><tr><td><div class="footer-spacer"></div></td></tr></tfoot>
  <tbody><tr><td>

    <!-- ─── محتوای اصلی ─── -->
    <div class="content">

    <div class="info-box">
      <div>
        <p><strong>شرکت:</strong> ${data.companyName || ""}</p>
        <p><strong>تاریخ:</strong> ${pn(data.issueDate)}</p>
        <p><strong>اعتبار:</strong> ${pn(data.validityDays || 30)} روز</p>
        <p><strong>تلفن:</strong> ${pn(data.letterPhone || data.companyPhone || "-")}</p>
        <p><strong>فکس:</strong> ${pn(data.letterFax || data.companyFax || "-")}</p>
      </div>
      <!-- عنوان «پیش فاکتور» — وسط باکس اطلاعات، بین نام شرکت و شماره -->
      <div style="display:flex; align-items:center; justify-content:center; padding: 0 14px;">
        <span style="font-size: 22px; font-weight: 900; color: ${primaryColor}; letter-spacing: 2px; white-space: nowrap;">${docTitle}</span>
      </div>
      <div>
        <p><strong>شماره:</strong> ${ltrNumberHtml(data.proformaNumber)}</p>
        <p><strong>نوع:</strong> ${data.typeName || ""}</p>
        <p><strong>نوع ارتباط:</strong> ${data.communicationMethod ? `${pn(data.communicationMethod)}${data.communicationId ? ` (شناسه: ${pn(data.communicationId)})` : ""}` : "-"}</p>
        <p><strong>ایمیل:</strong> ${data.companyEmail ? `<span dir="ltr">${pn(data.companyEmail)}</span>` : "-"}</p>
      </div>
    </div>

    ${showTextBefore && data.textBefore ? `<div class="txt-block accent-border" style="background:#f0f4ff;">${pn(data.textBefore)}</div>` : ""}

    <table class="data-table">
      <thead>
        <tr>
          <th>ردیف</th>
          <th>شرح</th>
          ${colQuantity ? "<th>تعداد</th>" : ""}
          ${colPoint ? "<th>نقطه</th>" : ""}
          ${colUnitPrice ? "<th>قیمت واحد</th>" : ""}
          ${colTotal ? "<th>مبلغ کل</th>" : ""}
          ${colCalib ? "<th>محل کالیبره</th>" : ""}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    ${data.showTotal ? `
    <div class="totals">
      <div class="row"><span>جمع اقلام:</span><span>${formatPrice(data.subtotal)} ریال</span></div>
      ${parseFloat(data.discountAmount) > 0 ? `<div class="row" style="color:#dc2626;"><span>تخفیف${percentSuffix(data.discountPercent)}:</span><span>-${formatPrice(data.discountAmount)}</span></div>` : ""}
      ${parseFloat(data.insuranceAmount) > 0 ? `<div class="row" style="color:#ea580c;"><span>بیمه${percentSuffix(data.insurancePercent)}:</span><span>-${formatPrice(data.insuranceAmount)}</span></div>` : ""}
      ${parseFloat(data.travelCost) > 0 ? `<div class="row"><span>ایاب و ذهاب:</span><span>${formatPrice(data.travelCost)}</span></div>` : ""}
      ${parseFloat(data.transportCost) > 0 ? `<div class="row"><span>هزینه سفر:</span><span>${formatPrice(data.transportCost)}</span></div>` : ""}
      ${parseFloat(data.taxAmount) > 0 ? `<div class="row" style="color:#2563eb;"><span>ارزش افزوده${percentSuffix(data.taxPercent)}:</span><span>${formatPrice(data.taxAmount)}</span></div>` : ""}
      <div class="row grand"><span>جمع کل:</span><span>${totalVal} ریال</span></div>
    </div>
    ` : ""}

    ${showTextAfter && safeTextAfter ? `<div class="txt-block" style="background:#fffbeb;border:1px solid #fde68a;">${pn(safeTextAfter)}</div>` : ""}

    ${showLastPage && data.textLastPage ? `
    <div style="page-break-before:always;padding-top:10px;">
      <h3 style="color:${primaryColor};margin-bottom:10px;font-size:16px;">شرایط و ضوابط</h3>
      <div class="txt-block" style="background:#f0fdf4;border:1px solid #bbf7d0;">${pn(data.textLastPage)}</div>
    </div>
    ` : ""}

    <!-- ══ مهر و امضا — همیشه در «آخرین صفحه» سند، در تمامی حالات ══
         اگر «ته‌برگ / صفحه آخر» وجود داشته باشد، مهر در همان صفحه آخر و زیر
         متن شرایط عمومی می‌آید؛ در غیر این‌صورت بلافاصله زیر آخرین مطلب سند
         قرار می‌گیرد. در هر دو حالت مهر هرگز در صفحه‌ای قبل از صفحه آخر نیست.
         متن سپاس دقیقاً در خط بالای «مهر و امضا» قرار می‌گیرد (وسط‌چین) و متن
         رسمی از تنظیمات (company_signature) خوانده می‌شود. -->
    ${(stampImg || showSignature) ? `
    <div class="sign-block" dir="rtl">
      ${showSignature ? `<div class="sign-text" dir="rtl">${pn(normalizeSignatureText(data.signatureText, officialSignature))}</div>` : ""}
      ${stampImg ? `<img src="${stampImg}" alt="stamp" class="stamp-img" />` : ""}
    </div>
    ` : ""}

    </div><!-- /content -->

  </td></tr></tbody>
</table>

<div class="no-print" style="text-align:center;margin:20px;">
  <button onclick="window.print()" style="padding:10px 28px;background:${primaryColor};color:white;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:bold;font-family:Vazirmatn,Tahoma;">🖨️ چاپ</button>
</div>

</body></html>`;
}

/** باز کردن پنجره چاپ با HTML ساخته‌شده */
export function openProformaPrintWindow(
  data: PrintProformaData,
  letterSettings: Record<string, string>,
  opts?: PrintBuildOptions
) {
  const html = buildProformaPrintHtml(data, letterSettings, opts);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

/** دانلود HTML خروجی به صورت فایل — دقیقاً همان خروجی چاپ */
export function downloadProformaHtml(
  data: PrintProformaData,
  letterSettings: Record<string, string>,
  opts?: PrintBuildOptions
) {
  const html = buildProformaPrintHtml(data, letterSettings, opts);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const safeNumber = (data.proformaNumber || "output").replace(/[\/\\]/g, "-");
  const a = document.createElement("a");
  a.href = url;
  a.download = `PF-${safeNumber}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}


