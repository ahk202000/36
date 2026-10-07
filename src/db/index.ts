import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    // داشبورد چند کوئری موازی اجرا می‌کند؛ ظرفیت اتصال‌ها باید کافی باشد
    // تا کوئری‌ها در صف نمانند. بدون این، لود داشبورد گاهی چند برابر کند می‌شود.
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
