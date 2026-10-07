import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { UPLOADS_DIR, buildStoredName } from "@/lib/file-storage";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return NextResponse.json({ error: "فایلی انتخاب نشده" }, { status: 400 });
    }

    // Limit: 20MB
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "حجم فایل نباید بیشتر از ۲۰ مگابایت باشد" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // ذخیره خارج از public تا فایل پس از build هم در دسترس بماند
    await mkdir(UPLOADS_DIR, { recursive: true });

    // Safe filename: keep original but sanitize
    const storedName = buildStoredName(file.name);
    const filePath = path.join(UPLOADS_DIR, storedName);
    
    await writeFile(filePath, buffer);

    return NextResponse.json({
      fileName: file.name,
      storedName,
      filePath: `/api/files/${storedName}`,
      fileSize: file.size,
      fileType: file.type,
    });
  } catch (error: unknown) {
    console.error("Upload error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "خطا در آپلود فایل: " + msg }, { status: 500 });
  }
}
