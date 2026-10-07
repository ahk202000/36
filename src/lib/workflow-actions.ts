/**
 * برچسب فارسی انواع رویداد گردش کار.
 *
 * ایراد قبلی: در «پرونده نامه → تاریخچه گردش کار» نوع رویداد به‌صورت خام و
 * انگلیسی (refer، submit، ...) نمایش داده می‌شد. این نگاشت مشترک در همه
 * بخش‌ها (پرونده نامه، کارتابل، اعلانات) استفاده می‌شود تا همیشه فارسی دیده شود.
 */
export const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  refer: "ارجاع",
  submit: "ارسال برای تایید مدیریت",
  approved: "تایید نهایی",
  rejected: "رد شده",
  revised: "نیاز به اصلاح",
  correction_send: "اصلاح و تایید (توسط بازرگانی)",
  final_sale: "فروش قطعی",
  confirm_refer: "تاییدیه استعلام",
  range_letter: "نامه رنج (فروش قطعی)",
  sent: "ارسال به مشتری",
  auto_sent: "ارسال خودکار به مشتری",
  direct_refer: "ارجاع مستقیم",
  created: "ایجاد",
  edited: "ویرایش",
  note: "یادداشت",
};

export function workflowActionLabel(action: string | null | undefined): string {
  if (!action) return "—";
  return WORKFLOW_ACTION_LABELS[action] || action;
}

/** رنگ/آیکون پیشنهادی برای رویداد (استفاده در کارتابل و اعلانات) */
export const WORKFLOW_ACTION_ICONS: Record<string, string> = {
  refer: "📨",
  submit: "📤",
  approved: "✅",
  rejected: "❌",
  revised: "🔄",
  correction_send: "🖊️",
  final_sale: "💵",
  confirm_refer: "📋",
  range_letter: "📄",
  sent: "📬",
  auto_sent: "🤖",
};
