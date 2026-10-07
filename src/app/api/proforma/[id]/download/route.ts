import { NextRequest, NextResponse } from "next/server";
import { generateProformaHtml } from "@/lib/proforma-html";

export const dynamic = "force-dynamic";

/**
 * دانلود خروجی پیش‌فاکتور — تولید در لحظه، بدون نیاز به فایل روی دیسک
 * GET /api/proforma/[id]/download          → دانلود فایل (attachment)
 * GET /api/proforma/[id]/download?inline=1 → نمایش در مرورگر برای چاپ / Save as PDF
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const proformaId = parseInt(id);
    if (isNaN(proformaId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const generated = await generateProformaHtml(proformaId);
    if (!generated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const inline = req.nextUrl.searchParams.get("inline") === "1";
    const safeNumber = generated.proformaNumber.replace(/\//g, "-").replace(/\\/g, "-");
    const fileName = `PF-${safeNumber}.html`;

    // نام فایل UTF-8 (برای شماره‌های فارسی/لاتین)
    const disposition = inline
      ? "inline"
      : `attachment; filename="PF-${proformaId}.html"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    return new Response(generated.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": disposition,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Download proforma error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
