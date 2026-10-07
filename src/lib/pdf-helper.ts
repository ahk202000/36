import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { promises as fs } from 'fs';
import path from 'path';
import { percentSuffix } from '@/lib/utils';

// Load Vazirmatn font as base64
let vazirRegularBase64: string | null = null;
let vazirBoldBase64: string | null = null;

async function loadFonts() {
  if (vazirRegularBase64 && vazirBoldBase64) return;

  const regPath = path.join(process.cwd(), 'src', 'lib', 'fonts', 'Vazirmatn-Regular.ttf');
  const boldPath = path.join(process.cwd(), 'src', 'lib', 'fonts', 'Vazirmatn-Bold.ttf');

  try {
    const [regBuf, boldBuf] = await Promise.all([
      fs.readFile(regPath),
      fs.readFile(boldPath),
    ]);
    vazirRegularBase64 = regBuf.toString('base64');
    vazirBoldBase64 = boldBuf.toString('base64');
  } catch (err) {
    console.error('Failed to load fonts:', err);
    throw new Error('فونت فارسی یافت نشد');
  }
}

function setPersianFont(doc: jsPDF, bold: boolean = false) {
  doc.setFont('Vazirmatn', bold ? 'bold' : 'normal');
}

// ─── ثابت‌های مارجین (سانتی‌متر → میلی‌متر) ───
const HEADER_MARGIN_CM = 3;  // 3 سانت از بالا
const FOOTER_MARGIN_CM = 5;  // 5 سانت از پایین
const HEADER_MARGIN_MM = HEADER_MARGIN_CM * 10;  // 30mm
const FOOTER_MARGIN_MM = FOOTER_MARGIN_CM * 10;  // 50mm
const PAGE_HEIGHT_MM = 297;  // A4 height
const PAGE_WIDTH_MM = 210;   // A4 width
const CONTENT_START_Y = HEADER_MARGIN_MM + 5;    // شروع محتوا بعد از هدر
const CONTENT_END_Y = PAGE_HEIGHT_MM - FOOTER_MARGIN_MM - 5;  // پایان محتوا قبل از فوتر
const SIDE_MARGIN = 15;

export interface ProformaPDFData {
  proformaNumber: string;
  issueDate: string;
  validityDays?: number;
  companyName: string;
  companyPhone?: string;
  companyAddress?: string;
  typeName: string;
  textBefore?: string;
  textAfter?: string;
  textLastPage?: string;
  signatureText?: string;
  showTotal: boolean;
  items: Array<{
    description: string;
    equipmentName?: string;
    paramName?: string;
    pointCount?: number | null;
    quantity: string | number;
    unitPrice: string | number;
    totalPrice: string | number;
    calibrationLocation?: string;
  }>;
  subtotal: string;
  discountPercent?: string;
  discountAmount?: string;
  taxPercent?: string;
  taxAmount?: string;
  insurancePercent?: string;
  insuranceAmount?: string;
  travelCost?: string;
  transportCost?: string;
  totalAmount: string;
  // تنظیمات هدر و فوتر
  headerImage?: string;  // base64 یا path
  footerImage?: string;  // base64 یا path
  stampImage?: string;   // مهر
  primaryColor?: string;
}

// تابع کمکی برای خواندن تصویر و تبدیل به base64
async function loadImageAsBase64(imagePath: string): Promise<string | null> {
  if (!imagePath) return null;
  if (imagePath.startsWith('data:')) return imagePath; // already base64
  
  try {
    // اگر URL است
    if (imagePath.startsWith('http')) {
      return imagePath;
    }
    
    // اگر مسیر فایل محلی است
    const fullPath = imagePath.startsWith('/') 
      ? path.join(process.cwd(), 'public', imagePath)
      : path.join(process.cwd(), imagePath);
    
    const buffer = await fs.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase().replace('.', '');
    const mimeType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

// رسم هدر در تمام صفحات — تصویر با سایز اصلی (فقط عرض صفحه، ارتفاع متناسب)
function drawHeader(doc: jsPDF, headerImage: string | null, pageNum: number, totalPages: number, proformaNumber: string, primaryColor: string) {
  const headerHeight = HEADER_MARGIN_MM;
  
  if (headerImage) {
    try {
      // ارتفاع متناسب: عرض صفحه × (ارتفاع واقعی / عرض واقعی)
      const props = doc.getImageProperties(headerImage);
      const imgH = (PAGE_WIDTH_MM * props.height) / props.width;
      doc.addImage(headerImage, 'PNG', 0, 0, PAGE_WIDTH_MM, imgH);
    } catch {
      drawDefaultHeader(doc, headerHeight, proformaNumber, primaryColor);
    }
  } else {
    drawDefaultHeader(doc, headerHeight, proformaNumber, primaryColor);
  }
}

// هدر پیش‌فرض (بدون تصویر)
function drawDefaultHeader(doc: jsPDF, headerHeight: number, proformaNumber: string, primaryColor: string) {
  // پس‌زمینه هدر
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, PAGE_WIDTH_MM, headerHeight, 'F');
  
  // خط پایین هدر
  const rgb = hexToRgb(primaryColor);
  doc.setDrawColor(rgb.r, rgb.g, rgb.b);
  doc.setLineWidth(0.5);
  doc.line(0, headerHeight, PAGE_WIDTH_MM, headerHeight);
  
  // عنوان
  setPersianFont(doc, true);
  doc.setFontSize(16);
  doc.setTextColor(rgb.r, rgb.g, rgb.b);
  doc.text('پیش فاکتور', PAGE_WIDTH_MM / 2, headerHeight / 2 + 2, { align: 'center' });
  
  // شماره پیش فاکتور
  setPersianFont(doc, false);
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`شماره: ${proformaNumber}`, PAGE_WIDTH_MM - SIDE_MARGIN, headerHeight - 5, { align: 'right' });
}

// رسم فوتر در تمام صفحات — تصویر با سایز اصلی (فقط عرض صفحه، ارتفاع متناسب)
function drawFooter(doc: jsPDF, footerImage: string | null, pageNum: number, totalPages: number, primaryColor: string) {
  const footerY = PAGE_HEIGHT_MM - FOOTER_MARGIN_MM;
  const footerHeight = FOOTER_MARGIN_MM;
  
  if (footerImage) {
    try {
      // ارتفاع متناسب: عرض صفحه × (ارتفاع واقعی / عرض واقعی)
      const props = doc.getImageProperties(footerImage);
      const imgH = (PAGE_WIDTH_MM * props.height) / props.width;
      // تصویر از پایین صفحه به بالا می‌چسبه
      const imgY = PAGE_HEIGHT_MM - imgH;
      doc.addImage(footerImage, 'PNG', 0, imgY, PAGE_WIDTH_MM, imgH);
    } catch {
      drawDefaultFooter(doc, footerY, footerHeight, pageNum, totalPages, primaryColor);
    }
  } else {
    drawDefaultFooter(doc, footerY, footerHeight, pageNum, totalPages, primaryColor);
  }
}

// فوتر پیش‌فرض (بدون تصویر)
function drawDefaultFooter(doc: jsPDF, footerY: number, footerHeight: number, pageNum: number, totalPages: number, primaryColor: string) {
  // پس‌زمینه فوتر
  doc.setFillColor(248, 250, 252);
  doc.rect(0, footerY, PAGE_WIDTH_MM, footerHeight, 'F');
  
  // خط بالای فوتر
  const rgb = hexToRgb(primaryColor);
  doc.setDrawColor(rgb.r, rgb.g, rgb.b);
  doc.setLineWidth(0.5);
  doc.line(0, footerY, PAGE_WIDTH_MM, footerY);
  
  // شماره صفحه
  setPersianFont(doc, false);
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`صفحه ${toPersianDigits(pageNum)} از ${toPersianDigits(totalPages)}`, PAGE_WIDTH_MM / 2, footerY + 10, { align: 'center' });
  
  // متن زیرنویس
  doc.setFontSize(8);
  doc.text('این پیش فاکتور توسط سیستم صدور پیش فاکتور تولید شده است', PAGE_WIDTH_MM / 2, footerY + 20, { align: 'center' });
  
  // اطلاعات تماس (اختیاری)
  doc.setFontSize(7);
  doc.setTextColor(130, 130, 130);
  doc.text('تلفن: ۰۲۱-۸۸۸۸۸۸۸۸ | فکس: ۰۲۱-۸۸۸۸۸۸۸۹', PAGE_WIDTH_MM / 2, footerY + 30, { align: 'center' });
}

// تبدیل HEX به RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 79, g: 70, b: 229 }; // default indigo
}

// تبدیل به اعداد فارسی
function toPersianDigits(num: number | string): string {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(num).replace(/[0-9]/g, (d) => persianDigits[parseInt(d)]);
}

export async function generateProformaPDF(data: ProformaPDFData, savePath?: string): Promise<string> {
  await loadFonts();

  // بارگذاری تصاویر
  const headerImage = await loadImageAsBase64(data.headerImage || '');
  const footerImage = await loadImageAsBase64(data.footerImage || '');
  const stampImage = await loadImageAsBase64(data.stampImage || '');
  const primaryColor = data.primaryColor || '#4f46e5';

  // Create doc with RTL support
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Add fonts
  if (vazirRegularBase64) {
    doc.addFileToVFS('Vazirmatn-Regular.ttf', vazirRegularBase64);
    doc.addFont('Vazirmatn-Regular.ttf', 'Vazirmatn', 'normal');
  }
  if (vazirBoldBase64) {
    doc.addFileToVFS('Vazirmatn-Bold.ttf', vazirBoldBase64);
    doc.addFont('Vazirmatn-Bold.ttf', 'Vazirmatn', 'bold');
  }

  // ─── محاسبه تعداد صفحات (تقریبی) ───
  let estimatedPages = 1;
  if (data.items.length > 15) estimatedPages = 2;
  if (data.items.length > 35) estimatedPages = 3;
  if (data.textLastPage) estimatedPages += 1;

  // ─── صفحه اول ───
  let currentPage = 1;
  
  // رسم هدر و فوتر صفحه اول
  drawHeader(doc, headerImage, currentPage, estimatedPages, data.proformaNumber, primaryColor);
  drawFooter(doc, footerImage, currentPage, estimatedPages, primaryColor);

  // ── شروع محتوا ──
  let yPos = CONTENT_START_Y;
  
  // ── اطلاعات پیش‌فاکتور ──
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(SIDE_MARGIN, yPos, PAGE_WIDTH_MM - 2 * SIDE_MARGIN, 28, 3, 3, 'F');
  
  setPersianFont(doc, true);
  doc.setFontSize(10);
  doc.setTextColor(51, 51, 51);
  
  yPos += 8;
  doc.text(`شماره پیش فاکتور: ${data.proformaNumber}`, PAGE_WIDTH_MM - SIDE_MARGIN - 5, yPos, { align: 'right' });
  doc.text(`تاریخ: ${data.issueDate}`, SIDE_MARGIN + 5, yPos, { align: 'left' });
  
  yPos += 7;
  doc.text(`مشتری: ${data.companyName || '-'}`, PAGE_WIDTH_MM - SIDE_MARGIN - 5, yPos, { align: 'right' });
  doc.text(`نوع: ${data.typeName}`, SIDE_MARGIN + 5, yPos, { align: 'left' });
  
  yPos += 7;
  if (data.companyPhone) {
    doc.text(`تلفن: ${data.companyPhone}`, PAGE_WIDTH_MM - SIDE_MARGIN - 5, yPos, { align: 'right' });
  }
  doc.text(`اعتبار: ${data.validityDays || 30} روز`, SIDE_MARGIN + 5, yPos, { align: 'left' });
  
  yPos += 10;

  // ── Text before items ──
  if (data.textBefore) {
    setPersianFont(doc, false);
    doc.setFontSize(9);
    doc.setTextColor(51, 51, 51);
    
    // باکس رنگی
    const lines = doc.splitTextToSize(data.textBefore, PAGE_WIDTH_MM - 2 * SIDE_MARGIN - 10);
    const boxHeight = lines.length * 5 + 8;
    
    doc.setFillColor(240, 244, 255);
    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(0.3);
    doc.roundedRect(SIDE_MARGIN, yPos, PAGE_WIDTH_MM - 2 * SIDE_MARGIN, boxHeight, 2, 2, 'FD');
    
    doc.text(lines, PAGE_WIDTH_MM - SIDE_MARGIN - 5, yPos + 5, { align: 'right' });
    yPos += boxHeight + 5;
  }

  // ── Items Table ──
  const tableData = data.items.map((item, idx) => {
    const desc = item.paramName
      ? `${item.description || item.equipmentName || ''} - ${item.paramName}`
      : (item.description || item.equipmentName || '');
    const point = item.pointCount ? ` (${item.pointCount} نقطه)` : '';
    return [
      (idx + 1).toString(),
      desc + point,
      item.quantity.toString(),
      formatNumber(item.unitPrice),
      formatNumber(item.totalPrice),
    ];
  });

  // محاسبه فضای قابل استفاده برای جدول
  const availableHeight = CONTENT_END_Y - yPos - 50; // 50mm برای جمع‌ها و امضا

  autoTable(doc, {
    startY: yPos,
    head: [['ردیف', 'شرح / تجهیز', 'تعداد', 'قیمت واحد (ریال)', 'قیمت کل (ریال)']],
    body: tableData,
    theme: 'grid',
    styles: {
      font: 'Vazirmatn',
      fontSize: 9,
      halign: 'center',
      cellPadding: 3,
    },
    headStyles: {
      font: 'Vazirmatn',
      fontStyle: 'bold',
      fillColor: [99, 102, 241],
      textColor: [255, 255, 255],
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 80, halign: 'right' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 40, halign: 'left' },
      4: { cellWidth: 40, halign: 'left' },
    },
    margin: { right: SIDE_MARGIN, left: SIDE_MARGIN, top: CONTENT_START_Y, bottom: FOOTER_MARGIN_MM + 10 },
    // وقتی صفحه جدید ایجاد می‌شود
    didDrawPage: function(hookData) {
      const pageNumber = hookData.pageNumber;
      // رسم هدر و فوتر برای صفحات جدید
      if (pageNumber > 1) {
        drawHeader(doc, headerImage, pageNumber, estimatedPages, data.proformaNumber, primaryColor);
        drawFooter(doc, footerImage, pageNumber, estimatedPages, primaryColor);
      }
    },
    // تنظیم شروع محتوا در صفحات جدید
    showHead: 'everyPage',
    pageBreak: 'auto',
  });

  // ── Totals ──
  // @ts-ignore - autoTable adds finalY
  let finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || yPos + 20;
  
  // بررسی اینکه آیا فضای کافی برای جمع‌ها هست
  if (finalY + 60 > CONTENT_END_Y) {
    doc.addPage();
    currentPage++;
    drawHeader(doc, headerImage, currentPage, estimatedPages, data.proformaNumber, primaryColor);
    drawFooter(doc, footerImage, currentPage, estimatedPages, primaryColor);
    finalY = CONTENT_START_Y;
  }
  
  finalY += 8;

  // باکس جمع‌ها
  const totalsBoxX = PAGE_WIDTH_MM - SIDE_MARGIN - 90;
  const totalsBoxWidth = 85;
  let totalsHeight = 45;
  if (parseFloat(data.discountAmount || '0') > 0) totalsHeight += 7;
  if (parseFloat(data.taxAmount || '0') > 0) totalsHeight += 7;
  if (parseFloat(data.insuranceAmount || '0') > 0) totalsHeight += 7;
  if (parseFloat(data.travelCost || '0') > 0) totalsHeight += 7;
  if (parseFloat(data.transportCost || '0') > 0) totalsHeight += 7;
  
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(totalsBoxX, finalY, totalsBoxWidth, totalsHeight, 3, 3, 'FD');

  const totalsX = PAGE_WIDTH_MM - SIDE_MARGIN - 8;
  const totalsValueX = totalsBoxX + 5;
  const lineHeight = 7;
  let totalsY = finalY + 8;

  setPersianFont(doc, false);
  doc.setFontSize(10);
  doc.setTextColor(51, 51, 51);

  if (data.showTotal) {
    doc.text('جمع اقلام:', totalsX, totalsY, { align: 'right' });
    doc.text(formatNumber(data.subtotal) + ' ریال', totalsValueX, totalsY, { align: 'left' });
    totalsY += lineHeight;
  }

  if (data.discountAmount && parseFloat(data.discountAmount) > 0) {
    doc.setTextColor(220, 38, 38);
    doc.text(`تخفیف${percentSuffix(data.discountPercent)}:`, totalsX, totalsY, { align: 'right' });
    doc.text('-' + formatNumber(data.discountAmount) + ' ریال', totalsValueX, totalsY, { align: 'left' });
    totalsY += lineHeight;
    doc.setTextColor(51, 51, 51);
  }

  if (data.insuranceAmount && parseFloat(data.insuranceAmount) > 0) {
    doc.setTextColor(234, 88, 12);
    doc.text(`بیمه${percentSuffix(data.insurancePercent)}:`, totalsX, totalsY, { align: 'right' });
    doc.text('-' + formatNumber(data.insuranceAmount) + ' ریال', totalsValueX, totalsY, { align: 'left' });
    totalsY += lineHeight;
    doc.setTextColor(51, 51, 51);
  }

  if (data.travelCost && parseFloat(data.travelCost) > 0) {
    doc.text('ایاب و ذهاب:', totalsX, totalsY, { align: 'right' });
    doc.text(formatNumber(data.travelCost) + ' ریال', totalsValueX, totalsY, { align: 'left' });
    totalsY += lineHeight;
  }

  if (data.transportCost && parseFloat(data.transportCost) > 0) {
    doc.text('هزینه سفر:', totalsX, totalsY, { align: 'right' });
    doc.text(formatNumber(data.transportCost) + ' ریال', totalsValueX, totalsY, { align: 'left' });
    totalsY += lineHeight;
  }

  if (data.taxAmount && parseFloat(data.taxAmount) > 0) {
    doc.setTextColor(37, 99, 235);
    doc.text(`ارزش افزوده${percentSuffix(data.taxPercent)}:`, totalsX, totalsY, { align: 'right' });
    doc.text(formatNumber(data.taxAmount) + ' ریال', totalsValueX, totalsY, { align: 'left' });
    totalsY += lineHeight;
    doc.setTextColor(51, 51, 51);
  }

  if (data.showTotal) {
    // خط جداکننده
    doc.setDrawColor(51, 51, 51);
    doc.setLineWidth(0.5);
    doc.line(totalsBoxX + 3, totalsY, totalsBoxX + totalsBoxWidth - 3, totalsY);
    totalsY += 5;
    
    setPersianFont(doc, true);
    doc.setFontSize(12);
    const rgb = hexToRgb(primaryColor);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text('جمع کل:', totalsX, totalsY, { align: 'right' });
    doc.text(formatNumber(data.totalAmount) + ' ریال', totalsValueX, totalsY, { align: 'left' });
  }

  finalY += totalsHeight + 5;

  // ── Text after items ──
  if (data.textAfter) {
    if (finalY + 30 > CONTENT_END_Y) {
      doc.addPage();
      currentPage++;
      drawHeader(doc, headerImage, currentPage, estimatedPages, data.proformaNumber, primaryColor);
      drawFooter(doc, footerImage, currentPage, estimatedPages, primaryColor);
      finalY = CONTENT_START_Y;
    }
    
    setPersianFont(doc, false);
    doc.setFontSize(9);
    doc.setTextColor(51, 51, 51);
    
    const lines = doc.splitTextToSize(data.textAfter, PAGE_WIDTH_MM - 2 * SIDE_MARGIN - 10);
    const boxHeight = lines.length * 5 + 8;
    
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
    doc.roundedRect(SIDE_MARGIN, finalY, PAGE_WIDTH_MM - 2 * SIDE_MARGIN, boxHeight, 2, 2, 'FD');
    
    doc.text(lines, PAGE_WIDTH_MM - SIDE_MARGIN - 5, finalY + 5, { align: 'right' });
    finalY += boxHeight + 5;
  }

  // ── مهر و امضا — با «اندازه اصلیِ واقعیِ فایل» (تبدیل پیکسل به میلی‌متر با
  //    همان استاندارد مرورگر: ۹۶ پیکسل بر اینچ) و بدون هیچ تغییر ابعادی ──
  if (stampImage || data.signatureText) {
    if (finalY + 25 > CONTENT_END_Y) {
      doc.addPage();
      currentPage++;
      drawHeader(doc, headerImage, currentPage, estimatedPages, data.proformaNumber, primaryColor);
      drawFooter(doc, footerImage, currentPage, estimatedPages, primaryColor);
      finalY = CONTENT_START_Y;
    }

    // مهر
    if (stampImage) {
      try {
        const props = doc.getImageProperties(stampImage);
        const PX_TO_MM = 25.4 / 96; // هر پیکسل CSS در چاپ دقیقاً ۱/۹۶ اینچ است
        let stampW = props.width * PX_TO_MM;
        let stampH = props.height * PX_TO_MM;
        // نگه‌دارنده: فقط اگر تصویر از عرض قابل چاپ بزرگ‌تر بود، متناسب کوچک شود
        const maxW = PAGE_WIDTH_MM - SIDE_MARGIN * 2;
        if (stampW > maxW) {
          stampH = (stampH * maxW) / stampW;
          stampW = maxW;
        }
        doc.addImage(stampImage, 'PNG', (PAGE_WIDTH_MM - stampW) / 2, finalY, stampW, stampH);
      } catch {}
    }
    
    // امضا
    if (data.signatureText) {
      setPersianFont(doc, false);
      doc.setFontSize(9);
      doc.setTextColor(51, 51, 51);
      const lines = doc.splitTextToSize(data.signatureText, 80);
      doc.text(lines, SIDE_MARGIN + 60, finalY + 10, { align: 'left' });
    }
  }

  // ── Last page text on a new page ──
  if (data.textLastPage) {
    doc.addPage();
    currentPage++;
    drawHeader(doc, headerImage, currentPage, estimatedPages, data.proformaNumber, primaryColor);
    drawFooter(doc, footerImage, currentPage, estimatedPages, primaryColor);
    
    let lpY = CONTENT_START_Y;
    
    // عنوان
    setPersianFont(doc, true);
    doc.setFontSize(14);
    const rgb = hexToRgb(primaryColor);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text('شرایط و ضوابط', PAGE_WIDTH_MM / 2, lpY, { align: 'center' });
    lpY += 10;
    
    // متن
    setPersianFont(doc, false);
    doc.setFontSize(9);
    doc.setTextColor(51, 51, 51);
    
    const lines = doc.splitTextToSize(data.textLastPage, PAGE_WIDTH_MM - 2 * SIDE_MARGIN - 10);
    const boxHeight = Math.min(lines.length * 5 + 10, CONTENT_END_Y - lpY - 10);
    
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(SIDE_MARGIN, lpY, PAGE_WIDTH_MM - 2 * SIDE_MARGIN, boxHeight, 2, 2, 'FD');
    
    doc.text(lines, PAGE_WIDTH_MM - SIDE_MARGIN - 5, lpY + 6, { align: 'right' });
  }

  // ── بروزرسانی شماره صفحات واقعی ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // فوتر را با شماره صفحه صحیح دوباره رسم کن
    drawFooter(doc, footerImage, i, totalPages, primaryColor);
  }

  // ── Save file ──
  if (savePath) {
    await fs.mkdir(path.dirname(savePath), { recursive: true });
    const buffer = doc.output('arraybuffer');
    await fs.writeFile(savePath, Buffer.from(buffer));
  }

  return doc.output('datauristring');
}

function formatNumber(num: string | number): string {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n) || n === 0) return '۰';
  return Math.floor(n).toLocaleString('fa-IR');
}

export async function buildSavePath(proformaNumber: string): Promise<string> {
  const jalaali = require('jalaali-js');
  const now = new Date();
  const j = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());

  // مسیر: uploads/proformas/سال/ماه/روز/شماره_پیش_فاکتور.pdf
  const safeName = proformaNumber.replace(/[\/\\:*?"<>|]/g, '-');
  const dir = path.join(process.cwd(), 'public', 'uploads', 'proformas',
    j.jy.toString(),
    j.jm.toString().padStart(2, '0'),
    j.jd.toString().padStart(2, '0')
  );
  return path.join(dir, `${safeName}.pdf`);
}
