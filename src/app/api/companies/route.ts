import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { ilike, desc } from "drizzle-orm";
import { findDuplicateCompany, duplicateCompanyMessage } from "@/lib/duplicates";

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get("search") || "";
    const rows = search
      ? await db.select().from(companies).where(ilike(companies.name, `%${search}%`)).orderBy(desc(companies.id))
      : await db.select().from(companies).orderBy(desc(companies.id));
    return NextResponse.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "نام شرکت الزامی است" }, { status: 400 });
    }

    // جلوگیری از ثبت مشتری تکراری (بدون توجه به فاصله/نیم‌فاصله)
    const dup = await findDuplicateCompany(name);
    if (dup) {
      return NextResponse.json(
        { error: duplicateCompanyMessage(dup.name), duplicate: true, existing: dup },
        { status: 409 }
      );
    }

    // فقط فیلدهای مجاز درج می‌شوند و مقادیر خالی به NULL تبدیل می‌گردند
    const value = (input: unknown) => {
      const text = String(input ?? "").trim();
      return text === "" ? null : text;
    };

    const result = await db
      .insert(companies)
      .values({
        name,
        phone: value(body.phone),
        fax: value(body.fax),
        email: value(body.email),
        address: value(body.address),
        contactPerson: value(body.contactPerson),
        communicationMethod: value(body.communicationMethod),
        communicationId: value(body.communicationId),
        createdBy: typeof body.createdBy === "number" ? body.createdBy : null,
      })
      .returning();

    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
