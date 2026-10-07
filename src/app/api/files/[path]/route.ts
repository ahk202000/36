import { NextRequest, NextResponse } from "next/server";
import { readStoredFile, storedFileResponse } from "@/lib/file-storage";

/**
 * سرو کردن فایل‌های آپلودشده (پیوست نامه‌ها، قراردادها، PDF پیش‌فاکتورها و ...)
 *
 * فایل‌ها در پوشه `uploads/` کنار پروژه ذخیره می‌شوند (خارج از public تا پس از
 * build هم در دسترس بمانند) و این روت آن‌ها را با آدرس `/api/files/<name>` سرو می‌کند.
 * مسیر قدیمی `/uploads/<name>` هم از طریق rewrite در next.config.ts به همین روت می‌رسد
 * تا لینک‌های ثبت‌شده در دیتابیس‌های قبلی 404 ندهند.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string | string[] }> }
) {
  try {
    const { path: pathParam } = await params;
    // پشتیبانی از هر دو حالت تک‌بخشی و چندبخشی مسیر
    const segments = Array.isArray(pathParam) ? pathParam : [pathParam];

    if (!segments || segments.length === 0 || !segments[0]) {
      return NextResponse.json({ error: "مسیر فایل مشخص نشده است" }, { status: 400 });
    }

    const relativePath = segments.join("/");
    const stored = await readStoredFile(relativePath);

    if (!stored) {
      return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 });
    }

    return storedFileResponse(relativePath, stored.buffer);
  } catch (error: unknown) {
    console.error("File serve error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "خطا در دریافت فایل: " + msg }, { status: 500 });
  }
}
