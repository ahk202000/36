"use client";
import { Fragment, useState, useEffect } from "react";
import type { UserInfo } from "@/app/page";
import { formatPrice, toPersianDigits, percentSuffix, formatPercentValue } from "@/lib/utils";
import { getPermissions, isOperationalUser } from "@/lib/permissions";
import { openProformaPrintWindow, buildItemDescription } from "@/lib/print-proforma";
import { proformaTitle, isRevisedProforma } from "@/lib/proforma-number";
import { isSimplifiedProforma } from "@/lib/proforma-type";
import {
  normalizeSignatureText,
  resolveOfficialSignature,
  stripWarrantyLines,
} from "@/lib/signature-text";
import {
  computeProformaTotals,
  isZeroAmount,
  zeroAmountMessage,
  findZeroAmountRows,
  zeroRowsMessage,
  toNum,
  type ProformaTotals,
} from "@/lib/proforma-calc";
import DocNo from "@/components/DocNo";

interface ProformaDetail {
  id: number;
  proformaNumber: string;
  revisionNo?: number | null;
  baseNumber?: string | null;
  letterSeq?: number | null;
  typeName: string | null;
  companyName: string | null;
  companyId: number | null;
  letterId: number | null;
  companyPhone?: string | null;
  companyFax?: string | null;
  companyEmail?: string | null;
  communicationMethod?: string | null;
  communicationId?: string | null;
  letterPhone?: string | null;
  letterFax?: string | null;
  letterContactPerson?: string | null;
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
  status: string;
  proformaDescription: string | null;
  managerComment: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  approvedByName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  items: Array<{
    id: number;
    equipmentId: number | null;
    description: string;
    equipmentName: string | null;
    quantity: string;
    unitPrice: string;
    pointCount: number | null;
    totalPrice: string;
    isSelected: boolean;
    multiplierPercent?: string | null;
    paramValues?: Record<string, unknown> | null;
    calibrationLocation?: string | null;
  }>;
}

interface PriceHistoryItem {
  id: number;
  unitPrice: string;
  pointCount: number | null;
  quantity: string;
  priceDate: string;
  proformaNumber: string | null;
}

interface Props {
  user: UserInfo;
  proformaId: number;
  onBack: () => void;
  onEdit: (id: number) => void;
}

const statusLabels: Record<string, string> = {
  correction_send: "اصلاح و ارسال",
  sent: "ارسال شده به مشتری",
  ready_to_send: "آماده ارسال",
  draft: "پیش‌نویس",
  pending: "در انتظار تایید",
  approved: "تایید شده",
  rejected: "رد شده",
  revised: "نیاز به اصلاح",
  final_sale: "فروش قطعی",
};

export default function ProformaView({ user, proformaId, onBack, onEdit }: Props) {
  const [data, setData] = useState<ProformaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState(false);
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [editedItems, setEditedItems] = useState<ProformaDetail["items"]>([]);
  const [editedTravel, setEditedTravel] = useState("0");
  const [editedTransport, setEditedTransport] = useState("0");
  const [editedDiscount, setEditedDiscount] = useState("0");
  const [editedTax, setEditedTax] = useState("10");
  const [editedInsurance, setEditedInsurance] = useState("0");
  const [editEnableTax, setEditEnableTax] = useState(true);
  const [editEnableInsurance, setEditEnableInsurance] = useState(false);
  const [editEnableTravel, setEditEnableTravel] = useState(false);
  const [editEnableTransport, setEditEnableTransport] = useState(false);
  const [editEnableDiscount, setEditEnableDiscount] = useState(false);
  const [priceHistories, setPriceHistories] = useState<Record<number, PriceHistoryItem[]>>({});
  const [showHistoryFor, setShowHistoryFor] = useState<number | null>(null);
  // مبنای قیمت‌گذاری هر قلم — برای نمای مدیریتی
  const [priceBasis, setPriceBasis] = useState<Record<number, {
    itemId: number;
    source: "history" | "catalog" | "manual_over_catalog" | "manual";
    label: string;
    referenceNumber: string | null;
    referenceDate: string | null;
    referencePrice: string | null;
    currentPrice: string;
    diff: string | null;
    diffPercent: number | null;
    isSame: boolean;
  }>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [equipmentList, setEquipmentList] = useState<Array<{ id: number; pricePerPoint: boolean }>>([]);
  const [viewContracts, setViewContracts] = useState<Array<{
    id: number; contractNumber: string; title: string | null;
    startDate: string; endDate: string; filePath: string | null; fileName: string | null;
  }>>([]);
  // تنظیمات سربرگ و ته‌برگ
  const [letterSettings, setLetterSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/equipment").then((r) => r.json()).then((list) => setEquipmentList(list.map((e: { id: number; pricePerPoint: boolean }) => ({ id: e.id, pricePerPoint: e.pricePerPoint })))).catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((rows: Array<{ settingKey: string; settingValue: string }>) => {
        const map: Record<string, string> = {};
        for (const row of rows) map[row.settingKey] = row.settingValue;
        setLetterSettings(map);
      })
      .catch(() => {});
  }, []);

  // مطلق کردن مسیر تصاویر برای لود صحیح در پنجره چاپ
  const absUrl = (p: string) => {
    if (!p) return "";
    if (p.startsWith("http")) return p;
    return typeof window !== "undefined" && window.location?.origin ? window.location.origin + p : p;
  };
  const headerImg = absUrl(letterSettings.header_image || "");
  const footerImg = absUrl(letterSettings.footer_image || "");
  const stampImg = absUrl(letterSettings.stamp_image || "");
  // متن رسمی سپاس/امضا — از تنظیمات (company_signature) قابل تغییر است
  const officialSignature = resolveOfficialSignature(letterSettings);
  // بند گارانتی از نمایش حذف می‌شود (حتی اگر در دیتابیس مانده باشد)
  const strippedTextAfter = data ? stripWarrantyLines(data.textAfter) : "";
  // پیش‌فاکتور «نامه ستاد» و «فروش»: ستون «محل کالیبره» و «شرایط و ضوابط» پنهان
  // می‌شود و مهر و امضا و نام شرکت دقیقاً زیر آخرین مطلب (زیر جمع کل) می‌آید
  const isSetad = isSimplifiedProforma(data?.typeName);

  const perms = getPermissions(user.role, user.permissions);
  const isManager = perms.approveProforma || user.role === "manager" || user.role === "admin";
  // کاربر برنامه‌ریزی — نباید قیمت‌ها را ببیند
  const isPlanner = isOperationalUser(user);

  // واکشی مبنای قیمت‌گذاری اقلام
  useEffect(() => {
    if (isPlanner) return;
    fetch(`/api/proforma/${proformaId}/price-basis`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.basis)) {
          const map: Record<number, (typeof d.basis)[number]> = {};
          for (const b of d.basis) map[b.itemId] = b;
          setPriceBasis(map);
        }
      })
      .catch(() => {});
  }, [proformaId, isPlanner]);

  useEffect(() => {
    fetch(`/api/proforma/${proformaId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setEditedItems(d.items || []);
        setEditedTravel(d.travelCost || "0");
        setEditedTransport(d.transportCost || "0");
        setEditedDiscount(d.discountPercent || "0");
        setEditedTax(d.taxPercent || "10");
        setEditedInsurance(d.insurancePercent || "0");
        setEditEnableTax(parseFloat(d.taxPercent || "0") > 0);
        setEditEnableInsurance(parseFloat(d.insurancePercent || "0") > 0);
        setEditEnableTravel(parseFloat(d.travelCost || "0") > 0);
        setEditEnableTransport(parseFloat(d.transportCost || "0") > 0);
        setEditEnableDiscount(parseFloat(d.discountPercent || "0") > 0);
        // Load contracts for this company
        if (d.companyId) {
          fetch(`/api/contracts?companyId=${d.companyId}`)
            .then((r) => r.json())
            .then((ct) => setViewContracts(Array.isArray(ct) ? ct : []))
            .catch(() => {});
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [proformaId]);

  const fetchPriceHistory = async (equipmentId: number, idx: number) => {
    if (!data?.companyId) return;
    if (priceHistories[idx]) {
      setShowHistoryFor(showHistoryFor === idx ? null : idx);
      return;
    }
    try {
      const res = await fetch(`/api/price-history?equipmentId=${equipmentId}&companyId=${data.companyId}`);
      const hist = await res.json();
      setPriceHistories({ ...priceHistories, [idx]: hist });
      setShowHistoryFor(idx);
    } catch {}
  };

  // فرمت عدد تعداد — بدون اعشار اگر عدد صحیح باشد
  const fmtQty = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "۰";
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (isNaN(n)) return "۰";
    return toPersianDigits(Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, ""));
  };

  // ─── تابع مشترک تولید HTML چاپ/PDF فارسی با فونت Vazir ───
  // ─── مارجین‌ها: 3cm از بالا، 5cm از پایین ───

  // ─── چاپ/دانلود خروجی — از همان سازنده مشترک تا خروجی دقیقاً یکسان باشد ───
  const [savingPdf, setSavingPdf] = useState(false);

  // گزینه‌های مشترک — در حالت ویرایش قیمت، اقلام و جمع ویرایش‌شده چاپ می‌شود
  const printOpts = () => ({
    items: isEditingPrices ? editedItems : undefined,
    totalText: isEditingPrices ? formatPrice(calculateEditedTotal()) : undefined,
  });

  const handleOpenPrintWindow = () => {
    if (!data) return;
    openProformaPrintWindow(data, letterSettings, printOpts());
  };

  // دانلود فایل PDF واقعی — سمت سرور با headless Chrome، دقیقاً همان رندر چاپ
  const handleSavePdf = () => {
    if (!data) return;
    setSavingPdf(true);
    const a = document.createElement("a");
    a.href = `/api/proforma/${proformaId}/pdf`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => setSavingPdf(false), 1200);
  };

  const handleAction = async (action: "approved" | "rejected" | "revised" | "correction_send") => {
    // «اصلاح و تایید» نیازمند دستور مدیریت است تا بازرگانی بداند چه چیزی را اصلاح کند
    if (action === "correction_send" && !comment.trim()) {
      alert("برای «اصلاح و تایید» لطفاً موارد اصلاحی را در کادر نظر مدیریت بنویسید.");
      return;
    }

    // ── آخرین مرحله: تایید نهایی ──
    // فقط در این لحظه مبلغ صفر بازدارنده است.
    if (action === "approved") {
      // اگر قیمت‌ها در حال ویرایش و ذخیره‌نشده‌اند، ابتدا باید ذخیره شوند تا
      // مبلغ ثبت‌شده در سیستم همان مبلغ تاییدشده باشد.
      if (isEditingPrices) {
        alert("ابتدا تغییرات قیمت را ذخیره کنید، سپس تایید نهایی را بزنید.");
        return;
      }
      // مبلغ نهایی ثبت‌شده (پس از تخفیف، بیمه، هزینه‌ها و ارزش افزوده)
      if (isZeroAmount(toNum(data?.totalAmount))) {
        alert(zeroAmountMessage());
        return;
      }
      // بازدارنده «ردیف صفر»: اگر حتی یک ردیف تجهیزاتِ انتخاب‌شده مبلغ صفر دارد، تایید نهایی متوقف می‌شود
      const zeroRows = findZeroAmountRows(data?.items || []);
      if (zeroRows.length > 0) {
        alert(zeroRowsMessage(zeroRows));
        return;
      }
    }

    setActing(true);
    const statusRes = await fetch(`/api/proforma/${proformaId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: action, managerComment: comment, approvedBy: user.id, updatedBy: user.id }),
    });
    if (!statusRes.ok) {
      const err = await statusRes.json().catch(() => ({}));
      setActing(false);
      alert(err.error || "ثبت تصمیم مدیریت ناموفق بود");
      return;
    }
    await fetch("/api/workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proformaId,
        fromUserId: user.id,
        toDepartment: "واحد بازرگانی",
        action,
        comment:
          action === "correction_send"
            ? `اصلاح و تایید — پس از اصلاح، بازرگانی مجاز به تایید و ارسال است.${comment ? ` | دستور: ${comment}` : ""}`
            : comment,
      }),
    });

    // هنگام تایید، دبیرخانه هم مطلع شود که پیش‌فاکتور تایید شده و باید صادر/ارسال شود
    if (action === "approved") {
      await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proformaId,
          fromUserId: user.id,
          toDepartment: "دبیرخانه",
          action,
          comment: comment || "پیش‌فاکتور تایید شد — لطفاً صادر و به مشتری ارسال شود",
        }),
      }).catch(() => {});
    }

    // اگر تایید شد، خروجی سمت سرور ذخیره کن
    let pdfPath: string | null = null;
    if (action === "approved") {
      try {
        const res = await fetch(`/api/proforma/${proformaId}/save-pdf`, { method: "POST" });
        const result = await res.json();
        if (result.success) {
          pdfPath = result.path;
        }
      } catch {}
    }

    const msg = action === "approved"
      ? `✅ تایید شد${pdfPath ? ` — خروجی ذخیره شد: ${pdfPath}` : ""}`
      : action === "rejected"
        ? "❌ رد شد"
        : action === "correction_send"
          ? "🖊️ برای «اصلاح و تایید» به کارتابل بازرگانی ارسال شد — بازرگانی پس از اصلاح، خودش تایید و ارسال می‌کند"
          : "🔄 برای اصلاح ارسال شد";

    if (typeof window !== "undefined" && (window as unknown as { showToast?: (m: string) => void }).showToast) {
      (window as unknown as { showToast: (m: string) => void }).showToast(msg);
    } else {
      alert(msg);
    }
    setActing(false);
    onBack();
  };

  const calculateEditedSubtotal = () => {
    return editedItems.filter(i => i.isSelected).reduce((sum, it) => sum + parseFloat(it.totalPrice || "0"), 0);
  };

  // محاسبه صحیح: جمع اقلام ← کسر تخفیف ← کسر بیمه ← افزودن هزینه‌ها ← ارزش افزوده (آخرین مرحله)
  const editedTotals = (): ProformaTotals =>
    computeProformaTotals({
      subtotal: calculateEditedSubtotal(),
      discountPercent: editEnableDiscount ? editedDiscount : "0",
      insurancePercent: editEnableInsurance ? editedInsurance : "0",
      travelCost: editEnableTravel ? editedTravel : "0",
      transportCost: editEnableTransport ? editedTransport : "0",
      taxPercent: editEnableTax ? editedTax : "0",
    });
  const calculateEditedBeforeTax = () => editedTotals().beforeTax;
  const calculateEditedTaxAmount = () => editedTotals().taxAmount;
  const calculateEditedTotal = () => editedTotals().totalAmount;

  const updateEditedItem = (idx: number, field: string, value: string) => {
    const newItems = [...editedItems];
    const item = { ...newItems[idx], [field]: value };
    
    // Recalculate total for this item - فقط برای تجهیز نقطه‌ای
    if (field === "quantity" || field === "unitPrice" || field === "pointCount") {
      const qty = parseFloat(field === "quantity" ? value : item.quantity) || 0;
      const price = parseFloat(field === "unitPrice" ? value : item.unitPrice) || 0;
      const eq = equipmentList.find((e) => e.id === item.equipmentId);
      const hasPoint = eq ? eq.pricePerPoint : !!item.pointCount;
      const points = hasPoint ? (parseInt(field === "pointCount" ? value : String(item.pointCount || 1)) || 1) : 1;
      item.totalPrice = (qty * price * (hasPoint ? points : 1)).toString();
      if (field === "pointCount") item.pointCount = hasPoint ? (parseInt(value) || null) : null;
    }
    
    newItems[idx] = item;
    setEditedItems(newItems);
  };

  const savePriceChanges = async () => {
    if (!data) return;
    setSavingPrices(true);
    try {
      const t = editedTotals();
      const subtotal = t.subtotal;
      const total = t.totalAmount;
      const effectiveDiscount = editEnableDiscount ? editedDiscount : "0";
      const effectiveTax = editEnableTax ? editedTax : "0";
      const effectiveInsurance = editEnableInsurance ? editedInsurance : "0";
      const discAmount = t.discountAmount;
      const insAmt = t.insuranceAmount;
      const taxAmt = t.taxAmount;

      const priceRes = await fetch(`/api/proforma/${proformaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // شناسه کاربر ویرایش‌کننده الزامی است — سرور با آن نقش «مدیر/ادمین» را
          // تشخیص می‌دهد و قفل «ارسال به مدیریت» برای خودِ مدیر باز می‌ماند.
          updatedBy: user.id,
          subtotal: subtotal.toString(),
          discountPercent: effectiveDiscount,
          discountAmount: discAmount.toString(),
          taxPercent: effectiveTax,
          taxAmount: taxAmt.toString(),
          insurancePercent: effectiveInsurance,
          insuranceAmount: insAmt.toString(),
          travelCost: editEnableTravel ? editedTravel : "0",
          transportCost: editEnableTransport ? editedTransport : "0",
          totalAmount: total.toString(),
          items: editedItems.map((it, idx) => ({
            equipmentId: it.equipmentId,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            pointCount: it.pointCount,
            totalPrice: it.totalPrice,
            rowOrder: idx,
            isSelected: it.isSelected,
          })),
        }),
      });

      if (!priceRes.ok) {
        const err = await priceRes.json().catch(() => ({}));
        throw new Error(err.error || "ذخیره تغییرات قیمت ناموفق بود");
      }

      // Update local data
      const newData = {
        ...data,
        subtotal: subtotal.toString(),
        discountPercent: effectiveDiscount,
        discountAmount: discAmount.toString(),
        taxPercent: effectiveTax,
        taxAmount: taxAmt.toString(),
        insurancePercent: effectiveInsurance,
        insuranceAmount: insAmt.toString(),
        travelCost: editEnableTravel ? editedTravel : "0",
        transportCost: editEnableTransport ? editedTransport : "0",
        totalAmount: total.toString(),
        items: editedItems,
      };
      setData(newData as ProformaDetail);
      setIsEditingPrices(false);
      alert("قیمت‌ها با موفقیت به‌روزرسانی شد ✓");
    } catch (error) {
      alert(error instanceof Error ? error.message : "خطا در ذخیره تغییرات");
    }
    setSavingPrices(false);
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-indigo-200 rounded-full animate-spin border-t-indigo-600"></div>
          <div className="absolute inset-0 w-12 h-12 border-4 border-transparent rounded-full animate-ping border-t-purple-400"></div>
        </div>
      </div>
    );
  }

  // مبالغ نمایشی همیشه با ترتیب صحیح محاسبه می‌شوند:
  // جمع اقلام ← کسر تخفیف ← کسر بیمه ← افزودن هزینه‌ها ← ارزش افزوده (آخرین مرحله)
  const viewTotals: ProformaTotals = isEditingPrices
    ? editedTotals()
    : computeProformaTotals({
        subtotal: data.subtotal,
        discountPercent: data.discountPercent,
        insurancePercent: data.insurancePercent,
        travelCost: data.travelCost,
        transportCost: data.transportCost,
        taxPercent: data.taxPercent,
      });
  const subtotal = viewTotals.subtotal;
  const total = viewTotals.totalAmount;
  // مبلغ نهایی ثبت‌شده در سیستم — مبنای بازدارندگی «تایید نهایی» (آخرین مرحله)
  const storedFinalTotal = toNum(data.totalAmount);
  // ردیف‌های تجهیزاتِ دارای مبلغ صفر — «تایید نهایی» با ردیف صفر مسدود است
  const storedZeroRows = findZeroAmountRows(data.items);

  return (
    <div className="space-y-6 slide-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-900 to-indigo-900 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-32 translate-x-32"></div>
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center hover:bg-white/30 transition">
              ←
            </button>
            <div>
              <h1 className="text-xl font-black flex items-center gap-2">
                {proformaTitle(data)} <DocNo v={data.proformaNumber} persian={false} />
                {isRevisedProforma(data) && (
                  <span className="bg-orange-500 text-white text-[11px] px-2 py-0.5 rounded-full font-bold" title={`اصلاحیه شماره ${data.revisionNo ?? ""}`}>
                    اصلاحیه {toPersianDigits(data.revisionNo ?? 1)}
                  </span>
                )}
              </h1>
              <p className="text-white/70 text-sm mt-1">{data.typeName} • {data.companyName} • {data.issueDate}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              <span className={`px-4 py-2 rounded-full text-xs font-bold backdrop-blur ${
                data.status === "final_sale" ? "bg-green-600 text-white" :
                data.status === "approved" ? "bg-green-500 text-white" :
                data.status === "rejected" ? "bg-red-500 text-white" :
                data.status === "pending" ? "bg-amber-500 text-white animate-pulse" :
                data.status === "revised" ? "bg-orange-500 text-white" :
                data.status === "correction_send" ? "bg-violet-500 text-white animate-pulse" :
                data.status === "sent" ? "bg-emerald-600 text-white" :
                "bg-white/20 text-white"
              }`}>
                {statusLabels[data.status] || data.status}
              </span>
              {data.letterId && (
                <span className="bg-white/20 backdrop-blur px-3 py-1 rounded-full text-xs">مرتبط با نامه #{data.letterId}</span>
              )}
            </div>
            {/* اطلاعات کاربران */}
            <div className="flex flex-wrap gap-2 text-xs">
              {data.createdByName && (
                <span className="bg-white/20 backdrop-blur px-2 py-1 rounded-lg">👤 صادرکننده: {data.createdByName}</span>
              )}
              {data.approvedByName && (
                <span className="bg-green-500/30 backdrop-blur px-2 py-1 rounded-lg">✅ تأییدکننده: {data.approvedByName}</span>
              )}
              {data.updatedByName && data.updatedByName !== data.createdByName && !data.approvedByName && (
                <span className="bg-white/20 backdrop-blur px-2 py-1 rounded-lg">✏️ ویرایش: {data.updatedByName}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Proforma Description */}
      {data.proformaDescription && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-4 flex items-start gap-3">
          <span className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">📝</span>
          <div>
            <div className="text-xs font-bold text-indigo-700 mb-1">شرح پیش‌فاکتور</div>
            <p className="text-sm text-indigo-900 leading-relaxed">{data.proformaDescription}</p>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className={`grid grid-cols-2 gap-4 ${isPlanner ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
        {!isPlanner && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">مبلغ کل</div>
          <div className="text-lg font-black text-gray-900">
            {formatPrice(total)} ریال
          </div>
          {!data.showTotal && (
            <div className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5 mt-1">
              ⚠️ بدون جمع کل برای مشتری
            </div>
          )}
          {isEditingPrices && (
            <div className="text-xs text-purple-600 mt-1">در حال ویرایش</div>
          )}
        </div>
        )}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">تعداد اقلام</div>
          <div className="text-lg font-black">{data.items.length} قلم</div>
          <div className="text-xs text-gray-400">{data.items.filter(i => i.isSelected).length} فعال</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">اعتبار</div>
          <div className="text-lg font-black">{data.validityDays} روز</div>
        </div>
        {!isPlanner && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">مالیات / بیمه</div>
          <div className="text-sm font-bold">{toPersianDigits(formatPercentValue(isEditingPrices ? editedTax : data.taxPercent) || "0")}% / {toPersianDigits(formatPercentValue(isEditingPrices ? editedInsurance : data.insurancePercent) || "0")}%</div>
        </div>
        )}
      </div>

      {/* Contract Info */}
      {viewContracts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-5">
          <h3 className="font-black text-amber-800 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center">📄</span>
            قراردادهای مشتری ({viewContracts.length})
          </h3>
          <div className="space-y-2">
            {viewContracts.map((ct) => (
              <div key={ct.id} className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-amber-100">
                <div>
                  <span className="font-bold text-sm">{ct.contractNumber}</span>
                  {ct.title && <span className="text-sm text-gray-600 mr-2">— {ct.title}</span>}
                  <div className="text-xs text-gray-500 mt-1">📅 {ct.startDate} الی {ct.endDate}</div>
                </div>
                {ct.filePath && (
                  <a href={ct.filePath} target="_blank" rel="noopener noreferrer" className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-200">
                    📥 دانلود قرارداد
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* سربرگ — متن بالای جدول */}
      {data.textBefore && !isEditingPrices && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">📄</span>
            سربرگ پیش‌فاکتور
          </h3>
          <p className="text-sm whitespace-pre-wrap text-gray-700 leading-relaxed bg-blue-50 p-4 rounded-xl border border-blue-100">{data.textBefore}</p>
        </div>
      )}

      {/* Items with Manager Pricing View */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold flex items-center gap-2">
            <span className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center text-white">📦</span>
            اقلام پیش‌فاکتور
            {isManager && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full mr-2">نمای مدیریتی</span>}
          </h3>
          <div className="flex gap-2">
            {isManager && !isEditingPrices && (
              <button
                onClick={() => setIsEditingPrices(true)}
                className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:shadow-lg transition"
              >
                ✏️ ویرایش قیمت‌ها (مدیر)
              </button>
            )}
            {isEditingPrices && (
              <>
                <button
                  onClick={() => {
                    setIsEditingPrices(false);
                    setEditedItems(data.items);
                    setEditedTravel(data.travelCost);
                    setEditedTransport(data.transportCost);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-sm hover:bg-gray-50"
                >
                  انصراف
                </button>
                <button
                  onClick={savePriceChanges}
                  disabled={savingPrices}
                  className="bg-green-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {savingPrices ? "ذخیره..." : "💾 ذخیره تغییرات"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Manager pricing basis hint */}
        {isManager && (
          <div className="mx-6 mt-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <span className="text-xl">💡</span>
            <div className="text-sm">
              <div className="font-bold text-amber-800">مبنای قیمت‌گذاری (ویژه مدیریت)</div>
              <div className="text-amber-700 mt-1">
                • برای هر تجهیز روی «📊 سوابق» کلیک کنید تا قیمت‌های قبلی همین مشتری را ببینید<br/>
                • قیمت را مستقیماً ویرایش کنید و ذخیره کنید — سپس تایید/رد کنید<br/>
                • تغییرات در تاریخچه قیمت همان مشتری ثبت می‌شود
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-3 text-right font-bold text-gray-600 rounded-r-xl">#</th>
                <th className="px-3 py-3 text-right font-bold text-gray-600">شرح / تجهیز</th>
                <th className="px-3 py-3 text-right font-bold text-gray-600">تعداد</th>
                <th className="px-3 py-3 text-right font-bold text-gray-600">نوع پارامتر</th>
                <th className="px-3 py-3 text-right font-bold text-gray-600">تعداد نقطه/پارامتر/اندازه</th>
                {!isSetad && <th className="px-3 py-3 text-right font-bold text-gray-600">محل کالیبره</th>}
                {!isPlanner && <th className="px-3 py-3 text-right font-bold text-gray-600">قیمت واحد</th>}
                {!isPlanner && <th className="px-3 py-3 text-right font-bold text-gray-600">مبنای قیمت</th>}
                {!isPlanner && <th className="px-3 py-3 text-right font-bold text-gray-600">مبلغ کل</th>}
                {!isPlanner && <th className="px-3 py-3 text-center font-bold text-gray-600 rounded-l-xl">عملیات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
  {(isEditingPrices ? editedItems : data.items).map((item, idx) => (
    <Fragment key={item.id}>
      <tr
        className={`${
          !item.isSelected
            ? "opacity-50 bg-gray-50"
            : "hover:bg-indigo-50/50"
        } transition`}
      >
        <td className="px-3 py-3 font-medium">
          {idx + 1}
        </td>

        <td className="px-3 py-3">
          <div className="font-medium">{buildItemDescription(item)}</div>

          {item.equipmentName &&
            item.description !== item.equipmentName && (
              <div className="text-xs text-gray-400">
                {item.equipmentName}
              </div>
            )}
        </td>

        <td className="px-3 py-3">
          {isEditingPrices ? (
            <input
              type="number"
              value={item.quantity}
              onChange={(e) =>
                updateEditedItem(
                  idx,
                  "quantity",
                  e.target.value
                )
              }
              className="w-20 px-2 py-1 border rounded-lg text-sm"
            />
          ) : (
            fmtQty(item.quantity)
          )}
        </td>

        <td className="px-3 py-3">
          {(() => {
            const pv = item.paramValues as unknown as {
              params?: Array<{ name?: string; unit?: string | null; count?: string | number }>;
              paramName?: string;
              pointCount?: unknown;
            } | null;

            // نمایش همه پارامترها با تعدادشان
            if (pv?.params && Array.isArray(pv.params) && pv.params.length > 0) {
              return (
                <div className="flex flex-wrap gap-1">
                  {pv.params.map((p, i) => {
                    const cnt = parseInt(String(p.count ?? "")) || 0;
                    return (
                      <span
                        key={i}
                        className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap"
                      >
                        {p.name}
                        {cnt > 1 && <span className="font-bold"> ×{toPersianDigits(cnt)}</span>}
                      </span>
                    );
                  })}
                </div>
              );
            }

            return (
              pv?.paramName ||
              (item as unknown as {
                paramName?: string;
              }).paramName ||
              "-"
            );
          })()}
        </td>

        <td className="px-3 py-3">
          {(() => {
            const eq = equipmentList.find(
              (e) => e.id === item.equipmentId
            );

            const hasPoint = eq
              ? eq.pricePerPoint
              : !!item.pointCount;

            if (isEditingPrices) {
              return hasPoint ? (
                <input
                  type="number"
                  value={item.pointCount || ""}
                  onChange={(e) =>
                    updateEditedItem(
                      idx,
                      "pointCount",
                      e.target.value
                    )
                  }
                  className="w-16 px-2 py-1 border rounded-lg text-sm"
                  placeholder="نقطه"
                />
              ) : (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                  —
                </span>
              );
            }

            return hasPoint
              ? item.pointCount || "-"
              : "—";
          })()}
        </td>

        {/* محل کالیبره — برای planner نمایش داده می‌شود؛ در نامه ستاد حذف است */}
        {!isSetad && (
        <td className="px-3 py-3">
          {(item as unknown as { calibrationLocation?: string | null }).calibrationLocation || "-"}
        </td>
        )}

        {!isPlanner && (
        <td className="px-3 py-3">
          {isEditingPrices ? (
            <input
              type="number"
              value={item.unitPrice}
              onChange={(e) =>
                updateEditedItem(
                  idx,
                  "unitPrice",
                  e.target.value
                )
              }
              className="w-28 px-2 py-1 border rounded-lg text-sm font-medium"
            />
          ) : (
            <span className="font-medium">
              {formatPrice(item.unitPrice)}
            </span>
          )}
        </td>
        )}

        {/* مبنای قیمت‌گذاری — بر چه اساسی این قیمت وارد شده است */}
        {!isPlanner && (
        <td className="px-3 py-3">
          {(() => {
            const pb = priceBasis[item.id];
            if (!pb) {
              return <span className="text-[11px] text-gray-300">—</span>;
            }
            const styles =
              pb.source === "history"
                ? "bg-sky-50 text-sky-700 border-sky-200"
                : pb.source === "catalog"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : pb.source === "manual_over_catalog"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-gray-100 text-gray-600 border-gray-200";
            const icon =
              pb.source === "history" ? "📋" : pb.source === "catalog" ? "🏷️" : pb.source === "manual_over_catalog" ? "✍️" : "✍️";
            return (
              <div className="space-y-1 min-w-[150px]">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold border rounded-full px-2 py-0.5 ${styles}`}>
                  <span>{icon}</span> {pb.label}
                </span>
                {pb.referenceNumber && (
                  <div className="text-[10px] text-gray-500 leading-4">
                    پیش‌فاکتور: <span className="font-bold text-gray-700">{pb.referenceNumber}</span>
                  </div>
                )}
                {pb.referenceDate && (
                  <div className="text-[10px] text-gray-400 leading-4">تاریخ: {toPersianDigits(pb.referenceDate)}</div>
                )}
                {pb.referencePrice && (
                  <div className="text-[10px] text-gray-500 leading-4">
                    مبلغ مرجع: <span className="font-bold">{formatPrice(pb.referencePrice)}</span>
                  </div>
                )}
                {pb.diffPercent !== null && (
                  pb.isSame ? (
                    <div className="text-[10px] font-bold text-emerald-600">= بدون تغییر</div>
                  ) : (
                    <div className={`text-[10px] font-bold ${Number(pb.diff) > 0 ? "text-red-500" : "text-green-600"}`}>
                      {Number(pb.diff) > 0 ? "▲" : "▼"} {toPersianDigits(Math.abs(pb.diffPercent).toFixed(1))}%
                      <span className="text-gray-400 font-normal"> ({formatPrice(Math.abs(Number(pb.diff)))})</span>
                    </div>
                  )
                )}
              </div>
            );
          })()}
        </td>
        )}

        {!isPlanner && (
        <td className="px-3 py-3 font-bold text-indigo-600">
          {formatPrice(item.totalPrice)}
        </td>
        )}

        {!isPlanner && (
        <td className="px-3 py-3 text-center">
          <div className="flex justify-center gap-1">
            {item.equipmentId && (
              <button
                onClick={() =>
                  fetchPriceHistory(
                    item.equipmentId!,
                    idx
                  )
                }
                className="w-8 h-8 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg flex items-center justify-center text-xs transition"
                title="سوابق قیمت"
              >
                📊
              </button>
            )}

            {isEditingPrices && (
              <button
                onClick={() => {
                  const newItems = [...editedItems];

                  newItems[idx] = {
                    ...newItems[idx],
                    isSelected:
                      !newItems[idx].isSelected,
                  };

                  setEditedItems(newItems);
                }}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs ${
                  item.isSelected
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-200 text-gray-500"
                }`}
                title={
                  item.isSelected
                    ? "فعال"
                    : "غیرفعال"
                }
              >
                {item.isSelected ? "✓" : "✕"}
              </button>
            )}
          </div>
        </td>
        )}
      </tr>

      {showHistoryFor === idx &&
        priceHistories[idx] && (
          <tr>
            <td
              colSpan={isPlanner ? 6 : 9}
              className="px-3 py-3 bg-purple-50"
            >
              <div className="bg-white rounded-xl p-4 border border-purple-200">
                <div className="font-bold text-sm mb-3 flex items-center gap-2">
                  📈 سوابق قیمت برای همین مشتری —{" "}
                  {item.equipmentName ||
                    item.description}

                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                    {priceHistories[idx].length} سابقه
                  </span>
                </div>

                {priceHistories[idx].length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">
                    سابقه‌ای برای این تجهیز و مشتری یافت نشد
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-2 text-right">
                            تاریخ
                          </th>
                          <th className="px-2 py-2 text-right">
                            پیش‌فاکتور
                          </th>
                          <th className="px-2 py-2 text-right">
                            قیمت واحد
                          </th>
                          <th className="px-2 py-2 text-right">
                            نقطه
                          </th>
                          <th className="px-2 py-2 text-right">
                            تعداد
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y">
                        {priceHistories[idx]
                          .slice(0, 5)
                          .map((h) => (
                            <tr
                              key={h.id}
                              className="hover:bg-gray-50"
                            >
                              <td className="px-2 py-2">
                                {h.priceDate}
                              </td>

                              <td className="px-2 py-2 font-mono">
                                {h.proformaNumber ||
                                  `#${h.id}`}
                              </td>

                              <td className="px-2 py-2 font-bold text-green-700">
                                {formatPrice(
                                  h.unitPrice
                                )}
                              </td>

                              <td className="px-2 py-2">
                                {h.pointCount || "-"}
                              </td>

                              <td className="px-2 py-2">
                                {fmtQty(h.quantity)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-3 text-xs text-gray-500">
                  💡 میانگین:{" "}
                  {priceHistories[idx].length
                    ? formatPrice(
                        priceHistories[idx].reduce(
                          (s, h) =>
                            s +
                            parseFloat(
                              h.unitPrice
                            ),
                          0
                        ) /
                          priceHistories[idx]
                            .length
                      )
                    : 0}{" "}
                  ریال
                </div>
              </div>
            </td>
          </tr>
        )}
    </Fragment>
  ))}
</tbody>
          </table>
        </div>

        {/* Editable costs when manager is editing - چک‌باکسی */}
        {isEditingPrices ? (
          <div className="p-6 bg-gray-50 border-t">
            <h4 className="font-bold text-sm mb-4">هزینه‌ها و ضرایب (چک‌باکسی - قابل ویرایش مدیر)</h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className={`border rounded-xl p-3 ${editEnableDiscount ? "bg-white border-red-200" : "bg-gray-100 border-gray-200"}`}>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={editEnableDiscount} onChange={(e) => setEditEnableDiscount(e.target.checked)} className="w-4 h-4" />
                  <span className="text-xs font-bold">تخفیف %</span>
                </label>
                <input type="number" value={editedDiscount} onChange={(e) => setEditedDiscount(e.target.value)} disabled={!editEnableDiscount} className="w-full px-2 py-2 border rounded-lg text-sm disabled:bg-gray-100" />
              </div>
              <div className={`border rounded-xl p-3 ${editEnableTax ? "bg-white border-blue-200" : "bg-gray-100 border-gray-200"}`}>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={editEnableTax} onChange={(e) => setEditEnableTax(e.target.checked)} className="w-4 h-4" />
                  <span className="text-xs font-bold">ارزش افزوده %</span>
                </label>
                <input type="number" value={editedTax} onChange={(e) => setEditedTax(e.target.value)} disabled={!editEnableTax} className="w-full px-2 py-2 border rounded-lg text-sm disabled:bg-gray-100" />
              </div>
              <div className={`border rounded-xl p-3 ${editEnableInsurance ? "bg-white border-orange-200" : "bg-gray-100 border-gray-200"}`}>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={editEnableInsurance} onChange={(e) => setEditEnableInsurance(e.target.checked)} className="w-4 h-4" />
                  <span className="text-xs font-bold">بیمه %</span>
                </label>
                <input type="number" value={editedInsurance} onChange={(e) => setEditedInsurance(e.target.value)} disabled={!editEnableInsurance} className="w-full px-2 py-2 border rounded-lg text-sm disabled:bg-gray-100" />
              </div>
              <div className={`border rounded-xl p-3 ${editEnableTravel ? "bg-white border-green-200" : "bg-gray-100 border-gray-200"}`}>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={editEnableTravel} onChange={(e) => setEditEnableTravel(e.target.checked)} className="w-4 h-4" />
                  <span className="text-xs font-bold">ایاب و ذهاب</span>
                </label>
                <input type="number" value={editedTravel} onChange={(e) => setEditedTravel(e.target.value)} disabled={!editEnableTravel} className="w-full px-2 py-2 border rounded-lg text-sm disabled:bg-gray-100" />
              </div>
              <div className={`border rounded-xl p-3 ${editEnableTransport ? "bg-white border-purple-200" : "bg-gray-100 border-gray-200"}`}>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={editEnableTransport} onChange={(e) => setEditEnableTransport(e.target.checked)} className="w-4 h-4" />
                  <span className="text-xs font-bold">هزینه سفر</span>
                </label>
                <input type="number" value={editedTransport} onChange={(e) => setEditedTransport(e.target.value)} disabled={!editEnableTransport} className="w-full px-2 py-2 border rounded-lg text-sm disabled:bg-gray-100" />
              </div>
            </div>
          </div>
        ) : null}

        {/* Totals — برای planner مخفی */}
        {!isPlanner && (
        <div className="p-6 bg-gradient-to-r from-gray-50 to-indigo-50 border-t">
          <div className="max-w-md mr-auto space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">جمع اقلام:</span>
              <span className="font-bold">{formatPrice(subtotal)} ریال</span>
            </div>
            {viewTotals.discountAmount > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>تخفیف{percentSuffix(viewTotals.discountPercent)}:</span>
                <span>-{formatPrice(viewTotals.discountAmount)}</span>
              </div>
            )}
            {/* ۲) بیمه بلافاصله پس از جمع اقلام کسر می‌شود */}
            {viewTotals.insuranceAmount > 0 && (
              <div className="flex justify-between text-sm text-orange-600">
                <span>بیمه{percentSuffix(viewTotals.insurancePercent)}:</span>
                <span>-{formatPrice(viewTotals.insuranceAmount)}</span>
              </div>
            )}
            {/* ۳) سپس هزینه‌ها افزوده می‌شوند */}
            {viewTotals.travelCost > 0 && (
              <div className="flex justify-between text-sm">
                <span>ایاب و ذهاب:</span>
                <span>+{formatPrice(viewTotals.travelCost)}</span>
              </div>
            )}
            {viewTotals.transportCost > 0 && (
              <div className="flex justify-between text-sm">
                <span>هزینه سفر:</span>
                <span>+{formatPrice(viewTotals.transportCost)}</span>
              </div>
            )}
            {/* ۴) ارزش افزوده در آخرین مرحله روی جمع پس از بیمه و هزینه‌ها */}
            {viewTotals.taxPercent > 0 && (
              <>
                <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                  <span className="font-medium">جمع قبل از ارزش افزوده:</span>
                  <span className="font-medium">{formatPrice(viewTotals.beforeTax)}</span>
                </div>
                <div className="flex justify-between text-sm text-blue-600">
                  <span>ارزش افزوده{percentSuffix(viewTotals.taxPercent)}:</span>
                  <span>+{formatPrice(viewTotals.taxAmount)}</span>
                </div>
              </>
            )}
            {/* جمع کل برای استفاده داخلی همیشه نمایش داده می‌شود؛ اگر «بدون جمع کل»
                فعال باشد فقط نسخه مشتری (PDF/چاپ) بدون جمع است و اینجا اعلان می‌شود */}
            <div className="flex justify-between text-lg font-black pt-3 border-t-2 border-indigo-200">
              <span>جمع کل:</span>
              <span className="text-indigo-600">{formatPrice(total)} ریال</span>
            </div>
            {!data.showTotal && (
              <div className="text-center text-xs font-bold bg-amber-50 py-2 px-3 rounded-xl text-amber-800 border border-amber-200">
                ⚠️ این پیش‌فاکتور «بدون جمع کل» برای مشتری ارسال می‌شود — جمع بالا فقط برای استفاده داخلی است و در نسخه مشتری (PDF/چاپ) نمایش داده نمی‌شود
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* شرایط و توضیحات — متن بعد از جدول (بند گارانتی حذف شده است) */}
      {!isEditingPrices && strippedTextAfter && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">📋</span>
            شرایط و توضیحات
          </h3>
          <p className="text-sm whitespace-pre-wrap text-gray-700 leading-relaxed bg-amber-50 p-4 rounded-xl border border-amber-100">{strippedTextAfter}</p>
        </div>
      )}
      {/* ته‌برگ — شرایط عمومی صفحه آخر (در نامه ستاد حذف می‌شود)
          پیش از بلوک مهر و امضا نمایش داده می‌شود چون در خروجی چاپ/PDF نیز
          مهر و امضا پس از آن و همیشه در «آخرین صفحه» سند قرار می‌گیرد.
          طبق درخواست: در نمای مدیریت این بلوک (و بلوک مهر و امضا) پنهان است —
          متن ته‌برگ فقط در نسخه چاپ/PDF مشتری معنا دارد. */}
      {!isEditingPrices && !isSetad && !isManager && data.textLastPage && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">📄</span>
            ته‌برگ / شرایط عمومی (صفحه آخر)
          </h3>
          <p className="text-sm whitespace-pre-wrap text-gray-700 leading-relaxed bg-green-50 p-4 rounded-xl border border-green-100">{data.textLastPage}</p>
        </div>
      )}
      {/* مهر و امضا — مطابق خروجی PDF: همیشه در «آخرین صفحه» سند، در تمامی حالات.
          اگر ته‌برگ/صفحه آخر وجود داشته باشد مهر زیر همان متن و در همان صفحه آخر
          می‌آید؛ در غیر این‌صورت بلافاصله زیر آخرین مطلب سند قرار می‌گیرد.
          متن سپاس دقیقاً در خط بالای «مهر و امضا» قرار می‌گیرد (وسط‌چین) و متن
          رسمی از تنظیمات (company_signature) خوانده می‌شود.
          طبق درخواست: مدیریت هنگام باز کردن پیش‌فاکتور مهر و امضا را نمی‌بیند —
          این بلوک فقط در نسخه چاپ/PDF مشتری کاربرد دارد. */}
      {!isEditingPrices && !isManager && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">✍️</span>
            مهر و امضا
            <span className="text-xs font-normal text-gray-400">(در PDF: همیشه در آخرین صفحه سند — پس از «ته‌برگ / صفحه آخر»؛ متن سپاس دقیقاً بالای مهر و امضا، وسط‌چین)</span>
          </h3>
          <div dir="rtl" className="flex flex-col items-center text-center gap-1">
            <p dir="rtl" className="text-sm whitespace-pre-wrap text-gray-800 font-bold bg-gray-50 px-6 py-3 rounded-xl leading-8" style={{ unicodeBidi: "isolate" }}>{normalizeSignatureText(data.signatureText, officialSignature)}</p>
            {/* مهر و امضا — با اندازه اصلیِ واقعیِ فایل، بدون هیچ تغییر ابعادی */}
            {stampImg && <img src={stampImg} alt="مهر و امضا" className="max-w-full h-auto" />}
          </div>
          {isSetad && (
            <p className="mt-3 text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 text-center">
              📌 در خروجی چاپ/PDF، مهر و امضا و نام شرکت دقیقاً زیر آخرین مطلب (زیر جمع کل) می‌آید؛ ستون «محل کالیبره» و «صفحه آخر (شرایط و ضوابط)» چاپ نمی‌شود.
            </p>
          )}
        </div>
      )}

      {data.managerComment && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-200">
          <h3 className="font-bold mb-2 text-amber-800 flex items-center gap-2">💬 نظر مدیریت</h3>
          <p className="text-sm text-amber-900 leading-relaxed">{data.managerComment}</p>
        </div>
      )}

      {/* Manager Actions - Enhanced */}
      {isManager && data.status === "pending" && (
        <div className="bg-white rounded-2xl shadow-xl border-2 border-indigo-100 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-2xl"></div>
          <h3 className="font-black text-lg mb-2 flex items-center gap-2">
            <span className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center text-white">👔</span>
            تصمیم مدیریت
          </h3>
          <p className="text-sm text-gray-500 mb-4">شما می‌توانید قیمت‌ها را در بالا ویرایش کرده، سپس تایید/رد کنید. مبنای قیمت‌گذاری هر تجهیز را از «📊 سوابق» ببینید.</p>
          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-700 mb-2">نظر / دستور مدیریت</label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="مثال: قیمت ردیف ۲ اصلاح شد، تایید می‌شود..."
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
            />
          </div>
          {/* آخرین مرحله: تایید نهایی — مبلغ ثبت‌شده نباید صفر باشد */}
          {isZeroAmount(storedFinalTotal) && (
            <div className="mb-4 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              ⛔ مبلغ نهایی این پیش‌فاکتور صفر است — «تایید نهایی» مجاز نیست. ابتدا قیمت اقلام را ویرایش و ذخیره کنید.
              <span className="block font-normal text-xs mt-1 text-red-600">
                سایر تصمیم‌ها (نیاز به اصلاح / رد) بدون محدودیت در دسترس است.
              </span>
            </div>
          )}
          {/* بازدارنده «ردیف صفر» — اگر ردیفی از تجهیزات مبلغ صفر دارد، تایید نهایی مسدود است */}
          {!isZeroAmount(storedFinalTotal) && storedZeroRows.length > 0 && (
            <div className="mb-4 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              ⛔ {zeroRowsMessage(storedZeroRows)}
              <span className="block font-normal text-xs mt-1 text-red-600">
                ردیف‌های صفر: {storedZeroRows.map((r) => r.rowNo).join("، ")} — سایر تصمیم‌ها (نیاز به اصلاح / رد) بدون محدودیت در دسترس است.
              </span>
            </div>
          )}
          {!isZeroAmount(storedFinalTotal) && storedZeroRows.length === 0 && isEditingPrices && (
            <div className="mb-4 text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              ✏️ قیمت‌ها در حال ویرایش است — برای «تایید نهایی» ابتدا تغییرات را ذخیره کنید.
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleAction("approved")}
              disabled={acting || isEditingPrices || isZeroAmount(storedFinalTotal) || storedZeroRows.length > 0}
              title={
                isZeroAmount(storedFinalTotal)
                  ? zeroAmountMessage()
                  : storedZeroRows.length > 0
                    ? zeroRowsMessage(storedZeroRows)
                    : isEditingPrices
                      ? "ابتدا تغییرات قیمت را ذخیره کنید"
                      : "تایید نهایی پیش‌فاکتور"
              }
              className="flex-1 min-w-[120px] bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-green-500/25 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>✅</span> تایید نهایی
            </button>
            <button
              onClick={() => handleAction("revised")}
              disabled={acting}
              className="flex-1 min-w-[120px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-amber-500/25 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>🔄</span> نیاز به اصلاح
            </button>
            <button
              onClick={() => handleAction("rejected")}
              disabled={acting}
              className="flex-1 min-w-[120px] bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-red-500/25 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>❌</span> رد
            </button>
          </div>

          {/* اصلاح و تایید — تفویض اختیار تایید نهایی به بازرگانی */}
          <div className="mt-3">
            <button
              onClick={() => handleAction("correction_send")}
              disabled={acting}
              className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-violet-500/25 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>🖊️</span> اصلاح و تایید (ارسال به بازرگانی جهت اصلاح و تایید نهایی توسط خودش)
            </button>
            <p className="mt-2 text-[11px] leading-5 text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
              با این گزینه، پیش‌فاکتور به کارتابل واحد بازرگانی برمی‌گردد؛ کارشناس بازرگانی موارد خواسته‌شده را اصلاح می‌کند و
              <strong> بدون نیاز به ارسال مجدد به مدیریت</strong>، خودش آن را تایید و برای مشتری ارسال می‌کند.
            </p>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => onEdit(proformaId)}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-medium transition flex items-center justify-center gap-2"
            >
              ✏️ ویرایش کامل در فرم
            </button>
          </div>
        </div>
      )}

      {/* General Actions */}
      <div className="flex flex-wrap gap-3">
        <button onClick={onBack} className="px-6 py-3 border-2 border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium transition">
          بازگشت
        </button>
        {/* پیش‌فاکتورِ در انتظار دستور مدیریت (pending) تا صدور دستور مدیریت قابل ویرایش نیست */}
        {!(data.status === "pending" && !isManager) && (
        <button
          onClick={() => onEdit(proformaId)}
          className="bg-white border-2 border-indigo-200 text-indigo-600 px-6 py-3 rounded-xl font-bold hover:bg-indigo-50 transition"
        >
          ✏️ ویرایش
        </button>
        )}
        {/* دکمه چاپ — از سازنده مشترک */}
        <button
          onClick={handleOpenPrintWindow}
          className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/25 hover:shadow-xl transition flex items-center gap-2"
        >
          🖨️ چاپ
        </button>
        {/* دکمه دانلود خروجی — دقیقاً همان خروجی چاپ */}
        <button
          onClick={handleSavePdf}
          disabled={savingPdf}
          className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/25 hover:shadow-xl transition flex items-center gap-2 disabled:opacity-50"
        >
          {savingPdf ? "⏳ در حال ساخت PDF..." : "📥 دانلود PDF"}
        </button>
        {/* مشاهده خروجی — همان قالب چاپ در پنجره جدید */}
        <button
          onClick={handleOpenPrintWindow}
          className="bg-green-50 border-2 border-green-200 text-green-700 px-6 py-3 rounded-xl font-bold hover:bg-green-100 transition flex items-center gap-2"
        >
          📄 مشاهده خروجی
        </button>
      </div>
    </div>
  );
}
