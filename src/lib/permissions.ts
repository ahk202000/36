export type PermissionKey =
  | "manageLetters"
  | "viewLetters"
  | "createProforma"
  | "approveProforma"
  | "manageCompanies"
  | "manageEquipment"
  | "manageSettings"
  | "manageUsers";

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  manageLetters: "مدیریت نامه‌ها (ثبت/ویرایش)",
  viewLetters: "مشاهده نامه‌ها (فقط خواندنی)",
  createProforma: "صدور پیش فاکتور",
  approveProforma: "تایید پیش فاکتور (مدیریت)",
  manageCompanies: "مدیریت شرکت‌ها",
  manageEquipment: "مدیریت تجهیزات",
  manageSettings: "تنظیمات سیستم",
  manageUsers: "مدیریت کاربران و واحدها",
};

export const ROLE_DEFAULT_PERMISSIONS: Record<string, Record<PermissionKey, boolean>> = {
  admin: {
    manageLetters: true,
    viewLetters: true,
    createProforma: true,
    approveProforma: true,
    manageCompanies: true,
    manageEquipment: true,
    manageSettings: true,
    manageUsers: true,
  },
  manager: {
    manageLetters: true,
    viewLetters: true,
    createProforma: true,
    approveProforma: true,
    manageCompanies: true,
    manageEquipment: true,
    manageSettings: true,
    manageUsers: false,
  },
  commercial: {
    manageLetters: true,
    viewLetters: true,
    createProforma: true,
    approveProforma: false,
    manageCompanies: true,
    manageEquipment: true,
    manageSettings: false,
    manageUsers: false,
  },
  planner: {
    manageLetters: false,
    viewLetters: true,
    createProforma: false,
    approveProforma: false,
    manageCompanies: false,
    manageEquipment: false,
    manageSettings: false,
    manageUsers: false,
  },
  user: {
    manageLetters: false,
    viewLetters: false,
    createProforma: false,
    approveProforma: false,
    manageCompanies: false,
    manageEquipment: false,
    manageSettings: false,
    manageUsers: false,
  },
};

/**
 * واحدهای عملیاتی (اجرایی) سیستم
 * این واحدها ارجاعات کاری را در کارتابل دریافت می‌کنند، مبلغ پیش‌فاکتور را نمی‌بینند
 * و فقط وضعیت «انجام شد / انجام نشد» را ثبت می‌کنند.
 */
export const OPERATIONAL_DEPARTMENTS = [
  "برنامه ریزی درون سازمانی",
  "برنامه ریزی برون سازمانی",
  "آزمایشگاه",
] as const;

/**
 * واحدهایی که در فروش قطعی، ارجاع خودکار «نامه رنج / تاییدیه استعلام» دریافت می‌کنند.
 * آزمایشگاه دقیقاً مانند برنامه‌ریزی برون سازمانی رفتار می‌کند.
 */
export const EXTERNAL_EXECUTION_DEPARTMENTS = [
  "برنامه ریزی برون سازمانی",
  "آزمایشگاه",
] as const;

/** آیا این نام واحد، یک واحد عملیاتی است؟ */
export function isOperationalDepartment(departmentName?: string | null): boolean {
  const name = (departmentName || "").trim();
  if (!name) return false;
  return name.includes("برنامه ریزی") || name.includes("برنامه‌ریزی") || name.includes("آزمایشگاه");
}

/**
 * کاربرانی که رفتار «واحد عملیاتی» دارند:
 * نقش planner یا عضویت در واحدهای برنامه‌ریزی/آزمایشگاه
 */
export function isOperationalUser(user: { role?: string | null; departmentName?: string | null }): boolean {
  return user.role === "planner" || isOperationalDepartment(user.departmentName);
}

export function getPermissions(role: string, customPermissions?: Record<string, boolean> | null): Record<PermissionKey, boolean> {
  const defaults = ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS["user"];
  if (customPermissions) {
    return { ...defaults, ...customPermissions } as Record<PermissionKey, boolean>;
  }
  return defaults;
}

export function hasPermission(
  user: { role: string; permissions?: Record<string, boolean> | null },
  key: PermissionKey
): boolean {
  const perms = getPermissions(user.role, user.permissions);
  return !!perms[key];
}
