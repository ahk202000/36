import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updateData: Record<string, unknown> = {};

    if (body.fullName !== undefined) updateData.fullName = body.fullName;
    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.phone !== undefined) updateData.phone = body.phone || null;
    if (body.departmentId !== undefined) updateData.departmentId = body.departmentId ? parseInt(body.departmentId) : null;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.permissions !== undefined) updateData.permissions = body.permissions;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.password) updateData.password = body.password;
    if (body.username !== undefined) updateData.username = body.username;

    const result = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, parseInt(id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.delete(users).where(eq(users.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
