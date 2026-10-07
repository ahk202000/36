"use client";

import { useState, useEffect, useMemo } from "react";
import type { UserInfo } from "@/app/page";
import { toPersianDigits, toJalali, formatQuantity } from "@/lib/utils";
import { isOperationalUser, getPermissions } from "@/lib/permissions";
import PersianDatePicker from "@/components/PersianDatePicker";
import Pagination from "./Pagination";
import DocNo from "@/components/DocNo";
import CustomersWorkedPanel from "@/components/CustomersWorkedPanel";
import { Users, Folder, FolderOpen, ChevronDown, ChevronUp } from "lucide-react";
import { WORKFLOW_ACTION_LABELS, workflowActionLabel } from "@/lib/workflow-actions";
import { formatJalaliDateTime, formatJalaliDate } from "@/lib/datetime";

interface WorkflowItem {
  id: number;
  letterId: number | null;
  proformaId: number | null;
  fromUserName: string | null;
  toUserName?: string | null;
  toDepartment: string | null;
  action: string;
  comment: string | null;
  isRead: boolean;
  createdAt: string;
  letterNumber: string | null;
  // نوع درخواست نامه (برای دکمه «صدور پیش‌فاکتور» روی نامه‌های استعلام)
  letterRequestType?: string | null;
  letterStatus?: string | null;
  letterProformaCount?: number | null;
  proformaNumber: string | null;
  // وضعیت فعلی پیش‌فاکتور مرتبط (برای محدودیت ثبت «انجام شد» در کارتابل مدیریت)
  proformaStatus?: string | null;
  // اطلاعات فروش قطعی
  companyName?: string | null;
  itemCount?: number | null;
  // پیوست‌های نامه (برای برون سازمانی)
  attachments?: Array<{ fileName: string; filePath: string; attachmentType: string }> | null;
  // اقلام پیش‌فاکتور (تعداد + محل کالیبره، بدون مبلغ)
  proformaItems?: Array<{ id: number; equipmentName: string | null; description: string; quantity: string; calibrationLocation: string | null }> | null;
  // وضعیت انجام
  doneStatus?: string | null; // pending | done | not_done
  doneBy?: number | null;
  doneByName?: string | null;
  note?: string | null;
  doneAt?: string | null;
  /** دستورهای صادرشده توسط خودِ کاربر (مدیر) روی همین نامه/پیش‌فاکتور —
   *  به‌جای ساختن اعلان/ردیف جدید، در همین ردیفِ روند سند نمایش داده می‌شوند. */
  ownActions?: Array<{
    id: number;
    action: string;
    comment: string | null;
    createdAt: string;
    toDepartment: string | null;
    toUserName: string | null;
  }> | null;
  /** این ردیف از روی «دستور صادره توسط خود کاربر» ساخته شده (ارجاع ورودی نیست) */
  selfIssued?: boolean;
}

interface Props {
  user: UserInfo;
  onViewLetter: (id: number) => void;
  onViewProforma: (id: number) => void;
  /** صدور پیش‌فاکتور از روی نامه (فقط برای نامه‌های «استعلام» و کاربران دارای مجوز) */
  onCreateProforma?: (letterId: number) => void;
}

/** نرمال‌سازی برچسب فارسی (ی/ک عربی، نیم‌فاصله، فاصله‌های اضافی) */
const normFa = (s: string | null | undefined) =>
  (s || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ").replace(/\s+/g, " ").trim();

/** آیا نامه از نوع «استعلام» است؟ (نه «تاییدیه استعلام») */
const isInquiryRequest = (requestType: string | null | undefined) => {
  const t = normFa(requestType);
  return t === "استعلام" || t === "پیش فاکتور";
};

const actionLabels: Record<string, string> = {
  refer: "ارجاع",
  submit: "ارسال برای تایید",
  approved: "تایید",
  rejected: "رد",
  revised: "نیاز به اصلاح",
  correction_send: "اصلاح و تایید (توسط بازرگانی)",
  final_sale: "فروش قطعی",
  confirm_refer: "تاییدیه استعلام",
  range_letter: "نامه رنج (فروش قطعی)",
  sent: "ارسال به مشتری",
  auto_sent: "ارسال خودکار به مشتری",
};

/**
 * وضعیت‌هایی از پیش‌فاکتور که در آن‌ها ثبت «انجام شد» در کارتابل مدیریت مجاز است:
 *  - approved: تایید نهایی (توسط مدیریت) یا تایید نهایی توسط بازرگانی (هر دو وضعیت approved دارند)
 *  - rejected: رد شده
 *  - final_sale: نهایی شده / فروش قطعی
 */
const PROFORMA_STATUSES_ALLOWING_DONE = ["approved", "rejected", "final_sale"];

const proformaStatusLabels: Record<string, string> = {
  draft: "پیش‌نویس",
  pending: "در انتظار تایید",
  approved: "تایید نهایی",
  rejected: "رد شده",
  revised: "نیاز به اصلاح",
  correction_send: "اصلاح و ارسال",
  ready_to_send: "آماده ارسال",
  sent: "ارسال شده به مشتری",
  final_sale: "فروش قطعی (نهایی شده)",
};

export default function Kartabl({ user, onViewLetter, onViewProforma, onCreateProforma }: Props) {
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "letters" | "proformas" | "unread" | "done" | "not_done" | "pending_task" | "inquiry">("all");
  // فرم جزئیات (اقلام + فلگ + یادداشت)
  const [detailItem, setDetailItem] = useState<WorkflowItem | null>(null);
  const [noteText, setNoteText] = useState("");
  // پنل «لیست مشتریان انجام‌شده» — مشتریانی که تاکنون برای آن‌ها کار انجام شده
  const [customersOpen, setCustomersOpen] = useState(false);

  // جستجوی سریع (نوار همیشه‌نمایش)
  const [quickSearch, setQuickSearch] = useState("");
  // فیلتر نوع فعالیت (ارجاع / فروش قطعی / اصلاحیه / تاییدیه استعلام / ...) و ارجاع‌دهنده
  const [filterAction, setFilterAction] = useState("");
  const [filterReferrer, setFilterReferrer] = useState("");
  // جستجوی پیشرفته
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchCustomer, setSearchCustomer] = useState("");
  const [searchProforma, setSearchProforma] = useState("");
  const [searchLetter, setSearchLetter] = useState("");
  const [searchDateFrom, setSearchDateFrom] = useState("");
  const [searchDateTo, setSearchDateTo] = useState("");

  // صفحه‌بندی
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ── نمای پوشه‌ای مشتریان (کارتابل‌های عملیاتی: برنامه‌ریزی درون/برون و آزمایشگاه) ──
  // هر مشتری یک «پوشه» است؛ داخل پوشه تمام فعالیت‌ها (نامه‌ها و پیش‌فاکتورهای آن مشتری)
  // به‌همراه تاریخ هر فعالیت نمایش داده می‌شود. روی لیست هر پوشه «نام مشتری + تاریخ آخرین فعالیت» دیده می‌شود.
  const [viewMode, setViewMode] = useState<"folders" | "list">("folders");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (key: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // واحدهای عملیاتی: برنامه‌ریزی درون/برون و آزمایشگاه — رفتار یکسان دارند
  const isPlannerDept = isOperationalUser(user);
  // مدیریت: ارجاع‌های ورودی را می‌بیند و وضعیت انجام آن‌ها را ثبت/پیگیری می‌کند
  const isManagement =
    normFa(user.departmentName) === "مدیریت" || user.role === "manager" || user.role === "admin";
  // چه کسانی فلگ/فیلتر «انجام شد / انجام نشد / باز» را می‌بینند: واحدهای عملیاتی + مدیریت
  const canTrackDone = isPlannerDept || isManagement;
  // چه کارتابل‌هایی نمای «پرونده‌ای / پوشه مشتری» دارند: واحدهای عملیاتی (آزمایشگاه و
  // برنامه‌ریزی) + مدیریت — کارتابل مدیر دقیقاً مثل کارتابل آزمایشگاه پرونده‌ای است.
  const canUseFolders = isPlannerDept || isManagement;
  // مجوز صدور پیش‌فاکتور (بازرگانی / مدیر / ادمین)
  const perms = getPermissions(user.role, user.permissions);
  const canIssueProforma = !!onCreateProforma && perms.createProforma && !isPlannerDept;
  // تعداد نامه‌های استعلامِ در انتظار صدور پیش‌فاکتور
  const inquiryPendingCount = items.filter(
    (it) => it.letterId && isInquiryRequest(it.letterRequestType) && !(it.letterProformaCount && it.letterProformaCount > 0)
  ).length;

  const loadItems = () => {
    const params = new URLSearchParams();
    if (user.departmentName) params.set("department", user.departmentName);
    params.set("userId", user.id.toString());

    fetch(`/api/workflow?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadItems();
  }, [user]);

  // علامت‌گذاری به عنوان خوانده شده
  const markAsRead = async (id: number) => {
    await fetch(`/api/workflow/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });
    setItems(items.map(it => it.id === id ? { ...it, isRead: true } : it));
  };

  // مشاهده و علامت‌گذاری خوانده شده
  const handleViewLetter = (letterId: number, workflowId: number, isRead: boolean) => {
    if (!isRead) markAsRead(workflowId);
    onViewLetter(letterId);
  };

  const handleViewProforma = (proformaId: number, workflowId: number, isRead: boolean) => {
    if (!isRead) markAsRead(workflowId);
    onViewProforma(proformaId);
  };

  // آیا ثبت دستی «انجام شد» برای این مورد مجاز است؟
  // در کارتابل مدیریت فقط زمانی که وضعیت پیش‌فاکتور «تایید نهایی» (توسط مدیریت یا
  // بازرگانی)، «رد شده» یا «فروش قطعی / نهایی شده» باشد می‌توان وضعیت را انجام‌شده ثبت کرد.
  const canMarkDone = (it: WorkflowItem): boolean => {
    if (!isManagement) return true; // واحدهای عملیاتی طبق روال قبل
    if (!it.proformaId) return true; // ارجاع نامه‌محور (بدون پیش‌فاکتور) محدودیتی ندارد
    return PROFORMA_STATUSES_ALLOWING_DONE.includes(it.proformaStatus || "");
  };

  const doneBlockReason = (it: WorkflowItem): string => {
    const current = it.proformaStatus
      ? (proformaStatusLabels[it.proformaStatus] || it.proformaStatus)
      : "نامشخص";
    return `ثبت «انجام شد» فقط پس از نهایی شدن پیش‌فاکتور ممکن است (تایید نهایی، تایید نهایی توسط بازرگانی، رد یا فروش قطعی). وضعیت فعلی: ${current}`;
  };

  // تغییر وضعیت انجام
  const setDoneStatus = async (id: number, status: "done" | "not_done") => {
    const target = items.find((it) => it.id === id) || (detailItem?.id === id ? detailItem : null);
    if (status === "done" && target && !canMarkDone(target)) {
      alert(doneBlockReason(target));
      return;
    }
    const res = await fetch(`/api/workflow/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doneStatus: status, doneBy: user.id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.error || "خطا در ثبت وضعیت انجام");
      return;
    }
    setItems(items.map(it => it.id === id ? { ...it, doneStatus: status } : it));
    setDetailItem((prev) => prev && prev.id === id ? { ...prev, doneStatus: status } : prev);
  };

  // ذخیره یادداشت
  const saveNote = async () => {
    if (!detailItem) return;
    await fetch(`/api/workflow/${detailItem.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: noteText }),
    });
    setItems(items.map(it => it.id === detailItem.id ? { ...it, note: noteText } : it));
    setDetailItem({ ...detailItem, note: noteText });
    alert("یادداشت ذخیره شد ✓");
  };

  // باز کردن فرم جزئیات
  const openDetail = (it: WorkflowItem) => {
    setDetailItem(it);
    setNoteText(it.note || "");
    if (!it.isRead) markAsRead(it.id);
  };

  const unreadCount = items.filter(it => !it.isRead).length;
  const doneCount = items.filter(it => it.doneStatus === "done").length;
  const notDoneCount = items.filter(it => it.doneStatus === "not_done").length;
  const pendingTaskCount = items.filter(it => !it.doneStatus || it.doneStatus === "pending").length;
  // تعداد مشتریان یکتایی که تاکنون برای آن‌ها در این واحد کار انجام شده
  const uniqueCustomersCount = new Set(
    items.filter((i) => i.companyName).map((i) => normFa(i.companyName!))
  ).size;

  const hasActiveSearch =
    quickSearch.trim() !== "" ||
    searchCustomer.trim() !== "" ||
    searchProforma.trim() !== "" ||
    searchLetter.trim() !== "" ||
    filterAction !== "" ||
    filterReferrer !== "" ||
    searchDateFrom !== "" ||
    searchDateTo !== "";

  // نرمال‌سازی متن فارسی برای جستجو
  const norm = (s: string) => s.replace(/ي/g, "ی").replace(/ك/g, "ک").toLowerCase();

  // گزینه‌های فیلتر «نوع فعالیت» — بر اساس داده واقعی کارتابل + همه انواع شناخته‌شده
  // نکته: «کارها و دستورهایی که خودِ مدیر انجام/صادر می‌کند» هم در گزینه‌های فیلتر
  // می‌آید (این دستورها ردیف/اعلان جدا نمی‌سازند و در همان ردیف سند درج شده‌اند).
  const rowActions = (it: WorkflowItem): string[] => {
    const list = [it.action, ...((it.ownActions || []).map((a) => a.action))];
    return Array.from(new Set(list.filter(Boolean)));
  };

  const actionOptions = useMemo(() => {
    const present = new Set<string>();
    for (const it of items) for (const a of rowActions(it)) present.add(a);
    const merged = new Set([...Object.keys(WORKFLOW_ACTION_LABELS), ...present]);
    return Array.from(merged)
      .map((a) => ({
        value: a,
        label: workflowActionLabel(a),
        count: items.filter((it) => rowActions(it).includes(a)).length,
      }))
      .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label, "fa"));
  }, [items]);

  // گزینه‌های فیلتر «ارجاع‌دهنده» — بر اساس افرادی که واقعاً ارجاع داده‌اند
  const referrerOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const name = (it.fromUserName || "").trim();
      if (!name) continue;
      map.set(name, (map.get(name) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fa"));
  }, [items]);

  /** چیپ‌های «دستور/روند» — دستورهایی که خودِ کاربر (مدیر) روی همین سند صادر کرده
   *  اینجا در همان ردیف سند نمایش داده می‌شود (بدون ساختن اعلان یا ردیف جدید). */
  const OwnActionChips = ({ it, compact = false }: { it: WorkflowItem; compact?: boolean }) => {
    const list = it.ownActions || [];
    if (list.length === 0) return null;
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "mt-2"}`}>
        {!compact && (
          <span className="text-[11px] text-gray-500 font-bold">🗂️ روند / دستور صادره:</span>
        )}
        {list.slice(0, compact ? 2 : 6).map((a) => (
          <span
            key={a.id}
            className="text-[11px] px-2 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 font-bold"
            title={`${workflowActionLabel(a.action)}${a.toUserName || a.toDepartment ? ` → ${a.toUserName || a.toDepartment}` : ""} — ${formatJalaliDateTime(a.createdAt)}${a.comment ? `\n${a.comment}` : ""}`}
          >
            🖋️ {workflowActionLabel(a.action)}
            {a.toUserName || a.toDepartment ? ` ← ${a.toUserName || a.toDepartment}` : ""}
            {` • ${formatJalaliDate(a.createdAt)}`}
            {!compact && a.comment ? ` — ${a.comment}` : ""}
          </span>
        ))}
        {list.length > (compact ? 2 : 6) && (
          <span className="text-[11px] text-purple-600 font-bold">
            +{toPersianDigits(list.length - (compact ? 2 : 6))} دستور دیگر
          </span>
        )}
      </div>
    );
  };

  const filtered = items.filter((it) => {
    if (filter === "letters") return !!it.letterId;
    if (filter === "proformas") return !!it.proformaId;
    if (filter === "unread") return !it.isRead;
    if (filter === "done") return it.doneStatus === "done";
    if (filter === "not_done") return it.doneStatus === "not_done";
    if (filter === "pending_task") return !it.doneStatus || it.doneStatus === "pending";
    if (filter === "inquiry") return !!it.letterId && isInquiryRequest(it.letterRequestType) && !(it.letterProformaCount && it.letterProformaCount > 0);
    return true;
  }).filter((it) => {
    // فیلتر نوع فعالیت — شامل دستورهای صادره توسط خود مدیر روی همین سند
    if (filterAction && !rowActions(it).includes(filterAction)) return false;
    // فیلتر ارجاع‌دهنده
    if (filterReferrer && (it.fromUserName || "").trim() !== filterReferrer) return false;
    // جستجوی سریع — روی همه فیلدهای مهم
    if (quickSearch.trim()) {
      const q = norm(quickSearch.trim());
      const hay = norm(
        [
          it.letterNumber || "",
          it.proformaNumber || "",
          it.companyName || "",
          it.fromUserName || "",
          it.toDepartment || "",
          it.comment || "",
          it.note || "",
          actionLabels[it.action] || it.action,
          ...(it.ownActions || []).map((a) => `${workflowActionLabel(a.action)} ${a.comment || ""} ${a.toDepartment || ""} ${a.toUserName || ""}`),
        ].join(" ")
      );
      if (!hay.includes(q)) return false;
    }
    // جستجوی پیشرفته
    if (searchCustomer.trim() && !(it.companyName || "").includes(searchCustomer.trim())) return false;
    if (searchProforma.trim() && !(it.proformaNumber || "").includes(searchProforma.trim())) return false;
    if (searchLetter.trim() && !(it.letterNumber || "").includes(searchLetter.trim())) return false;
    if (searchDateFrom) {
      const d = toJalali(it.createdAt);
      if (d < searchDateFrom) return false;
    }
    if (searchDateTo) {
      const d = toJalali(it.createdAt);
      if (d > searchDateTo) return false;
    }
    return true;
  });

  const clearSearch = () => {
    setQuickSearch("");
    setSearchCustomer("");
    setSearchProforma("");
    setSearchLetter("");
    setFilterAction("");
    setFilterReferrer("");
    setSearchDateFrom("");
    setSearchDateTo("");
    setCurrentPage(1);
  };

  // ── پوشه‌های مشتری ──
  // گروه‌بندی همه فعالیت‌های کارتابل بر اساس مشتری: برای هر مشتری یک پوشه که
  // داخل آن تمام فعالیت‌هایش (نامه‌ها + پیش‌فاکتورها + ارجاع‌ها) با تاریخ دیده می‌شود.
  const customerFolders = useMemo(() => {
    const map = new Map<string, { key: string; name: string; items: WorkflowItem[] }>();
    for (const it of filtered) {
      const name = (it.companyName || "").trim() || "بدون نام مشتری";
      const key = normFa(name);
      const g = map.get(key);
      if (g) g.items.push(it);
      else map.set(key, { key, name, items: [it] });
    }
    return Array.from(map.values())
      .map((g) => {
        const itemsSorted = [...g.items].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return {
          ...g,
          items: itemsSorted,
          lastActivity: itemsSorted[0]?.createdAt || null,
          pendingCount: itemsSorted.filter((i) => !i.doneStatus || i.doneStatus === "pending").length,
          doneCount: itemsSorted.filter((i) => i.doneStatus === "done").length,
          notDoneCount: itemsSorted.filter((i) => i.doneStatus === "not_done").length,
          unreadCount: itemsSorted.filter((i) => !i.isRead).length,
          // تعداد نامه‌ها و پیش‌فاکتورهای یکتای داخل پرونده مشتری
          letterCount: new Set(itemsSorted.filter((i) => i.letterId).map((i) => i.letterId)).size,
          proformaCount: new Set(itemsSorted.filter((i) => i.proformaId).map((i) => i.proformaId)).size,
        };
      })
      // پوشه‌های دارای کار «باز» بالاتر، سپس بر اساس تازه‌ترین تاریخ فعالیت
      .sort(
        (a, b) =>
          b.pendingCount - a.pendingCount ||
          new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime() ||
          a.name.localeCompare(b.name, "fa")
      );
  }, [filtered]);

  // صفحه‌بندی
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedList = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // صفحه‌بندی پوشه‌ها (در نمای پوشه‌ای، صفحه‌بندی روی پوشه‌های مشتری اعمال می‌شود)
  const folderTotalPages = Math.max(1, Math.ceil(customerFolders.length / pageSize));
  const safeFolderPage = Math.min(currentPage, folderTotalPages);
  const paginatedFolders = customerFolders.slice((safeFolderPage - 1) * pageSize, safeFolderPage * pageSize);

  // نمای پوشه‌ای (پرونده‌ای) برای کارتابل‌های عملیاتی (آزمایشگاه/برنامه‌ریزی) و
  // همچنین کارتابل مدیریت — طبق درخواست، کارتابل مدیر دقیقاً مثل کارتابل آزمایشگاه پرونده‌ای است.
  const folderViewActive = canUseFolders && viewMode === "folders";

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📥 کارتابل {user.departmentName || ""}</h1>
        <p className="text-gray-500 text-sm mt-1">
          کاربر: {user.fullName} • واحد: {user.departmentName || "بدون واحد"} • {toPersianDigits(items.length)} مورد ارجاعی
          {unreadCount > 0 && (
            <span className="text-red-600 font-bold mr-2">• {toPersianDigits(unreadCount)} خوانده نشده</span>
          )}
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm ${filter === "all" ? "bg-blue-600 text-white" : "bg-white border"}`}
        >
          همه ({toPersianDigits(items.length)})
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`px-4 py-2 rounded-lg text-sm flex items-center gap-1 ${filter === "unread" ? "bg-red-600 text-white" : "bg-white border text-red-600"}`}
        >
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          خوانده نشده ({toPersianDigits(unreadCount)})
        </button>
        {/* فیلترهای نامه/پیش‌فاکتور — در کارتابل مدیریت نمایش داده نمی‌شوند؛
            کارتابل مدیریت «فقط پیش‌فاکتور» است */}
        {!isManagement && (
          <>
            <button
              onClick={() => setFilter("letters")}
              className={`px-4 py-2 rounded-lg text-sm ${filter === "letters" ? "bg-blue-600 text-white" : "bg-white border"}`}
            >
              نامه‌ها ({toPersianDigits(items.filter((i) => i.letterId).length)})
            </button>
            <button
              onClick={() => setFilter("proformas")}
              className={`px-4 py-2 rounded-lg text-sm ${filter === "proformas" ? "bg-blue-600 text-white" : "bg-white border"}`}
            >
              پیش‌فاکتورها ({toPersianDigits(items.filter((i) => i.proformaId).length)})
            </button>
          </>
        )}
        {/* فیلتر استعلام‌های در انتظار صدور پیش‌فاکتور — برای بازرگانی (نه مدیریت) */}
        {canIssueProforma && !isManagement && (
          <button
            onClick={() => setFilter("inquiry")}
            className={`px-4 py-2 rounded-lg text-sm flex items-center gap-1 ${filter === "inquiry" ? "bg-emerald-600 text-white" : "bg-white border text-emerald-700"}`}
            title="نامه‌های استعلام که هنوز پیش‌فاکتوری برایشان صادر نشده"
          >
            🧾 استعلام‌های بدون پیش‌فاکتور ({toPersianDigits(inquiryPendingCount)})
          </button>
        )}
        {/* فیلترهای وضعیت انجام — برای واحدهای عملیاتی و مدیریت */}
        {canTrackDone && (
          <>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => setFilter("pending_task")}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-1 ${filter === "pending_task" ? "bg-amber-600 text-white" : "bg-white border text-amber-600"}`}
            >
              ⏳ باز / در انتظار ({toPersianDigits(pendingTaskCount)})
            </button>
            <button
              onClick={() => setFilter("done")}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-1 ${filter === "done" ? "bg-green-600 text-white" : "bg-white border text-green-600"}`}
            >
              ✅ انجام شده ({toPersianDigits(doneCount)})
            </button>
            <button
              onClick={() => setFilter("not_done")}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-1 ${filter === "not_done" ? "bg-red-600 text-white" : "bg-white border text-red-600"}`}
            >
              ❌ انجام نشده ({toPersianDigits(notDoneCount)})
            </button>
          </>
        )}
        {/* دکمه جستجوی پیشرفته */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className={`px-4 py-2 rounded-lg text-sm flex items-center gap-1 ${searchOpen || hasActiveSearch ? "bg-indigo-600 text-white" : "bg-white border text-indigo-600"}`}
        >
          🔍 جستجوی پیشرفته
          {hasActiveSearch && <span className="w-2 h-2 bg-indigo-300 rounded-full"></span>}
        </button>
        {/* لیست مشتریان انجام‌شده — مشتریانی که تاکنون برای آن‌ها کار انجام شده؛
            وضعیت هر مشتری در انتهای سطرش نمایش داده می‌شود */}
        <button
          onClick={() => setCustomersOpen(true)}
          className="px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 bg-white border text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition font-bold"
          title="لیست مشتریانی که تاکنون در این واحد برای آن‌ها کار انجام شده — به‌همراه وضعیت هر مشتری در انتهای سطر"
        >
          <Users className="w-4 h-4" />
          لیست مشتریان انجام‌شده ({toPersianDigits(uniqueCustomersCount)})
        </button>
        {/* تعویض حالت نمایش: «پوشه‌های مشتری» / «لیست ساده» — ویژه کارتابل‌های عملیاتی
            (برنامه‌ریزی درون سازمانی، برنامه‌ریزی برون سازمانی، آزمایشگاه) */}
        {canUseFolders && (
          <div className="flex items-center rounded-lg overflow-hidden border border-indigo-200 shadow-sm" title="انتخاب حالت نمایش کارتابل">
            <button
              onClick={() => { setViewMode("folders"); setCurrentPage(1); }}
              className={`px-3 py-2 text-xs font-bold flex items-center gap-1.5 transition ${
                viewMode === "folders" ? "bg-indigo-600 text-white" : "bg-white text-indigo-700 hover:bg-indigo-50"
              }`}
              title="نمای پوشه‌ای: برای هر مشتری یک پوشه شامل همه فعالیت‌ها (نامه‌ها و پیش‌فاکتورها) با تاریخ"
            >
              <Folder className="w-4 h-4" />
              پوشه‌های مشتری
            </button>
            <button
              onClick={() => { setViewMode("list"); setCurrentPage(1); }}
              className={`px-3 py-2 text-xs font-bold flex items-center gap-1.5 transition border-r border-indigo-200 ${
                viewMode === "list" ? "bg-indigo-600 text-white" : "bg-white text-indigo-700 hover:bg-indigo-50"
              }`}
              title="نمای لیستی ساده (همه موارد پشت سر هم)"
            >
              ☰ لیست ساده
            </button>
          </div>
        )}
      </div>

      {/* ── نوار جستجوی سریع ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-lg">
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={quickSearch}
            onChange={(e) => { setQuickSearch(e.target.value); setCurrentPage(1); }}
            placeholder="جستجو در شماره نامه، پیش‌فاکتور، مشتری، فرستنده، توضیحات ..."
            className="w-full pr-10 pl-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition bg-white"
          />
          {quickSearch && (
            <button
              onClick={() => setQuickSearch("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
            >
              ✕
            </button>
          )}
        </div>
        {/* فیلتر نوع فعالیت — ارجاع / فروش قطعی / اصلاحیه / تاییدیه استعلام / نامه رنج و ... */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">نوع فعالیت:</label>
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setCurrentPage(1); }}
            className={`px-3 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white max-w-[190px] ${filterAction ? "border-indigo-400 text-indigo-800 font-bold" : "border-gray-200"}`}
            title="فیلتر بر اساس نوع فعالیت"
          >
            <option value="">همه فعالیت‌ها</option>
            {actionOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}{o.count > 0 ? ` (${toPersianDigits(o.count)})` : ""}
              </option>
            ))}
          </select>
        </div>
        {/* فیلتر ارجاع‌دهنده */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">ارجاع‌دهنده:</label>
          <select
            value={filterReferrer}
            onChange={(e) => { setFilterReferrer(e.target.value); setCurrentPage(1); }}
            className={`px-3 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white max-w-[190px] ${filterReferrer ? "border-indigo-400 text-indigo-800 font-bold" : "border-gray-200"}`}
            title="فیلتر بر اساس ارجاع‌دهنده"
          >
            <option value="">همه ارجاع‌دهندگان</option>
            {referrerOptions.map((o) => (
              <option key={o.name} value={o.name}>
                {o.name} ({toPersianDigits(o.count)})
              </option>
            ))}
          </select>
        </div>
        {hasActiveSearch && (
          <button onClick={clearSearch} className="text-red-500 hover:text-red-700 text-xs font-medium">
            ✕ پاک‌سازی همه فیلترها
          </button>
        )}
        <span className="text-xs text-gray-400 mr-auto">
          {hasActiveSearch
            ? `${toPersianDigits(filtered.length)} از ${toPersianDigits(items.length)} مورد`
            : `${toPersianDigits(items.length)} مورد`}
        </span>
      </div>

      {/* ── پنل جستجوی پیشرفته ── */}
      {searchOpen && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-5 mb-4 border border-indigo-100">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* نام مشتری */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">نام مشتری</label>
              <input
                type="text"
                value={searchCustomer}
                onChange={(e) => setSearchCustomer(e.target.value)}
                placeholder="جستجو بر اساس نام مشتری..."
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>
            {/* شماره پیش‌فاکتور */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">شماره پیش‌فاکتور</label>
              <input
                type="text"
                value={searchProforma}
                onChange={(e) => setSearchProforma(e.target.value)}
                placeholder="مثلا: PF-1404-0001"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>
            {/* شماره نامه */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">شماره نامه</label>
              <input
                type="text"
                value={searchLetter}
                onChange={(e) => setSearchLetter(e.target.value)}
                placeholder="مثلا: 1404/0001"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>
            {/* تاریخ از */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">از تاریخ</label>
              <PersianDatePicker
                value={searchDateFrom}
                onChange={setSearchDateFrom}
                placeholder="از تاریخ"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>
            {/* تاریخ تا */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">تا تاریخ</label>
              <PersianDatePicker
                value={searchDateTo}
                onChange={setSearchDateTo}
                placeholder="تا تاریخ"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>
            {/* دکمه پاک‌سازی */}
            <div className="flex items-end">
              <button
                onClick={clearSearch}
                className="px-4 py-2 border border-red-200 rounded-xl text-sm text-red-600 hover:bg-red-50 transition"
              >
                پاک‌سازی جستجو
              </button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-gray-500">موردی در کارتابل شما وجود ندارد</p>
          <p className="text-xs text-gray-400 mt-2">
            {isManagement
              ? "پیش‌فاکتورهای ارجاع شده به مدیریت اینجا نمایش داده می‌شوند"
              : `نامه‌ها و پیش‌فاکتورهای ارجاع شده به "${user.departmentName}" اینجا نمایش داده می‌شوند`}
          </p>
        </div>
      ) : folderViewActive ? (
        <>
        {/* ── نمای پوشه‌ای مشتریان ──
            برای هر مشتری یک پوشه: سربرگ پوشه = نام مشتری + تاریخ آخرین فعالیت + شمارش‌ها،
            داخل پوشه = تمامی فعالیت‌های مشتری (نامه‌ها و پیش‌فاکتورها) به‌همراه تاریخ */}
        {customerFolders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <Folder className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">پوشه‌ای یافت نشد — با تغییر فیلترها دوباره تلاش کنید</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedFolders.map((f) => {
              const isOpen = openFolders.has(f.key);
              return (
                <div key={f.key} className={`bg-white rounded-xl shadow-sm border transition ${f.unreadCount > 0 ? "border-red-200" : "border-gray-100"}`}>
                  {/* سربرگ پوشه مشتری — نام مشتری + تاریخ + شمارش‌ها */}
                  <button
                    onClick={() => toggleFolder(f.key)}
                    className="w-full flex items-center gap-3 p-4 text-right hover:bg-indigo-50/40 transition rounded-xl"
                  >
                    <span className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${f.pendingCount > 0 ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600"}`}>
                      {isOpen ? <FolderOpen className="w-6 h-6" /> : <Folder className="w-6 h-6" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-gray-800 text-sm">{f.name}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-bold">{toPersianDigits(f.items.length)} فعالیت</span>
                        {!isManagement && f.letterCount > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold">📨 {toPersianDigits(f.letterCount)} نامه</span>}
                        {f.proformaCount > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-bold">📋 {toPersianDigits(f.proformaCount)} پیش‌فاکتور</span>}
                        {f.pendingCount > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">⏳ {toPersianDigits(f.pendingCount)} باز</span>}
                        {f.doneCount > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">✅ {toPersianDigits(f.doneCount)} انجام‌شده</span>}
                        {f.notDoneCount > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">❌ {toPersianDigits(f.notDoneCount)} انجام‌نشده</span>}
                        {f.unreadCount > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500 text-white font-bold animate-pulse">{toPersianDigits(f.unreadCount)} جدید</span>}
                      </div>
                      {/* تاریخ — طبق درخواست: روی لیست هر پوشه تاریخ آخرین فعالیت دیده می‌شود */}
                      <div className="text-xs text-gray-500 mt-1">
                        🕒 آخرین فعالیت: {f.lastActivity ? formatJalaliDateTime(f.lastActivity) : "—"}
                      </div>
                    </div>
                    {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />}
                  </button>
                  {/* داخل پوشه: تمام فعالیت‌های این مشتری با تاریخ (پرونده مشتری) */}
                  {isOpen && (
                    <div className="border-t border-gray-100 p-3 overflow-x-auto">
                      <table className="w-full text-xs min-w-[720px]">
                        <thead>
                          <tr className="text-gray-500 border-b border-gray-100">
                            <th className="py-2 px-2 text-right font-bold">تاریخ فعالیت</th>
                            <th className="py-2 px-2 text-right font-bold">سند</th>
                            <th className="py-2 px-2 text-right font-bold">نوع فعالیت</th>
                            <th className="py-2 px-2 text-right font-bold">ارجاع‌دهنده</th>
                            <th className="py-2 px-2 text-right font-bold">دستور / روند</th>
                            <th className="py-2 px-2 text-right font-bold">وضعیت انجام</th>
                            <th className="py-2 px-2 text-right font-bold">عملیات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {f.items.map((it) => (
                            <tr key={it.id} className={`hover:bg-indigo-50/40 transition ${!it.isRead ? "bg-red-50/60" : ""}`}>
                              <td className="py-2 px-2 whitespace-nowrap text-gray-600">🕒 {formatJalaliDateTime(it.createdAt)}</td>
                              <td className="py-2 px-2 font-bold">
                                {/* در کارتابل مدیریت همه ردیف‌ها پیش‌فاکتور محسوب می‌شوند */}
                                {(() => { const isLetterDoc = !!it.letterId && (!isManagement || !it.proformaId); return (
                                <span className={`inline-block px-1.5 py-0.5 rounded ml-1.5 ${isLetterDoc ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}`}>
                                  {isLetterDoc ? "نامه" : "پیش‌فاکتور"}
                                </span>
                                ); })()}
                                <DocNo v={(isManagement && it.proformaId ? it.proformaNumber : null) || it.letterNumber || it.proformaNumber || `#${it.letterId || it.proformaId}`} persian={false} />
                              </td>
                              <td className="py-2 px-2">
                                {workflowActionLabel(it.action)}
                                {it.selfIssued && (
                                  <span className="mr-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold">دستور صادره</span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-gray-600">{it.fromUserName || "—"}</td>
                              <td className="py-2 px-2">
                                {(it.ownActions?.length ?? 0) > 0 ? (
                                  <OwnActionChips it={it} compact />
                                ) : it.comment ? (
                                  <span className="text-[11px] text-gray-500">💬 {it.comment}</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="py-2 px-2">
                                {it.doneStatus === "done" ? (
                                  <span className="text-green-700 font-bold">✅ انجام شد</span>
                                ) : it.doneStatus === "not_done" ? (
                                  <span className="text-red-700 font-bold">❌ انجام نشد</span>
                                ) : (
                                  <span className="text-amber-600 font-bold">⏳ باز</span>
                                )}
                              </td>
                               <td className="py-2 px-2">
                                 <div className="flex gap-1.5">
                                   {/* کارتابل مدیریت «فقط پیش‌فاکتور» است — دکمه مشاهده نامه ندارد */}
                                   {it.letterId && !isManagement && (
                                     <button
                                       onClick={() => handleViewLetter(it.letterId!, it.id, it.isRead)}
                                       className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                                     >
                                       مشاهده نامه
                                     </button>
                                   )}
                                  {it.proformaId && !isPlannerDept && (
                                    <button
                                      onClick={() => handleViewProforma(it.proformaId!, it.id, it.isRead)}
                                      className="px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                                    >
                                      مشاهده پیش‌فاکتور
                                    </button>
                                  )}
                                  <button
                                    onClick={() => openDetail(it)}
                                    className="px-2 py-1 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-bold"
                                  >
                                    جزئیات
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* ── صفحه‌بندی پوشه‌های مشتری ── */}
        <Pagination
          currentPage={safeFolderPage}
          totalPages={folderTotalPages}
          totalItems={customerFolders.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
        />
        </>
      ) : (
        <>
        <div className="space-y-3">
          {paginatedList.map((it) => (
            <div 
              key={it.id} 
              className={`bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition border-r-4 ${
                !it.isRead 
                  ? "border-red-500 bg-red-50" 
                  : it.letterId ? "border-blue-500" : "border-green-500"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {/* نشانگر خوانده نشده */}
                    {!it.isRead && (
                      <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" title="خوانده نشده"></span>
                    )}
                    {/* در کارتابل مدیریت همه ردیف‌ها «پیش‌فاکتور» هستند */}
                    {(() => { const isLetterDoc = !!it.letterId && (!isManagement || !it.proformaId); return (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      isLetterDoc ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"
                    }`}>
                      {isLetterDoc ? "📨 نامه" : "📋 پیش‌فاکتور"}
                    </span>
                    ); })()}
                    <span className="font-bold text-sm">
                      <DocNo v={(isManagement && it.proformaId ? it.proformaNumber : null) || it.letterNumber || it.proformaNumber || `#${it.letterId || it.proformaId}`} persian={false} />
                    </span>
                    {/* نام مشتری — برای هر نامه/پیش‌فاکتور در کارتابل نمایش داده می‌شود */}
                    {it.companyName && (
                      <span
                        className="text-xs px-2 py-1 rounded-lg font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1"
                        title="نام مشتری"
                      >
                        🏢 {it.companyName}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-1 rounded font-bold ${
                      it.action === "correction_send"
                        ? "bg-violet-100 text-violet-800 border border-violet-300"
                        : "bg-gray-100"
                    }`}>
                      {it.action === "correction_send" && "🖊️ "}
                      {workflowActionLabel(it.action)}
                    </span>
                    {/* وضعیت فعلی پیش‌فاکتور — همیشه به‌روز از روی سند خوانده می‌شود تا
                        با مشخص شدن تکلیف (تایید نهایی/رد/فروش قطعی و...) وضعیت موردِ
                        کارتابل هم بلافاصله تغییر کند */}
                    {it.proformaId && it.proformaStatus && (
                      <span
                        className={`text-xs px-2 py-1 rounded font-bold border ${
                          it.proformaStatus === "approved"
                            ? "bg-green-100 text-green-800 border-green-300"
                            : it.proformaStatus === "rejected"
                              ? "bg-red-100 text-red-700 border-red-300"
                              : it.proformaStatus === "final_sale"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : it.proformaStatus === "sent" || it.proformaStatus === "ready_to_send"
                                  ? "bg-sky-100 text-sky-800 border-sky-300"
                                  : it.proformaStatus === "pending"
                                    ? "bg-amber-100 text-amber-800 border-amber-300"
                                    : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                        title="وضعیت فعلی پیش‌فاکتور (به‌روز)"
                      >
                        🧾 {proformaStatusLabels[it.proformaStatus] || it.proformaStatus}
                      </span>
                    )}
                    {/* وضعیت انجام دستور — باز / انجام شد / انجام نشد
                        (برای همه واحدها از جمله مدیریت همیشه نمایش داده می‌شود) */}
                    {it.doneStatus === "done" ? (
                      <span
                        className="text-xs px-2 py-1 rounded font-bold bg-green-100 text-green-800 border border-green-300"
                        title={it.doneByName ? `توسط ${it.doneByName} ثبت شد` : "انجام شد"}
                      >
                        ✅ انجام شد
                      </span>
                    ) : it.doneStatus === "not_done" ? (
                      <span
                        className="text-xs px-2 py-1 rounded font-bold bg-red-100 text-red-700 border border-red-300"
                        title={it.doneByName ? `توسط ${it.doneByName} ثبت شد` : "انجام نشد"}
                      >
                        ❌ انجام نشد
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded font-bold bg-amber-100 text-amber-700 border border-amber-300">
                        ⏳ باز
                      </span>
                    )}
                    {!it.isRead && !it.selfIssued && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-bold">جدید</span>
                    )}
                    {it.selfIssued && (
                      <span
                        className="text-xs bg-purple-100 text-purple-800 border border-purple-300 px-2 py-1 rounded font-bold"
                        title="این مورد، دستور/اقدام صادرشده توسط خود شماست و در همین ردیف سند نمایش داده می‌شود"
                      >
                        🖋️ دستور صادره
                      </span>
                    )}
                    {/* نشانگرهای مربوط به «نامه» در کارتابل مدیریت نمایش داده نمی‌شوند */}
                    {!isManagement && it.letterId && it.letterRequestType && (
                      <span className={`text-xs px-2 py-1 rounded font-bold ${
                        isInquiryRequest(it.letterRequestType)
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : "bg-slate-100 text-slate-700"
                      }`}>
                        {isInquiryRequest(it.letterRequestType) && "📝 "}
                        {it.letterRequestType}
                      </span>
                    )}
                    {!isManagement && it.letterId && isInquiryRequest(it.letterRequestType) && (it.letterProformaCount ?? 0) > 0 && (
                      <span className="text-xs bg-sky-100 text-sky-800 px-2 py-1 rounded font-bold" title="تعداد پیش‌فاکتورهای صادرشده برای این نامه">
                        🧾 {toPersianDigits(it.letterProformaCount!)} پیش‌فاکتور صادر شده
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-600">
                    {/* ارجاع‌دهنده — چه کسی این دستور را داده است، به‌صورت مشخص */}
                    {it.fromUserName ? (
                      <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg px-2.5 py-1 font-bold text-xs">
                        👤 ارجاع‌دهنده: {it.fromUserName}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 bg-gray-50 text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1 text-xs">
                        👤 ارجاع‌دهنده: نامشخص
                      </span>
                    )}
                    {(it.toUserName || it.toDepartment) && (
                      <span className="text-xs">
                        به: <strong>{it.toUserName || it.toDepartment}</strong>
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      🕒 {formatJalaliDateTime(it.createdAt)}
                    </span>
                    {/* چه کسی و چه زمانی وضعیت انجام را ثبت کرده است */}
                    {it.doneStatus && it.doneStatus !== "pending" && (it.doneByName || it.doneAt) && (
                      <span className={`text-xs font-bold ${it.doneStatus === "done" ? "text-green-700" : "text-red-700"}`}>
                        {it.doneStatus === "done" ? "انجام شد" : "انجام نشد"}
                        {it.doneByName ? ` توسط ${it.doneByName}` : ""}
                        {it.doneAt ? ` — ${formatJalaliDateTime(it.doneAt)}` : ""}
                      </span>
                    )}
                  </div>

                  {/* نمایش خلاصه — شماره پیش‌فاکتور + نام مشتری + تعداد اقلام + تعداد پیوست (بدون ریز اقلام در لیست)
                      در کارتابل مدیریت برای سادگی نمایش داده نمی‌شود (ریز جزئیات در صفحه پیش‌فاکتور است) */}
                  {!isManagement && (it.action === "final_sale" || it.action === "confirm_refer" || it.action === "range_letter") && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {it.proformaNumber && (
                        <span className="text-sm font-bold bg-violet-50 border border-violet-300 rounded-lg px-3 py-1.5 text-violet-800 flex items-center gap-1.5">
                          🧾 پیش‌فاکتور شماره: <span className="font-black"><DocNo v={it.proformaNumber} /></span>
                        </span>
                      )}
                      <span className="text-sm font-bold text-gray-800 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                        🏢 نام مشتری: <span className="text-green-800">{it.companyName || "—"}</span>
                      </span>
                      {it.itemCount !== null && it.itemCount !== undefined && it.itemCount > 0 && (
                        <span className="text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-1 text-blue-800 font-bold">
                          📦 {toPersianDigits(it.itemCount)} قلم (بدون مبلغ)
                        </span>
                      )}
                      {/* پیوست‌ها — برای نامه رنج فایل به‌صورت قابل‌کلیک نمایش داده می‌شود تا کارشناس خود نامه را ببیند */}
                      {it.action === "range_letter" ? (
                        it.attachments && it.attachments.length > 0 ? (
                          it.attachments.map((a, idx) => (
                            <a
                              key={idx}
                              href={a.filePath}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="مشاهده فایل نامه رنج در تب جدید"
                              className="text-sm font-bold bg-rose-600 text-white border border-rose-700 rounded-lg px-3 py-1.5 flex items-center gap-1.5 hover:bg-rose-700 transition shadow-sm"
                            >
                              📄 نامه رنج: {a.fileName}
                              <span className="text-rose-100">↗</span>
                            </a>
                          ))
                        ) : (
                          <span className="text-xs font-bold bg-amber-50 border border-amber-300 text-amber-700 rounded-lg px-3 py-1.5">
                            ⚠️ فایل نامه رنج به این نامه پیوست نشده — از ثبت‌کننده بخواهید در فرم نامه، پیوست نوع «نامه رنج» را بارگذاری کند
                          </span>
                        )
                      ) : (
                        it.attachments && it.attachments.length > 0 && (
                          <span className="text-sm border rounded-lg px-3 py-1 font-bold bg-purple-50 border-purple-200 text-purple-700">
                            📎 {toPersianDigits(it.attachments.length)} پیوست
                          </span>
                        )
                      )}
                    </div>
                  )}

                  {it.comment && (
                    <div className="mt-2 text-sm bg-yellow-50 border border-yellow-200 rounded p-2 text-yellow-800">
                      💬 {it.comment}
                    </div>
                  )}

                  {/* دستورهای صادره توسط خودِ کاربر — در کارتابل مدیریت فقط در
                      «جزئیات» دیده می‌شود (ردیف لیست ساده و خلوت می‌ماند)؛ در
                      کارتابل‌های عملیاتی همچنان زیر همان ردیف نمایش داده می‌شود */}
                  {!isManagement && <OwnActionChips it={it} />}
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  {/* کارتابل مدیریت «فقط پیش‌فاکتور» است — دکمه مشاهده نامه ندارد */}
                  {it.letterId && !isManagement && (
                    <button
                      onClick={() => handleViewLetter(it.letterId!, it.id, it.isRead)}
                      className={`px-4 py-1.5 rounded text-xs ${
                        !it.isRead 
                          ? "bg-red-600 text-white hover:bg-red-700" 
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {!it.isRead ? "👁️ مشاهده (جدید)" : "مشاهده نامه"}
                    </button>
                  )}
                  {/* صدور پیش‌فاکتور — فقط برای نامه‌های «استعلام» و کاربران دارای مجوز (بازرگانی، نه مدیریت) */}
                  {!isManagement && it.letterId && canIssueProforma && isInquiryRequest(it.letterRequestType) && (
                    <button
                      onClick={() => {
                        if (!it.isRead) markAsRead(it.id);
                        onCreateProforma!(it.letterId!);
                      }}
                      className={`px-4 py-1.5 rounded text-xs font-bold text-white shadow-sm transition ${
                        (it.letterProformaCount ?? 0) > 0
                          ? "bg-sky-600 hover:bg-sky-700"
                          : "bg-emerald-600 hover:bg-emerald-700"
                      }`}
                      title={
                        (it.letterProformaCount ?? 0) > 0
                          ? "برای این نامه قبلاً پیش‌فاکتور صادر شده؛ پیش‌فاکتور بعدی با پسوند فرعی (مثلاً شماره‌نامه/2) صادر می‌شود"
                          : "صدور پیش‌فاکتور برای این استعلام — شماره پیش‌فاکتور همان شماره نامه خواهد بود"
                      }
                    >
                      {(it.letterProformaCount ?? 0) > 0 ? "🧾 صدور پیش‌فاکتور دیگر" : "🧾 صدور پیش‌فاکتور"}
                    </button>
                  )}
                  {it.proformaId && !isPlannerDept && (
                    <button
                      onClick={() => handleViewProforma(it.proformaId!, it.id, it.isRead)}
                      className={`px-4 py-1.5 rounded text-xs ${
                        !it.isRead 
                          ? "bg-red-600 text-white hover:bg-red-700" 
                          : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                    >
                      {!it.isRead ? "👁️ مشاهده (جدید)" : "مشاهده پیش‌فاکتور"}
                    </button>
                  )}
                  {!it.isRead && (
                    <button
                      onClick={() => markAsRead(it.id)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      ✓ علامت خوانده شده
                    </button>
                  )}
                  {/* وضعیت و دکمه‌های اقدام — واحدهای عملیاتی (ارجاع‌های فروش/رنج)
                      و مدیریت روی همه ارجاع‌های کارتابل خود */}
                  {((isPlannerDept && (it.action === "final_sale" || it.action === "confirm_refer" || it.action === "range_letter")) || isManagement) && (
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {it.doneStatus === "done" ? (
                        <>
                          <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-lg font-bold">✅ انجام شد</span>
                          <button
                            onClick={() => setDoneStatus(it.id, "not_done")}
                            className="text-xs bg-red-500 text-white px-2 py-1 rounded-lg hover:bg-red-600 font-bold"
                            title="تغییر به انجام نشد"
                          >
                            ❌
                          </button>
                        </>
                      ) : it.doneStatus === "not_done" ? (
                        <>
                          <span className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-lg font-bold">❌ انجام نشد</span>
                          <button
                            onClick={() => setDoneStatus(it.id, "done")}
                            disabled={!canMarkDone(it)}
                            className={`text-xs text-white px-2 py-1 rounded-lg font-bold ${canMarkDone(it) ? "bg-green-500 hover:bg-green-600" : "bg-gray-300 cursor-not-allowed"}`}
                            title={canMarkDone(it) ? "تغییر به انجام شد" : doneBlockReason(it)}
                          >
                            ✅
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setDoneStatus(it.id, "done")}
                            disabled={!canMarkDone(it)}
                            className={`text-xs text-white px-3 py-1.5 rounded-lg font-bold ${canMarkDone(it) ? "bg-green-500 hover:bg-green-600" : "bg-gray-300 cursor-not-allowed"}`}
                            title={canMarkDone(it) ? undefined : doneBlockReason(it)}
                          >
                            ✅ انجام شد
                          </button>
                          <button
                            onClick={() => setDoneStatus(it.id, "not_done")}
                            className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 font-bold"
                          >
                            ❌ انجام نشد
                          </button>
                          {!canMarkDone(it) && (
                            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 font-bold">
                              ⏳ «انجام شد» پس از نهایی شدن پیش‌فاکتور (تایید نهایی / رد / فروش قطعی) فعال می‌شود
                            </span>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => openDetail(it)}
                        className="text-xs bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600 font-bold"
                      >
                        📋 جزئیات و یادداشت
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── صفحه‌بندی ── */}
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
        />
        </>
      )}

      {/* ── فرم جزئیات (اقلام + فلگ + یادداشت) ── */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-black text-lg">📋 جزئیات مورد</h3>
                <p className="text-white/80 text-xs mt-1">
                  {detailItem.letterNumber && <span>نامه <DocNo v={detailItem.letterNumber} /></span>}
                  {detailItem.letterNumber && detailItem.proformaNumber && <span> • </span>}
                  {detailItem.proformaNumber && <span className="font-black text-white">پیش‌فاکتور <DocNo v={detailItem.proformaNumber} /></span>}
                  {(detailItem.letterNumber || detailItem.proformaNumber) && <span> • </span>}
                  <span>{actionLabels[detailItem.action] || detailItem.action}</span>
                </p>
              </div>
              <button onClick={() => setDetailItem(null)} className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition text-xl">✕</button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-5 space-y-4">
              {/* اطلاعات پایه */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-1 text-sm">
                {detailItem.companyName && <p><span className="text-gray-500">شرکت:</span> <strong>{detailItem.companyName}</strong></p>}
                <p>
                  <span className="text-gray-500">ارجاع‌دهنده:</span>{" "}
                  <strong className="text-indigo-800">{detailItem.fromUserName || "نامشخص"}</strong>
                </p>
                {(detailItem.toUserName || detailItem.toDepartment) && (
                  <p><span className="text-gray-500">ارجاع به:</span> <strong>{detailItem.toUserName || detailItem.toDepartment}</strong></p>
                )}
                <p><span className="text-gray-500">تاریخ ارجاع:</span> {formatJalaliDateTime(detailItem.createdAt)}</p>
                {/* وضعیت انجام دستور به‌صورت شفاف: باز / انجام شد / انجام نشد + چه کسی و کی */}
                <p className="flex items-center gap-2 flex-wrap">
                  <span className="text-gray-500">وضعیت انجام:</span>
                  {detailItem.doneStatus === "done" ? (
                    <span className="text-xs px-2 py-1 rounded font-bold bg-green-100 text-green-800 border border-green-300">✅ انجام شد</span>
                  ) : detailItem.doneStatus === "not_done" ? (
                    <span className="text-xs px-2 py-1 rounded font-bold bg-red-100 text-red-700 border border-red-300">❌ انجام نشد</span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded font-bold bg-amber-100 text-amber-700 border border-amber-300">⏳ باز / در انتظار</span>
                  )}
                  {detailItem.doneStatus && detailItem.doneStatus !== "pending" && (detailItem.doneByName || detailItem.doneAt) && (
                    <span className="text-xs text-gray-500">
                      {detailItem.doneByName ? `توسط ${detailItem.doneByName}` : ""}
                      {detailItem.doneAt ? ` — ${formatJalaliDateTime(detailItem.doneAt)}` : ""}
                    </span>
                  )}
                </p>
              </div>

              {/* روند سند: دستورهای صادرشده توسط خودِ کاربر (مدیر) روی همین نامه/پیش‌فاکتور
                  — به‌جای اعلان یا ردیف جداگانه، در همین پرونده/ردیف ثبت و نمایش داده می‌شود */}
              {(detailItem.ownActions?.length ?? 0) > 0 && (
                <div>
                  <h4 className="font-bold text-gray-700 mb-2">🖋️ دستورهای صادرشده توسط شما روی این سند:</h4>
                  <div className="border border-purple-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-purple-50">
                        <tr>
                          <th className="px-3 py-2 text-right font-bold text-purple-700">تاریخ</th>
                          <th className="px-3 py-2 text-right font-bold text-purple-700">نوع دستور</th>
                          <th className="px-3 py-2 text-right font-bold text-purple-700">به</th>
                          <th className="px-3 py-2 text-right font-bold text-purple-700">متن دستور</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-100">
                        {detailItem.ownActions!.map((a) => (
                          <tr key={a.id} className="hover:bg-purple-50/50">
                            <td className="px-3 py-2 whitespace-nowrap">{formatJalaliDateTime(a.createdAt)}</td>
                            <td className="px-3 py-2 font-bold">{workflowActionLabel(a.action)}</td>
                            <td className="px-3 py-2">{a.toUserName || a.toDepartment || "—"}</td>
                            <td className="px-3 py-2 text-gray-700">{a.comment || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* اقلام پیش‌فاکتور (بدون مبلغ) — شماره پیش‌فاکتور همراه اقلام نمایش داده می‌شود */}
              {detailItem.proformaItems && detailItem.proformaItems.length > 0 && (
                <div>
                  <h4 className="font-bold text-gray-700 mb-2">
                    📦 اقلام پیش‌فاکتور{detailItem.proformaNumber ? ` شماره ${toPersianDigits(detailItem.proformaNumber)}` : ""} (بدون مبلغ):
                  </h4>
                  <div className="overflow-x-auto border border-gray-200 rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-right font-bold text-gray-600">ردیف</th>
                          <th className="px-3 py-2 text-right font-bold text-gray-600">شرح تجهیز</th>
                          <th className="px-3 py-2 text-right font-bold text-gray-600">تعداد</th>
                          <th className="px-3 py-2 text-right font-bold text-gray-600">محل کالیبره</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {detailItem.proformaItems.map((pi, idx) => (
                          <tr key={pi.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-center">{toPersianDigits(idx + 1)}</td>
                            <td className="px-3 py-2">{pi.equipmentName || pi.description}</td>
                            <td className="px-3 py-2 text-center">{formatQuantity(pi.quantity)}</td>
                            <td className="px-3 py-2 text-center">{pi.calibrationLocation || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* فایل نامه رنج — پررنگ و قابل‌مشاهده برای کارشناس */}
              {detailItem.action === "range_letter" && (
                <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4">
                  <h4 className="font-bold text-rose-800 mb-2">📄 فایل نامه رنج مشتری:</h4>
                  {detailItem.attachments && detailItem.attachments.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {detailItem.attachments.map((att, i) => (
                        <a
                          key={i}
                          href={att.filePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-bold bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition flex items-center gap-2 shadow-sm"
                        >
                          مشاهده نامه: {att.fileName}
                          <span>↗</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-rose-700 bg-white/70 border border-rose-200 rounded-lg px-3 py-2">
                      ⚠️ فایلی با نوع «نامه رنج» برای این نامه ثبت نشده است — از واحد بازرگانی/دبیرخانه بخواهید فایل نامه رنج را در فرم نامه بارگذاری کنند. پس از بارگذاری، همین‌ها به‌صورت خودکار همین‌جا نمایش داده می‌شود.
                    </p>
                  )}
                </div>
              )}

              {/* پیوست‌های نامه */}
              {detailItem.action !== "range_letter" && detailItem.attachments && detailItem.attachments.length > 0 && (
                <div>
                  <h4 className="font-bold text-gray-700 mb-2">📎 پیوست‌های نامه ({toPersianDigits(detailItem.attachments.length)}):</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailItem.attachments.map((att, i) => (
                      <a
                        key={i}
                        href={att.filePath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition flex items-center gap-1"
                      >
                        📄 {att.fileName}
                        <span className="text-[10px] text-purple-400">({att.attachmentType})</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* وضعیت انجام */}
              <div>
                <h4 className="font-bold text-gray-700 mb-2">وضعیت انجام:</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDoneStatus(detailItem.id, "done")}
                    disabled={detailItem.doneStatus !== "done" && !canMarkDone(detailItem)}
                    title={!canMarkDone(detailItem) && detailItem.doneStatus !== "done" ? doneBlockReason(detailItem) : undefined}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition ${
                      detailItem.doneStatus === "done"
                        ? "bg-green-600 text-white"
                        : !canMarkDone(detailItem)
                          ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                    }`}
                  >
                    ✅ انجام شد
                  </button>
                  <button
                    onClick={() => setDoneStatus(detailItem.id, "not_done")}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition ${detailItem.doneStatus === "not_done" ? "bg-red-600 text-white" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
                  >
                    ❌ انجام نشد
                  </button>
                </div>
                {!canMarkDone(detailItem) && detailItem.doneStatus !== "done" && (
                  <p className="mt-2 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-5">
                    ⏳ {doneBlockReason(detailItem)}
                  </p>
                )}
              </div>

              {/* یادداشت کارشناس */}
              <div>
                <h4 className="font-bold text-gray-700 mb-2">✏️ یادداشت کارشناس:</h4>
                <textarea
                  rows={3}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="یادداشت خود را برای این مورد بنویسید..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
                <button
                  onClick={saveNote}
                  className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold transition"
                >
                  💾 ذخیره یادداشت
                </button>
              </div>

              {/* یادداشت ذخیره شده */}
              {detailItem.note && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                  <div className="font-bold mb-1">📝 یادداشت ثبت شده:</div>
                  {detailItem.note}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t bg-gray-50 p-4 flex justify-end shrink-0">
              <button onClick={() => setDetailItem(null)} className="px-6 py-2.5 border border-gray-300 rounded-xl text-sm font-bold hover:bg-gray-100 transition">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── پنل «لیست مشتریان انجام‌شده» — مشتریانی که تاکنون کار برای آن‌ها انجام
          شده، به‌همراه وضعیت هر مشتری در انتهای سطر ── */}
      <CustomersWorkedPanel
        open={customersOpen}
        onClose={() => setCustomersOpen(false)}
        items={items}
      />
    </div>
  );
}
