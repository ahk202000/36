import path from "path";
import fs from "fs/promises";

/**
 * ذخیره‌سازی فایل‌های بارگذاری‌شده — خارج از public
 *
 * توجه: فایل‌هایی که در زمان اجرا داخل public/ نوشته شوند در خروجی build
 * سرو نمی‌شوند (404). برای همین فایل‌ها را در پوشه uploads/ کنار پروژه
 * نگهداری می‌کنیم و از مسیر دینامیک API با همان نام /api/files و
 * مسیر سازگار با گذشته /uploads سرو می‌کنیم.
 */
export const UPLOADS_DIR = path.join(process.cwd(), "uploads");
export const PUBLIC_UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".json": "application/json; charset=utf-8",
};

export function mimeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

/**
 * مسیر نسبی را به مسیر مطلق امن داخل base تبدیل می‌کند.
 * جلوگیری از path traversal (..). اگر ناامن بود null برمی‌گرداند.
 */
export function resolveSafelyInside(baseDir: string, relativePath: string): string | null {
  const segments = relativePath
    .split(/[\\/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "." && s !== "..");
  if (segments.length === 0) return null;
  const abs = path.resolve(baseDir, ...segments);
  const baseAbs = path.resolve(baseDir);
  if (abs !== baseAbs && !abs.startsWith(baseAbs + path.sep)) return null;
  return abs;
}

export interface StoredFileResult {
  absolutePath: string;
  buffer: Buffer;
  fileName: string;
}

/**
 * یافتن فایل: ابتدا uploads/ (جدید) سپس public/uploads/ (سازگار با داده‌های قبلی)
 */
export async function readStoredFile(relativePath: string): Promise<StoredFileResult | null> {
  for (const base of [UPLOADS_DIR, PUBLIC_UPLOADS_DIR]) {
    const abs = resolveSafelyInside(base, relativePath);
    if (!abs) continue;
    try {
      const stat = await fs.stat(abs);
      if (!stat.isFile()) continue;
      const buffer = await fs.readFile(abs);
      return { absolutePath: abs, buffer, fileName: path.basename(abs) };
    } catch {
      // فایل در این مسیر نیست — مسیر بعدی
    }
  }
  return null;
}

/** پاسخ HTTP برای مشاهده فایل داخل مرورگر (inline) با编码 صحیح نام فارسی */
export function storedFileResponse(relativePath: string, buffer: Buffer, contentType?: string) {
  const name = path.basename(relativePath);
  const type = contentType || mimeFor(name);
  const asciiFallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_");
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Content-Length": String(buffer.length),
    "Cache-Control": "private, max-age=0, must-revalidate",
    "Content-Disposition": `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff",
  };
  return new Response(new Uint8Array(buffer), { status: 200, headers });
}

/** نام امن برای ذخیره روی دیسک با پسوند زمانی */
export function buildStoredName(originalName: string): string {
  const safeOriginal = String(originalName)
    .replace(/[^a-zA-Z0-9._\u0600-\u06FF\-\s]/g, "_")
    .slice(0, 120);
  return `${Date.now()}-${safeOriginal}`;
}
