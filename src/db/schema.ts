import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ── Users & Departments ── */
export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  permissions: jsonb("permissions"), // default permissions for this department
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 100 }),
  departmentId: integer("department_id").references(() => departments.id),
  role: varchar("role", { length: 50 }).notNull().default("user"), // admin, commercial, manager, user
  permissions: jsonb("permissions"), // { canManageLetters, canCreateProforma, canApprove, canManageSettings, canManageUsers, canManageCompanies, canManageEquipment }
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ── System Settings ── */
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  settingKey: varchar("setting_key", { length: 100 }).notNull().unique(),
  settingValue: text("setting_value").notNull(),
  year: integer("year"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/* ── Companies / Customers ── */
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 500 }).notNull(),
  phone: varchar("phone", { length: 100 }),
  fax: varchar("fax", { length: 100 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  contactPerson: varchar("contact_person", { length: 255 }),
  // اطلاعات ارتباط پیش‌فرض مشتری برای ارسال خودکار پیش‌فاکتور
  communicationMethod: varchar("communication_method", { length: 100 }),
  communicationId: varchar("communication_id", { length: 255 }),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ── Equipment Categories & Equipment ── */
export const equipmentCategories = pgTable("equipment_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const equipmentParams = pgTable("equipment_params", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").references(() => equipmentCategories.id),
  // پارامتر می‌تواند مستقیماً به یک تجهیز متصل باشد (هر تجهیز چند پارامتر)
  equipmentId: integer("equipment_id").references(() => equipment.id),
  paramName: varchar("param_name", { length: 255 }).notNull(),
  paramUnit: varchar("param_unit", { length: 100 }),
  // ترتیب نمایش پارامترها برای هر تجهیز
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("equipment_params_equipment_id_idx").on(table.equipmentId),
]);

export const equipment = pgTable("equipment", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 500 }).notNull(),
  categoryId: integer("category_id").references(() => equipmentCategories.id),
  parentEquipmentId: integer("parent_equipment_id"),
  description: text("description"),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).default("0"),
  pricePerPoint: boolean("price_per_point").default(false),
  calibrationLocation: varchar("calibration_location", { length: 255 }),
  imagePath: varchar("image_path", { length: 1000 }),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ── Letters (نامه‌ها) ── */
export const letters = pgTable("letters", {
  id: serial("id").primaryKey(),
  letterNumber: varchar("letter_number", { length: 100 }).notNull(),
  companyId: integer("company_id").references(() => companies.id),
  registrationDate: varchar("registration_date", { length: 20 }).default("1404/01/01").notNull(),
  letterDate: varchar("letter_date", { length: 20 }).notNull(),
  customerLetterDate: varchar("customer_letter_date", { length: 20 }),
  customerLetterNumber: varchar("customer_letter_number", { length: 100 }),
  requestType: varchar("request_type", { length: 100 }).notNull(),
  communicationMethod: varchar("communication_method", { length: 100 }),
  communicationId: varchar("communication_id", { length: 255 }),
  description: text("description"),
  phone: varchar("phone", { length: 100 }),
  fax: varchar("fax", { length: 100 }),
  contactPerson: varchar("contact_person", { length: 255 }),
  referralDepartment: varchar("referral_department", { length: 255 }),
  savePath: varchar("save_path", { length: 1000 }),
  status: varchar("status", { length: 50 }).default("received").notNull(),
  // Final confirmation fields for "تاییدیه استعلام" - represents actual sale
  isFinalConfirmed: boolean("is_final_confirmed").default(false).notNull(),
  finalConfirmedAt: timestamp("final_confirmed_at", { withTimezone: true }),
  finalConfirmedBy: integer("final_confirmed_by").references(() => users.id),
  confirmedProformaId: integer("confirmed_proforma_id"), // Which proforma this confirmation is for
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // ایندکس‌ها برای داشبورد تحلیلی و کارتابل — جلوگیری از full-table scan
  index("letters_registration_date_idx").on(table.registrationDate),
  index("letters_request_type_idx").on(table.requestType),
  index("letters_company_id_idx").on(table.companyId),
  index("letters_confirmed_proforma_id_idx").on(table.confirmedProformaId),
  index("letters_referral_department_idx").on(table.referralDepartment),
  index("letters_created_by_idx").on(table.createdBy),
]);

/* ── Letter Attachments ── */
export const letterAttachments = pgTable("letter_attachments", {
  id: serial("id").primaryKey(),
  letterId: integer("letter_id").references(() => letters.id).notNull(),
  attachmentType: varchar("attachment_type", { length: 100 }).notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  filePath: varchar("file_path", { length: 1000 }).notNull(),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("letter_attachments_letter_id_idx").on(table.letterId),
]);

/* ── Proforma Invoice Types ── */
export const proformaTypes = pgTable("proforma_types", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  defaultTextBefore: text("default_text_before"),
  defaultTextAfter: text("default_text_after"),
  defaultTextLastPage: text("default_text_last_page"),
  signatureText: text("signature_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ── Proforma Invoices ── */
export const proformaInvoices = pgTable("proforma_invoices", {
  id: serial("id").primaryKey(),
  proformaNumber: varchar("proforma_number", { length: 100 }).notNull(),
  // ── نسخه‌بندی اصلاحیه (رفع ایراد پرش شماره نسخه) ──
  // اصل‌‌شماره هنگام صدور ثبت و هرگز تغییر نمی‌کند؛ شماره نمایشی = base-revisionNo
  baseNumber: varchar("base_number", { length: 100 }),
  revisionNo: integer("revision_no").default(0).notNull(),
  // ── چند پیش‌فاکتور برای یک نامه (مثلاً کالیبراسیون + فروش در یک استعلام) ──
  // شماره فرعی پیش‌فاکتور داخل همان نامه: ۱ = خودِ شماره نامه، ۲ = «شماره‌نامه/2» و ...
  // شماره نامه هرگز تغییر نمی‌کند؛ فقط پسوند فرعی به پیش‌فاکتور اضافه می‌شود.
  letterSeq: integer("letter_seq").default(1).notNull(),
  proformaTypeId: integer("proforma_type_id").references(() => proformaTypes.id),
  letterId: integer("letter_id").references(() => letters.id),
  companyId: integer("company_id").references(() => companies.id),
  // اطلاعات ارسال مستقیم؛ در پیش‌فاکتورهای بدون نامه الزامی برای ارسال خودکار
  communicationMethod: varchar("communication_method", { length: 100 }),
  communicationId: varchar("communication_id", { length: 255 }),
  issueDate: varchar("issue_date", { length: 20 }).notNull(),
  validityDays: integer("validity_days").default(30),
  showTotal: boolean("show_total").default(true).notNull(),
  subtotal: numeric("subtotal", { precision: 18, scale: 2 }).default("0"),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).default("0"),
  discountAmount: numeric("discount_amount", { precision: 18, scale: 2 }).default("0"),
  taxPercent: numeric("tax_percent", { precision: 5, scale: 2 }).default("10"),
  taxAmount: numeric("tax_amount", { precision: 18, scale: 2 }).default("0"),
  insurancePercent: numeric("insurance_percent", { precision: 5, scale: 2 }).default("0"),
  insuranceAmount: numeric("insurance_amount", { precision: 18, scale: 2 }).default("0"),
  travelCost: numeric("travel_cost", { precision: 18, scale: 2 }).default("0"),
  transportCost: numeric("transport_cost", { precision: 18, scale: 2 }).default("0"),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).default("0"),
  textBefore: text("text_before"),
  textAfter: text("text_after"),
  textLastPage: text("text_last_page"),
  signatureText: text("signature_text"),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  proformaDescription: text("proforma_description"),
  managerComment: text("manager_comment"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  globalMultiplierPercent: numeric("global_multiplier_percent", { precision: 5, scale: 2 }),
  targetAmount: numeric("target_amount", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("proforma_invoices_letter_id_idx").on(table.letterId),
  // هر نامه فقط یک پیش‌فاکتور با شماره فرعی مشخص دارد (۱، ۲، ۳ ...)
  uniqueIndex("proforma_invoices_letter_seq_uq")
    .on(table.letterId, table.letterSeq)
    .where(sql`letter_id IS NOT NULL`),
  // ایندکس‌های داشبورد و لیست‌ها — فیلتر/مرتب‌سازی بدون full-table scan
  index("proforma_invoices_issue_date_idx").on(table.issueDate),
  index("proforma_invoices_status_idx").on(table.status),
  index("proforma_invoices_company_id_idx").on(table.companyId),
  index("proforma_invoices_created_by_idx").on(table.createdBy),
  index("proforma_invoices_type_id_idx").on(table.proformaTypeId),
  index("proforma_invoices_created_at_idx").on(table.createdAt),
  index("proforma_invoices_updated_at_idx").on(table.updatedAt),
  index("proforma_invoices_base_number_idx").on(table.baseNumber),
]);

/* ── Proforma Invoice Items ── */
export const proformaItems = pgTable("proforma_items", {
  id: serial("id").primaryKey(),
  proformaId: integer("proforma_id").references(() => proformaInvoices.id).notNull(),
  equipmentId: integer("equipment_id").references(() => equipment.id),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).default("1"),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).default("0"),
  pointCount: integer("point_count"),
  totalPrice: numeric("total_price", { precision: 18, scale: 2 }).default("0"),
  rowOrder: integer("row_order").default(0),
  isSelected: boolean("is_selected").default(true),
  multiplierPercent: numeric("multiplier_percent", { precision: 5, scale: 2 }),
  calibrationLocation: varchar("calibration_location", { length: 255 }),
  paramValues: jsonb("param_values"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // JOINهای داشبورد و کارتابل روی اقلام پیش‌فاکتور
  index("proforma_items_proforma_id_idx").on(table.proformaId),
  index("proforma_items_equipment_id_idx").on(table.equipmentId),
]);

/* ── Price History ── */
export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  equipmentId: integer("equipment_id").references(() => equipment.id).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  proformaId: integer("proforma_id").references(() => proformaInvoices.id),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),
  pointCount: integer("point_count"),
  quantity: numeric("quantity", { precision: 10, scale: 2 }),
  priceDate: varchar("price_date", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("price_history_equipment_company_idx").on(table.equipmentId, table.companyId),
  index("price_history_proforma_id_idx").on(table.proformaId),
]);

/* ── Contracts / قراردادها ── */
export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  contractNumber: varchar("contract_number", { length: 255 }).notNull(),
  title: varchar("title", { length: 500 }),
  startDate: varchar("start_date", { length: 20 }).notNull(),
  endDate: varchar("end_date", { length: 20 }).notNull(),
  description: text("description"),
  filePath: varchar("file_path", { length: 1000 }),
  fileName: varchar("file_name", { length: 500 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

/* ── Contract Files / فایل‌های قرارداد (چند فایل برای هر قرارداد) ── */
export const contractFiles = pgTable("contract_files", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => contracts.id).notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  filePath: varchar("file_path", { length: 1000 }).notNull(),
  fileSize: integer("file_size"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("contract_files_contract_id_idx").on(table.contractId),
]);;

/* ── Workflow / Kartabl ── */
// توجه: ستون‌های زمانی با timezone ذخیره می‌شوند (timestamptz) تا ساعت فعالیت‌ها
// در همه بخش‌ها (کارتابل، پرونده نامه، اعلانات) یکسان و دقیق نمایش داده شود.
export const workflowItems = pgTable("workflow_items", {
  id: serial("id").primaryKey(),
  letterId: integer("letter_id").references(() => letters.id),
  proformaId: integer("proforma_id").references(() => proformaInvoices.id),
  fromUserId: integer("from_user_id").references(() => users.id),
  toUserId: integer("to_user_id").references(() => users.id),
  toDepartment: varchar("to_department", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(),
  comment: text("comment"),
  isRead: boolean("is_read").default(false).notNull(),
  // فلگ وضعیت انجام — برای واحدهای برنامه‌ریزی
  doneStatus: varchar("done_status", { length: 50 }).default("pending"), // pending | done | not_done
  doneAt: timestamp("done_at", { withTimezone: true }),
  doneBy: integer("done_by").references(() => users.id),
  // یادداشت کارشناس
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // کارتابل، اعلان‌ها (پولینگ ۱۵ ثانیه‌ای) و CTEهای داشبورد بدون این ایندکس‌ها
  // با رشد جدول فلج می‌شدند
  index("workflow_items_letter_id_idx").on(table.letterId),
  index("workflow_items_proforma_id_idx").on(table.proformaId),
  index("workflow_items_to_user_id_idx").on(table.toUserId),
  index("workflow_items_to_department_idx").on(table.toDepartment),
  index("workflow_items_from_user_id_idx").on(table.fromUserId),
  index("workflow_items_created_at_idx").on(table.createdAt),
  index("workflow_items_proforma_action_idx").on(table.proformaId, table.action),
]);
