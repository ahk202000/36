import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, departments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    let body: { username?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
    }

    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: "نام کاربری و رمز عبور الزامی است" }, { status: 400 });
    }

    // Add timeout for DB query
    const result = await Promise.race([
      db
        .select({
          id: users.id,
          username: users.username,
          fullName: users.fullName,
          email: users.email,
          role: users.role,
          permissions: users.permissions,
          departmentId: users.departmentId,
          departmentName: departments.name,
        })
        .from(users)
        .leftJoin(departments, eq(users.departmentId, departments.id))
        .where(and(eq(users.username, username), eq(users.password, password), eq(users.isActive, true)))
        .limit(1),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 8000)),
    ]);

    if (result.length === 0) {
      return NextResponse.json({ error: "نام کاربری یا رمز عبور اشتباه است" }, { status: 401 });
    }

    return NextResponse.json({ user: result[0] });
  } catch (error: unknown) {
    console.error("Auth error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg === "DB_TIMEOUT") {
      return NextResponse.json({ error: "سرور دیتابیس پاسخگو نیست، لطفا دوباره تلاش کنید" }, { status: 503 });
    }
    // Check for connection errors
    if (msg.includes("ECONNREFUSED") || msg.includes("connect") || msg.includes("timeout")) {
      return NextResponse.json({ error: "خطا در ارتباط با دیتابیس، لطفا چند ثانیه بعد دوباره تلاش کنید" }, { status: 503 });
    }
    return NextResponse.json({ error: "خطای سرور: " + msg }, { status: 500 });
  }
}
