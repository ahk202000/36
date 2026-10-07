"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { UserInfo } from "@/app/page";
import { computeProformaTotals, isZeroAmount, zeroAmountMessage, findZeroAmountRows, zeroRowsMessage } from "@/lib/proforma-calc";
import { formatPrice, formatQuantity, toPersianDigits, percentSuffix, normalizePriceValue, normalizeQuantityValue, COMMUNICATION_METHODS, PROFORMA_STATUS_LABELS } from "@/lib/utils";
import { buildLetterBasedBase } from "@/lib/proforma-number";
import { isSimplifiedProforma } from "@/lib/proforma-type";
import EquipmentSearch from "./EquipmentSearch";
import CompanySearch from "./CompanySearch";
import ParamSearch from "./ParamSearch";
import PersianDatePicker, { getTodayJalali } from "./PersianDatePicker";
import MessengerChatPicker from "./MessengerChatPicker";
import DocNo from "@/components/DocNo";

// کامپوننت ورودی با جداکننده هزارگان - نسخه اصلاح شده
function NumberInputWithSeparator({ 
  value, 
  onChange, 
  className = "", 
  placeholder = "",
  disabled = false
}: { 
  value: string; 
  onChange: (val: string) => void; 
  className?: string; 
  placeholder?: string;
  disabled?: boolean;
}) {
  // تبدیل اعداد فارسی/عربی به انگلیسی
  const toEnglishDigits = (str: string) => {
    return str
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  };

  const formatWithSeparator = (val: string) => {
    if (val === null || val === undefined || val === "") return "";
    const enVal = toEnglishDigits(String(val)).replace(/,/g, "").trim();
    // نقطه اعشار باید حفظ شود تا مقادیر numeric دیتابیس مثل "1500000.00"
    // به اشتباه به "150000000" تبدیل نشوند
    const cleaned = enVal.replace(/[^0-9.]/g, "");
    if (!cleaned || cleaned === ".") return "";
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed) || !isFinite(parsed)) return "";
    // قیمت‌ها ریالی و بدون اعشار هستند
    return Math.round(parsed).toLocaleString("en-US");
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const enVal = toEnglishDigits(e.target.value);
    const raw = enVal.replace(/,/g, "").replace(/[^0-9]/g, "");
    onChange(raw);
  };
  
  return (
    <input
      type="text"
      inputMode="numeric"
      value={formatWithSeparator(value)}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      dir="ltr"
    />
  );
}

interface Company {
  id: number;
  name: string;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  address?: string | null;
  contactPerson?: string | null;
}
interface ProformaType { id: number; name: string; code: string; defaultTextBefore: string; defaultTextAfter: string; defaultTextLastPage: string; signatureText: string; }
interface EquipmentItem { id: number; name: string; categoryName: string | null; parentEquipmentId?: number | null; unitPrice: string; pricePerPoint: boolean; calibrationLocation?: string | null; imagePath?: string | null; }
interface PriceHistoryItem { id: number; unitPrice: string; pointCount: number | null; quantity: string; priceDate: string; proformaNumber: string | null; }
interface MessengerChatItem {
  id: string;
  name: string;
  username?: string;
  type?: string;
  lastMessage?: string;
  linkedCompanies?: Array<{ id: number; name: string }>;
}

// ردیف نتیجه «جستجوی سابقه تجهیزات» در پیش‌فاکتورهای همه مشتریان
interface HistorySearchRow {
  id: number;
  proformaId: number;
  equipmentId: number | null;
  equipmentName: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  pointCount: number | null;
  totalPrice: string;
  calibrationLocation?: string | null;
  paramValues: unknown;
  proformaNumber: string;
  issueDate: string;
  status: string;
  typeName: string | null;
  companyId: number | null;
  companyName: string | null;
}

interface CustomerContactInfo {
  contactPerson: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  communicationMethod: string | null;
  communicationId: string | null;
}

// پارامتر انتخاب‌شده روی یک ردیف پیش‌فاکتور (هر تجهیز می‌تواند چند پارامتر داشته باشد)
interface SelectedParam {
  paramId: number | null;
  name: string;
  unit: string | null;
  count: string; // تعداد نقاط/اندازه‌های این پارامتر
}

interface EquipParam {
  id: number;
  equipmentId: number | null;
  categoryId: number | null;
  paramName: string;
  paramUnit: string | null;
}

interface LineItem {
  key: string;
  equipmentId: number | null;
  description: string;
  quantity: string;
  unitPrice: string;
  pointCount: string;
  paramName: string;
  paramUnit: string | null;
  selectedParams: SelectedParam[];
  totalPrice: string;
  isSelected: boolean;
  multiplierPercent: string;
  calibrationLocation: string;
  paramValues?: Record<string, unknown> | null;
}

// جمع تعداد نقاط همه پارامترهای یک ردیف
function sumParamCounts(params: SelectedParam[]): number {
  return params.reduce((s, p) => s + (parseInt(p.count) || 0), 0);
}

// محاسبه ضریب نقطه: اگر پارامتر انتخاب شده باشد جمع آنها، وگرنه pointCount
function getPointMultiplier(item: { selectedParams?: SelectedParam[]; pointCount: string }): number {
  const fromParams = sumParamCounts(item.selectedParams || []);
  if (fromParams > 0) return fromParams;
  const pc = parseInt(item.pointCount) || 0;
  return pc > 0 ? pc : 1;
}

interface Props {
  user: UserInfo;
  proformaId?: number | null;
  letterId?: number | null;
  onBack: () => void;
  onSaved: () => void;
}

export default function ProformaForm({ user, proformaId, letterId, onBack, onSaved }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [types, setTypes] = useState<ProformaType[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [priceHistoryData, setPriceHistoryData] = useState<PriceHistoryItem[]>([]);
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  const [phEquipId, setPhEquipId] = useState<number | null>(null);

  const [companyId, setCompanyId] = useState("");
  const [sourceLetterId, setSourceLetterId] = useState<number | null>(letterId || null);
  // اطلاعات نامه مبدأ برای پیش‌نمایش شماره پیش‌فاکتور (شماره نامه یا شماره‌نامه/۲ ...)
  const [sourceLetterInfo, setSourceLetterInfo] = useState<{ letterNumber: string; requestType: string; existingCount: number } | null>(null);
  const [customerContact, setCustomerContact] = useState<CustomerContactInfo>({
    contactPerson: "",
    phone: "",
    fax: "",
    email: "",
    address: "",
    communicationMethod: "",
    communicationId: "",
  });
  const [loadingCustomerContact, setLoadingCustomerContact] = useState(false);
  const [commMethods, setCommMethods] = useState<string[]>(COMMUNICATION_METHODS);
  const [contactDirty, setContactDirty] = useState(false);
  // وضعیت و دستور مدیریت — برای حالت «اصلاح و تایید»
  const [proformaStatus, setProformaStatus] = useState("");
  const [managerComment, setManagerComment] = useState("");
  // انتخاب سریع شناسه از چت‌های اخیر پیام‌رسان — مشابه فرم ثبت نامه
  const [recentMessengerChats, setRecentMessengerChats] = useState<MessengerChatItem[]>([]);
  const [loadingMessengerChats, setLoadingMessengerChats] = useState(false);
  const [messengerChatsError, setMessengerChatsError] = useState("");
  const [showMessengerChats, setShowMessengerChats] = useState(false);
  const [proformaTypeId, setProformaTypeId] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [validityDays, setValidityDays] = useState("20");
  const [showTotal, setShowTotal] = useState(true);
  const [textBefore, setTextBefore] = useState("");
  const [textAfter, setTextAfter] = useState("");
  const [textLastPage, setTextLastPage] = useState("");
  const [signatureText, setSignatureText] = useState("");
  const [taxPercent, setTaxPercent] = useState("10");
  const [insurancePercent, setInsurancePercent] = useState("0");
  const [travelCost, setTravelCost] = useState("0");
  const [transportCost, setTransportCost] = useState("0");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [globalMultiplierPercent, setGlobalMultiplierPercent] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [roundStep, setRoundStep] = useState("1000");
  // هزینه‌ها بصورت چک‌باکسی
  const [enableTax, setEnableTax] = useState(true);
  const [enableInsurance, setEnableInsurance] = useState(false);
  const [enableTravel, setEnableTravel] = useState(false);
  const [enableTransport, setEnableTransport] = useState(false);
  const [enableDiscount, setEnableDiscount] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);
  // قراردادها و پیوست نامه
  const [companyContracts, setCompanyContracts] = useState<Array<{
    id: number; contractNumber: string; title: string | null;
    startDate: string; endDate: string; filePath: string | null; fileName: string | null; isActive: boolean;
  }>>([]);
  const [letterAttachments, setLetterAttachments] = useState<Array<{
    id: number; attachmentType: string; fileName: string; filePath: string;
  }>>([]);
  const [editingEquip, setEditingEquip] = useState<EquipmentItem | null>(null);
  const [showEquipEdit, setShowEquipEdit] = useState(false);
  const [equipEditForm, setEquipEditForm] = useState({ name: "", unitPrice: "0", pricePerPoint: false, categoryId: "" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTexts, setShowTexts] = useState(false);
  const [proformaDescription, setProformaDescription] = useState("");
  // چک‌باکس‌های انتخاب اقلام در پاپ‌آپ کپی
  const [copyChecked, setCopyChecked] = useState<Set<string>>(new Set());
  // سوابق مشتری برای کپی اقلام
  const [showCopyPanel, setShowCopyPanel] = useState(false);
  const [pastProformas, setPastProformas] = useState<Array<{
    id: number; proformaNumber: string; typeName: string | null; issueDate: string; status: string; totalAmount: string;
    items: Array<{ id: number; equipmentId: number | null; equipmentName: string | null; description: string; quantity: string; unitPrice: string; pointCount: number | null; totalPrice: string; paramValues: unknown; calibrationLocation?: string | null }>;
  }>>([]);
  // تصاویر تجهیزات انتخاب شده برای نمایش در انتها
  const [selectedImages, setSelectedImages] = useState<Array<{ name: string; path: string }>>([]);
  // مبنای قیمت‌گذاری — آخرین قیمت هر تجهیز برای این مشتری
  const [priceBasis, setPriceBasis] = useState<Record<number, { unitPrice: string; priceDate: string; proformaNumber: string | null }>>({});
  // کش پارامترهای هر تجهیز — هر تجهیز می‌تواند چند پارامتر داشته باشد
  const [equipParams, setEquipParams] = useState<Record<number, EquipParam[]>>({});
  // ── جستجوی سابقه تجهیزات در سوابق همه مشتریان ──
  const [showHistorySearch, setShowHistorySearch] = useState(false);
  const [historyQ, setHistoryQ] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyResults, setHistoryResults] = useState<HistorySearchRow[]>([]);
  const [historyChecked, setHistoryChecked] = useState<Set<number>>(new Set());
  // پیش‌فرض: فقط «مشتریان دیگر» — با تیک این گزینه سوابق همین مشتری هم جستجو می‌شود
  const [historyIncludeOwn, setHistoryIncludeOwn] = useState(false);
  const [historySearched, setHistorySearched] = useState(false);

  const reloadEquipment = () => {
    fetch("/api/equipment").then((r) => r.json()).then(setEquipmentList).catch(() => {});
  };

  const emptyCustomerContact = (): CustomerContactInfo => ({
    contactPerson: "",
    phone: "",
    fax: "",
    email: "",
    address: "",
    communicationMethod: "",
    communicationId: "",
  });

  /** ویرایش مستقیم اطلاعات تماس مشتری از داخل فرم صدور پیش‌فاکتور */
  const updateCustomerContact = (field: keyof CustomerContactInfo, value: string) => {
    setContactDirty(true);
    setCustomerContact((prev) => ({ ...prev, [field]: value }));
  };

  const messengerKeyFromMethod = (method: string): "telegram" | "bale" | "rubika" | "eitaa" | null => {
    if (/تلگرام|telegram/i.test(method)) return "telegram";
    if (/روبیکا|rubika/i.test(method)) return "rubika";
    if (/بله|bale/i.test(method)) return "bale";
    if (/ایتا|eitaa|eita/i.test(method)) return "eitaa";
    return null;
  };

  /** دریافت چت‌های اخیر پیام‌رسان — دقیقاً مشابه فرم ثبت نامه */
  const loadRecentMessengerChats = async () => {
    const messengerKey = messengerKeyFromMethod(customerContact.communicationMethod || "");
    if (!messengerKey) return;
    setLoadingMessengerChats(true);
    setMessengerChatsError("");
    setShowMessengerChats(true);
    try {
      const res = await fetch(`/api/messenger/updates?messenger=${messengerKey}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setRecentMessengerChats([]);
        setMessengerChatsError(data.error || "دریافت شناسه‌ها ناموفق بود");
      } else {
        setRecentMessengerChats(Array.isArray(data.chats) ? data.chats : []);
        setMessengerChatsError(data.note || "");
      }
    } catch {
      setRecentMessengerChats([]);
      setMessengerChatsError("ارتباط با سرویس پیام‌رسان برقرار نشد");
    } finally {
      setLoadingMessengerChats(false);
    }
  };

  const handleCompanySelect = async (nextCompanyId: string) => {
    if (nextCompanyId === companyId) return;
    setCompanyId(nextCompanyId);
    setContactDirty(false);
    if (!nextCompanyId) {
      setCustomerContact(emptyCustomerContact());
      return;
    }

    // اطلاعات تماس همیشه از همان منبع مشترک فرم ثبت نامه واکشی می‌شود
    setCustomerContact(emptyCustomerContact());
    setLoadingCustomerContact(true);
    try {
      const res = await fetch(`/api/companies/${nextCompanyId}/last-contact`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && !data.error) {
        setCustomerContact({
          contactPerson: data.contactPerson || "",
          phone: data.phone || "",
          fax: data.fax || "",
          email: data.email || "",
          address: data.address || "",
          communicationMethod: data.communicationMethod || "",
          communicationId: data.communicationId || "",
        });
      }
    } catch {
      // بخش اطلاعات شرکت خالی می‌ماند تا اطلاعات مشتری دیگر به‌اشتباه نمایش داده نشود
    } finally {
      setLoadingCustomerContact(false);
    }
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/companies").then((r) => r.json()),
      fetch("/api/proforma-types").then((r) => r.json()),
      fetch("/api/equipment").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([c, t, e, settingRows]) => {
      setCompanies(c);
      setTypes(t);
      setEquipmentList(e);
      // گزینه‌های «طریقه ارتباط» دقیقاً همان مقادیر فرم ثبت نامه
      const commSetting = Array.isArray(settingRows)
        ? settingRows.find((row: { settingKey?: string }) => row.settingKey === "communication_methods")
        : null;
      if (commSetting?.settingValue) {
        try {
          const parsed = JSON.parse(commSetting.settingValue);
          if (Array.isArray(parsed) && parsed.length > 0) setCommMethods(parsed.map(String));
        } catch {
          // مقادیر پیش‌فرض حفظ می‌شوند
        }
      }

      if (proformaId) {
        fetch(`/api/proforma/${proformaId}`)
          .then((r) => r.json())
          .then((d) => {
            setCompanyId(d.companyId?.toString() || "");
            setSourceLetterId(d.letterId || null);
            setProformaStatus(d.status || "");
            setManagerComment(d.managerComment || "");
            // برای نمایش بالای فرم، اطلاعات اولیه تماس از خود پیش‌فاکتور خوانده می‌شود
            setCustomerContact((prev) => ({
              ...prev,
              contactPerson: d.letterContactPerson || prev.contactPerson,
              phone: d.letterPhone || "",
              fax: d.letterFax || "",
              email: d.companyEmail || "",
              communicationMethod: d.communicationMethod || "",
              communicationId: d.communicationId || "",
            }));
            if (d.companyId) {
              // جدیدترین اطلاعات مشترک شرکت واکشی می‌شود؛
              // اما مقدار ذخیره‌شده روی خود این پیش‌فاکتور اولویت دارد
              fetch(`/api/companies/${d.companyId}/last-contact`, { cache: "no-store" })
                .then((r) => r.json())
                .then((contact) => {
                  if (!contact?.error) {
                    setCustomerContact({
                      contactPerson: contact.contactPerson || "",
                      phone: contact.phone || "",
                      fax: contact.fax || "",
                      email: contact.email || "",
                      address: contact.address || "",
                      communicationMethod: d.communicationMethod || contact.communicationMethod || "",
                      communicationId: d.communicationId || contact.communicationId || "",
                    });
                  }
                })
                .catch(() => {});
            }
            setProformaTypeId(d.proformaTypeId?.toString() || "");
            setIssueDate(d.issueDate || "");
            setValidityDays(d.validityDays?.toString() || "20");
            setShowTotal(d.showTotal);
            setTextBefore(d.textBefore || "");
            setTextAfter(d.textAfter || "");
            setTextLastPage(d.textLastPage || "");
            setSignatureText(d.signatureText || "");
            const tp = d.taxPercent || "10";
            const ip = d.insurancePercent || "0";
            // مقادیر numeric دیتابیس («500000.00») باید نرمال شوند تا در ورودی‌های
            // دارای جداکننده هزارگان دو رقم اضافه نمایش داده نشوند
            const trC = normalizePriceValue(d.travelCost);
            const tpC = normalizePriceValue(d.transportCost);
            const dp = d.discountPercent || "0";
            setTaxPercent(tp);
            setInsurancePercent(ip);
            setTravelCost(trC);
            setTransportCost(tpC);
            setDiscountPercent(dp);
            // چک‌باکس‌ها بر اساس مقدار
            setEnableTax(parseFloat(tp) > 0);
            setEnableInsurance(parseFloat(ip) > 0);
            setEnableTravel(parseFloat(trC) > 0);
            setEnableTransport(parseFloat(tpC) > 0);
            setEnableDiscount(parseFloat(dp) > 0);
            setGlobalMultiplierPercent(d.globalMultiplierPercent || "");
            setTargetAmount(d.targetAmount ? normalizePriceValue(d.targetAmount) : "");
            if (d.items) {
              setItems(
                d.items.map((it: Record<string, unknown>, idx: number) => ({
                  key: `item-${idx}-${Date.now()}`,
                  equipmentId: it.equipmentId as number | null,
                  description: (it.description as string) || (it.equipmentName as string) || "",
                  quantity: normalizeQuantityValue(it.quantity as string),
                  unitPrice: normalizePriceValue(it.unitPrice as string),
                  pointCount: (it.pointCount as unknown as number)?.toString() || "",
                  paramName: (it.paramValues as unknown as { paramName?: string })?.paramName || (it as unknown as { paramName?: string }).paramName || "",
                  paramUnit: (it.paramValues as unknown as { paramUnit?: string })?.paramUnit || null,
                  selectedParams: ((it.paramValues as unknown as { params?: SelectedParam[] })?.params) || [],
                  totalPrice: (it.totalPrice as string) || "0",
                  isSelected: (it.isSelected as boolean) !== false,
                  multiplierPercent: (it.multiplierPercent as string) || "",
                  calibrationLocation: (it.calibrationLocation as string) || "",
                  paramValues: (it.paramValues as unknown as Record<string, unknown>) || null,
                }))
              );
            }
            setLoading(false);
          })
          .catch(() => setLoading(false));
      } else {
        if (letterId) {
          fetch(`/api/letters/${letterId}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.companyId) setCompanyId(d.companyId.toString());
              setSourceLetterId(letterId || d.id || null);
              setSourceLetterInfo({
                letterNumber: d.letterNumber || "",
                requestType: d.requestType || "",
                existingCount: Array.isArray(d.proformas) ? d.proformas.length : 0,
              });
              setCustomerContact({
                contactPerson: d.contactPerson || "",
                phone: d.phone || "",
                fax: d.fax || "",
                email: d.email || d.companyEmail || "",
                address: d.address || d.companyAddress || "",
                communicationMethod: d.communicationMethod || "",
                communicationId: d.communicationId || "",
              });
              // Load letter attachments
              if (d.attachments && Array.isArray(d.attachments)) {
                setLetterAttachments(d.attachments.map((a: Record<string, unknown>) => ({
                  id: a.id as number,
                  attachmentType: (a.attachmentType as string) || "سایر",
                  fileName: (a.fileName as string) || "",
                  filePath: (a.filePath as string) || (a.file_path as string) || "",
                })));
              }
            })
            .catch(() => {});
        }
        // Set today for new proforma
        if (!issueDate) {
          try {
            setIssueDate(getTodayJalali());
          } catch {}
        }
        // ── مقادیر پیش‌فرض از «تنظیمات عمومی»: درصد ارزش افزوده و درصد بیمه ──
        // (ایراد قبلی: مقدار پیش‌فرض بیمهٔ واردشده در تنظیمات هیچ‌وقت در فرم اعمال نمی‌شد)
        const readSetting = (key: string): string => {
          if (!Array.isArray(settingRows)) return "";
          const row = settingRows.find((r: { settingKey?: string }) => r.settingKey === key);
          return row?.settingValue !== undefined && row?.settingValue !== null ? String(row.settingValue).trim() : "";
        };
        const defaultTaxRaw = readSetting("tax_percent");
        const defaultInsRaw = readSetting("insurance_percent");
        const defaultTax = defaultTaxRaw !== "" && !isNaN(parseFloat(defaultTaxRaw)) ? parseFloat(defaultTaxRaw) : 10;
        const defaultIns = defaultInsRaw !== "" && !isNaN(parseFloat(defaultInsRaw)) ? parseFloat(defaultInsRaw) : 0;
        setTaxPercent(String(defaultTax));
        setInsurancePercent(String(defaultIns));

        // پیش‌فرض چک‌باکس‌ها برای فاکتور جدید: مالیات روشن (اگر درصد > ۰)،
        // بیمه بر اساس مقدار پیش‌فرض تنظیمات، بقیه خاموش
        setEnableTax(defaultTax > 0);
        setEnableInsurance(defaultIns > 0);
        setEnableTravel(false);
        setEnableTransport(false);
        setEnableDiscount(false);
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, [proformaId, letterId]);

  // Load contracts and past proformas when company changes
  useEffect(() => {
    if (companyId) {
      fetch(`/api/contracts?companyId=${companyId}`)
        .then((r) => r.json())
        .then((d) => setCompanyContracts(Array.isArray(d) ? d : []))
        .catch(() => setCompanyContracts([]));
      fetch(`/api/proforma/copy-items?companyId=${companyId}${proformaId ? `&excludeId=${proformaId}` : ""}`)
        .then((r) => r.json())
        .then((d) => setPastProformas(Array.isArray(d) ? d : []))
        .catch(() => setPastProformas([]));
      // ریست مبنای قیمت‌گذاری وقتی مشتری عوض می‌شه
      setPriceBasis({});
    } else {
      setCompanyContracts([]);
      setPastProformas([]);
      setPriceBasis({});
    }
  }, [companyId, proformaId]);

  // بارگذاری خودکار مبنای قیمت‌گذاری برای اقلامی که تجهیز دارند
  useEffect(() => {
    if (!companyId) return;
    const equipIds = items
      .filter(it => it.equipmentId && !priceBasis[it.equipmentId])
      .map(it => it.equipmentId!);
    const uniqueIds = [...new Set(equipIds)];
    if (uniqueIds.length === 0) return;

    uniqueIds.forEach(eqId => {
      fetch(`/api/price-history?equipmentId=${eqId}&companyId=${companyId}${proformaId ? `&excludeProformaId=${proformaId}` : ""}`)
        .then(r => r.json())
        .then((data: PriceHistoryItem[]) => {
          if (data.length > 0) {
            // آخرین سابقه قیمت
            const latest = data[0];
            setPriceBasis(prev => ({
              ...prev,
              [eqId]: {
                unitPrice: latest.unitPrice,
                priceDate: latest.priceDate,
                proformaNumber: latest.proformaNumber,
              }
            }));
          }
        })
        .catch(() => {});
    });
  }, [companyId, items.length, proformaId]);

  // ── جستجوی سابقه تجهیزات در سوابق مشتریان (با تأخیر کوتاه هنگام تایپ) ──
  // پیش‌فرض: جستجو در «مشتریان دیگر» — با فعال‌کردن تیک، سوابق همین مشتری هم جستجو می‌شود
  useEffect(() => {
    if (!showHistorySearch) return;
    setHistoryLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (historyQ.trim()) params.set("q", historyQ.trim());
        if (!historyIncludeOwn && companyId) params.set("excludeCompanyId", companyId);
        if (proformaId) params.set("excludeProformaId", String(proformaId));
        const res = await fetch(`/api/proforma/search-history?${params.toString()}`, { cache: "no-store" });
        const data = await res.json();
        setHistoryResults(Array.isArray(data) ? data : []);
      } catch {
        setHistoryResults([]);
      } finally {
        setHistoryLoading(false);
        setHistorySearched(true);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [showHistorySearch, historyQ, historyIncludeOwn, companyId, proformaId]);

  // ریست وضعیت پنل جستجوی سابقه هنگام بازشدن
  const openHistorySearch = () => {
    setHistoryQ("");
    setHistoryChecked(new Set());
    setHistorySearched(false);
    setHistoryResults([]);
    setShowHistorySearch(true);
  };

  // افزودن اقلام انتخاب‌شده از نتایج جستجو به لیست پیش‌فاکتور (همان منطق کپی اقلام)
  const addHistoryItems = (rows: HistorySearchRow[]) => {
    copySelectedItems(rows.map((r) => ({
      id: r.id,
      equipmentId: r.equipmentId,
      equipmentName: r.equipmentName,
      description: r.description,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      pointCount: r.pointCount,
      totalPrice: r.totalPrice,
      paramValues: r.paramValues,
      calibrationLocation: r.calibrationLocation,
    })));
  };

  // کلید یکتای هر قلم برای تشخیص تکراری — بر اساس تجهیز، و در نبود آن شرح
  const dupKeyOf = (equipId: number | null | undefined, desc: string | null | undefined): string | null => {
    if (equipId) return `eq:${equipId}`;
    const d = (desc || "").replace(/\s+/g, " ").trim().toLowerCase();
    return d ? `desc:${d}` : null;
  };

  // بررسی تکراری بودن اقلام نسبت به ردیف‌های فعلی
  const isDuplicate = (equipId: number | null, desc: string) => {
    const key = dupKeyOf(equipId, desc);
    if (!key) return false;
    return items.some(it => dupKeyOf(it.equipmentId, it.description) === key);
  };

  const showDuplicateToast = (count = 1) => {
    const w = window as unknown as { showToast?: (m: string) => void };
    const msg = count > 1 ? `${count} مورد تکراری بود و اضافه نشد` : "مورد تکراری بود و اضافه نشد";
    if (w.showToast) {
      w.showToast(msg);
    } else {
      alert(msg);
    }
  };

  // کپی اقلام انتخاب شده از پاپ‌آپ
  const copySelectedItems = (selectedItemsList: typeof pastProformas[0]["items"]) => {
    // یک تجهیز ممکن است در چند پیش‌فاکتور قبلی تکرار شده باشد؛ بنابراین علاوه بر
    // مقایسه با ردیف‌های فعلی، باید تکراری‌های داخل خودِ دسته انتخابی هم حذف شوند
    const seen = new Set<string>();
    for (const it of items) {
      const k = dupKeyOf(it.equipmentId, it.description);
      if (k) seen.add(k);
    }

    const nonDuplicate: typeof selectedItemsList = [];
    for (const it of selectedItemsList) {
      const k = dupKeyOf(it.equipmentId, it.description || it.equipmentName || "");
      if (!k || seen.has(k)) continue;
      seen.add(k);
      nonDuplicate.push(it);
    }
    const dupCount = selectedItemsList.length - nonDuplicate.length;

    if (nonDuplicate.length === 0) {
      showDuplicateToast(dupCount || 1);
      return;
    }

    const newItems: LineItem[] = nonDuplicate.map((it, idx) => ({
      key: `copy-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      equipmentId: it.equipmentId,
      description: it.description || it.equipmentName || "",
      quantity: normalizeQuantityValue(it.quantity),
      unitPrice: normalizePriceValue(it.unitPrice),
      pointCount: it.pointCount?.toString() || "",
      paramName: (it.paramValues as unknown as { paramName?: string })?.paramName || "",
      paramUnit: (it.paramValues as unknown as { paramUnit?: string })?.paramUnit || null,
      selectedParams: ((it.paramValues as unknown as { params?: SelectedParam[] })?.params) || [],
      totalPrice: it.totalPrice || "0",
      isSelected: true,
      multiplierPercent: "",
      calibrationLocation: (it as unknown as { calibrationLocation?: string })?.calibrationLocation || "",
      paramValues: it.paramValues as Record<string, unknown> | null,
    }));
    // لایه ایمنی نهایی: در برابر کلیک سریع پشت‌سرهم و state قدیمی
    setItems(prev => {
      const existing = new Set<string>();
      for (const it of prev) {
        const k = dupKeyOf(it.equipmentId, it.description);
        if (k) existing.add(k);
      }
      const safe = newItems.filter(ni => {
        const k = dupKeyOf(ni.equipmentId, ni.description);
        if (!k || existing.has(k)) return false;
        existing.add(k);
        return true;
      });
      return safe.length ? [...prev, ...safe] : prev;
    });

    const w = window as unknown as { showToast?: (m: string) => void };
    if (dupCount > 0) {
      if (w.showToast) w.showToast(`${newItems.length} ردیف کپی شد — ${dupCount} مورد تکراری اضافه نشد`);
    } else {
      if (w.showToast) w.showToast(`${newItems.length} ردیف از سوابق کپی شد`);
    }
  };

  // اضافه کردن زیرتجهیزات خودکار — بدون تکرار
  const handleSelectMultipleEquip = (equips: EquipmentItem[]) => {
    // حذف تکراری‌ها هم نسبت به ردیف‌های فعلی و هم داخل خودِ دسته انتخابی
    const seenEq = new Set<string>();
    for (const it of items) {
      const k = dupKeyOf(it.equipmentId, it.description);
      if (k) seenEq.add(k);
    }
    const nonDup: EquipmentItem[] = [];
    for (const eq of equips) {
      const k = dupKeyOf(eq.id, eq.name);
      if (!k || seenEq.has(k)) continue;
      seenEq.add(k);
      nonDup.push(eq);
    }
    const dupCount = equips.length - nonDup.length;
    if (nonDup.length === 0) {
      showDuplicateToast(dupCount || 1);
      return;
    }
    const newItems: LineItem[] = nonDup.map((eq, idx) => ({
      key: `multi-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      equipmentId: eq.id,
      description: eq.name,
      quantity: "1",
      unitPrice: normalizePriceValue(eq.unitPrice),
      pointCount: "",
      paramName: "",
      paramUnit: null,
      selectedParams: [],
      totalPrice: normalizePriceValue(eq.unitPrice),
      isSelected: true,
      multiplierPercent: "",
      calibrationLocation: eq.calibrationLocation || "",
      paramValues: null,
    }));
    // لایه ایمنی نهایی در برابر state قدیمی
    setItems(prev => {
      const existing = new Set<string>();
      for (const it of prev) {
        const k = dupKeyOf(it.equipmentId, it.description);
        if (k) existing.add(k);
      }
      const safe = newItems.filter(ni => {
        const k = dupKeyOf(ni.equipmentId, ni.description);
        if (!k || existing.has(k)) return false;
        existing.add(k);
        return true;
      });
      return safe.length ? [...prev, ...safe] : prev;
    });
    // Check for images
    nonDup.forEach(eq => {
      if (eq.imagePath) {
        setSelectedImages(prev => {
          if (prev.some(img => img.path === eq.imagePath)) return prev;
          return [...prev, { name: eq.name, path: eq.imagePath! }];
        });
      }
    });
    const w = window as unknown as { showToast?: (m: string) => void };
    if (dupCount > 0) {
      if (w.showToast) w.showToast(`${newItems.length} تجهیز اضافه شد — ${dupCount} مورد تکراری اضافه نشد`);
    } else {
      if (w.showToast) w.showToast(`${newItems.length} تجهیز اضافه شد`);
    }
  };

  const handleTypeChange = (typeId: string) => {
    setProformaTypeId(typeId);
    const t = types.find((x) => x.id.toString() === typeId);
    if (t) {
      setTextBefore(t.defaultTextBefore || "");
      setTextAfter(t.defaultTextAfter || "");
      // نامه ستاد و فروش «متن سوم/صفحه آخر» ندارند — مقدار پیش‌فرض آن اعمال نمی‌شود
      setTextLastPage(isSimplifiedProforma(t.name, t.code) ? "" : (t.defaultTextLastPage || ""));
      setSignatureText(t.signatureText || "");
    }
  };

  // پیش‌فاکتور «نامه ستاد» و «فروش»: ستون «محل کالیبره» و فیلد «صفحه آخر» در فرم پنهان است
  const selectedType = types.find((x) => x.id.toString() === proformaTypeId);
  const isSetad = isSimplifiedProforma(selectedType?.name, selectedType?.code);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        key: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        equipmentId: null,
        description: "",
        quantity: "1",
        unitPrice: "0",
        pointCount: "",
        paramName: "",
        paramUnit: null,
        selectedParams: [],
        totalPrice: "0",
        isSelected: true,
        multiplierPercent: "",
        calibrationLocation: "",
        paramValues: null,
      },
    ]);
  };

  const openEquipEdit = (equip: EquipmentItem) => {
    setEditingEquip(equip);
    setEquipEditForm({
      name: equip.name,
      unitPrice: normalizePriceValue(equip.unitPrice),
      pricePerPoint: equip.pricePerPoint,
      categoryId: (equip as unknown as { categoryId?: number | null }).categoryId?.toString() || "",
    });
    setShowEquipEdit(true);
  };

  const saveEquipEdit = async () => {
    if (!editingEquip) return;
    const res = await fetch(`/api/equipment/${editingEquip.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: equipEditForm.name,
        unitPrice: equipEditForm.unitPrice,
        pricePerPoint: equipEditForm.pricePerPoint,
        categoryId: equipEditForm.categoryId ? parseInt(equipEditForm.categoryId) : null,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEquipmentList((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)));
      // Update items that use this equipment
      setItems((prev) =>
        prev.map((it) =>
          it.equipmentId === updated.id
            ? { ...it, description: updated.name, unitPrice: normalizePriceValue(updated.unitPrice), totalPrice: (() => { const qty = parseFloat(it.quantity)||1; const points = parseInt(it.pointCount)||1; return (qty * parseFloat(updated.unitPrice||"0") * (updated.pricePerPoint ? points : 1)).toString(); })() }
            : it
        )
      );
      setShowEquipEdit(false);
      setEditingEquip(null);
    } else {
      // نام تکراری یا خطای دیگر
      const data = await res.json().catch(() => ({}));
      alert(data.error || "خطا در ذخیره تجهیز");
    }
  };

  // کلید میانبر افزودن ردیف: Insert یا Ctrl+Enter یا Alt+N
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isInsert = e.key === "Insert";
      const isCtrlEnter = e.ctrlKey && e.key === "Enter";
      const isAltN = e.altKey && (e.key.toLowerCase() === "n" || e.key === "ن");
      const isPlus = e.key === "+" && (e.ctrlKey || e.altKey);
      if (isInsert || isCtrlEnter || isAltN || isPlus) {
        const target = e.target as HTMLElement;
        const isTextArea = target?.tagName === "TEXTAREA";
        if (isTextArea && !e.ctrlKey && !e.altKey && e.key !== "Insert") return;
        e.preventDefault();
        addItem();
        const w = window as unknown as { showToast?: (msg: string) => void };
        if (w.showToast) w.showToast("➕ ردیف جدید اضافه شد (Insert / Ctrl+Enter)");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const removeItem = (key: string) => {
    setItems(items.filter((i) => i.key !== key));
  };

  const updateItem = (key: string, field: keyof LineItem, value: string | boolean | number | null) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.key !== key) return item;
        const updated = { ...item, [field]: value } as LineItem;

        if (field === "equipmentId" && value) {
          const eq = equipmentList.find((e) => e.id === value);
          if (eq) {
            updated.description = eq.name;
            updated.unitPrice = normalizePriceValue(eq.unitPrice);
            // keep paramName, but clear pointCount if not point-based? Keep for generic use
            // if equipment has params, suggest first param
          }
        }
        if (field === "paramName" as unknown as keyof LineItem) {
          updated.paramName = value as string;
          // store in paramValues for persistence
          updated.paramValues = { paramName: value, paramUnit: (updated as unknown as { paramUnit?: string }).paramUnit };
        }

        // محاسبه مبلغ — ضریب از جمع تعداد پارامترها، در نبود آن از «نقطه»
        const qty = parseFloat(updated.quantity) || 0;
        const price = parseFloat(updated.unitPrice) || 0;
        const pointMult = getPointMultiplier(updated);
        const mult = parseFloat(updated.multiplierPercent) || 0;

        let lineTotal = qty * price * pointMult;
        if (mult) {
          lineTotal = lineTotal * (1 + mult / 100);
        }
        updated.totalPrice = lineTotal.toString();

        return updated;
      })
    );
  };

  // ── بارگذاری پارامترهای یک تجهیز (با کش) ──
  const loadEquipParams = useCallback(async (equipId: number): Promise<EquipParam[]> => {
    if (equipParams[equipId]) return equipParams[equipId];
    try {
      const res = await fetch(`/api/equipment-params?equipmentId=${equipId}`);
      const data: EquipParam[] = await res.json();
      const list = Array.isArray(data) ? data : [];
      setEquipParams((prev) => ({ ...prev, [equipId]: list }));
      return list;
    } catch {
      setEquipParams((prev) => ({ ...prev, [equipId]: [] }));
      return [];
    }
  }, [equipParams]);

  // بارگذاری پارامترهای همه تجهیزات موجود در ردیف‌ها
  useEffect(() => {
    const ids = Array.from(new Set(items.map((i) => i.equipmentId).filter((v): v is number => !!v)));
    ids.forEach((id) => {
      if (!equipParams[id]) loadEquipParams(id);
    });
  }, [items, equipParams, loadEquipParams]);

  // محاسبه مجدد مبلغ ردیف بر اساس پارامترها
  const recalcLine = (it: LineItem): LineItem => {
    const qty = parseFloat(it.quantity) || 0;
    const price = parseFloat(it.unitPrice) || 0;
    const pointMult = getPointMultiplier(it);
    const mult = parseFloat(it.multiplierPercent) || 0;
    let lineTotal = qty * price * pointMult;
    if (mult) lineTotal = lineTotal * (1 + mult / 100);
    return { ...it, totalPrice: lineTotal.toString() };
  };

  // افزودن/حذف پارامتر روی یک ردیف
  const toggleItemParam = (itemKey: string, param: EquipParam) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;
        const exists = it.selectedParams.some((p) => p.paramId === param.id);
        const nextParams = exists
          ? it.selectedParams.filter((p) => p.paramId !== param.id)
          : [
              ...it.selectedParams,
              { paramId: param.id, name: param.paramName, unit: param.paramUnit, count: "1" },
            ];
        const updated: LineItem = {
          ...it,
          selectedParams: nextParams,
          paramName: nextParams[0]?.name || "",
          paramUnit: nextParams[0]?.unit || null,
          paramValues: nextParams.length
            ? { params: nextParams, paramName: nextParams[0].name, paramUnit: nextParams[0].unit }
            : null,
        };
        return recalcLine(updated);
      })
    );
  };

  // تغییر تعداد یک پارامتر روی ردیف
  const updateItemParamCount = (itemKey: string, paramId: number | null, count: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;
        const nextParams = it.selectedParams.map((p) =>
          p.paramId === paramId ? { ...p, count } : p
        );
        const updated: LineItem = {
          ...it,
          selectedParams: nextParams,
          paramValues: nextParams.length
            ? { params: nextParams, paramName: nextParams[0].name, paramUnit: nextParams[0].unit }
            : null,
        };
        return recalcLine(updated);
      })
    );
  };

  const [phItemKey, setPhItemKey] = useState<string | null>(null);

  const viewPriceHistory = async (equipId: number, itemKey?: string) => {
    if (!companyId) {
      alert("ابتدا مشتری را انتخاب کنید");
      return;
    }
    setPhEquipId(equipId);
    setPhItemKey(itemKey ?? null);
    try {
      const res = await fetch(`/api/price-history?equipmentId=${equipId}&companyId=${companyId}${proformaId ? `&excludeProformaId=${proformaId}` : ""}`);
      const data = await res.json();
      setPriceHistoryData(data);
      setShowPriceHistory(true);
    } catch {
      alert("خطا در دریافت سوابق قیمت");
    }
  };

  // اعمال قیمت سابقه روی ردیف فعلی پیش‌فاکتور با کلیک روی سطر
  const applyPriceHistory = (h: PriceHistoryItem) => {
    if (!phItemKey) {
      setShowPriceHistory(false);
      return;
    }
    const target = items.find((it) => it.key === phItemKey);
    if (!target) {
      setShowPriceHistory(false);
      return;
    }
    // همه فیلدها در یک به‌روزرسانی اتمیک اعمال می‌شوند تا مقادیر همدیگر را بازنویسی نکنند
    // و مقادیر numeric دیتابیس («1500000.00») قبل از نشستن در فیلد نرمال می‌شوند
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== phItemKey) return it;
        const updated: LineItem = { ...it, unitPrice: normalizePriceValue(h.unitPrice) };
        if (h.pointCount !== null && h.pointCount !== undefined) {
          updated.pointCount = String(h.pointCount);
        }
        if (h.quantity !== null && h.quantity !== undefined && String(h.quantity) !== "") {
          updated.quantity = normalizeQuantityValue(h.quantity);
        }
        return recalcLine(updated);
      })
    );
    setShowPriceHistory(false);
    setPhItemKey(null);
    const w = window as unknown as { showToast?: (m: string) => void };
    const msg = `قیمت ${formatPrice(h.unitPrice)} ریال روی ردیف اعمال شد`;
    if (w.showToast) w.showToast(msg); else alert(msg);
  };

  const calculateSubtotal = useCallback(() => {
    return items
      .filter((i) => i.isSelected)
      .reduce((sum, i) => sum + (parseFloat(i.totalPrice) || 0), 0);
  }, [items]);

  // محاسبه یکپارچه با ترتیب صحیح:
  // جمع اقلام → کسر تخفیف → کسر بیمه → افزودن هزینه‌ها → ارزش افزوده (آخرین مرحله)
  const totals = useMemo(
    () =>
      computeProformaTotals({
        subtotal: calculateSubtotal(),
        discountPercent: enableDiscount ? discountPercent : "0",
        insurancePercent: enableInsurance ? insurancePercent : "0",
        travelCost: enableTravel ? travelCost : "0",
        transportCost: enableTransport ? transportCost : "0",
        taxPercent: enableTax ? taxPercent : "0",
      }),
    [calculateSubtotal, discountPercent, insurancePercent, travelCost, transportCost, taxPercent, enableDiscount, enableInsurance, enableTravel, enableTransport, enableTax]
  );

  const calculateBeforeTax = useCallback(() => totals.beforeTax, [totals]);
  const calculateTaxAmount = useCallback(() => totals.taxAmount, [totals]);
  const calculateTotal = useCallback(() => totals.totalAmount, [totals]);

  const applyGlobalMultiplier = () => {
    const mult = parseFloat(globalMultiplierPercent);
    if (isNaN(mult)) return;
    setItems(
      items.map((item) => {
        if (!item.isSelected) return item;
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unitPrice) || 0;
        const eqForPoints = equipmentList.find((e) => e.id === item.equipmentId);
        const hasPoint = eqForPoints ? eqForPoints.pricePerPoint : !!item.pointCount;
        const points = parseInt(item.pointCount) || 0;
        const pointMult = points > 0 ? points : 1;
        const newPrice = price * (1 + mult / 100);
        const lineTotal = qty * newPrice * pointMult;
        return { ...item, unitPrice: newPrice.toFixed(0), totalPrice: lineTotal.toString(), multiplierPercent: mult.toString() };
      })
    );
  };

  const applyTargetAmount = () => {
    const target = parseFloat(targetAmount);
    if (isNaN(target) || target <= 0) return;
    const currentSub = calculateSubtotal();
    if (currentSub <= 0) return;
    const ratio = target / currentSub;
    setItems(
      items.map((item) => {
        if (!item.isSelected) return item;
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unitPrice) || 0;
        const eqForPoints = equipmentList.find((e) => e.id === item.equipmentId);
        const hasPoint = eqForPoints ? eqForPoints.pricePerPoint : !!item.pointCount;
        const points = hasPoint ? (parseInt(item.pointCount) || 1) : 1;
        const newPrice = price * ratio;
        const lineTotal = qty * newPrice * (hasPoint ? points : 1);
        return { ...item, unitPrice: newPrice.toFixed(0), totalPrice: lineTotal.toString() };
      })
    );
  };

  const applyRounding = () => {
    const step = parseInt(roundStep);
    if (isNaN(step) || step <= 0) return;
    if (!confirm(`آیا می‌خواهید قیمت اقلام انتخاب شده به نزدیک‌ترین ${step.toLocaleString("fa-IR")} رند شود؟`)) return;
    setItems(
      items.map((item) => {
        if (!item.isSelected) return item;
        const qty = parseFloat(item.quantity) || 0;
        const eqForPoints = equipmentList.find((e) => e.id === item.equipmentId);
        const hasPoint = eqForPoints ? eqForPoints.pricePerPoint : !!item.pointCount;
        const points = hasPoint ? (parseInt(item.pointCount) || 1) : 1;
        let price = parseFloat(item.unitPrice) || 0;
        price = Math.round(price / step) * step;
        const lineTotal = qty * price * (hasPoint ? points : 1);
        const roundedTotal = Math.round(lineTotal / step) * step;
        return { ...item, unitPrice: price.toFixed(0), totalPrice: roundedTotal.toString() };
      })
    );
  };

  const handleSave = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!companyId || !proformaTypeId || !issueDate) {
      const message = "لطفاً شرکت، نوع پیش‌فاکتور و تاریخ صدور را تکمیل کنید";
      if (silent) throw new Error(message);
      alert(message);
      return;
    }

    // نام مسئول مانند فرم ثبت نامه، برای صدور و تأیید پیش‌فاکتور الزامی است
    const responsiblePerson = (
      customerContact.contactPerson ||
      companies.find((company) => company.id.toString() === companyId)?.contactPerson ||
      ""
    ).trim();
    if (!responsiblePerson) {
      const message = "نام مسئول مشتری الزامی است؛ لطفاً در بخش اطلاعات تماس مشتری وارد کنید";
      if (silent) throw new Error(message);
      alert(message);
      requestAnimationFrame(() => {
        const input = document.getElementById("proforma-contact-person") as HTMLInputElement | null;
        input?.scrollIntoView({ behavior: "smooth", block: "center" });
        input?.focus();
      });
      return;
    }

    if (
      (customerContact.communicationMethod && !customerContact.communicationId?.trim()) ||
      (!customerContact.communicationMethod && customerContact.communicationId?.trim())
    ) {
      alert("برای ارسال پیام‌رسان، روش ارتباط و شناسه ارتباط مشتری باید هر دو تکمیل شوند");
      return;
    }
    // بررسی حداقل یک تجهیز
    if (items.length === 0 || !items.some(it => it.description.trim() || it.equipmentId)) {
      alert("حداقل یک تجهیز یا قلم باید وارد شود");
      return;
    }
    setSaving(true);
    try {
      // مقادیر هزینه‌ها بر اساس چک‌باکس
      const effectiveTaxPercent = enableTax ? taxPercent : "0";
      const effectiveInsurancePercent = enableInsurance ? insurancePercent : "0";
      const effectiveTravelCost = enableTravel ? travelCost : "0";
      const effectiveTransportCost = enableTransport ? transportCost : "0";
      const effectiveDiscountPercent = enableDiscount ? discountPercent : "0";

      // محاسبه صحیح (یکپارچه با سرور):
      // جمع اقلام → کسر تخفیف → کسر بیمه → افزودن هزینه‌ها → ارزش افزوده (آخرین مرحله)
      const t = computeProformaTotals({
        subtotal: calculateSubtotal(),
        discountPercent: effectiveDiscountPercent,
        insurancePercent: effectiveInsurancePercent,
        travelCost: effectiveTravelCost,
        transportCost: effectiveTransportCost,
        taxPercent: effectiveTaxPercent,
      });
      const subtotalVal = t.subtotal;
      const discAmount = t.discountAmount;
      const insAmount = t.insuranceAmount;
      const taxAmount = t.taxAmount;
      const totalVal = t.totalAmount;

      const payload = {
        companyId: parseInt(companyId),
        proformaTypeId: parseInt(proformaTypeId),
        letterId: sourceLetterId || null,
        communicationMethod: customerContact.communicationMethod?.trim() || null,
        communicationId: customerContact.communicationId?.trim() || null,
        issueDate,
        validityDays: parseInt(validityDays) || 20,
        showTotal,
        subtotal: subtotalVal.toString(),
        discountPercent: effectiveDiscountPercent,
        discountAmount: discAmount.toString(),
        taxPercent: effectiveTaxPercent,
        taxAmount: taxAmount.toString(),
        insurancePercent: effectiveInsurancePercent,
        insuranceAmount: insAmount.toString(),
        travelCost: effectiveTravelCost,
        transportCost: effectiveTransportCost,
        totalAmount: totalVal.toString(),
        proformaDescription: proformaDescription || null,
        textBefore,
        textAfter,
        // نامه ستاد «متن سوم/صفحه آخر» ندارد — مقدارش همیشه خالی ذخیره می‌شود
        textLastPage: isSetad ? "" : textLastPage,
        signatureText,
        globalMultiplierPercent: globalMultiplierPercent || null,
        targetAmount: targetAmount || null,
        createdBy: user.id,
        items: items.map((i, idx) => {
          const sel = i.selectedParams || [];
          // شرح: نام تجهیز + پارامترها با تعداد (مثال: «هر نقطه دمایی ×۹»)
          const paramsLabel = sel.length
            ? sel.map((p) => `${p.name}${parseInt(p.count) > 1 ? ` ×${p.count}` : ""}`).join("، ")
            : i.paramName;
          const totalPoints = sumParamCounts(sel);
          return {
            equipmentId: i.equipmentId,
            description: paramsLabel ? `${i.description} (${paramsLabel})` : i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            pointCount: totalPoints > 0 ? totalPoints : i.pointCount ? parseInt(i.pointCount) : null,
            totalPrice: i.totalPrice,
            rowOrder: idx,
            isSelected: i.isSelected,
            multiplierPercent: i.multiplierPercent || null,
            calibrationLocation: i.calibrationLocation || null,
            paramValues: sel.length
              ? { params: sel, paramName: sel[0].name, paramUnit: sel[0].unit, pointCount: totalPoints }
              : i.paramName
              ? { paramName: i.paramName, paramUnit: i.paramUnit, pointCount: i.pointCount }
              : null,
          };
        }),
      };

      // همگام‌سازی اطلاعات تماس با کارت شرکت تا فرم ثبت نامه همین مقادیر را نشان دهد
      if (contactDirty) {
        const contactResponse = await fetch(`/api/companies/${companyId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactPerson: customerContact.contactPerson?.trim() || "",
            phone: customerContact.phone?.trim() || "",
            fax: customerContact.fax?.trim() || "",
            email: customerContact.email?.trim() || "",
            address: customerContact.address?.trim() || "",
            communicationMethod: customerContact.communicationMethod?.trim() || "",
            communicationId: customerContact.communicationId?.trim() || "",
            updatedBy: user.id,
          }),
        });
        if (!contactResponse.ok) {
          const contactError = await contactResponse.json().catch(() => ({}));
          throw new Error(contactError.error || "ذخیره اطلاعات تماس مشتری ناموفق بود");
        }
        setCompanies((prev) =>
          prev.map((company) =>
            company.id.toString() === companyId
              ? {
                  ...company,
                  contactPerson: customerContact.contactPerson || null,
                  phone: customerContact.phone || null,
                  fax: customerContact.fax || null,
                  email: customerContact.email || null,
                  address: customerContact.address || null,
                  communicationMethod: customerContact.communicationMethod || null,
                  communicationId: customerContact.communicationId || null,
                }
              : company
          )
        );
      }

      const saveResponse = proformaId
        ? await fetch(`/api/proforma/${proformaId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, updatedBy: user.id }),
          })
        : await fetch("/api/proforma", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const saveResult = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) {
        throw new Error(saveResult.error || "ذخیره پیش‌فاکتور ناموفق بود");
      }
      // اگر پیش‌فاکتور ارسال‌شده اصلاح شد، سرور شماره را نسخه‌بندی کرده است (مثلاً ۱۴۰۴/۰۰۱۲ ← ۱۴۰۴/۰۰۱۲e)
      if (!silent && saveResult?.revisedTo) {
        alert(
          `این پیش‌فاکتور قبلاً به مشتری ارسال شده بود؛ «پیش‌فاکتور اصلاحی» با شماره ${toPersianDigits(saveResult.revisedTo)} ثبت شد و وضعیت به «پیش‌نویس» برگشت تا دوباره چرخه تایید و ارسال طی شود.`
        );
      }
      // در حالت silent، فراخوان بیرونی خودش ادامه فرآیند را مدیریت می‌کند
      if (!silent) onSaved();
      // شناسه سند ذخیره‌شده برگردانده می‌شود تا «ثبت و ارسال به مدیریت»
      // برای پیش‌فاکتور جدید نیز از همان‌جا انجام شود
      return (saveResult as { id?: number } | null)?.id ?? proformaId ?? null;
    } catch (error) {
      if (silent) {
        setSaving(false);
        throw error;
      }
      alert(error instanceof Error ? error.message : "خطا در ذخیره");
      return null;
    } finally {
      if (!silent) setSaving(false);
    }
  };

  /**
   * حالت «اصلاح و تایید»: مدیریت اختیار تایید نهایی را به بازرگانی داده است.
   * بازرگانی اصلاحات را ذخیره، سپس خودش تایید و برای ارسال به مشتری آماده می‌کند.
   */
  const approveAndSendByCommercial = async () => {
    if (!proformaId) {
      alert("ابتدا پیش فاکتور را ذخیره کنید");
      return;
    }
    // بازدارنده مبلغ صفر — تایید نهایی با مبلغ صفر مجاز نیست
    if (isZeroAmount(calculateTotal())) {
      alert(zeroAmountMessage("approved"));
      return;
    }
    // بازدارنده «ردیف صفر» — اگر ردیفی از تجهیزات مبلغ صفر دارد، تایید نهایی متوقف می‌شود
    const zeroRowsCommercial = findZeroAmountRows(items);
    if (zeroRowsCommercial.length > 0) {
      alert(zeroRowsMessage(zeroRowsCommercial));
      return;
    }
    if (!confirm("اصلاحات ذخیره شود و پیش‌فاکتور تایید و برای ارسال به مشتری آماده گردد؟")) return;

    setSaving(true);
    try {
      // ۱) ذخیره اصلاحات جاری فرم
      await handleSave({ silent: true });

      // ۲) تایید نهایی توسط خود بازرگانی (طبق تفویض اختیار مدیریت)
      const res = await fetch(`/api/proforma/${proformaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved", approvedBy: user.id, updatedBy: user.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "تایید پیش‌فاکتور ناموفق بود");
      }

      // ۳) ثبت در گردش کار و اطلاع دبیرخانه جهت ارسال
      await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proformaId,
          fromUserId: user.id,
          toDepartment: "دبیرخانه",
          action: "approved",
          comment: "اصلاح و تایید توسط واحد بازرگانی طبق تفویض اختیار مدیریت — آماده ارسال به مشتری",
        }),
      }).catch(() => {});

      // ۴) ذخیره خروجی PDF نهایی
      await fetch(`/api/proforma/${proformaId}/save-pdf`, { method: "POST" }).catch(() => {});

      setProformaStatus("approved");
      alert("✅ اصلاحات ذخیره شد و پیش‌فاکتور تایید و برای ارسال به مشتری آماده شد");
      onSaved();
    } catch (error) {
      alert(error instanceof Error ? error.message : "خطا در تایید و ارسال");
    }
    setSaving(false);
  };

  const submitToManager = async () => {
    setSaving(true);
    try {
      // ابتدا همه تغییرات جاری فرم ذخیره می‌شود تا دقیقاً «همین نسخه» به مدیریت برسد.
      // (رفع ایراد: پیش‌فاکتور اصلاح‌شده توسط بازرگانی بدون ذخیره به مدیریت می‌رفت
      // و مدیریت همان نسخه قبلی را می‌دید.) برای پیش‌فاکتور جدید نیز ابتدا سند
      // ساخته و سپس از همان‌جا به مدیریت ارسال می‌شود.
      const savedId = await handleSave({ silent: true });
      const targetId = proformaId ?? savedId ?? null;
      if (!targetId) {
        throw new Error("ذخیره پیش‌فاکتور ناموفق بود — ابتدا فرم را کامل کنید");
      }
      // ارسال به مدیریت بدون محدودیت مبلغ است — مدیریت می‌تواند قیمت‌گذاری/اصلاح کند.
      // محدودیت مبلغ صفر فقط در آخرین مرحله (تایید نهایی) اعمال می‌شود.
      const statusRes = await fetch(`/api/proforma/${targetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending", updatedBy: user.id }),
      });
      if (!statusRes.ok) {
        const err = await statusRes.json().catch(() => ({}));
        throw new Error(err.error || "ارسال به مدیریت ناموفق بود");
      }
      await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proformaId: targetId,
          fromUserId: user.id,
          toDepartment: "مدیریت",
          action: "submit",
          comment: "ارسال برای تایید مدیریت",
        }),
      });
      alert("پیش‌فاکتور ذخیره و به مدیریت ارسال شد");
      onSaved();
    } catch (error) {
      alert(error instanceof Error ? error.message : "خطا در ذخیره و ارسال به مدیریت");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto" />
      </div>
    );
  }

  // نام مشتری انتخاب‌شده برای نمایش اطلاعات تماس در بالای فرم
  const selectedCompany = companies.find(c => c.id.toString() === companyId);
  const visibleCustomerContact: CustomerContactInfo = {
    contactPerson: customerContact.contactPerson || "",
    phone: customerContact.phone || selectedCompany?.phone || "",
    fax: customerContact.fax || "",
    email: customerContact.email || selectedCompany?.email || "",
    address: customerContact.address || "",
    communicationMethod: customerContact.communicationMethod || "",
    communicationId: customerContact.communicationId || "",
  };
  const currentMessengerKey = messengerKeyFromMethod(visibleCustomerContact.communicationMethod || "");
  const isEitaaMethod = currentMessengerKey === "eitaa";
  const currentMessengerLabel = currentMessengerKey === "telegram"
    ? "تلگرام"
    : currentMessengerKey === "bale"
      ? "بله"
      : currentMessengerKey === "rubika"
        ? "روبیکا"
        : currentMessengerKey === "eitaa"
          ? "ایتا"
          : "پیام‌رسان";
  const hasCustomerContactInfo = Boolean(
    visibleCustomerContact.contactPerson ||
    visibleCustomerContact.phone ||
    visibleCustomerContact.fax ||
    visibleCustomerContact.email ||
    visibleCustomerContact.address ||
    visibleCustomerContact.communicationMethod ||
    visibleCustomerContact.communicationId
  );
  // ── قفل ویرایش پس از ارسال به مدیریت ──
  // درخواست: «پیش‌فاکتور وقتی به مدیریت ارسال می‌شود نباید بشود ویرایش کرد؛
  // بعد از دستور مدیریت (نیاز به اصلاح / اصلاح و تایید) قابلیت ویرایش داشته باشد.»
  // پس تا زمانی که وضعیت «در انتظار تایید» است، فرم برای بازرگانی قفل است.
  const isManagerUser = user.role === "manager" || user.role === "admin";
  const pendingEditLocked = !!proformaId && proformaStatus === "pending" && !isManagerUser;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-800">→ بازگشت</button>
        <h1 className="text-2xl font-bold">{proformaId ? "ویرایش پیش فاکتور" : "صدور پیش فاکتور جدید"}</h1>
      </div>

      {/* نمایش نام مشتری و شماره پیش‌فاکتور در بالای فرم */}
      {(selectedCompany || proformaId || sourceLetterInfo) && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-4 mb-6 border border-indigo-100">
          <div className="flex flex-wrap items-center gap-6">
            {selectedCompany && (
              <div className="flex items-center gap-2">
                <span className="text-indigo-600 font-bold">🏢 مشتری:</span>
                <span className="bg-white px-3 py-1 rounded-lg border border-indigo-200 font-bold text-lg">{selectedCompany.name}</span>
              </div>
            )}
            {proformaId && (
              <div className="flex items-center gap-2">
                <span className="text-purple-600 font-bold">📋 شماره پیش‌فاکتور:</span>
                <span className="bg-white px-3 py-1 rounded-lg border border-purple-200 font-bold text-lg text-purple-700">در حال ویرایش #{proformaId}</span>
              </div>
            )}
            {!proformaId && sourceLetterInfo && sourceLetterInfo.letterNumber && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-purple-600 font-bold">📋 شماره پیش‌فاکتور (خودکار):</span>
                <span className="bg-white px-3 py-1 rounded-lg border border-purple-200 font-bold text-lg text-purple-700" dir="ltr">
                  <DocNo v={buildLetterBasedBase(sourceLetterInfo.letterNumber, sourceLetterInfo.existingCount + 1)} persian={false} />
                </span>
                <span className="text-xs text-gray-500">
                  {sourceLetterInfo.existingCount > 0
                    ? `این ${toPersianDigits(sourceLetterInfo.existingCount + 1)}مین پیش‌فاکتورِ نامه ${toPersianDigits(sourceLetterInfo.letterNumber)} است — شماره نامه تغییر نمی‌کند و فقط پسوند فرعی اضافه می‌شود`
                    : `اولین پیش‌فاکتور نامه ${toPersianDigits(sourceLetterInfo.letterNumber)} — دقیقاً همان شماره نامه`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* حالت اصلاح و تایید — دستور مدیریت به بازرگانی */}
        {proformaStatus === "correction_send" && (
          <div className="bg-gradient-to-r from-violet-50 to-fuchsia-50 border-2 border-violet-200 rounded-2xl p-5">
            <h3 className="font-black text-violet-800 flex items-center gap-2 mb-2">
              🖊️ اصلاح و تایید — تفویض اختیار از مدیریت
            </h3>
            {managerComment ? (
              <div className="bg-white/70 border border-violet-100 rounded-xl px-4 py-3 mb-3">
                <div className="text-[11px] font-bold text-violet-700 mb-1">دستور مدیریت:</div>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{managerComment}</p>
              </div>
            ) : null}
            <p className="text-xs leading-6 text-violet-900">
              موارد خواسته‌شده را اصلاح کنید و سپس دکمه <strong>«ذخیره اصلاحات، تایید و ارسال»</strong> را بزنید.
              نیازی به ارسال مجدد به مدیریت نیست؛ تایید نهایی با خود شماست.
            </p>
          </div>
        )}

        {/* اطلاعات تماس مشتری — نمایش برای بررسی صحیح ارسال */}
        {companyId && (
          <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2">👤 اطلاعات تماس مشتری</h2>
                <p className="text-xs text-gray-500 mt-1">
                  همگام با فرم ثبت نامه — تغییرات اینجا برای همین مشتری ذخیره و در ثبت نامه هم نمایش داده می‌شود.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {loadingCustomerContact && (
                  <span className="text-xs font-bold rounded-full bg-sky-100 text-sky-700 px-3 py-1">در حال واکشی...</span>
                )}
                {contactDirty && !loadingCustomerContact && (
                  <span className="text-xs font-bold rounded-full bg-amber-100 text-amber-700 px-3 py-1">
                    ✎ با ذخیره پیش‌فاکتور ثبت می‌شود
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label htmlFor="proforma-contact-person" className="block text-xs font-bold text-gray-700 mb-1">
                  نام مسئول <span className="text-red-600" aria-hidden="true">*</span>
                </label>
                <input
                  id="proforma-contact-person"
                  type="text"
                  required
                  aria-required="true"
                  value={visibleCustomerContact.contactPerson || ""}
                  onChange={(e) => updateCustomerContact("contactPerson", e.target.value)}
                  placeholder="نام مسئول مشتری — الزامی"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none text-sm ${
                    visibleCustomerContact.contactPerson?.trim()
                      ? "border-gray-300 focus:ring-emerald-500"
                      : "border-red-300 bg-red-50/40 focus:ring-red-400"
                  }`}
                />
                {!visibleCustomerContact.contactPerson?.trim() && (
                  <p className="mt-1 text-[10px] font-medium text-red-600">برای صدور پیش‌فاکتور الزامی است</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">تلفن</label>
                <input
                  type="text"
                  dir="ltr"
                  value={visibleCustomerContact.phone || ""}
                  onChange={(e) => updateCustomerContact("phone", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-left"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">فکس</label>
                <input
                  type="text"
                  dir="ltr"
                  value={visibleCustomerContact.fax || ""}
                  onChange={(e) => updateCustomerContact("fax", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-left"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ایمیل</label>
                <input
                  type="text"
                  dir="ltr"
                  value={visibleCustomerContact.email || ""}
                  onChange={(e) => updateCustomerContact("email", e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-left"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">طریقه ارتباط</label>
                <select
                  value={visibleCustomerContact.communicationMethod || ""}
                  onChange={(e) => {
                    updateCustomerContact("communicationMethod", e.target.value);
                    updateCustomerContact("communicationId", "");
                    setShowMessengerChats(false);
                    setRecentMessengerChats([]);
                    setMessengerChatsError("");
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white"
                >
                  <option value="">انتخاب کنید</option>
                  {commMethods.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">شناسه ارتباط</label>
                <div className="flex items-stretch gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={visibleCustomerContact.communicationId || ""}
                    onChange={(e) => updateCustomerContact("communicationId", e.target.value.trim())}
                    placeholder={
                      currentMessengerKey === "rubika"
                        ? "b0... / g0... / u0... / c0..."
                        : currentMessengerKey === "telegram" || currentMessengerKey === "bale"
                          ? "Chat ID"
                          : currentMessengerKey === "eitaa"
                            ? "شناسه کاربر/کانال ایتا"
                            : "آیدی چت / شماره / ایمیل"
                    }
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm text-left"
                  />
                  {currentMessengerKey && (
                    <button
                      type="button"
                      onClick={loadRecentMessengerChats}
                      disabled={loadingMessengerChats}
                      title={isEitaaMethod ? "انتخاب از شناسه‌های ثبت‌شده ایتا" : `انتخاب از چت‌های اخیر ${currentMessengerLabel}`}
                      className="shrink-0 px-3 rounded-lg border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-60 text-xs font-bold transition whitespace-nowrap"
                    >
                      {loadingMessengerChats ? "..." : isEitaaMethod ? "📒 شناسه‌ها" : "🔎 چت‌ها"}
                    </button>
                  )}
                </div>

              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">آدرس</label>
                <input
                  type="text"
                  value={visibleCustomerContact.address || ""}
                  onChange={(e) => updateCustomerContact("address", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                />
              </div>
            </div>

            {!hasCustomerContactInfo && !loadingCustomerContact && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                برای این مشتری هنوز اطلاعات تماسی ثبت نشده است؛ می‌توانید همین‌جا وارد کنید.
              </p>
            )}
          </div>
        )}

        {/* Basic Info */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-bold text-lg mb-4">اطلاعات پایه</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">نوع پیش فاکتور *</label>
              <select
                value={proformaTypeId}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">انتخاب کنید</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">شرکت / مشتری * (جستجو)</label>
              <CompanySearch
                value={companyId}
                companies={companies}
                onSelect={handleCompanySelect}
                onCompanyAdded={(c) => setCompanies((prev) => [...prev, c])}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">تاریخ صدور * (شمسی)</label>
              <PersianDatePicker
                value={issueDate}
                onChange={setIssueDate}
                placeholder="تاریخ صدور"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">مدت اعتبار (روز)</label>
              <input
                type="number"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">شرح پیش‌فاکتور</label>
            <textarea
              rows={2}
              value={proformaDescription}
              onChange={(e) => setProformaDescription(e.target.value)}
              placeholder="شرح مختصر پیش‌فاکتور — مدیریت این شرح را مشاهده خواهد کرد"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showTotal}
                onChange={(e) => setShowTotal(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">نمایش جمع کل</span>
            </label>
          </div>
        </div>

        {/* Past Proformas — سوابق مشتری */}
        {companyId && (
          <div className={`rounded-2xl shadow-sm border p-4 flex flex-wrap items-center justify-between gap-3 ${pastProformas.length > 0 ? "bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200" : "bg-gray-50 border-gray-200"}`}>
            <div className="flex items-center gap-3">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg ${pastProformas.length > 0 ? "bg-gradient-to-br from-purple-500 to-pink-500" : "bg-gray-400"}`}>📋</span>
              <div>
                {pastProformas.length > 0 ? (
                  <>
                    <span className="font-black text-sm text-purple-800">سوابق مشتری: {pastProformas.length} پیش‌فاکتور قبلی</span>
                    <div className="text-xs text-purple-600/70">اقلام و قیمت‌های قبلی را مشاهده و به لیست فعلی اضافه کنید</div>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-sm text-gray-600">سابقه‌ای برای این مشتری ثبت نشده</span>
                    <div className="text-xs text-gray-400">اولین پیش‌فاکتور این مشتری</div>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openHistorySearch}
                className="bg-gradient-to-r from-cyan-600 to-teal-500 text-white px-6 py-3 rounded-xl text-sm font-black shadow-lg hover:shadow-xl hover:scale-[1.02] transition flex items-center gap-2"
                title="جستجوی تجهیزات در پیش‌فاکتورهای همه مشتریان و افزودن به این پیش‌فاکتور"
              >
                <span className="text-lg">🔍</span>
                جستجوی سابقه تجهیزات (همه مشتریان)
              </button>
              {pastProformas.length > 0 && (
                <button onClick={() => setShowCopyPanel(true)} className="bg-gradient-to-r from-purple-600 to-pink-500 text-white px-6 py-3 rounded-xl text-sm font-black shadow-lg hover:shadow-xl hover:scale-[1.02] transition flex items-center gap-2">
                  <span className="text-lg">📥</span>
                  مشاهده سوابق و کپی اقلام
                </button>
              )}
            </div>
          </div>
        )}

        {/* جستجوی سابقه تجهیزات در مشتریان دیگر — حتی پیش از انتخاب مشتری قابل استفاده است */}
        {!companyId && (
          <div className="rounded-2xl shadow-sm border p-4 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-cyan-50 to-teal-50 border-cyan-200">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg bg-gradient-to-br from-cyan-500 to-teal-500">🔍</span>
              <div>
                <span className="font-black text-sm text-cyan-800">جستجوی سابقه تجهیزات در مشتریان دیگر</span>
                <div className="text-xs text-cyan-600/70">نام تجهیز، شرح یا مشتری را جستجو کنید و یک یا چند قلم را به پیش‌فاکتور اضافه کنید</div>
              </div>
            </div>
            <button
              type="button"
              onClick={openHistorySearch}
              className="bg-gradient-to-r from-cyan-600 to-teal-500 text-white px-6 py-3 rounded-xl text-sm font-black shadow-lg hover:shadow-xl hover:scale-[1.02] transition flex items-center gap-2"
            >
              <span className="text-lg">🔍</span>
              جستجو و افزودن اقلام
            </button>
          </div>
        )}

        {/* لیست سریع پیش‌فاکتورهای قبلی — بدون نیاز به باز کردن پاپ‌آپ */}
        {companyId && pastProformas.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-purple-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-purple-50/60 border-b border-purple-100 flex items-center justify-between">
              <span className="text-xs font-black text-purple-800">پیش‌فاکتورهای قبلی این مشتری</span>
              <span className="text-[11px] text-purple-500">برای افزودن اقلام، روی نام تجهیز کلیک کنید</span>
            </div>
            <div className="max-h-56 overflow-auto divide-y divide-gray-50">
              {pastProformas.map((pp) => (
                <div key={pp.id} className="px-4 py-2.5 hover:bg-gray-50/70 transition">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-bold text-xs"><DocNo v={pp.proformaNumber} /></span>
                    <span className="text-[11px] text-gray-400">{toPersianDigits(pp.issueDate)}</span>
                    {pp.typeName && <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{pp.typeName}</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      pp.status === "final_sale" ? "bg-green-600 text-white"
                        : pp.status === "approved" ? "bg-green-100 text-green-700"
                        : pp.status === "sent" ? "bg-emerald-100 text-emerald-700"
                        : pp.status === "pending" ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-600"}`}>
                      {PROFORMA_STATUS_LABELS[pp.status] || pp.status}
                    </span>
                    <span className="text-[11px] text-gray-400 mr-auto">{toPersianDigits(pp.items.length)} قلم</span>
                    <span className="text-xs font-bold text-green-700">{formatPrice(pp.totalAmount)} ریال</span>
                  </div>
                  {/* اقلام کلیک‌پذیر */}
                  <div className="flex flex-wrap gap-1.5">
                    {pp.items.map((it) => {
                      const dup = isDuplicate(it.equipmentId, it.description || it.equipmentName || "");
                      return (
                        <button
                          key={it.id}
                          type="button"
                          disabled={dup}
                          onClick={() => copySelectedItems([it])}
                          className={`px-2 py-1 rounded-lg text-[11px] border transition ${
                            dup
                              ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                              : "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600"
                          }`}
                          title={dup ? "قبلاً اضافه شده" : `افزودن — ${formatPrice(it.unitPrice)} ریال`}
                        >
                          {dup ? "✓ " : "+ "}{it.equipmentName || it.description}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Copy Items Modal/Popup — با چک‌باکس */}
        {showCopyPanel && (() => {
          const allPastItems = pastProformas.flatMap(pp => pp.items.map(it => ({ ...it, pfNumber: pp.proformaNumber, pfId: pp.id })));
          const checkedCount = copyChecked.size;
          const getCheckedItems = () => allPastItems.filter(it => copyChecked.has(`${it.pfId}-${it.id}`));

          const toggleItem = (key: string) => {
            setCopyChecked(prev => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key); else next.add(key);
              return next;
            });
          };
          const toggleAllInPf = (pfId: number, pfItems: typeof allPastItems) => {
            setCopyChecked(prev => {
              const next = new Set(prev);
              const keys = pfItems.filter(it => it.pfId === pfId).map(it => `${it.pfId}-${it.id}`);
              const allChecked = keys.every(k => next.has(k));
              keys.forEach(k => allChecked ? next.delete(k) : next.add(k));
              return next;
            });
          };

          return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600 to-pink-500 p-5 text-white flex items-center justify-between shrink-0">
                <div>
                  <h3 className="font-black text-lg">📥 کپی اقلام از سوابق مشتری</h3>
                  <p className="text-white/80 text-xs mt-1">اقلام مورد نظر را تیک بزنید سپس «کپی انتخاب شده‌ها» را بزنید — اقلام تکراری خودکار حذف می‌شوند</p>
                </div>
                <button onClick={() => { setShowCopyPanel(false); setCopyChecked(new Set()); }} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition text-xl">✕</button>
              </div>
              
              {/* Content */}
              <div className="flex-1 overflow-auto p-5 space-y-4 scrollbar-thin">
                {pastProformas.map(pp => {
                  const pfKeys = pp.items.map(it => `${pp.id}-${it.id}`);
                  const allCheckedInPf = pfKeys.length > 0 && pfKeys.every(k => copyChecked.has(k));
                  const someCheckedInPf = pfKeys.some(k => copyChecked.has(k));

                  return (
                  <div key={pp.id} className={`border rounded-2xl overflow-hidden transition ${someCheckedInPf ? "border-purple-400 shadow-md" : "border-gray-200"}`}>
                    {/* Proforma header */}
                    <div className="bg-gray-50 px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleAllInPf(pp.id, allPastItems)}
                          className="flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 transition"
                          title="انتخاب/لغو همه اقلام این پیش‌فاکتور"
                        >
                          <input
                            type="checkbox"
                            checked={allCheckedInPf}
                            readOnly
                            tabIndex={-1}
                            className="w-4 h-4 accent-purple-600 pointer-events-none"
                          />
                          {allCheckedInPf ? "لغو همه" : "همه"}
                        </button>
                        <span className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border font-bold text-sm text-purple-600">📋</span>
                        <div>
                          <span className="font-black text-sm"><DocNo v={pp.proformaNumber} persian={false} /></span>
                          <span className="text-xs text-gray-500 mr-3">{pp.issueDate}</span>
                          {pp.typeName && <span className="text-xs bg-gray-200 px-2 py-0.5 rounded mr-2">{pp.typeName}</span>}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${pp.status === "approved" ? "bg-green-100 text-green-700" : pp.status === "pending" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}>
                            {pp.status === "approved" ? "تایید شده" : pp.status === "pending" ? "در انتظار" : pp.status}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500">{pp.items.length} قلم</span>
                    </div>
                    {/* Items with checkboxes */}
                    <div className="divide-y divide-gray-50">
                      {pp.items.map(it => {
                        const key = `${pp.id}-${it.id}`;
                        const checked = copyChecked.has(key);
                        const alreadyExists = isDuplicate(it.equipmentId, it.description || it.equipmentName || "");
                        return (
                        <div
                          key={it.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleItem(key)}
                          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggleItem(key); } }}
                          className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition select-none ${checked ? "bg-purple-100 ring-1 ring-inset ring-purple-300" : "hover:bg-gray-50"}`}
                          title="برای انتخاب کلیک کنید"
                        >
                          {/* چک‌باکس بصری — کلیک روی کل ردیف انتخاب می‌کند */}
                          <input
                            type="checkbox"
                            checked={checked}
                            readOnly
                            tabIndex={-1}
                            className="w-4 h-4 accent-purple-600 shrink-0 pointer-events-none"
                          />
                          <span className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500 shrink-0">📦</span>
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm font-medium ${alreadyExists ? "text-gray-500" : ""}`}>
                              {it.description || it.equipmentName}
                            </span>
                            {it.pointCount && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded mr-2">×{toPersianDigits(it.pointCount)}</span>}
                            <span className="text-xs text-gray-400 mr-2">تعداد: {formatQuantity(it.quantity)}</span>
                            {alreadyExists && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded mr-2">در لیست فعلی هست</span>}
                          </div>
                          <span className="text-sm font-bold text-green-700 shrink-0">{formatPrice(it.unitPrice)} ریال</span>
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); copySelectedItems([it]); }}
                            className="shrink-0 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-2.5 py-1 rounded-lg text-xs font-bold transition"
                            title="افزودن سریع همین قلم به پیش‌فاکتور"
                          >
                            + افزودن
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Footer with action */}
              <div className="border-t bg-gray-50 p-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${checkedCount > 0 ? "bg-purple-600 text-white" : "bg-gray-200 text-gray-500"}`}>{toPersianDigits(checkedCount)}</span>
                  <span className="text-sm text-gray-600">{checkedCount > 0 ? `${toPersianDigits(checkedCount)} قلم انتخاب شده` : "هیچ قلمی انتخاب نشده"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const allKeys = allPastItems.map((it) => `${it.pfId}-${it.id}`);
                      setCopyChecked((prev) => (prev.size === allKeys.length ? new Set() : new Set(allKeys)));
                    }}
                    className="text-xs font-bold text-purple-700 hover:text-purple-900 underline underline-offset-4"
                  >
                    {checkedCount === allPastItems.length && allPastItems.length > 0 ? "لغو انتخاب همه" : "انتخاب همه اقلام"}
                  </button>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setShowCopyPanel(false); setCopyChecked(new Set()); }} className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold hover:bg-gray-100 transition">بستن</button>
                  <button
                    onClick={() => {
                      const selected = getCheckedItems();
                      if (selected.length === 0) { alert("هیچ قلمی انتخاب نشده"); return; }
                      copySelectedItems(selected);
                      setCopyChecked(new Set());
                      setShowCopyPanel(false);
                    }}
                    disabled={checkedCount === 0}
                    className="bg-gradient-to-r from-purple-600 to-pink-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📥 کپی {checkedCount} قلم انتخاب شده
                  </button>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ── پنل جستجوی سابقه تجهیزات در سوابق همه مشتریان ── */}
        {showHistorySearch && (() => {
          const checkedCount = historyChecked.size;
          const checkedRows = historyResults.filter((r) => historyChecked.has(r.id));
          const allChecked = historyResults.length > 0 && historyResults.every((r) => historyChecked.has(r.id));

          const toggleRow = (id: number) => {
            setHistoryChecked((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            });
          };
          const toggleAll = () => {
            setHistoryChecked((prev) =>
              allChecked ? new Set() : new Set(historyResults.map((r) => r.id))
            );
          };

          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-cyan-600 to-teal-500 p-5 text-white flex items-center justify-between shrink-0">
                  <div>
                    <h3 className="font-black text-lg">🔍 جستجوی سابقه تجهیزات در مشتریان</h3>
                    <p className="text-white/80 text-xs mt-1">
                      سابقه هر تجهیز را در پیش‌فاکتورهای همه مشتریان پیدا کنید؛ یک یا چند قلم را تیک بزنید و به لیست پیش‌فاکتور فعلی اضافه کنید
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowHistorySearch(false); setHistoryChecked(new Set()); }}
                    className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition text-xl"
                  >✕</button>
                </div>

                {/* Search bar */}
                <div className="p-4 border-b bg-cyan-50/50 shrink-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[240px]">
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                      <input
                        type="text"
                        value={historyQ}
                        onChange={(e) => setHistoryQ(e.target.value)}
                        placeholder="نام تجهیز، بخشی از شرح یا نام مشتری… (مثلاً: چمبر تست دما)"
                        className="w-full pr-9 pl-3 py-2.5 border border-cyan-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white"
                        autoFocus
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer bg-white border border-cyan-200 rounded-xl px-3 py-2.5 text-xs font-bold text-cyan-800 select-none">
                      <input
                        type="checkbox"
                        checked={historyIncludeOwn}
                        onChange={(e) => setHistoryIncludeOwn(e.target.checked)}
                        className="w-4 h-4 accent-cyan-600"
                      />
                      جستجو در سوابق همین مشتری هم
                    </label>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-gray-500">
                    {historyLoading ? (
                      <span className="flex items-center gap-2 text-cyan-700 font-bold">
                        <span className="w-3.5 h-3.5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></span>
                        در حال جستجو…
                      </span>
                    ) : (
                      <span>
                        {historyResults.length > 0
                          ? `${toPersianDigits(historyResults.length)} سابقه یافت شد — جدیدترین‌ها ابتدا`
                          : historySearched
                            ? "سابقه‌ای یافت نشد — عبارت دیگری را امتحان کنید"
                            : "بدون تایپ، جدیدترین اقلام ثبت‌شده در سیستم نمایش داده می‌شود"}
                      </span>
                    )}
                    {!historyIncludeOwn && companyId && (
                      <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-2 py-0.5 font-bold">
                        سوابق مشتری فعلی نمایش داده نمی‌شود
                      </span>
                    )}
                  </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-auto divide-y divide-gray-50">
                  {!historyLoading && historyResults.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                      <span className="text-5xl">🗂️</span>
                      <span className="text-sm font-bold">سابقه‌ای مطابق جستجو پیدا نشد</span>
                    </div>
                  )}
                  {historyResults.map((r) => {
                    const checked = historyChecked.has(r.id);
                    const alreadyExists = isDuplicate(r.equipmentId, r.description || r.equipmentName || "");
                    return (
                      <div
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleRow(r.id)}
                        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggleRow(r.id); } }}
                        className={`px-5 py-3.5 cursor-pointer transition select-none ${checked ? "bg-cyan-50 ring-1 ring-inset ring-cyan-300" : "hover:bg-gray-50"}`}
                        title="برای انتخاب کلیک کنید"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            readOnly
                            tabIndex={-1}
                            className="w-4 h-4 accent-cyan-600 shrink-0 pointer-events-none"
                          />
                          <span className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center text-sm text-gray-500 shrink-0">📦</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`text-sm font-bold truncate ${alreadyExists ? "text-gray-500" : "text-gray-800"}`}>
                                {r.description || r.equipmentName}
                              </span>
                              {r.pointCount ? (
                                <span className="text-[10px] bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded font-bold">×{toPersianDigits(r.pointCount)} نقطه</span>
                              ) : null}
                              <span className="text-[10px] text-gray-400">تعداد: {formatQuantity(r.quantity)}</span>
                              {alreadyExists && (
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">در لیست فعلی هست</span>
                              )}
                            </div>
                            {/* منبع سابقه: مشتری + پیش‌فاکتور */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full font-bold">
                                🏢 {r.companyName || "—"}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                <DocNo v={r.proformaNumber} />
                              </span>
                              <span className="text-[10px] text-gray-400">{toPersianDigits(r.issueDate)}</span>
                              {r.typeName && <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{r.typeName}</span>}
                               <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                 r.status === "final_sale" ? "bg-green-600 text-white"
                                   : r.status === "approved" ? "bg-green-100 text-green-700"
                                   : r.status === "sent" ? "bg-emerald-100 text-emerald-700"
                                   : r.status === "pending" ? "bg-yellow-100 text-yellow-700"
                                   : "bg-gray-100 text-gray-600"}`}>
                                 {PROFORMA_STATUS_LABELS[r.status] || r.status}
                               </span>
                            </div>
                          </div>
                          <div className="shrink-0 text-left">
                            <div className="text-sm font-black text-green-700 whitespace-nowrap">{formatPrice(r.unitPrice)} <span className="text-[10px] font-normal text-gray-400">ریال</span></div>
                          </div>
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); addHistoryItems([r]); }}
                            className="shrink-0 bg-cyan-50 text-cyan-700 hover:bg-cyan-600 hover:text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition border border-cyan-200"
                            title="افزودن سریع همین قلم به پیش‌فاکتور"
                          >
                            + افزودن
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="border-t bg-gray-50 p-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${checkedCount > 0 ? "bg-cyan-600 text-white" : "bg-gray-200 text-gray-500"}`}>{toPersianDigits(checkedCount)}</span>
                    <span className="text-sm text-gray-600">{checkedCount > 0 ? `${toPersianDigits(checkedCount)} قلم انتخاب شده` : "هیچ قلمی انتخاب نشده"}</span>
                    {historyResults.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-xs font-bold text-cyan-700 hover:text-cyan-900 underline underline-offset-4"
                      >
                        {allChecked ? "لغو انتخاب همه" : "انتخاب همه نتایج"}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowHistorySearch(false); setHistoryChecked(new Set()); }}
                      className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold hover:bg-gray-100 transition"
                    >بستن</button>
                    <button
                      onClick={() => {
                        if (checkedRows.length === 0) { alert("هیچ قلمی انتخاب نشده"); return; }
                        addHistoryItems(checkedRows);
                        setHistoryChecked(new Set());
                        setShowHistorySearch(false);
                      }}
                      disabled={checkedCount === 0}
                      className="bg-gradient-to-r from-cyan-600 to-teal-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      📥 افزودن {toPersianDigits(checkedCount)} قلم انتخاب‌شده به پیش‌فاکتور
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Contract & Attachments Info */}
        {companyId && (companyContracts.length > 0 || letterAttachments.length > 0) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            {/* Contracts */}
            {companyContracts.length > 0 && (
              <div>
                <h3 className="font-black text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center text-white">📄</span>
                  قراردادهای مشتری ({companyContracts.length})
                </h3>
                <div className="space-y-2">
                  {companyContracts.map((ct) => {
                    const isExpired = (() => {
                      try {
                        const parts = ct.endDate.split("/");
                        const today = getTodayJalali().split("/");
                        return (parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2])) < (parseInt(today[0]) * 10000 + parseInt(today[1]) * 100 + parseInt(today[2]));
                      } catch { return false; }
                    })();
                    return (
                      <div key={ct.id} className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border ${isExpired ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-8 rounded-full ${isExpired ? "bg-red-500" : "bg-green-500"}`}></span>
                          <div>
                            <div className="font-bold text-sm">{ct.contractNumber} {ct.title && `— ${ct.title}`}</div>
                            <div className="text-xs text-gray-600">
                              📅 {ct.startDate} الی {ct.endDate}
                              <span className={`mr-2 px-2 py-0.5 rounded-full text-xs font-bold ${isExpired ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                {isExpired ? "منقضی" : "فعال"}
                              </span>
                            </div>
                          </div>
                        </div>
                        {ct.filePath && (
                          <a href={ct.filePath} target="_blank" rel="noopener noreferrer" className="bg-white text-amber-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-300 hover:bg-amber-100">
                            📥 مشاهده قرارداد
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Letter Attachments */}
            {letterAttachments.length > 0 && (
              <div>
                <h3 className="font-black text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center text-white">📎</span>
                  پیوست‌های نامه مرتبط
                </h3>
                <div className="flex flex-wrap gap-2">
                  {letterAttachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold">{att.attachmentType}</span>
                      <span className="text-sm">{att.fileName}</span>
                      {att.filePath && (
                        <a href={att.filePath} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs font-bold">
                          مشاهده →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Items — جدول سطری فشرده */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-black text-gray-900 flex items-center gap-2">
                <span className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center text-white text-sm">📦</span>
                اقلام پیش فاکتور
                {items.length > 0 && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{items.length} ردیف</span>}
              </h2>
              <p className="text-xs text-gray-400 mt-1">میانبر: <kbd className="bg-gray-100 border border-gray-200 rounded px-1 py-0.5 font-mono text-[10px]">Insert</kbd> / <kbd className="bg-gray-100 border border-gray-200 rounded px-1 py-0.5 font-mono text-[10px]">Ctrl+Enter</kbd></p>
            </div>
            <button
              onClick={addItem}
              title="میانبر: Insert / Ctrl+Enter / Alt+N"
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition flex items-center gap-1.5"
            >
              <span className="text-lg leading-none">+</span>
              افزودن ردیف
            </button>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
              <div className="text-3xl mb-2">📦</div>
              اقلام را اضافه کنید
            </div>
          ) : (
            <div className="overflow-visible">
              <table className="w-full text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-gradient-to-r from-slate-50 to-gray-100 text-gray-600">
                    <th className="px-1 py-2.5 text-center w-8 font-bold text-xs">✓</th>
                    <th className="px-1 py-2.5 text-center w-8 font-bold text-xs">#</th>
                    <th className="px-2 py-2.5 text-right font-bold text-xs min-w-[200px]">تجهیز</th>
                    <th className="px-2 py-2.5 text-center font-bold text-xs w-16">تعداد</th>
                    <th className="px-2 py-2.5 text-center font-bold text-xs w-16" title="در صورت انتخاب پارامتر، جمع تعداد پارامترها ملاک است">نقطه</th>
                    <th className="px-2 py-2.5 text-center font-bold text-xs w-32">قیمت واحد</th>
                    <th className="px-2 py-2.5 text-center font-bold text-xs w-36">مبنای قیمت</th>
                    {!isSetad && <th className="px-2 py-2.5 text-center font-bold text-xs w-28">محل کالیبره</th>}
                    <th className="px-2 py-2.5 text-left font-bold text-xs w-32">مبلغ کل</th>
                    <th className="px-1 py-2.5 text-center font-bold text-xs w-20">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const eqForThis = equipmentList.find((e) => e.id === item.equipmentId);
                    const categoryId = (eqForThis as unknown as { categoryId?: number | null })?.categoryId || null;
                    return (
                    <tr
                      key={item.key}
                      className={`border-b border-gray-100 transition group ${!item.isSelected ? "opacity-40 bg-gray-50" : "hover:bg-blue-50/30"} ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                    >
                      {/* چک‌باکس */}
                      <td className="px-1 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={item.isSelected}
                          onChange={(e) => updateItem(item.key, "isSelected", e.target.checked)}
                          className="w-3.5 h-3.5 accent-emerald-600"
                        />
                      </td>

                      {/* شماره ردیف */}
                      <td className="px-1 py-2 text-center">
                        <span className="text-xs text-gray-400 font-mono">{idx + 1}</span>
                      </td>

                      {/* تجهیز */}
                      <td className="px-2 py-1.5 relative overflow-visible">
                        <EquipmentSearch
                          value={item.equipmentId}
                          equipmentList={equipmentList}
                          onEquipmentAdded={reloadEquipment}
                          onSelectMultiple={handleSelectMultipleEquip}
                          onSelect={(equip) => {
                            if (equip) {
                              const otherItems = items.filter(it => it.key !== item.key);
                              const dup = otherItems.some(it => it.equipmentId === equip.id);
                              if (dup) { showDuplicateToast(1); return; }
                              setItems(items.map((it) => {
                                if (it.key !== item.key) return it;
                                const qty = parseFloat(it.quantity) || 1;
                                const price = parseFloat(equip.unitPrice) || 0;
                                const points = parseInt(it.pointCount) || 0;
                                const pointMult = points > 0 ? points : 1;
                                const lineTotal = qty * price * pointMult;
                                return {
                                  ...it,
                                  equipmentId: equip.id,
                                  description: equip.name,
                                  unitPrice: normalizePriceValue(equip.unitPrice),
                                  totalPrice: lineTotal.toString(),
                                  // پارامترهای ردیف قبلی پاک می‌شوند تا پارامترهای تجهیز جدید انتخاب شود
                                  selectedParams: [],
                                  paramName: "",
                                  paramUnit: null,
                                  paramValues: null,
                                  calibrationLocation: (equip as { calibrationLocation?: string | null }).calibrationLocation || it.calibrationLocation || "",
                                };
                              }));
                              // بارگذاری پارامترهای تجهیز انتخاب‌شده
                              loadEquipParams(equip.id);
                              if (equip.imagePath) {
                                const addImg = confirm(`تجهیز "${equip.name}" دارای تصویر است. آیا می‌خواهید نمایش داده شود؟`);
                                if (addImg) {
                                  setSelectedImages(prev => {
                                    if (prev.some(img => img.path === equip.imagePath)) return prev;
                                    return [...prev, { name: equip.name, path: equip.imagePath! }];
                                  });
                                }
                              }
                            } else {
                              updateItem(item.key, "equipmentId", null);
                            }
                          }}
                        />
                        {/* ── پارامترهای این تجهیز (چندتایی) ── */}
                        {item.equipmentId && (() => {
                          const available = equipParams[item.equipmentId] || [];
                          const selected = item.selectedParams || [];
                          if (available.length === 0 && selected.length === 0) {
                            // تجهیز نقطه‌ای بدون پارامتر تعریف‌شده → جستجوی آزاد
                            return eqForThis?.pricePerPoint || item.paramName ? (
                              <div className="mt-1">
                                <ParamSearch
                                  value={item.paramName || ""}
                                  categoryId={categoryId}
                                  onSelect={(name, unit) => {
                                    setItems((prev) => prev.map((it) => it.key === item.key
                                      ? recalcLine({
                                          ...it,
                                          paramName: name,
                                          paramUnit: unit || null,
                                          selectedParams: [{ paramId: null, name, unit: unit || null, count: it.pointCount || "1" }],
                                          paramValues: { params: [{ paramId: null, name, unit: unit || null, count: it.pointCount || "1" }], paramName: name, paramUnit: unit },
                                        })
                                      : it));
                                  }}
                                  placeholder="نوع پارامتر"
                                />
                              </div>
                            ) : null;
                          }
                          return (
                            <div className="mt-1.5 space-y-1.5">
                              {/* چیپ‌های انتخاب پارامتر */}
                              <div className="flex flex-wrap gap-1">
                                {available.map((p) => {
                                  const isOn = selected.some((sp) => sp.paramId === p.id);
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => toggleItemParam(item.key, p)}
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                                        isOn
                                          ? "bg-emerald-600 text-white border-emerald-600"
                                          : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400 hover:text-emerald-700"
                                      }`}
                                      title={p.paramUnit ? `واحد: ${p.paramUnit}` : undefined}
                                    >
                                      {isOn ? "✓ " : "+ "}{p.paramName}
                                    </button>
                                  );
                                })}
                              </div>
                              {/* تعداد هر پارامتر انتخاب‌شده */}
                              {selected.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 bg-emerald-50/70 rounded-lg p-1.5 border border-emerald-100">
                                  {selected.map((sp) => (
                                    <div key={`${item.key}-${sp.paramId ?? sp.name}`} className="flex items-center gap-1 bg-white rounded px-1.5 py-0.5 border border-emerald-200">
                                      <span className="text-[10px] text-emerald-800 font-bold whitespace-nowrap">{sp.name}</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={sp.count}
                                        onChange={(e) => updateItemParamCount(item.key, sp.paramId, e.target.value)}
                                        className="w-12 px-1 py-0.5 border border-emerald-200 rounded text-center text-[11px] outline-none focus:ring-1 focus:ring-emerald-400"
                                      />
                                      {sp.unit && <span className="text-[9px] text-gray-400">{sp.unit}</span>}
                                    </div>
                                  ))}
                                  <span className="text-[10px] text-emerald-700 font-bold self-center mr-auto">
                                    مجموع: {toPersianDigits(sumParamCounts(selected))}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* تعداد */}
                      <td className="px-1 py-1.5">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.key, "quantity", e.target.value)}
                          className="w-full px-1.5 py-1 border border-gray-200 rounded text-center text-sm focus:ring-1 focus:ring-blue-400 outline-none bg-transparent"
                        />
                      </td>

                      {/* نقطه */}
                      <td className="px-1 py-1.5">
                        <input
                          type="number"
                          value={item.pointCount}
                          onChange={(e) => updateItem(item.key, "pointCount", e.target.value)}
                          placeholder="—"
                          className="w-full px-1.5 py-1 border border-gray-200 rounded text-center text-sm focus:ring-1 focus:ring-indigo-400 outline-none bg-transparent"
                        />
                      </td>

                      {/* قیمت واحد */}
                      <td className="px-1 py-1.5">
                        <NumberInputWithSeparator
                          value={item.unitPrice}
                          onChange={(val) => updateItem(item.key, "unitPrice", val)}
                          className="w-full px-1.5 py-1 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-400 outline-none bg-transparent text-left"
                        />
                      </td>

                      {/* مبنای قیمت‌گذاری */}
                      <td className="px-1 py-1.5">
                        {item.equipmentId && priceBasis[item.equipmentId] ? (() => {
                          const pb = priceBasis[item.equipmentId!];
                          const lastPrice = parseFloat(pb.unitPrice) || 0;
                          const currentPrice = parseFloat(item.unitPrice) || 0;
                          const diff = currentPrice - lastPrice;
                          const diffPercent = lastPrice > 0 ? ((diff / lastPrice) * 100).toFixed(1) : "0";
                          return (
                            <div className="text-[10px] leading-tight space-y-0.5">
                              <div className="text-gray-500 flex items-center gap-1">
                                <span>📋</span>
                                <span className="font-bold text-gray-700">{formatPrice(pb.unitPrice)}</span>
                              </div>
                              <div className="text-gray-400">{pb.priceDate}</div>
                              {pb.proformaNumber && <div className="text-gray-400 truncate" title={pb.proformaNumber}>PF: <DocNo v={pb.proformaNumber} persian={false} /></div>}
                              {diff !== 0 && (
                                <div className={`font-bold ${diff > 0 ? "text-red-500" : "text-green-600"}`}>
                                  {diff > 0 ? "▲" : "▼"} {diffPercent}%
                                </div>
                              )}
                              {diff === 0 && <div className="text-emerald-500 font-bold">= بدون تغییر</div>}
                            </div>
                          );
                        })() : (
                          <span className="text-[10px] text-gray-300">{item.equipmentId ? "بدون سابقه" : "—"}</span>
                        )}
                      </td>

                      {/* محل کالیبره — در نامه ستاد حذف است */}
                      {!isSetad && (
                      <td className="px-1 py-1.5">
                        <select
                          value={item.calibrationLocation || ""}
                          onChange={(e) => updateItem(item.key, "calibrationLocation", e.target.value)}
                          className="w-full px-1 py-1 border border-gray-200 rounded text-[11px] focus:ring-1 focus:ring-blue-400 outline-none bg-transparent"
                        >
                          <option value="">—</option>
                          <option value="سایت مشتری">سایت</option>
                          <option value="آزمایشگاه بهسا">آزمایشگاه</option>
                          <option value="سایت مشتری -آزمایشگاه بهسا">هردو</option>
                        </select>
                      </td>
                      )}

                      {/* مبلغ کل */}
                      <td className="px-2 py-1.5 text-left">
                        <span className="font-bold text-sm text-emerald-700 whitespace-nowrap">{formatPrice(item.totalPrice)}</span>
                      </td>

                      {/* عملیات */}
                      <td className="px-1 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          {item.equipmentId && (
                            <>
                              <button
                                onClick={() => viewPriceHistory(item.equipmentId!, item.key)}
                                className="w-7 h-7 rounded-lg hover:bg-purple-100 text-purple-500 flex items-center justify-center transition"
                                title="سوابق قیمت"
                              >
                                <span className="text-sm">📊</span>
                              </button>
                              <button
                                onClick={() => { const eq = equipmentList.find((e) => e.id === item.equipmentId); if (eq) openEquipEdit(eq); }}
                                className="w-7 h-7 rounded-lg hover:bg-indigo-100 text-indigo-500 flex items-center justify-center transition"
                                title="اصلاح تجهیز"
                              >
                                <span className="text-sm">✏️</span>
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => removeItem(item.key)}
                            className="w-7 h-7 rounded-lg hover:bg-red-100 text-red-400 flex items-center justify-center transition"
                            title="حذف ردیف"
                          >
                            <span className="text-sm">🗑</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
                {/* فوتر جدول — جمع */}
                <tfoot>
                  <tr className="bg-gradient-to-r from-emerald-50 to-teal-50 border-t-2 border-emerald-200">
                    <td colSpan={8} className="px-3 py-2.5 text-left font-black text-sm text-emerald-800">جمع اقلام:</td>
                    <td className="px-2 py-2.5 text-left font-black text-sm text-emerald-800 whitespace-nowrap">{formatPrice(calculateSubtotal())} <span className="text-xs font-normal">ریال</span></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Multiplier & Target */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-bold text-lg mb-4">ضرایب و تنظیمات قیمت</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">افزایش/کاهش درصدی همه اقلام</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="درصد (مثلا: 15)"
                  value={globalMultiplierPercent}
                  onChange={(e) => setGlobalMultiplierPercent(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  onClick={applyGlobalMultiplier}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition"
                >
                  اعمال
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رساندن به مبلغ مشخص</label>
              <div className="flex gap-2">
                <NumberInputWithSeparator
                  value={targetAmount}
                  onChange={setTargetAmount}
                  placeholder="مبلغ هدف (ریال)"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  onClick={applyTargetAmount}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 transition"
                >
                  اعمال
                </button>
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 mb-1">
                <input type="checkbox" checked={enableDiscount} onChange={(e) => setEnableDiscount(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm font-medium text-gray-700">تخفیف (%)</span>
              </label>
              <input
                type="number"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                disabled={!enableDiscount}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
              />
            </div>
          </div>

          {/* Rounding */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-bold text-gray-700 mb-3">🔄 رند کردن اقلام</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">مبنای رند کردن</label>
                <select
                  value={roundStep}
                  onChange={(e) => setRoundStep(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                >
                  <option value="100">۱۰۰ ریال</option>
                  <option value="1000">۱,۰۰۰ ریال</option>
                  <option value="10000">۱۰,۰۰۰ ریال</option>
                  <option value="100000">۱۰۰,۰۰۰ ریال</option>
                  <option value="1000000">۱,۰۰۰,۰۰۰ ریال</option>
                  <option value="10000000">۱۰,۰۰۰,۰۰۰ ریال</option>
                </select>
              </div>
              <button
                onClick={applyRounding}
                className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg text-sm font-medium transition"
              >
                رند کردن قیمت اقلام انتخاب شده
              </button>
              <span className="text-xs text-gray-400">
                قیمت واحد هر قلم انتخاب شده به نزدیک‌ترین مقدار انتخاب شده رند می‌شود
              </span>
            </div>
          </div>
        </div>

        {/* Costs - چک‌باکسی */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-bold text-lg mb-4">هزینه‌ها و مالیات (چک‌باکسی)</h2>
          <p className="text-xs text-gray-500 mb-4">هر هزینه را با تیک فعال کنید. در صورت بدون جمع کل بودن، هزینه‌ها همچنان ذخیره شده و می‌توانند در چاپ نمایش داده شوند.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`border rounded-xl p-3 ${enableTax ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-gray-50"}`}>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input type="checkbox" checked={enableTax} onChange={(e) => setEnableTax(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm font-bold text-gray-700">ارزش افزوده (%)</span>
              </label>
              <input
                type="number"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
                disabled={!enableTax}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
              />
            </div>
            <div className={`border rounded-xl p-3 ${enableInsurance ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-gray-50"}`}>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input type="checkbox" checked={enableInsurance} onChange={(e) => setEnableInsurance(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm font-bold text-gray-700">بیمه (% - کسر)</span>
              </label>
              <input
                type="number"
                value={insurancePercent}
                onChange={(e) => setInsurancePercent(e.target.value)}
                disabled={!enableInsurance}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
              />
            </div>
            <div className={`border rounded-xl p-3 ${enableTravel ? "border-green-300 bg-green-50" : "border-gray-200 bg-gray-50"}`}>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input type="checkbox" checked={enableTravel} onChange={(e) => setEnableTravel(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm font-bold text-gray-700">ایاب و ذهاب (ریال)</span>
              </label>
              <NumberInputWithSeparator
                value={travelCost}
                onChange={setTravelCost}
                disabled={!enableTravel}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${!enableTravel ? "bg-gray-100" : "bg-white"}`}
              />
            </div>
            <div className={`border rounded-xl p-3 ${enableTransport ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-gray-50"}`}>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input type="checkbox" checked={enableTransport} onChange={(e) => setEnableTransport(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm font-bold text-gray-700">هزینه سفر (ریال)</span>
              </label>
              <NumberInputWithSeparator
                value={transportCost}
                onChange={setTransportCost}
                disabled={!enableTransport}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${!enableTransport ? "bg-gray-100" : "bg-white"}`}
              />
            </div>
          </div>

          {/* Totals - ترتیب صحیح: جمع → تخفیف → بیمه → ایاب‌ذهاب → سفر → جمع قبل مالیات → ارزش افزوده → جمع کل */}
          <div className="mt-6 bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>جمع اقلام:</span>
              <span className="font-medium">{formatPrice(calculateSubtotal())} ریال</span>
            </div>
            {enableDiscount && parseFloat(discountPercent) > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>تخفیف{percentSuffix(discountPercent)}:</span>
                <span>-{formatPrice(calculateSubtotal() * parseFloat(discountPercent) / 100)} ریال</span>
              </div>
            )}
            {enableInsurance && parseFloat(insurancePercent) > 0 && (
              <div className="flex justify-between text-sm text-orange-600">
                <span>بیمه{percentSuffix(insurancePercent)}:</span>
                <span>-{formatPrice((calculateSubtotal() - (enableDiscount ? calculateSubtotal() * (parseFloat(discountPercent) || 0) / 100 : 0)) * parseFloat(insurancePercent) / 100)} ریال</span>
              </div>
            )}
            {enableTravel && parseFloat(travelCost) > 0 && (
              <div className="flex justify-between text-sm">
                <span>ایاب و ذهاب:</span>
                <span>+{formatPrice(travelCost)} ریال</span>
              </div>
            )}
            {enableTransport && parseFloat(transportCost) > 0 && (
              <div className="flex justify-between text-sm">
                <span>هزینه سفر:</span>
                <span>+{formatPrice(transportCost)} ریال</span>
              </div>
            )}
            {/* جمع قبل از ارزش افزوده */}
            {enableTax && parseFloat(taxPercent) > 0 && (
              <>
                <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                  <span className="font-medium">جمع قبل از ارزش افزوده:</span>
                  <span className="font-medium">{formatPrice(calculateBeforeTax())} ریال</span>
                </div>
                <div className="flex justify-between text-sm text-blue-600">
                  <span>ارزش افزوده{percentSuffix(taxPercent)}:</span>
                  <span>+{formatPrice(calculateTaxAmount())} ریال</span>
                </div>
              </>
            )}
            {showTotal ? (
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-300">
                <span>جمع کل نهایی:</span>
                <span className="text-green-700">{formatPrice(calculateTotal())} ریال</span>
              </div>
            ) : (
              <div className="pt-2 border-t border-dashed border-gray-300">
                <div className="text-center text-sm text-gray-500 bg-yellow-50 py-2 rounded">این پیش‌فاکتور بدون جمع کل است</div>
                <div className="flex justify-between text-sm text-gray-600 mt-2">
                  <span>جمع محاسباتی (ذخیره):</span>
                  <span>{formatPrice(calculateTotal())} ریال</span>
                </div>
              </div>
            )}
            {isZeroAmount(calculateTotal()) && (
              <div className="mt-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ مبلغ نهایی صفر است — ذخیره و ارسال به مدیریت جهت قیمت‌گذاری امکان‌پذیر است، اما در آخرین مرحله «تایید نهایی» با مبلغ صفر انجام نمی‌شود.
              </div>
            )}
            <div className="mt-2 text-[11px] text-gray-500 leading-relaxed">
              ترتیب محاسبه: جمع اقلام ← کسر تخفیف ← کسر بیمه (روی جمع اقلام) ← افزودن ایاب و ذهاب و هزینه سفر ← محاسبه ارزش افزوده در آخرین مرحله.
            </div>
          </div>
        </div>

        {/* Texts */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <button
            onClick={() => setShowTexts(!showTexts)}
            className="flex items-center gap-2 font-bold text-lg mb-4"
          >
            <span>{showTexts ? "▼" : "◀"}</span>
            <span>متون پیش فاکتور (قابل ویرایش)</span>
          </button>
          {showTexts && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">متن قبل از اقلام</label>
                <textarea
                  rows={4}
                  value={textBefore}
                  onChange={(e) => setTextBefore(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">متن بعد از اقلام</label>
                <textarea
                  rows={4}
                  value={textAfter}
                  onChange={(e) => setTextAfter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">متن و امضا</label>
                <textarea
                  rows={3}
                  value={signatureText}
                  onChange={(e) => setSignatureText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              {/* «صفحه آخر (شرایط عمومی)» در نامه ستاد کاملاً حذف می‌شود */}
              {!isSetad && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">صفحه آخر (شرایط عمومی)</label>
                <textarea
                  rows={4}
                  value={textLastPage}
                  onChange={(e) => setTextLastPage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              )}
              {isSetad && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-bold text-violet-700">
                  📌 پیش‌فاکتور «نامه ستاد» و «فروش»: ستون «محل کالیبره» و «صفحه آخر (شرایط و ضوابط)» در خروجی چاپ نمی‌آید — فقط مهر و امضا و نام شرکت دقیقاً زیر آخرین مطلب (زیر جمع کل) چاپ می‌شود.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Equipment Images for print */}
        {selectedImages.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-black text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-8 h-8 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center text-white">🖼</span>
              تصاویر تجهیزات (نمایش در انتهای پیش‌فاکتور)
            </h3>
            <div className="flex flex-wrap gap-4">
              {selectedImages.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img src={img.path} alt={img.name} className="w-32 h-32 rounded-xl object-cover border-2 border-gray-200" />
                  <div className="text-xs text-center mt-1 text-gray-600">{img.name}</div>
                  <button
                    onClick={() => setSelectedImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute top-1 left-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">این تصاویر در انتهای PDF پیش‌فاکتور نمایش داده خواهند شد. برای حذف روی × کلیک کنید.</p>
          </div>
        )}

        {/* Actions */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          {/* قفل ویرایش — پیش‌فاکتور به مدیریت ارسال شده و تا صدور دستور مدیریت
              (نیاز به اصلاح / اصلاح و تایید / تایید / رد) قابل ویرایش نیست */}
          {pendingEditLocked && (
            <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 flex items-center gap-2">
              <span className="text-lg">🔒</span>
              <span>
                این پیش‌فاکتور به مدیریت ارسال شده و در انتظار دستور مدیریت است؛ تا مشخص شدن نظر مدیریت قابل ویرایش نیست.
                {managerComment ? ` آخرین دستور: ${managerComment}` : ""}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-3 justify-end">
            <button onClick={onBack} className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition">
              انصراف
            </button>
            {!pendingEditLocked && (
            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl font-medium transition disabled:opacity-50"
            >
              {saving ? "در حال ذخیره..." : "ذخیره پیش فاکتور"}
            </button>
            )}
            {/* ثبت و ارسال به مدیریت — هم برای پیش‌فاکتور جدید و هم در حال ویرایش:
                در هر دو حالت ابتدا تغییرات ذخیره و سپس سند برای مدیریت ارسال می‌شود */}
            {!pendingEditLocked && (user.role === "commercial" || user.role === "admin") && proformaStatus !== "correction_send" && (
              <button
                onClick={submitToManager}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl font-medium transition disabled:opacity-50"
              >
                {saving ? "در حال ارسال..." : "ثبت و ارسال به مدیریت"}
              </button>
            )}

            {/* حالت «اصلاح و تایید» — بازرگانی خودش تایید و ارسال می‌کند */}
            {proformaId && proformaStatus === "correction_send" && (user.role === "commercial" || user.role === "admin") && (
              <button
                onClick={approveAndSendByCommercial}
                disabled={saving}
                className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-violet-500/25 transition disabled:opacity-50"
              >
                ✅ ذخیره اصلاحات، تایید و ارسال
              </button>
            )}
            {/* دکمه تایید مستقیم برای مدیر عامل */}
            {(user.role === "manager" || user.role === "admin") && (
              <button
                onClick={async () => {
                  if (!proformaId) {
                    alert("ابتدا پیش‌فاکتور را ذخیره کنید");
                    return;
                  }
                  if (items.length === 0 || !items.some(it => it.description.trim() || it.equipmentId)) {
                    alert("حداقل یک تجهیز یا قلم باید وارد شود");
                    return;
                  }

                  // آخرین مرحله: بازدارندگی قطعی مبلغ صفر در خود دکمه تایید مدیر
                  const finalAmount = calculateTotal();
                  if (isZeroAmount(finalAmount)) {
                    alert(zeroAmountMessage());
                    return;
                  }
                  // بازدارنده «ردیف صفر» — اگر ردیفی از تجهیزات مبلغ صفر دارد، تایید نهایی متوقف می‌شود
                  const zeroRowsManager = findZeroAmountRows(items);
                  if (zeroRowsManager.length > 0) {
                    alert(zeroRowsMessage(zeroRowsManager));
                    return;
                  }

                  if (!confirm(`آیا پیش‌فاکتور با مبلغ نهایی ${formatPrice(finalAmount)} ریال تایید شود؟`)) return;
                  setSaving(true);
                  try {
                    // ابتدا تمام اصلاحات جاری مدیر ذخیره می‌شود تا مبلغ روی صفحه و دیتابیس یکی باشد
                    await handleSave({ silent: true });

                    // سپس آخرین مرحله انجام می‌شود؛ سرور نیز مبلغ صفر را دوباره کنترل می‌کند
                    const approvalRes = await fetch(`/api/proforma/${proformaId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "approved", approvedBy: user.id, updatedBy: user.id }),
                    });
                    const approvalResult = await approvalRes.json().catch(() => ({}));
                    if (!approvalRes.ok) {
                      throw new Error(approvalResult.error || "تایید نهایی پیش‌فاکتور ناموفق بود");
                    }

                    // گردش کار فقط پس از تایید موفق سرور ثبت می‌شود
                    const workflowRes = await fetch("/api/workflow", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        proformaId,
                        fromUserId: user.id,
                        toDepartment: "واحد بازرگانی",
                        action: "approved",
                        comment: `تایید مستقیم توسط مدیریت — مبلغ نهایی: ${formatPrice(finalAmount)} ریال`,
                      }),
                    });
                    if (!workflowRes.ok) {
                      console.error("ثبت گردش کار پس از تایید ناموفق بود");
                    }

                    setProformaStatus("approved");
                    alert(`✅ پیش‌فاکتور با مبلغ ${formatPrice(finalAmount)} ریال تایید نهایی شد`);
                    onSaved();
                  } catch (error) {
                    alert(error instanceof Error ? error.message : "خطا در تایید نهایی");
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg transition disabled:opacity-50 flex items-center gap-2"
              >
                ✅ تایید نهایی (مدیر)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Equipment Edit Modal */}
      {showEquipEdit && editingEquip && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-6">
              <h3 className="font-black text-lg mb-4">✏️ اصلاح تجهیز: {editingEquip.name}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-1">نام تجهیز</label>
                  <input
                    type="text"
                    value={equipEditForm.name}
                    onChange={(e) => setEquipEditForm({ ...equipEditForm, name: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold mb-1">قیمت واحد (ریال)</label>
                    <input
                      type="number"
                      value={equipEditForm.unitPrice}
                      onChange={(e) => setEquipEditForm({ ...equipEditForm, unitPrice: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-gray-100 rounded-xl outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
                      <input
                        type="checkbox"
                        checked={equipEditForm.pricePerPoint}
                        onChange={(e) => setEquipEditForm({ ...equipEditForm, pricePerPoint: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-bold">نقطه‌ای/پارامتری</span>
                    </label>
                  </div>
                </div>
                <p className="text-xs text-gray-500">تغییرات این تجهیز برای این ردیف و تمام ردیف‌های همین تجهیز اعمال می‌شود.</p>
              </div>
              <div className="flex gap-3 mt-6 justify-end">
                <button onClick={() => setShowEquipEdit(false)} className="px-4 py-2 border rounded-xl">انصراف</button>
                <button onClick={saveEquipEdit} className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold">ذخیره اصلاح</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Price History Modal */}
      {showPriceHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg">سوابق قیمت (مشتری فعلی)</h3>
                  <p className="text-xs text-indigo-600 mt-1">💡 روی سطر مورد نظر کلیک کنید تا همان قیمت روی ردیف فعلی اعمال شود</p>
                </div>
                <button onClick={() => setShowPriceHistory(false)} className="text-gray-500 hover:text-gray-800 text-xl">✕</button>
              </div>
              {priceHistoryData.length === 0 ? (
                <p className="text-gray-500 text-center py-8">سابقه‌ای یافت نشد</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-right">تاریخ</th>
                      <th className="px-3 py-2 text-right">شماره پیش فاکتور</th>
                      <th className="px-3 py-2 text-right">قیمت واحد</th>
                      <th className="px-3 py-2 text-right">تعداد نقطه</th>
                      <th className="px-3 py-2 text-right">تعداد</th>
                      <th className="px-3 py-2 text-right">انتخاب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {priceHistoryData.map((h) => (
                      <tr
                        key={h.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => applyPriceHistory(h)}
                        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); applyPriceHistory(h); } }}
                        className="hover:bg-indigo-50/80 cursor-pointer transition group"
                        title={`اعمال قیمت ${formatPrice(h.unitPrice)} ریال روی ردیف فعلی`}
                      >
                        <td className="px-3 py-2">{h.priceDate}</td>
                        <td className="px-3 py-2">{h.proformaNumber || "-"}</td>
                        <td className="px-3 py-2 font-bold text-green-700 group-hover:text-green-800">
                          {formatPrice(h.unitPrice)} ریال
                        </td>
                        <td className="px-3 py-2">{h.pointCount || "-"}</td>
                        <td className="px-3 py-2">{formatQuantity(h.quantity)}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white px-2.5 py-1 rounded-lg text-xs font-bold transition">
                            ⤵ اعمال قیمت
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* پاپ‌آپ تمام‌صفحه انتخاب شناسه ارتباط */}
      <MessengerChatPicker
        open={!!currentMessengerKey && showMessengerChats}
        loading={loadingMessengerChats}
        chats={recentMessengerChats}
        errorNote={messengerChatsError}
        messengerKey={currentMessengerKey}
        messengerLabel={currentMessengerLabel}
        companyId={companyId}
        companyName={selectedCompany?.name}
        onRefresh={loadRecentMessengerChats}
        onSelect={(chatId) => updateCustomerContact("communicationId", chatId)}
        onClose={() => setShowMessengerChats(false)}
      />
    </div>
  );
}
