import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, departments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        departmentId: users.departmentId,
        departmentName: departments.name,
        role: users.role,
        permissions: users.permissions,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .orderBy(desc(users.id));

    return NextResponse.json(rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check duplicate username
    const existing = await db.select().from(users).where(eq(users.username, body.username)).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "نام کاربری تکراری است" }, { status: 400 });
    }

    const result = await db
      .insert(users)
      .values({
        username: body.username,
        password: body.password,
        fullName: body.fullName,
        email: body.email || null,
        phone: body.phone || null,
        departmentId: body.departmentId ? parseInt(body.departmentId) : null,
        role: body.role || "user",
        permissions: body.permissions || null,
        isActive: body.isActive !== undefined ? body.isActive : true,
      })
      .returning();

    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
