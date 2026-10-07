import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { departments, users } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db.select().from(departments).orderBy(desc(departments.id));
    
    // Get user count per department
    const result = await Promise.all(rows.map(async (dept) => {
      const count = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.departmentId, dept.id));
      return { ...dept, userCount: Number(count[0]?.count || 0) };
    }));

    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await db.insert(departments).values({
      name: body.name,
      description: body.description || null,
      permissions: body.permissions || null,
    }).returning();
    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
