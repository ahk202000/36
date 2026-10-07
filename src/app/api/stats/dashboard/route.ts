import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ── کش حافظه‌ای کوتاه‌مدت برای آمار داشبورد ──
 * این روت بیش از ۱۴ کوئری سنگین تحلیلی اجرا می‌کند؛ بدون کش، هر رفرش یا
 * ورود کاربر به داشبورد همه کوئری‌ها دوباره اجرا می‌شد و با حجیم‌شدن داده‌ها
 * «گاهی» چند ثانیه طول می‌کشید. پاسخ برای ۴۵ ثانیه کش می‌شود که برای یک
 * داشبورد مدیریتی کاملاً تازه است.
 */
type StatsCacheEntry = { expiresAt: number; payload: unknown };
const statsCache = new Map<string, StatsCacheEntry>();
const STATS_CACHE_TTL_MS = 45_000;

function readStatsCache(key: string): unknown | null {
  const entry = statsCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    statsCache.delete(key);
    return null;
  }
  return entry.payload;
}

function writeStatsCache(key: string, payload: unknown) {
  if (statsCache.size > 64) {
    // حذف قدیمی‌ترین کلیدها تا حافظه بیش‌ازاندازه مصرف نشود
    const oldest = statsCache.keys().next().value;
    if (oldest !== undefined) statsCache.delete(oldest);
  }
  statsCache.set(key, { expiresAt: Date.now() + STATS_CACHE_TTL_MS, payload });
}

const jalaliDatePattern = /^\d{4}\/\d{2}\/\d{2}$/;

function validDate(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/-/g, "/");
  return jalaliDatePattern.test(normalized) ? normalized : null;
}

function previousYear(value: string | null): string | null {
  if (!value) return null;
  const year = parseInt(value.slice(0, 4));
  return `${year - 1}${value.slice(4)}`;
}

function numberValue(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * داشبورد تحلیلی مدیریت
 * GET /api/stats/dashboard?from=1405/01/01&to=1405/12/29
 *
 * تمام شاخص‌های پیش‌فاکتور بر اساس issue_date فیلتر می‌شوند.
 * نامه‌ها بر اساس registration_date و فروش قطعی بر اساس پیش‌فاکتور تأییدشده محاسبه می‌شوند.
 */
export async function GET(req: NextRequest) {
  try {
    const fromDate = validDate(req.nextUrl.searchParams.get("from"));
    const toDate = validDate(req.nextUrl.searchParams.get("to"));

    const cacheKey = `${fromDate ?? ""}|${toDate ?? ""}`;
    const cachedPayload = readStatsCache(cacheKey);
    if (cachedPayload) {
      return NextResponse.json(cachedPayload, { headers: { "X-Stats-Cache": "HIT" } });
    }

    const params = [fromDate, toDate];
    const prevParams = [previousYear(fromDate), previousYear(toDate)];

    const proformaFilter = `($1::text IS NULL OR pi.issue_date >= $1) AND ($2::text IS NULL OR pi.issue_date <= $2)`;
    const letterFilter = `($1::text IS NULL OR l.registration_date >= $1) AND ($2::text IS NULL OR l.registration_date <= $2)`;

    const [
      statusResult,
      requestTypeResult,
      topCompaniesResult,
      salesByTypeResult,
      monthlyResult,
      recentResult,
      totalsResult,
      confirmedResult,
      topEquipmentResult,
      operatorsResult,
      staleResult,
      previousResult,
      totalLettersResult,
      entityTotalsResult,
    ] = await Promise.all([
      pool.query(
        `SELECT pi.status,
                COUNT(*)::int AS count,
                COALESCE(SUM(pi.total_amount::numeric), 0)::text AS "totalAmount"
         FROM proforma_invoices pi
         WHERE ${proformaFilter}
         GROUP BY pi.status ORDER BY count DESC`,
        params
      ),
      pool.query(
        `SELECT l.request_type AS "requestType", COUNT(*)::int AS count
         FROM letters l WHERE ${letterFilter}
         GROUP BY l.request_type ORDER BY count DESC`,
        params
      ),
      pool.query(
        `WITH confirmed AS (
           SELECT DISTINCT confirmed_proforma_id AS id
           FROM letters WHERE is_final_confirmed = true AND confirmed_proforma_id IS NOT NULL
         )
         SELECT pi.company_id AS "companyId", c.name AS "companyName",
                COUNT(*)::int AS count,
                COALESCE(SUM(pi.total_amount::numeric), 0)::text AS "totalAmount",
                COUNT(*) FILTER (WHERE cf.id IS NOT NULL)::int AS "confirmedCount",
                COALESCE(SUM(pi.total_amount::numeric) FILTER (WHERE cf.id IS NOT NULL), 0)::text AS "confirmedAmount",
                ROUND(100.0 * COUNT(*) FILTER (WHERE cf.id IS NOT NULL) / NULLIF(COUNT(*), 0), 1)::float AS "conversionRate"
         FROM proforma_invoices pi
         LEFT JOIN companies c ON c.id = pi.company_id
         LEFT JOIN confirmed cf ON cf.id = pi.id
         WHERE ${proformaFilter}
         GROUP BY pi.company_id, c.name
         ORDER BY COALESCE(SUM(pi.total_amount::numeric) FILTER (WHERE cf.id IS NOT NULL), 0) DESC,
                  SUM(pi.total_amount::numeric) DESC
         LIMIT 10`,
        params
      ),
      pool.query(
        `SELECT pt.id AS "typeId", pt.name AS "typeName", pt.code AS "typeCode",
                COUNT(pi.id)::int AS count,
                COALESCE(SUM(pi.total_amount::numeric), 0)::text AS "totalAmount"
         FROM proforma_invoices pi
         LEFT JOIN proforma_types pt ON pt.id = pi.proforma_type_id
         WHERE ${proformaFilter} AND pi.status IN ('approved', 'sent')
         GROUP BY pt.id, pt.name, pt.code
         ORDER BY SUM(pi.total_amount::numeric) DESC NULLS LAST`,
        params
      ),
      pool.query(
        `WITH confirmed AS (
           SELECT DISTINCT confirmed_proforma_id AS id
           FROM letters WHERE is_final_confirmed = true AND confirmed_proforma_id IS NOT NULL
         )
         SELECT SUBSTRING(pi.issue_date FROM 1 FOR 7) AS month,
                COUNT(*)::int AS count,
                COALESCE(SUM(pi.total_amount::numeric), 0)::text AS amount,
                COUNT(*) FILTER (WHERE pi.status IN ('approved','sent'))::int AS "approvedCount",
                COALESCE(SUM(pi.total_amount::numeric) FILTER (WHERE cf.id IS NOT NULL), 0)::text AS "confirmedAmount"
         FROM proforma_invoices pi
         LEFT JOIN confirmed cf ON cf.id = pi.id
         WHERE ${proformaFilter} AND pi.issue_date ~ '^\\d{4}/\\d{2}/\\d{2}$'
         GROUP BY SUBSTRING(pi.issue_date FROM 1 FOR 7)
         ORDER BY month ASC`,
        params
      ),
      pool.query(
        `SELECT pi.id, pi.proforma_number AS "proformaNumber", c.name AS "companyName",
                pt.name AS "typeName", pi.status, pi.total_amount AS "totalAmount",
                pi.issue_date AS "issueDate"
         FROM proforma_invoices pi
         LEFT JOIN companies c ON c.id = pi.company_id
         LEFT JOIN proforma_types pt ON pt.id = pi.proforma_type_id
         WHERE ${proformaFilter}
         ORDER BY pi.created_at DESC LIMIT 8`,
        params
      ),
      pool.query(
        `WITH approval_times AS (
           SELECT proforma_id, MIN(created_at) AS approved_at
           FROM workflow_items
           WHERE action = 'approved'
           GROUP BY proforma_id
         )
           SELECT COUNT(*)::int AS proformas,
                  COUNT(*) FILTER (WHERE pi.status = 'pending')::int AS pending,
                  COUNT(*) FILTER (WHERE pi.status IN ('approved','sent','ready_to_send','final_sale') OR pi.approved_by IS NOT NULL)::int AS approved,
                  COUNT(*) FILTER (WHERE pi.status IN ('sent','final_sale'))::int AS sent,
                  COUNT(*) FILTER (WHERE pi.status = 'rejected')::int AS rejected,
                  COUNT(*) FILTER (WHERE pi.status IN ('revised','correction_send'))::int AS revisions,
                  -- درخواست: پیش‌فاکتور «بدون جمع» برای مشتری محاسبه نمی‌شود؛
                  -- مبالغ نسخه‌های بدون جمع فقط در «محاسبات داخلی» شرکت لحاظ می‌شود.
                  COALESCE(SUM(pi.total_amount::numeric) FILTER (WHERE pi.show_total = true), 0)::text AS "quoteAmount",
                  COALESCE(SUM(pi.total_amount::numeric) FILTER (WHERE pi.show_total = true AND (pi.status IN ('approved','sent','ready_to_send','final_sale') OR pi.approved_by IS NOT NULL)), 0)::text AS "approvedAmount",
                   COALESCE(SUM(pi.total_amount::numeric) FILTER (WHERE pi.show_total = false), 0)::text AS "internalAmount",
                   COUNT(*) FILTER (WHERE pi.show_total = false)::int AS "internalCount",
                   -- جمع کل پیشنهادها بدون هیچ تفکیکی — نسخه‌های «دارای جمع» + «بدون جمع» با هم
                   COALESCE(SUM(pi.total_amount::numeric), 0)::text AS "grandQuoteAmount",
                  COALESCE(AVG(pi.total_amount::numeric) FILTER (WHERE pi.show_total = true), 0)::text AS "averageQuote",
                 COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(at.approved_at, pi.updated_at)-pi.created_at))/3600)
                   FILTER (WHERE pi.status IN ('approved','sent')), 0)::float AS "avgApprovalHours"
         FROM proforma_invoices pi
         LEFT JOIN approval_times at ON at.proforma_id = pi.id
         WHERE ${proformaFilter}`,
        params
      ),
      pool.query(
        `WITH confirmed_ids AS (
           SELECT DISTINCT confirmed_proforma_id AS id
           FROM letters
           WHERE is_final_confirmed = true AND confirmed_proforma_id IS NOT NULL
         ), confirmed_filtered AS (
           SELECT pi.id, pi.total_amount
           FROM proforma_invoices pi
           JOIN confirmed_ids ci ON ci.id = pi.id
           WHERE ${proformaFilter}
         )
         SELECT
           (SELECT COUNT(*)::int FROM letters l
             JOIN confirmed_filtered cf2 ON cf2.id = l.confirmed_proforma_id
             WHERE l.is_final_confirmed = true) AS count,
           COUNT(*)::int AS "proformaCount",
           COALESCE(SUM(total_amount::numeric), 0)::text AS amount
         FROM confirmed_filtered`,
        params
      ),
      pool.query(
        `WITH confirmed AS (
           SELECT DISTINCT confirmed_proforma_id AS id
           FROM letters WHERE is_final_confirmed = true AND confirmed_proforma_id IS NOT NULL
         )
         SELECT i.equipment_id AS "equipmentId", COALESCE(e.name, i.description) AS name,
                COUNT(*)::int AS "lineCount",
                COUNT(DISTINCT pi.id)::int AS "proformaCount",
                COUNT(DISTINCT pi.company_id)::int AS "customerCount",
                COALESCE(SUM(i.total_price::numeric), 0)::text AS "quotedAmount",
                COALESCE(SUM(i.total_price::numeric) FILTER (WHERE cf.id IS NOT NULL), 0)::text AS "confirmedAmount"
         FROM proforma_items i
         JOIN proforma_invoices pi ON pi.id = i.proforma_id
         LEFT JOIN equipment e ON e.id = i.equipment_id
         LEFT JOIN confirmed cf ON cf.id = pi.id
         WHERE ${proformaFilter} AND COALESCE(i.is_selected, true) = true
         GROUP BY i.equipment_id, COALESCE(e.name, i.description)
         ORDER BY SUM(i.total_price::numeric) DESC NULLS LAST LIMIT 10`,
        params
      ),
      pool.query(
        `WITH approval_times AS (
           SELECT proforma_id, MIN(created_at) AS approved_at
           FROM workflow_items WHERE action = 'approved' GROUP BY proforma_id
         )
         SELECT u.id AS "userId", u.full_name AS "fullName",
                COUNT(pi.id)::int AS "createdCount",
                COUNT(pi.id) FILTER (WHERE pi.status IN ('approved','sent'))::int AS "approvedCount",
                COUNT(pi.id) FILTER (WHERE pi.status = 'sent')::int AS "sentCount",
                COUNT(pi.id) FILTER (WHERE pi.status = 'rejected')::int AS "rejectedCount",
                COALESCE(SUM(pi.total_amount::numeric), 0)::text AS "totalAmount",
                COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(at.approved_at, pi.updated_at)-pi.created_at))/3600)
                  FILTER (WHERE pi.status IN ('approved','sent')), 0)::float AS "avgCycleHours"
         FROM users u
         LEFT JOIN proforma_invoices pi ON pi.created_by = u.id AND ${proformaFilter}
         LEFT JOIN approval_times at ON at.proforma_id = pi.id
         WHERE u.is_active = true
         GROUP BY u.id, u.full_name
         HAVING COUNT(pi.id) > 0
         ORDER BY COUNT(pi.id) DESC LIMIT 10`,
        params
      ),
      pool.query(
        `SELECT pi.id, pi.proforma_number AS "proformaNumber", c.name AS "companyName",
                pi.status, pi.total_amount AS "totalAmount", pi.issue_date AS "issueDate",
                pi.updated_at AS "updatedAt",
                FLOOR(EXTRACT(EPOCH FROM (NOW()-pi.updated_at))/86400)::int AS "ageDays",
                COUNT(*) OVER()::int AS "totalStale"
         FROM proforma_invoices pi
         LEFT JOIN companies c ON c.id = pi.company_id
         WHERE ${proformaFilter}
           AND pi.status IN ('pending','revised','correction_send','ready_to_send')
           AND pi.updated_at < NOW() - INTERVAL '7 days'
         ORDER BY pi.updated_at ASC LIMIT 12`,
        params
      ),
      pool.query(
        `WITH confirmed AS (
           SELECT DISTINCT confirmed_proforma_id AS id
           FROM letters WHERE is_final_confirmed = true AND confirmed_proforma_id IS NOT NULL
         )
          SELECT COUNT(*)::int AS proformas,
                 COALESCE(SUM(pi.total_amount::numeric), 0)::text AS "quoteAmount",
                 COUNT(*) FILTER (WHERE pi.status IN ('approved','sent','ready_to_send','final_sale') OR pi.approved_by IS NOT NULL)::int AS approved,
                 COUNT(*) FILTER (WHERE cf.id IS NOT NULL)::int AS confirmed,
                COALESCE(SUM(pi.total_amount::numeric) FILTER (WHERE cf.id IS NOT NULL), 0)::text AS "confirmedAmount"
         FROM proforma_invoices pi
          LEFT JOIN confirmed cf ON cf.id = pi.id
          WHERE ${proformaFilter}`,
        prevParams
      ),
      // این دو کوئری قبلاً بعد از Promise.all به‌صورت سِری اجرا می‌شدند و
      // یک رفت‌و‌برگشت اضافه به دیتابیس تحمیل می‌کردند؛ حالا موازی اجرا می‌شوند.
      pool.query(
        `SELECT COUNT(*)::int AS count FROM letters l WHERE ${letterFilter}`,
        params
      ),
      pool.query(
        `SELECT (SELECT COUNT(*)::int FROM companies) AS companies,
                (SELECT COUNT(*)::int FROM users WHERE is_active=true) AS users`
      ),
    ]);

    const totalsRow = totalsResult.rows[0] || {};
    const confirmedRow = confirmedResult.rows[0] || {};
    const prevRow = previousResult.rows[0] || {};

    const totalProformas = numberValue(totalsRow.proformas);
    const approvedCount = numberValue(totalsRow.approved);
    const confirmedCount = numberValue(confirmedRow.proformaCount);
    const quoteAmount = numberValue(totalsRow.quoteAmount);
    const confirmedAmount = numberValue(confirmedRow.amount);

    const percentChange = (current: number, previous: number) =>
      previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : current > 0 ? 100 : 0;

    const previous = {
      proformas: numberValue(prevRow.proformas),
      quoteAmount: String(prevRow.quoteAmount || "0"),
      approved: numberValue(prevRow.approved),
      confirmed: numberValue(prevRow.confirmed),
      confirmedAmount: String(prevRow.confirmedAmount || "0"),
    };

    const responsePayload = {
      filters: { from: fromDate, to: toDate, previousFrom: prevParams[0], previousTo: prevParams[1] },
      statusStats: statusResult.rows,
      requestTypeStats: requestTypeResult.rows,
      topCompanies: topCompaniesResult.rows,
      salesByType: salesByTypeResult.rows,
      monthlyTrend: monthlyResult.rows,
      recentProformas: recentResult.rows,
      topEquipment: topEquipmentResult.rows,
      operatorPerformance: operatorsResult.rows,
      staleProformas: staleResult.rows,
      funnel: {
        issued: totalProformas,
        approved: approvedCount,
        sent: numberValue(totalsRow.sent),
        confirmed: confirmedCount,
        approvalRate: totalProformas ? Number(((approvedCount / totalProformas) * 100).toFixed(1)) : 0,
        conversionRate: totalProformas ? Number(((confirmedCount / totalProformas) * 100).toFixed(1)) : 0,
        rejectionRate: totalProformas ? Number(((numberValue(totalsRow.rejected) / totalProformas) * 100).toFixed(1)) : 0,
      },
      managementKpis: {
        quoteAmount: String(totalsRow.quoteAmount || "0"),
        approvedAmount: String(totalsRow.approvedAmount || "0"),
        // محاسبات داخلی — مجموع مبالغ پیش‌فاکتورهای «بدون جمع» (نسخه داخلی شرکت)
        internalAmount: String(totalsRow.internalAmount || "0"),
        internalCount: numberValue(totalsRow.internalCount),
        // درخواست: کنار ارزش کل پیشنهادی (فقط دارای جمع)، «جمع با نسخه‌های بدون جمع» هم نمایش داده شود
        grandQuoteAmount: String(totalsRow.grandQuoteAmount || "0"),
        confirmedAmount: String(confirmedRow.amount || "0"),
        averageQuote: String(totalsRow.averageQuote || "0"),
        avgApprovalHours: Number(numberValue(totalsRow.avgApprovalHours).toFixed(1)),
        staleCount: numberValue(staleResult.rows[0]?.totalStale),
        revisions: numberValue(totalsRow.revisions),
        previous,
        changes: {
          proformas: percentChange(totalProformas, previous.proformas),
          quoteAmount: percentChange(quoteAmount, numberValue(previous.quoteAmount)),
          confirmedAmount: percentChange(confirmedAmount, numberValue(previous.confirmedAmount)),
        },
      },
      totals: {
        proformas: totalProformas,
        letters: numberValue(totalLettersResult.rows[0]?.count),
        companies: numberValue(entityTotalsResult.rows[0]?.companies),
        users: numberValue(entityTotalsResult.rows[0]?.users),
        pending: numberValue(totalsRow.pending),
        confirmedSales: numberValue(confirmedRow.count),
        confirmedSalesAmount: String(confirmedRow.amount || "0"),
      },
    };
    writeStatsCache(cacheKey, responsePayload);
    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Stats error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
