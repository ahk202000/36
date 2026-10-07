"use client";

import { useState, useEffect, useRef } from "react";
import type { UserInfo } from "@/app/page";
import { formatPrice, toPersianDigits, REQUEST_TYPES as REQUEST_TYPE_OPTIONS, COMMUNICATION_METHODS } from "@/lib/utils";
import { getPermissions } from "@/lib/permissions";
import PersianDatePicker, { getTodayJalali } from "./PersianDatePicker";
import CompanySearch from "./CompanySearch";
import MessengerChatPicker from "./MessengerChatPicker";
import DocNo from "@/components/DocNo";
import BidiText from "@/components/BidiText";
import { workflowActionLabel } from "@/lib/workflow-actions";
import { formatJalaliDateTime } from "@/lib/datetime";

interface Company {
  id: number;
  name: string;
  phone?: string | null;
  contactPerson?: string | null;
}

interface Attachment {
  id: number;
  attachmentType: string;
  fileName: string;
  filePath?: string;
  fileSize?: number;
}

interface Proforma {
  id: number;
  proformaNumber: string;
  issueDate: string;
  status: string;
  totalAmount: string;
  revisionNo?: number | null;
  letterSeq?: number | null;
}

interface WorkflowItem {
  id: number;
  action: string;
  comment: string | null;
  toDepartment: string | null;
  createdAt: string;
}

interface RecentMessengerChat {
  id: string;
  name: string;
  username?: string;
  type?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  linkedCompanies: Array<{ id: number; name: string }>;
}

interface Props {
  user: UserInfo;
  letterId?: number | null;
  onBack: () => void;
  onSaved: () => void;
  /** صدور پیش‌فاکتور از داخل نامه (فقط برای نامه‌های «استعلام» و کاربران دارای مجوز) */
  onCreateProforma?: (letterId: number) => void;
  /** مشاهده پیش‌فاکتور مرتبط از داخل پرونده نامه */
  onViewProforma?: (proformaId: number) => void;
}

// نوع درخواست و طریقه ارتباط — ابتدا از دیتابیس (تنظیمات) خوانده می‌شوند
// و در نبودشان از مقادیر پیش‌فرض @/lib/utils استفاده می‌شود.
const ATTACH_TYPES = ["تاییدیه استعلام", "نامه رنج", "نامه اصلی", "استعلام", "مدرک فنی", "سایر"];
/** نوع ضمیمه‌ای که پس از فروش قطعی جایگزین ارجاع برنامه‌ریزی برون سازمانی می‌شود */
const RANGE_LETTER_TYPE = "نامه رنج";
// حذف شد — حالا از دیتابیس خوانده می‌شود

const statusLabels: Record<string, string> = {
  draft: "پیش‌نویس",
  pending: "در انتظار تایید",
  approved: "تایید شده",
  rejected: "رد شده",
  revised: "نیاز به اصلاح",
};

export default function LetterForm({ user, letterId, onBack, onSaved, onCreateProforma, onViewProforma }: Props) {
  // بررسی اینکه کاربر فقط مشاهده دارد یا ویرایش هم
  const userPerms = getPermissions(user.role, user.permissions);
  const readOnly = !userPerms.manageLetters;
  // نرمال‌سازی برچسب فارسی برای تشخیص نوع «استعلام»
  const normFa = (v: string) => (v || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ").replace(/\s+/g, " ").trim();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [nextLetterNumber, setNextLetterNumber] = useState("");
  const [departmentsList, setDepartmentsList] = useState<string[]>([]);
  // گزینه‌های فرم — ابتدا مقادیر پیش‌فرض، سپس از تنظیمات دیتابیس جایگزین می‌شوند
  const [requestTypes, setRequestTypes] = useState<string[]>(REQUEST_TYPE_OPTIONS);
  const [commMethods, setCommMethods] = useState<string[]>(COMMUNICATION_METHODS);
  
  const [form, setForm] = useState({
    companyId: "",
    registrationDate: "",
    letterDate: "",
    customerLetterNumber: "",
    requestType: "استعلام",
    communicationMethod: "",
    communicationId: "",
    description: "",
    phone: "",
    fax: "",
    contactPerson: "",
    referralDepartment: "",
    status: "received",
    isFinalConfirmed: false,
    confirmedProformaId: "",
  });
  
  const [existingLetterNumber, setExistingLetterNumber] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [proformas, setProformas] = useState<Proforma[]>([]); // پیش‌فاکتورهای مرتبط با این نامه
  const [companyProformas, setCompanyProformas] = useState<Proforma[]>([]); // پیش‌فاکتورهای این مشتری برای انتخاب
  const [loadingProformas, setLoadingProformas] = useState(false);
  const [workflow, setWorkflow] = useState<WorkflowItem[]>([]);
  // وضعیت قبلی تأیید نهایی — برای جلوگیری از ارجاع تکراری فروش قطعی
  const [wasFinalConfirmed, setWasFinalConfirmed] = useState(false);
  // اطلاعات کاربر ایجادکننده/ویرایش‌کننده
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [newAttachType, setNewAttachType] = useState("تاییدیه استعلام");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recentMessengerChats, setRecentMessengerChats] = useState<RecentMessengerChat[]>([]);
  const [loadingMessengerChats, setLoadingMessengerChats] = useState(false);
  const [messengerChatsError, setMessengerChatsError] = useState("");
  const [messengerBotUsername, setMessengerBotUsername] = useState("");
  const [messengerBotShareUrl, setMessengerBotShareUrl] = useState("");
  const [showMessengerChats, setShowMessengerChats] = useState(false);

  // Set today dates on client only for new letters
  useEffect(() => {
    if (!letterId) {
      const today = getTodayJalali();
      setForm(prev => ({
        ...prev,
        registrationDate: prev.registrationDate || today,
        letterDate: prev.letterDate || today,
      }));
    }
  }, [letterId]);

  // واکشی لیست‌های انتخابی از تنظیمات (با fallback روی پیش‌فرض‌ها)
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((rows: Array<{ settingKey: string; settingValue: string }>) => {
        const rt = rows.find((x) => x.settingKey === "request_types");
        const cm = rows.find((x) => x.settingKey === "communication_methods");
        try {
          if (rt?.settingValue) {
            const arr = JSON.parse(rt.settingValue);
            if (Array.isArray(arr) && arr.length > 0) setRequestTypes(arr.map(String));
          }
        } catch {}
        try {
          if (cm?.settingValue) {
            const arr = JSON.parse(cm.settingValue);
            if (Array.isArray(arr) && arr.length > 0) setCommMethods(arr.map(String));
          }
        } catch {}
      })
      .catch(() => {});
  }, []);

  // Auto-fill contactPerson when company changes
  // اطلاعاتی که به‌صورت خودکار پر شده‌اند (برای نمایش نشانه به کاربر)
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set());
  const [loadingContact, setLoadingContact] = useState(false);
  // نگه‌داشتن آخرین مشتری درخواست‌شده — جلوگیری از اعمال پاسخ قدیمی وقتی
  // کاربر سریع مشتری را عوض می‌کند (race condition)
  const lastCompanyReqRef = useRef<string>("");

  const handleCompanySelect = async (companyId: string) => {
    // فیلدهایی که برای «مشتری قبلی» خودکار پر شده‌اند و کاربر آن‌ها را دستکاری نکرده است؛
    // با انتخاب مشتری جدید باید با اطلاعات مشتری جدید به‌روزرسانی (یا در نبود داده، پاک) شوند —
    // اما فیلدهایی که کاربر خودش تایپ کرده هرگز دست نمی‌خورند.
    const prevAuto = new Set(autoFilled);
    lastCompanyReqRef.current = companyId;
    setForm(prev => ({ ...prev, companyId, confirmedProformaId: "" }));
    setAutoFilled(new Set());

    // پاک شدن انتخاب مشتری → مقادیر خودکارِ متعلق به مشتری قبلی هم پاک می‌شود
    if (!companyId) {
      if (!letterId && prevAuto.size > 0) {
        setForm(prev => {
          const next = { ...prev };
          for (const f of prevAuto) {
            if (f in next && typeof (next as unknown as Record<string, unknown>)[f] === "string") {
              (next as unknown as Record<string, string>)[f] = "";
            }
          }
          return next;
        });
      }
      return;
    }
    if (letterId) return; // در حالت ویرایش، مقادیر ثبت‌شده دست نمی‌خورند

    // واکشی آخرین اطلاعات تماس این مشتری (از آخرین نامه‌ها + کارت شرکت)
    setLoadingContact(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/last-contact`);
      const data = await res.json();
      // اگر در این میان کاربر مشتری دیگری انتخاب کرده باشد، این پاسخ قدیمی است
      if (lastCompanyReqRef.current !== companyId) return;
      if (data && !data.error) {
        const filled = new Set<string>();
        setForm(prev => {
          const next = { ...prev } as typeof form;
          // فیلدی که قبلاً «خودکار» پر شده یعنی مقدارش از مشتری قبلی است و باید
          // بدون هیچ قیدی جایگزین شود؛ فیلد دستی فقط در صورت خالی بودن پر می‌شود.
          const apply = (field: "contactPerson" | "phone" | "fax" | "communicationMethod" | "communicationId" | "referralDepartment", newVal: string | null) => {
            const wasAuto = prevAuto.has(field);
            if (newVal) {
              if (!prev[field] || wasAuto) {
                next[field] = newVal;
                filled.add(field);
              }
            } else if (wasAuto) {
              // داده متعلق به مشتری قبلی است و مشتری جدید داده‌ای ندارد → پاک می‌شود
              next[field] = "";
            }
          };
          apply("contactPerson", data.contactPerson || null);
          apply("phone", data.phone || null);
          apply("fax", data.fax || null);
          apply("communicationMethod", data.communicationMethod || null);
          apply("communicationId", data.communicationId || null);
          apply("referralDepartment", data.referralDepartment || null);
          return next;
        });
        setAutoFilled(filled);
      }
    } catch {}
    if (lastCompanyReqRef.current === companyId) setLoadingContact(false);
  };

  // پاک کردن نشانه «خودکار» وقتی کاربر خودش مقدار را تغییر می‌دهد
  const clearAutoFlag = (field: string) => {
    setAutoFilled(prev => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const isTelegramMethod = /تلگرام|telegram/i.test(form.communicationMethod);
  const isRubikaMethod = /روبیکا|rubika/i.test(form.communicationMethod);
  const isBaleMethod = /بله|bale/i.test(form.communicationMethod);
  const isEitaaMethod = /ایتا|eitaa|eita/i.test(form.communicationMethod);
  const supportsRecentChats = isTelegramMethod || isRubikaMethod || isBaleMethod || isEitaaMethod;
  const currentMessengerKey = isRubikaMethod
    ? "rubika"
    : isBaleMethod
      ? "bale"
      : isEitaaMethod
        ? "eitaa"
        : "telegram";
  const currentMessengerLabel = isRubikaMethod
    ? "روبیکا"
    : isBaleMethod
      ? "بله"
      : isEitaaMethod
        ? "ایتا"
        : "تلگرام";
  const selectedCompany = companies.find((company) => String(company.id) === form.companyId);
  const normalizeMessengerId = (value: string) => value.trim().replace(/^@/, "");
  const selectedMessengerChat = recentMessengerChats.find(
    (chat) => normalizeMessengerId(chat.id) === normalizeMessengerId(form.communicationId)
  );

  /** دریافت شناسه‌های واقعی چت از getUpdates — توکن هرگز به مرورگر برنمی‌گردد */
  const loadRecentMessengerChats = async () => {
    setLoadingMessengerChats(true);
    setMessengerChatsError("");
    setShowMessengerChats(true);
    try {
      const res = await fetch(`/api/messenger/updates?messenger=${currentMessengerKey}`, { cache: "no-store" });
      const data = (await res.json()) as {
        error?: string;
        note?: string;
        botUsername?: string;
        botShareUrl?: string;
        chats?: RecentMessengerChat[];
      };
      setMessengerBotUsername(data.botUsername || "");
      setMessengerBotShareUrl(data.botShareUrl || "");
      if (!res.ok || data.error) {
        setRecentMessengerChats([]);
        setMessengerChatsError(data.error || `دریافت چت‌های ${currentMessengerLabel} ناموفق بود`);
      } else {
        setRecentMessengerChats(Array.isArray(data.chats) ? data.chats : []);
        setMessengerChatsError(data.note || "");
      }
    } catch {
      setRecentMessengerChats([]);
      setMessengerChatsError(`ارتباط با سرویس دریافت چت‌های ${currentMessengerLabel} برقرار نشد`);
    } finally {
      setLoadingMessengerChats(false);
    }
  };

  // Load customer's proformas when company changes and request type is "تاییدیه استعلام"
  useEffect(() => {
    if (form.companyId && form.requestType === "تاییدیه استعلام") {
      setLoadingProformas(true);
      // دریافت پیش‌فاکتورها و نامه‌های قطعی شده
      Promise.all([
        fetch(`/api/proforma?companyId=${form.companyId}`).then((r) => r.json()),
        fetch(`/api/letters?companyId=${form.companyId}&isFinalConfirmed=true`).then((r) => r.json()).catch(() => [])
      ])
        .then(([proformaData, confirmedLetters]) => {
          // استخراج شناسه پیش‌فاکتورهایی که قبلاً قطعی شده‌اند
          const confirmedProformaIds = new Set(
            (confirmedLetters || [])
              .filter((l: { confirmedProformaId?: number }) => l.confirmedProformaId)
              .map((l: { confirmedProformaId: number }) => l.confirmedProformaId)
          );
          
          // فیلتر پیش‌فاکتورهای تایید شده که هنوز قطعی نشده‌اند — فقط متعلق به همین مشتری
          const confirmable = (proformaData || []).filter((p: Proforma & { companyId?: number | string | null }) => 
            (!p.companyId || String(p.companyId) === String(form.companyId)) &&
            ["approved", "sent", "ready_to_send"].includes(p.status) &&
            !confirmedProformaIds.has(p.id)
          );
          setCompanyProformas(confirmable);
          setLoadingProformas(false);
        })
        .catch(() => {
          setCompanyProformas([]);
          setLoadingProformas(false);
        });
    } else {
      setCompanyProformas([]);
    }
  }, [form.companyId, form.requestType]);

  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then((d) => setCompanies(Array.isArray(d) ? d : [])).catch(() => {});
    // واکشی لیست واحدها از دیتابیس
    fetch("/api/departments").then((r) => r.json()).then((d: Array<{ name: string }>) => setDepartmentsList(Array.isArray(d) ? d.map(dept => dept.name) : [])).catch(() => {});

    if (letterId) {
      fetch(`/api/letters/${letterId}`)
        .then((r) => r.json())
        .then((d) => {
          setExistingLetterNumber(d.letterNumber || "");
          setForm({
            companyId: d.companyId?.toString() || "",
            registrationDate: d.registrationDate || getTodayJalali(),
            letterDate: d.letterDate || getTodayJalali(),
            customerLetterNumber: d.customerLetterNumber || "",
            requestType: d.requestType || "استعلام",
            communicationMethod: d.communicationMethod || "",
            communicationId: d.communicationId || "",
            description: d.description || "",
            phone: d.phone || "",
            fax: d.fax || "",
            contactPerson: d.contactPerson || "",
            referralDepartment: d.referralDepartment || "",
            status: d.status || "received",
            isFinalConfirmed: d.isFinalConfirmed || false,
            confirmedProformaId: d.confirmedProformaId?.toString() || "",
          });
          setWasFinalConfirmed(d.isFinalConfirmed || false);
          const mappedAtts = (d.attachments || []).map((a: Record<string, unknown>) => ({
            id: a.id as number,
            attachmentType: a.attachmentType as string,
            fileName: a.fileName as string,
            filePath: (a.filePath as string) || (a.file_path as string) || "",
            fileSize: a.fileSize as number | undefined,
          }));
          setAttachments(mappedAtts);
          setProformas(d.proformas || []);
          setWorkflow(d.workflow || []);
          // اطلاعات کاربر
          setCreatedByName(d.createdByName || null);
          setUpdatedByName(d.updatedByName || null);
          setCreatedAt(d.createdAt || null);
          setUpdatedAt(d.updatedAt || null);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      fetch("/api/letters/next-number")
        .then(r => r.json())
        .then(d => {
          setNextLetterNumber(d.letterNumber);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [letterId]);

  const handleSave = async () => {
    if (!form.registrationDate || !form.letterDate || !form.requestType || !form.contactPerson) {
      alert("لطفا فیلدهای ستاره‌دار شامل نام مسئول را پر کنید");
      return;
    }
    if (!form.companyId) {
      alert("لطفا شرکت را انتخاب کنید");
      return;
    }
    // تعیین واحد ارجاع هنگام ثبت نامه جدید الزامی است
    if (!letterId && !form.referralDepartment) {
      alert("تعیین ارجاع هنگام ثبت نامه الزامی است. لطفا واحد ارجاع را انتخاب کنید");
      return;
    }
    // Validation for تاییدیه استعلام
    if (form.requestType === "تاییدیه استعلام" && !form.confirmedProformaId) {
      alert("لطفا پیش‌فاکتور مورد تأیید را انتخاب کنید");
      return;
    }
    setSaving(true);
    try {
      // نکته: ارجاع خودکار فروش قطعی (نامه رنج / تاییدیه استعلام) به «برنامه‌ریزی برون» و «آزمایشگاه»
      // سمت سرور در تراکنش ذخیره نامه انجام می‌شود تا فایل نامه رنج همیشه از دیتابیس همراه باشد
      // و اگر نامه رنج بعداً اضافه شود هم از قلم نیفتد.

      const payload = {
        companyId: form.companyId ? parseInt(form.companyId) : null,
        registrationDate: form.registrationDate,
        letterDate: form.letterDate,
        customerLetterNumber: form.customerLetterNumber || null,
        requestType: form.requestType,
        communicationMethod: form.communicationMethod || null,
        communicationId: form.communicationId || null,
        description: form.description || null,
        phone: form.phone || null,
        fax: form.fax || null,
        contactPerson: form.contactPerson,
        referralDepartment: form.referralDepartment || null,
        status: form.status,
        isFinalConfirmed: form.isFinalConfirmed,
        finalConfirmedBy: form.isFinalConfirmed ? user.id : null,
        confirmedProformaId: form.confirmedProformaId ? parseInt(form.confirmedProformaId) : null,
        createdBy: user.id,
        attachments: attachments.map(a => ({
          attachmentType: a.attachmentType,
          fileName: a.fileName,
          filePath: a.filePath || `/api/files/${a.fileName}`,
          fileSize: a.fileSize,
        })),
      };

      let savedLetterNumber = existingLetterNumber;
      let savedId = letterId;

      if (letterId) {
        const res = await fetch(`/api/letters/${letterId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, updatedBy: user.id }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "خطا در بروزرسانی");
        }
        const data = await res.json();
        savedLetterNumber = data.letterNumber || savedLetterNumber;
        // اگر تایید نهایی شده، وضعیت پیش‌فاکتور را به final_sale تغییر بده
        if (form.isFinalConfirmed && form.confirmedProformaId) {
          await fetch(`/api/proforma/${form.confirmedProformaId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "final_sale", updatedBy: user.id }),
          });
          // ── ارجاع خودکار فروش قطعی — فقط اگر قبلاً تأیید نشده بود (جلوگیری از تکرار) ──
          if (!wasFinalConfirmed) {
            await fetch("/api/workflow", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                proformaId: parseInt(form.confirmedProformaId),
                letterId: letterId,
                fromUserId: user.id,
                toDepartment: "برنامه ریزی درون سازمانی",
                action: "final_sale",
                comment: `فروش قطعی — نامه ${savedLetterNumber} — پیش‌فاکتور شماره ${companyProformas.find(p => p.id.toString() === form.confirmedProformaId)?.proformaNumber || form.confirmedProformaId} تأیید نهایی شد`,
              }),
            });
          }
        }
        // ارجاع دستی
        if (form.referralDepartment) {
          await fetch("/api/workflow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              letterId: letterId,
              fromUserId: user.id,
              toDepartment: form.referralDepartment,
              action: "refer",
              comment: `ارجاع نامه ${savedLetterNumber} به ${form.referralDepartment}`,
            }),
          });
        }
      } else {
        const res = await fetch("/api/letters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "خطا در ثبت");
        }
        const data = await res.json();
        savedId = data.id;
        savedLetterNumber = data.letterNumber;
        // اگر تایید نهایی شده، وضعیت پیش‌فاکتور را به final_sale تغییر بده
        if (form.isFinalConfirmed && form.confirmedProformaId) {
          await fetch(`/api/proforma/${form.confirmedProformaId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "final_sale", updatedBy: user.id }),
          });
          // ── ارجاع خودکار فروش قطعی — فقط اگر قبلاً تأیید نشده بود (جلوگیری از تکرار) ──
          if (!wasFinalConfirmed) {
            await fetch("/api/workflow", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                proformaId: parseInt(form.confirmedProformaId),
                letterId: savedId,
                fromUserId: user.id,
                toDepartment: "برنامه ریزی درون سازمانی",
                action: "final_sale",
                comment: `فروش قطعی — نامه ${savedLetterNumber} — پیش‌فاکتور شماره ${companyProformas.find(p => p.id.toString() === form.confirmedProformaId)?.proformaNumber || form.confirmedProformaId} تأیید نهایی شد`,
              }),
            });
          }
        }
        // ارجاع دستی
        if (form.referralDepartment && savedId) {
          await fetch("/api/workflow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              letterId: savedId,
              fromUserId: user.id,
              toDepartment: form.referralDepartment,
              action: "refer",
              comment: `ارجاع نامه ${savedLetterNumber} به ${form.referralDepartment}`,
            }),
          });
        }
      }

      // ── همگام‌سازی کارت شرکت با آخرین اطلاعات تماس واردشده ──
      // تا دفعه بعد همین مقادیر به‌عنوان آخرین اطلاعات پیشنهاد شوند
      if (form.companyId) {
        const compUpdate: Record<string, string> = {};
        if (form.contactPerson?.trim()) compUpdate.contactPerson = form.contactPerson.trim();
        if (form.phone?.trim()) compUpdate.phone = form.phone.trim();
        if (form.fax?.trim()) compUpdate.fax = form.fax.trim();
        if (form.communicationMethod?.trim()) compUpdate.communicationMethod = form.communicationMethod.trim();
        if (form.communicationId?.trim()) compUpdate.communicationId = form.communicationId.trim();
        if (Object.keys(compUpdate).length > 0) {
          fetch(`/api/companies/${form.companyId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...compUpdate, updatedBy: user.id }),
          }).catch(() => {});
        }
      }

      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "خطا در ذخیره";
      alert(msg);
    }
    setSaving(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleAddAttachment = async () => {
    if (!selectedFile) {
      alert("لطفا فایل را انتخاب کنید");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "خطا در آپلود");
      }
      setAttachments([
        ...attachments,
        {
          id: Date.now(),
          attachmentType: newAttachType,
          fileName: data.fileName,
          filePath: data.filePath,
          fileSize: data.fileSize,
        },
      ]);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در آپلود";
      alert(msg);
    }
    setUploading(false);
  };

  const removeAttachment = (id: number) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent mx-auto" />
        <p className="text-sm text-gray-500 mt-3">در حال بارگذاری...</p>
      </div>
    );
  }

  const displayLetterNumber = existingLetterNumber || nextLetterNumber;
  // شرط نمایش دکمه «صدور پیش‌فاکتور» داخل نامه
  const isInquiryLetter = normFa(form.requestType) === "استعلام" || normFa(form.requestType) === "پیش فاکتور";
  const canIssueProformaHere = !!letterId && !!onCreateProforma && userPerms.createProforma && isInquiryLetter;

  return (
    <div className="space-y-6 slide-in">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center hover:bg-gray-50 transition">
          →
        </button>
        <h1 className="text-2xl font-black text-gray-900">{letterId ? "ویرایش نامه" : "ثبت نامه جدید"}</h1>
        {/* صدور پیش‌فاکتور از داخل نامه — فقط نامه‌های «استعلام» و کاربران دارای مجوز صدور */}
        {canIssueProformaHere && (
          <button
            onClick={() => onCreateProforma!(letterId!)}
            className={`mr-auto px-5 py-2.5 rounded-xl text-sm font-black text-white shadow-lg transition flex items-center gap-2 ${
              proformas.length > 0
                ? "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 shadow-sky-500/25"
                : "bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-emerald-500/25"
            }`}
            title={
              proformas.length > 0
                ? `برای این نامه ${toPersianDigits(proformas.length)} پیش‌فاکتور صادر شده؛ پیش‌فاکتور بعدی با پسوند فرعی (${displayLetterNumber}/${toPersianDigits(proformas.length + 1)}) صادر می‌شود`
                : `صدور پیش‌فاکتور برای این استعلام — شماره پیش‌فاکتور همان شماره نامه (${displayLetterNumber}) خواهد بود`
            }
          >
            🧾 {proformas.length > 0 ? "صدور پیش‌فاکتور دیگر برای این نامه" : "صدور پیش‌فاکتور"}
          </button>
        )}
      </div>

      {/* Letter Number Display */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-16 translate-x-16"></div>
        <div className="relative flex items-center justify-between">
          <div>
            <div className="text-white/80 text-sm">شماره دبیرخانه</div>
            <div className="text-2xl font-black mt-1">{displayLetterNumber ? <DocNo v={displayLetterNumber} persian={false} /> : "..."}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {!letterId && (
              <span className="bg-white/20 backdrop-blur px-3 py-1.5 rounded-full text-xs font-medium">
                خودکار • پس از ثبت تثبیت می‌شود
              </span>
            )}
            {letterId && createdByName && (
              <div className="text-xs text-white/80">
                <span className="bg-white/20 backdrop-blur px-2 py-1 rounded-lg">
                  👤 ثبت: {createdByName}
                </span>
              </div>
            )}
            {letterId && updatedByName && updatedByName !== createdByName && (
              <div className="text-xs text-white/80">
                <span className="bg-white/20 backdrop-blur px-2 py-1 rounded-lg">
                  ✏️ ویرایش: {updatedByName}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Basic Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-black text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-sm">۱</span>
          اطلاعات پایه
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">شرکت / مشتری *</label>
            <CompanySearch
              value={form.companyId}
              companies={companies}
              onSelect={handleCompanySelect}
              onCompanyAdded={(c) => setCompanies((prev) => [...prev, c])}
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">تاریخ ثبت *</label>
            <PersianDatePicker
              value={form.registrationDate}
              onChange={(val) => setForm({ ...form, registrationDate: val })}
              placeholder="تاریخ ثبت"
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">تاریخ نامه *</label>
            <PersianDatePicker
              value={form.letterDate}
              onChange={(val) => setForm({ ...form, letterDate: val })}
              placeholder="تاریخ نامه"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">نوع درخواست *</label>
            <select
              value={form.requestType}
              onChange={(e) => setForm({ ...form, requestType: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-gray-50 focus:bg-white transition"
            >
              {requestTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          
          {/* Final Confirmation Box - Only shows for "تاییدیه استعلام" */}
          {form.requestType === "تاییدیه استعلام" && (
            <div className="md:col-span-3">
              <div className={`p-5 rounded-2xl border-2 transition ${
                form.isFinalConfirmed 
                  ? "bg-green-50 border-green-300" 
                  : "bg-amber-50 border-amber-300"
              }`}>
                {/* Proforma Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    🎯 انتخاب پیش‌فاکتور مورد تأیید *
                  </label>
                  {!form.companyId ? (
                    <div className="bg-white/50 rounded-xl p-3 text-sm text-gray-500 text-center">
                      ⚠️ ابتدا شرکت/مشتری را انتخاب کنید
                    </div>
                  ) : loadingProformas ? (
                    <div className="bg-white/50 rounded-xl p-3 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
                      در حال بارگذاری پیش‌فاکتورها...
                    </div>
                  ) : companyProformas.length === 0 ? (
                    <div className="bg-white/50 rounded-xl p-3 text-sm text-amber-600 text-center">
                      ⚠️ هیچ پیش‌فاکتور تأیید شده‌ای برای این مشتری وجود ندارد
                    </div>
                  ) : (
                    <select
                      value={form.confirmedProformaId}
                      onChange={(e) => setForm({ ...form, confirmedProformaId: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white transition text-sm"
                    >
                      <option value="">-- انتخاب پیش‌فاکتور --</option>
                      {companyProformas.map((p) => (
  <option key={p.id} value={p.id}>
    {String(p.proformaNumber)} • {p.issueDate}
    {!readOnly && ` • ${formatPrice(p.totalAmount)} ریال`}
  </option>
))}
                    </select>
                  )}
                  {form.confirmedProformaId && (
                    <div className="mt-2 bg-white rounded-xl p-3 border border-green-200">
                      <div className="text-xs text-gray-500 mb-1">پیش‌فاکتور انتخاب شده:</div>
                      <div className="font-bold text-green-700">
                        {companyProformas.find(p => p.id.toString() === form.confirmedProformaId)?.proformaNumber}
                        {!readOnly && ` — ${formatPrice(companyProformas.find(p => p.id.toString() === form.confirmedProformaId)?.totalAmount || "0")} ریال`}
                      </div>
                    </div>
                  )}
                </div>

                {/* Final Confirmation Checkbox */}
                <div className="flex items-start gap-3 pt-4 border-t border-gray-200/50">
                  <label className="flex items-center gap-3 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={form.isFinalConfirmed}
                      onChange={(e) => setForm({ ...form, isFinalConfirmed: e.target.checked })}
                      disabled={!form.confirmedProformaId}
                      className="w-5 h-5 rounded border-2 border-gray-300 text-green-600 focus:ring-green-500 focus:ring-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <div>
                      <span className={`font-bold ${!form.confirmedProformaId ? "text-gray-400" : "text-gray-800"}`}>
                        {form.isFinalConfirmed ? "✅ تأیید نهایی شده (فروش قطعی)" : "⏳ در انتظار تأیید نهایی مشتری"}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
                        {!form.confirmedProformaId 
                          ? "ابتدا پیش‌فاکتور را انتخاب کنید"
                          : form.isFinalConfirmed 
                            ? "این تاییدیه به عنوان فروش واقعی در گزارشات ثبت می‌شود"
                            : "تا زمان تأیید نهایی، این مورد در گزارش فروش محاسبه نمی‌شود"
                        }
                      </p>
                    </div>
                  </label>
                  {form.isFinalConfirmed && form.confirmedProformaId && (
                    <span className="bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                      فروش قطعی
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">شماره نامه مشتری</label>
            <input
              type="text"
              value={form.customerLetterNumber}
              onChange={(e) => setForm({ ...form, customerLetterNumber: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-gray-50 focus:bg-white transition"
              placeholder="اختیاری"
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">ارجاع به <span className="text-rose-500">*</span> {!letterId && (<span className="text-[10px] font-normal text-rose-500">(الزامی هنگام ثبت)</span>)} {autoFilled.has("referralDepartment") && (
                <span className="text-[10px] font-normal bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">✨</span>
              )}</label>
            <select
              value={form.referralDepartment}
              onChange={(e) => { clearAutoFlag("referralDepartment"); setForm({ ...form, referralDepartment: e.target.value }); }}
              className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-gray-50 focus:bg-white transition"
            >
              <option value="">انتخاب کنید</option>
              {departmentsList.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* بنر اطلاع‌رسانی پرشدن خودکار */}
        {loadingContact && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            در حال بازیابی آخرین اطلاعات تماس این مشتری...
          </div>
        )}
        {!loadingContact && autoFilled.size > 0 && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-800 flex items-start gap-2">
            <span className="text-sm">✨</span>
            <span>
              <strong>{toPersianDigits(autoFilled.size)} فیلد</strong> با آخرین اطلاعات ثبت‌شده این مشتری پر شد —
              در صورت تغییر، مقدار جدید را وارد کنید (همان مقدار برای دفعات بعد ذخیره می‌شود).
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              نام مسئول *
              {autoFilled.has("contactPerson") && (
                <span className="text-[10px] font-normal bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">✨ آخرین مقدار</span>
              )}
            </label>
            <input
              type="text"
              required
              placeholder="نام مسئول مربوط به نامه"
              value={form.contactPerson}
              onChange={(e) => { clearAutoFlag("contactPerson"); setForm({ ...form, contactPerson: e.target.value }); }}
              className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-gray-50 focus:bg-white transition"
            />
            <p className="text-xs text-gray-400 mt-1">آخرین مقدار ثبت‌شده برای این مشتری به‌صورت خودکار پر می‌شود</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">تلفن</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => { clearAutoFlag("phone"); setForm({ ...form, phone: e.target.value }); }}
              className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 focus:bg-white transition ltr-input"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">فکس</label>
            <input
              type="text"
              value={form.fax}
              onChange={(e) => { clearAutoFlag("fax"); setForm({ ...form, fax: e.target.value }); }}
              className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 focus:bg-white transition ltr-input"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              طریقه ارتباط
              {autoFilled.has("communicationMethod") && <span className="text-[10px] font-normal bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">✨</span>}
            </label>
            <select
              value={form.communicationMethod}
              onChange={(e) => {
                clearAutoFlag("communicationMethod");
                setForm({ ...form, communicationMethod: e.target.value });
                setShowMessengerChats(false);
                setMessengerChatsError("");
                setRecentMessengerChats([]);
                setMessengerBotUsername("");
                setMessengerBotShareUrl("");
              }}
              className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 focus:bg-white transition"
            >
              <option value="">انتخاب کنید</option>
              {commMethods.map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </div>

          <div className="md:col-span-2 relative">
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              شناسه ارتباط
              {autoFilled.has("communicationId") && <span className="text-[10px] font-normal bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">✨</span>}
            </label>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                dir="ltr"
                placeholder={isTelegramMethod ? "Chat ID عددی تلگرام" : isRubikaMethod ? "شناسه چت روبیکا (b0.../g0.../u0.../c0...)" : isBaleMethod ? "شناسه عددی چت بله" : isEitaaMethod ? "شناسه کاربر/کانال ایتا" : "آیدی پیام‌رسان، ایمیل و..."}
                value={form.communicationId}
                onChange={(e) => { clearAutoFlag("communicationId"); setForm({ ...form, communicationId: e.target.value.trim() }); }}
                className="flex-1 min-w-0 px-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 focus:bg-white transition text-left"
              />
              {supportsRecentChats && (
                <button
                  type="button"
                  onClick={loadRecentMessengerChats}
                  disabled={loadingMessengerChats}
                  title={isEitaaMethod ? "انتخاب از شناسه‌های ثبت‌شده ایتا" : `انتخاب از چت‌های اخیر ${currentMessengerLabel}`}
                  className="shrink-0 px-4 rounded-xl border-2 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-60 text-xs font-bold transition whitespace-nowrap"
                >
                  {loadingMessengerChats ? "..." : isEitaaMethod ? "📒 شناسه‌ها" : `🔎 چت‌های ${currentMessengerLabel}`}
                </button>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <label className="block text-sm font-bold text-gray-700 mb-2">شرح</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 focus:bg-white transition"
          placeholder="توضیحات نامه..."
        />
      </div>

      {/* Status (only for edit) */}
      {letterId && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-bold text-gray-900 mb-3">وضعیت</h2>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            className="w-full md:w-64 px-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="received">دریافت شده</option>
            <option value="referred">ارجاع شده</option>
            <option value="processed">پردازش شده</option>
          </select>
        </div>
      )}

      {/* Attachments - SIMPLE & REAL FILE UPLOAD */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-black text-gray-900 mb-1 flex items-center gap-2">
          <span className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center text-white">📎</span>
          پیوست‌ها
        </h3>
        <p className="text-xs text-gray-500 mb-3">فایل را انتخاب کنید — نام و مسیر به‌صورت خودکار ذخیره می‌شود</p>

        <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-[11px] leading-6 text-rose-900">
          <strong>📄 نامه رنج:</strong> اگر پیوستی با نوع «نامه رنج» ثبت شود، هنگام <strong>فروش قطعی</strong> همین نامه به
          «برنامه ریزی برون سازمانی» و «آزمایشگاه» ارجاع می‌شود. توجه: خودِ <strong>نامه استعلام (تاییدیه استعلام)</strong> دیگر برای
          آزمایشگاه و برنامه‌ریزی برون‌سازمانی ارجاع داده نمی‌شود.
        </div>

        <div className="bg-gradient-to-r from-gray-50 to-indigo-50 border-2 border-dashed border-gray-200 rounded-2xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-2">نوع پیوست</label>
              <select
                value={newAttachType}
                onChange={(e) => setNewAttachType(e.target.value)}
                className="w-full px-3 py-3 border-2 border-white rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-sm"
              >
                {ATTACH_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-2">انتخاب فایل</label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="w-full px-3 py-2.5 border-2 border-white rounded-xl bg-white shadow-sm text-sm file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:bg-indigo-50 file:text-indigo-700 file:text-xs file:font-bold hover:file:bg-indigo-100 transition"
              />
              {selectedFile && (
                <div className="text-xs text-gray-600 mt-2 bg-white px-3 py-2 rounded-xl border flex items-center justify-between">
                  <span>📄 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  <button onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-red-500 hover:text-red-700">✕</button>
                </div>
              )}
            </div>
            
            <button
              onClick={handleAddAttachment}
              disabled={uploading || !selectedFile}
              className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/25 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 h-[48px]"
            >
              {uploading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  در حال آپلود...
                </>
              ) : (
                <>+ افزودن پیوست</>
              )}
            </button>
          </div>
        </div>

        {attachments.length > 0 ? (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-bold text-gray-600 mb-2">{attachments.length} پیوست ثبت شده:</div>
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-xl hover:bg-white hover:shadow-sm transition">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border text-xs shrink-0">
                    {a.attachmentType === RANGE_LETTER_TYPE ? "📄" : "📎"}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                        a.attachmentType === RANGE_LETTER_TYPE
                          ? "bg-rose-100 text-rose-700"
                          : "bg-indigo-100 text-indigo-700"
                      }`}>{a.attachmentType}</span>
                      <span className="text-sm font-medium truncate">{a.fileName}</span>
                      {a.attachmentType === RANGE_LETTER_TYPE && (
                        <span className="text-[10px] bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full">
                          در فروش قطعی → برنامه ریزی برون + آزمایشگاه
                        </span>
                      )}
                    </div>
                    {a.filePath && (
                      <a href={a.filePath} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">مشاهده فایل →</a>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeAttachment(a.id)}
                  className="w-8 h-8 bg-white border border-gray-200 rounded-xl flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition shrink-0"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 text-center py-6 text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/50">
            هنوز پیوستی اضافه نشده — فایل را از بالا انتخاب و افزودن را بزنید
          </div>
        )}
      </div>

      {/* Case/Folder View - Only for existing letters */}
      {letterId && (proformas.length > 0 || workflow.length > 0) && (
        <div className="bg-white rounded-2xl shadow-sm border-2 border-purple-100 p-6">
          <h3 className="font-black text-purple-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center">📁</span>
            پرونده نامه
          </h3>
          
          {proformas.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-sm text-gray-700">پیش فاکتورهای مرتبط ({toPersianDigits(proformas.length)}):</h4>
                {canIssueProformaHere && (
                  <button
                    onClick={() => onCreateProforma!(letterId!)}
                    className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition"
                  >
                    🧾 + صدور پیش‌فاکتور دیگر
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {proformas.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-xl border border-purple-100">
                    <div className="flex items-center gap-2">
                      <span className="font-bold"><DocNo v={p.proformaNumber} persian={false} /></span>
                      {(p.revisionNo ?? 0) > 0 && (
                        <span className="text-[10px] bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-bold">اصلاحی</span>
                      )}
                      <span className="text-xs text-gray-500 mr-3">{p.issueDate}</span>
                      {onViewProforma && (
                        <button onClick={() => onViewProforma(p.id)} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold mr-2">
                          مشاهده ↗
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {!readOnly && (
                        <span className="text-sm font-bold text-green-700">
                          {formatPrice(p.totalAmount)} ریال
                        </span>
                      )}
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                        p.status === "approved" ? "bg-green-100 text-green-800" :
                        p.status === "rejected" ? "bg-red-100 text-red-800" :
                        p.status === "pending" ? "bg-amber-100 text-amber-800" :
                        "bg-gray-100 text-gray-800"
                      }`}>
                        {statusLabels[p.status] || p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {workflow.length > 0 && (
            <div>
              <h4 className="font-bold text-sm text-gray-700 mb-3">تاریخچه گردش کار:</h4>
              <div className="space-y-2">
                {workflow.map(w => (
                  <div key={w.id} className="flex flex-wrap items-center gap-3 text-sm bg-gray-50 p-3 rounded-xl border-r-4 border-purple-300">
                    <span className="text-xs bg-white px-2 py-1 rounded-full border whitespace-nowrap" title="زمان رویداد (به وقت تهران)">
                      🕒 {formatJalaliDateTime(w.createdAt)}
                    </span>
                    {/* نوع رویداد همیشه فارسی نمایش داده می‌شود (مثلاً refer → ارجاع) */}
                    <span className="font-bold">{workflowActionLabel(w.action)}</span>
                    {w.toDepartment && <span className="text-gray-500">→ {w.toDepartment}</span>}
                    {/* کامنت حاوی شماره نامه/پیش‌فاکتور با ایزوله bidi نمایش داده می‌شود تا برعکس نشود */}
                    {w.comment && <BidiText className="text-gray-600" text={`: ${w.comment}`} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex gap-3 justify-end">
          <button
            onClick={onBack}
            className="px-6 py-3 border-2 border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium transition"
          >
            انصراف
          </button>
          {!readOnly && (
          <button
            onClick={handleSave}
            disabled={saving || !form.registrationDate || !form.letterDate || !form.requestType || !form.contactPerson}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-indigo-500/25 transition disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                در حال ذخیره...
              </>
            ) : "ذخیره"}
          </button>
          )}
          {readOnly && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-700 font-medium">
              🔒 شما فقط دسترسی مشاهده دارید
            </div>
          )}
        </div>
      </div>

      {/* پاپ‌آپ تمام‌صفحه انتخاب شناسه ارتباط */}
      <MessengerChatPicker
        open={supportsRecentChats && showMessengerChats}
        loading={loadingMessengerChats}
        chats={recentMessengerChats}
        errorNote={messengerChatsError}
        messengerKey={isTelegramMethod ? "telegram" : isBaleMethod ? "bale" : isRubikaMethod ? "rubika" : isEitaaMethod ? "eitaa" : null}
        messengerLabel={currentMessengerLabel}
        companyId={form.companyId}
        companyName={selectedCompany?.name}
        botUsername={messengerBotUsername}
        botShareUrl={messengerBotShareUrl}
        onRefresh={loadRecentMessengerChats}
        onSelect={(chatId) => {
          clearAutoFlag("communicationId");
          setForm((prev) => ({ ...prev, communicationId: chatId }));
        }}
        onClose={() => setShowMessengerChats(false)}
      />
    </div>
  );
}
