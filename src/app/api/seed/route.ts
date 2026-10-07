import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  departments,
  users,
  settings,
  proformaTypes,
  companies,
  equipmentCategories,
  equipment,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { currentJalaliYear } from "@/lib/utils";
import { OFFICIAL_SIGNATURE } from "@/lib/signature-text";

export async function POST() {
  try {
    // ── ارتقای متن امضای قدیمی در دیتابیس‌های موجود (ایدمپوتنت) ──
    // «با تشکر و احترام / مدیریت شرکت» و متن رسمی قبلی →
    // «با سپاس فراوان — شرکت بهینه سنجش آزما (بهسا)»
    try {
      await db.execute(sql`
        UPDATE proforma_types
        SET signature_text = ${OFFICIAL_SIGNATURE}
        WHERE btrim(COALESCE(signature_text, '')) = ''
           OR signature_text IN (
             'با تشکر و احترام
مدیریت شرکت',
             'با تشکر و احترام
مدیریت',
             'با تشکر و احترام',
             'با تشکر
مدیریت شرکت',
             'با تشکر
مدیریت',
             'با تشکر',
             'با سپاس فراوان
شرکت مهندسی بهینه سنجش (پارت آریا تحلیل گر)',
             'با سپاس فراوان — شرکت مهندسی بهینه سنجش (پارت آریا تحلیل گر)'
           )
      `);
      // تنظیم سراسری متن سپاس (خط بالای مهر و امضا) — اگر وجود ندارد/قدیمی است ارتقا می‌یابد
      await db.execute(sql`
        INSERT INTO settings (setting_key, setting_value, year, updated_at)
        VALUES ('company_signature', ${OFFICIAL_SIGNATURE}, NULL, NOW())
        ON CONFLICT (setting_key) DO NOTHING
      `);
      await db.execute(sql`
        UPDATE settings
        SET setting_value = ${OFFICIAL_SIGNATURE}, updated_at = NOW()
        WHERE setting_key = 'company_signature'
          AND setting_value IN (
            'با سپاس فراوان
شرکت مهندسی بهینه سنجش (پارت آریا تحلیل گر)',
            'با سپاس فراوان — شرکت مهندسی بهینه سنجش (پارت آریا تحلیل گر)',
            ''
          )
      `);
    } catch (sigErr) {
      console.error("ارتقای متن امضا ناموفق بود:", sigErr);
    }

    // ── حذف کامل «بند گارانتی» از متون پیش‌فاکتور (ایدمپوتنت) ──
    // هر خطی از default_text_after / text_after که واژه «گارانتی» داشته باشد حذف می‌شود.
    try {
      for (const [tableName, columnName] of [
        ["proforma_types", "default_text_after"],
        ["proforma_invoices", "text_after"],
      ] as const) {
        await db.execute(sql.raw(`
          UPDATE ${tableName}
          SET ${columnName} = btrim(
            regexp_replace(
              COALESCE(
                (SELECT string_agg(l, E'\\n')
                 FROM unnest(string_to_array(${columnName}, E'\\n')) AS l
                 WHERE l NOT LIKE '%گارانتی%'),
                ''
              ),
              '(\\n){3,}', E'\\n\\n', 'g'
            )
          )
          WHERE ${columnName} LIKE '%گارانتی%'
        `));
      }
    } catch (warErr) {
      console.error("حذف بند گارانتی ناموفق بود:", warErr);
    }

    // ── تغییر نام نوع پیش‌فاکتور «خرید» به «فروش» (ایدمپوتنت) ──
    // درخواست کاربر: در نوع پیش‌فاکتور، «خرید» به «فروش» تغییر نام یابد.
    // هر نوعی که کدش calibration_sale است یا در نامش واژه «خرید» دارد → «فروش».
    try {
      await db.execute(sql`
        UPDATE proforma_types
        SET name = CASE
          WHEN code = 'calibration_sale' THEN 'فروش'
          ELSE replace(name, 'خرید', 'فروش')
        END
        WHERE code = 'calibration_sale' OR name LIKE '%خرید%'
      `);
    } catch (renameErr) {
      console.error("تغییر نام نوع «خرید» به «فروش» ناموفق بود:", renameErr);
    }

    // Check if already seeded
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length > 0) {
      return NextResponse.json({ message: "Already seeded" });
    }

    // Departments
    const deptRows = await db
      .insert(departments)
      .values([
        { name: "مدیریت" },
        { name: "واحد بازرگانی" },
        { name: "واحد فنی" },
        { name: "واحد مالی" },
        { name: "دبیرخانه" },
        { name: "برنامه ریزی درون سازمانی" },
        { name: "برنامه ریزی برون سازمانی" },
        { name: "آزمایشگاه" },
      ])
      .returning();

    // Users
    await db.insert(users).values([
      { username: "admin", password: "admin123", fullName: "مدیر سیستم", departmentId: deptRows[0].id, role: "admin" },
      { username: "manager", password: "manager123", fullName: "مدیر عامل", departmentId: deptRows[0].id, role: "manager" },
      { username: "commercial", password: "comm123", fullName: "کارشناس بازرگانی", departmentId: deptRows[1].id, role: "commercial" },
      { username: "secretary", password: "sec123", fullName: "مسئول دبیرخانه", departmentId: deptRows[4].id, role: "user" },
      { username: "planner_in", password: "planner123", fullName: "کارشناس برنامه‌ریزی درون", departmentId: deptRows[5].id, role: "planner" },
      { username: "planner_out", password: "planner123", fullName: "کارشناس برنامه‌ریزی برون", departmentId: deptRows[6].id, role: "planner" },
      { username: "lab", password: "lab123", fullName: "کارشناس آزمایشگاه", departmentId: deptRows[7].id, role: "planner" },
    ]);

    // Settings
    // سال شماره‌گذاری = سال جاری شمسی (نه مقدار ثابت)
    const seedYear = currentJalaliYear();
    await db
      .insert(settings)
      .values([
        { settingKey: "letter_format", settingValue: "{YEAR}/{SEQ}", year: seedYear },
        { settingKey: "letter_sequence", settingValue: "1", year: seedYear },
        { settingKey: "proforma_format", settingValue: "PF-{YEAR}-{SEQ}", year: seedYear },
        { settingKey: "proforma_sequence", settingValue: "1", year: seedYear },
        { settingKey: "tax_percent", settingValue: "10", year: null },
        { settingKey: "insurance_percent", settingValue: "0", year: null },
        { settingKey: "save_path", settingValue: "C:/Documents/Letters", year: null },
        { settingKey: "company_signature", settingValue: OFFICIAL_SIGNATURE, year: null },
      ])
      // company_signature ممکن است در مرحله «ارتقای متن امضا» همین مسیر،
      // قبلاً درج شده باشد — بدون onConflictDoNothing درج دسته‌ای روی دیتابیس
      // تازه، با خطای کلید تکراری متوقف می‌شد و seed ناقص می‌ماند.
      .onConflictDoNothing({ target: settings.settingKey });

    // Proforma types
    await db.insert(proformaTypes).values([
      {
        name: "کالیبراسیون",
        code: "calibration",
        defaultTextBefore: "با سلام و احترام\nبازگشت به استعلام شماره ... مورخ ... جنابعالی، پیش فاکتور کالیبراسیون تجهیزات به شرح ذیل تقدیم می‌گردد:",
        defaultTextAfter: "• مدت اعتبار پیش فاکتور ۳۰ روز از تاریخ صدور می‌باشد.\n• هزینه ایاب و ذهاب طبق جدول فوق محاسبه شده است.\n• پرداخت ۵۰٪ مبلغ فاکتور هنگام ثبت سفارش و مابقی پس از انجام کار.",
        defaultTextLastPage: "شرایط عمومی:\n۱- مدت اعتبار: ۳۰ روز\n۲- نحوه پرداخت: ۵۰٪ پیش پرداخت\n۳- مدت زمان انجام کار: بر اساس توافق",
        signatureText: OFFICIAL_SIGNATURE,
      },
      {
        name: "احراز کیفیت",
        code: "qualification",
        defaultTextBefore: "با سلام و احترام\nپیش فاکتور احراز کیفیت تجهیزات به شرح ذیل تقدیم می‌گردد:",
        defaultTextAfter: "• مدت اعتبار پیش فاکتور ۳۰ روز می‌باشد.\n• شامل صدور گواهینامه احراز کیفیت.",
        defaultTextLastPage: "شرایط عمومی احراز کیفیت",
        signatureText: OFFICIAL_SIGNATURE,
      },
      {
        name: "نقشه دمایی",
        code: "thermal_mapping",
        defaultTextBefore: "با سلام\nپیش فاکتور نقشه دمایی به شرح ذیل:",
        defaultTextAfter: "• شامل نقشه‌برداری دمایی کامل.",
        defaultTextLastPage: "شرایط نقشه دمایی",
        signatureText: OFFICIAL_SIGNATURE,
      },
      {
        name: "فروش",
        code: "calibration_sale",
        defaultTextBefore: "با سلام\nپیش فاکتور فروش تجهیزات به شرح ذیل تقدیم می‌گردد:",
        defaultTextAfter: "",
        defaultTextLastPage: "شرایط فروش",
        signatureText: OFFICIAL_SIGNATURE,
      },
      {
        name: "تعمیرات",
        code: "repair",
        defaultTextBefore: "با سلام\nپیش فاکتور تعمیرات تجهیزات:",
        defaultTextAfter: "",
        defaultTextLastPage: "شرایط تعمیرات",
        signatureText: OFFICIAL_SIGNATURE,
      },
      {
        name: "سامانه ستاد",
        code: "setad",
        defaultTextBefore: "با سلام و احترام\nبازگشت به درخواست سامانه ستاد، پیش فاکتور به شرح ذیل تقدیم می‌گردد:\nشماره نیاز: ...\nعنوان مناقصه: ...",
        defaultTextAfter: "• قیمت‌ها مطابق سامانه ستاد و با احتساب کلیه کسورات قانونی می‌باشد.\n• مدت اعتبار پیش فاکتور طبق ضوابط ستاد.\n• هزینه حمل و ایاب و ذهاب در صورت نیاز جداگانه محاسبه می‌گردد.",
        defaultTextLastPage: "شرایط سامانه ستاد:\n۱- ثبت در سامانه ستاد ایران\n۲- ارائه ضمانت‌نامه در صورت نیاز\n۳- تحویل مطابق برنامه زمان‌بندی",
        signatureText: OFFICIAL_SIGNATURE,
      },
      {
        name: "سایر",
        code: "other",
        defaultTextBefore: "با سلام و احترام",
        defaultTextAfter: "",
        defaultTextLastPage: "",
        signatureText: OFFICIAL_SIGNATURE,
      },
    ]);

    // Sample companies
    await db.insert(companies).values([
      { name: "شرکت داروسازی تهران", phone: "021-12345678", email: "info@tehranpharma.ir", address: "تهران" },
      { name: "شرکت پتروشیمی اصفهان", phone: "031-87654321", email: "info@isfahanpetro.ir", address: "اصفهان" },
    ]);

    // Equipment categories
    const cats = await db.insert(equipmentCategories).values([
      { name: "انکوباتور" },
      { name: "ترازو" },
      { name: "دماسنج" },
      { name: "فشارسنج" },
      { name: "رطوبت‌سنج" },
    ]).returning();

    // Equipment
    await db.insert(equipment).values([
      { name: "انکوباتور دمایی", categoryId: cats[0].id, pricePerPoint: true, unitPrice: "5000000" },
      { name: "انکوباتور CO2", categoryId: cats[0].id, pricePerPoint: true, unitPrice: "7000000" },
      { name: "ترازو آنالیتیکال", categoryId: cats[1].id, pricePerPoint: false, unitPrice: "3000000" },
      { name: "ترازو صنعتی", categoryId: cats[1].id, pricePerPoint: false, unitPrice: "2500000" },
      { name: "دماسنج دیجیتال", categoryId: cats[2].id, pricePerPoint: true, unitPrice: "2000000" },
      { name: "فشارسنج آنالوگ", categoryId: cats[3].id, pricePerPoint: false, unitPrice: "4000000" },
    ]);

    return NextResponse.json({ message: "Seed completed" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
