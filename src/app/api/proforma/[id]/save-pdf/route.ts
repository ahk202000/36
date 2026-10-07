import { NextRequest, NextResponse } from "next/server";
import { generateProformaHtml } from "@/lib/proforma-html";
import { promises as fs } from "fs";
import path from "path";
import { UPLOADS_DIR } from "@/lib/file-storage";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const proformaId = parseInt(id);

    const generated = await generateProformaHtml(proformaId);
    if (!generated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ─── ساخت مسیر ذخیره: uploads/proformas/سال/ماه/روز/شماره.html ───
    const issueDate = generated.issueDate || "1404/01/01";
    const parts = issueDate.split("/");
    const year = parts[0] || "1404";
    const month = (parts[1] || "01").padStart(2, "0");
    const day = (parts[2] || "01").padStart(2, "0");
    const safeNumber = String(generated.proformaNumber || proformaId).replace(/\//g, "-").replace(/\\/g, "-");
    const fileName = `PF-${safeNumber}.html`;

    // ذخیره خارج از public تا لینک خروجی پس از build هم باز شود
    const dirPath = path.join(UPLOADS_DIR, "proformas", year, month, day);
    await fs.mkdir(dirPath, { recursive: true });

    const filePath = path.join(dirPath, fileName);
    await fs.writeFile(filePath, generated.html, "utf-8");

    const publicPath = `/api/files/proformas/${year}/${month}/${day}/${fileName}`;

    return NextResponse.json({
      success: true,
      path: publicPath,
      fullPath: filePath,
      fileName,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Save PDF error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
