import { db } from "@/db";
import { companies, equipment } from "@/db/schema";
import { normalizeNameKey } from "@/lib/utils";

/**
 * بررسی تکراری بودن نام مشتری/تجهیز با نادیده‌گرفتن فاصله، نیم‌فاصله،
 * تفاوت حروف عربی/فارسی (ي/ی، ك/ک) و علائم.
 * مثال: «آدوراطب» و «آدورا طب» یکسان تلقی می‌شوند.
 */
export async function findDuplicateCompany(name: string, excludeId?: number | null) {
  const key = normalizeNameKey(name);
  if (!key) return null;
  const rows = await db.select({ id: companies.id, name: companies.name }).from(companies);
  return rows.find((r) => r.id !== excludeId && normalizeNameKey(r.name) === key) || null;
}

export async function findDuplicateEquipment(name: string, excludeId?: number | null) {
  const key = normalizeNameKey(name);
  if (!key) return null;
  const rows = await db.select({ id: equipment.id, name: equipment.name }).from(equipment);
  return rows.find((r) => r.id !== excludeId && normalizeNameKey(r.name) === key) || null;
}

export function duplicateCompanyMessage(existingName: string) {
  return `مشتری تکراری است: شرکتی با نام مشابه «${existingName}» قبلاً ثبت شده (تفاوت فاصله/نیم‌فاصله نادیده گرفته می‌شود). لطفاً همان مشتری را انتخاب کنید.`;
}

export function duplicateEquipmentMessage(existingName: string) {
  return `تجهیز تکراری است: تجهیزی با نام مشابه «${existingName}» قبلاً ثبت شده (تفاوت فاصله/نیم‌فاصله نادیده گرفته می‌شود). لطفاً همان تجهیز را انتخاب کنید.`;
}
