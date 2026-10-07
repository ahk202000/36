import { NextRequest, NextResponse } from "next/server";
import { generateProformaPdfBuffer } from "@/lib/proforma-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * خروجی «فایل PDF واقعی» — رندر با headless Chrome از روی دقیقاً همان قالب چاپ
 * GET /api/proforma/[id]/pdf          → دانلود PDF (attachment)
 * GET /api/proforma/[id]/pdf?inline=1 → نمایش PDF در مرورگر
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proformaId = parseInt(id);
  if (isNaN(proformaId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const result = await generateProformaPdfBuffer(proformaId, req.nextUrl.origin);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const inline = req.nextUrl.searchParams.get("inline") === "1";
    const safeNumber = result.proformaNumber.replace(/[\/\\]/g, "-");
    const fileName = `PF-${safeNumber}.pdf`;

    return new Response(Buffer.from(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": inline
          ? "inline"
          : `attachment; filename="PF-${proformaId}.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Proforma PDF error:", msg);
    return NextResponse.json({ error: `خطا در تولید PDF: ${msg}` }, { status: 500 });
  }
}
