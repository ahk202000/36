import { db } from "@/db";
import { proformaItems, equipment } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { PrintProformaData } from "@/lib/print-proforma";

/**
 * واکشی جزئیات کامل پیش‌فاکتور برای چاپ/PDF — سمت سرور
 * همان کوئری /api/proforma/[id] تا خروجی همیشه یکسان بماند
 */
export async function getProformaPrintData(proformaId: number): Promise<PrintProformaData | null> {
  const result = await db.execute(sql`
    SELECT
      p.id,
      p.proforma_number as "proformaNumber",
      p.revision_no as "revisionNo",
      p.proforma_type_id as "proformaTypeId",
      pt.name as "typeName",
      p.letter_id as "letterId",
      p.company_id as "companyId",
      c.name as "companyName",
      c.phone as "companyPhone",
      c.fax as "companyFax",
      c.email as "companyEmail",
       COALESCE(NULLIF(p.communication_method, ''), l.communication_method) as "communicationMethod",
       COALESCE(NULLIF(p.communication_id, ''), l.communication_id) as "communicationId",
      l.phone as "letterPhone",
      l.fax as "letterFax",
      l.contact_person as "letterContactPerson",
      p.issue_date as "issueDate",
      p.validity_days as "validityDays",
      p.show_total as "showTotal",
      p.subtotal,
      p.discount_percent as "discountPercent",
      p.discount_amount as "discountAmount",
      p.tax_percent as "taxPercent",
      p.tax_amount as "taxAmount",
      p.insurance_percent as "insurancePercent",
      p.insurance_amount as "insuranceAmount",
      p.travel_cost as "travelCost",
      p.transport_cost as "transportCost",
      p.total_amount as "totalAmount",
      COALESCE(NULLIF(p.text_before, ''), pt.default_text_before, '') as "textBefore",
      COALESCE(NULLIF(p.text_after, ''), pt.default_text_after, '') as "textAfter",
      COALESCE(NULLIF(p.text_last_page, ''), pt.default_text_last_page, '') as "textLastPage",
      COALESCE(NULLIF(p.signature_text, ''), pt.signature_text, '') as "signatureText",
      p.status
    FROM proforma_invoices p
    LEFT JOIN companies c ON p.company_id = c.id
    LEFT JOIN proforma_types pt ON p.proforma_type_id = pt.id
    LEFT JOIN letters l ON p.letter_id = l.id
    WHERE p.id = ${proformaId}
  `);

  if (result.rows.length === 0) return null;

  const items = await db
    .select({
      id: proformaItems.id,
      equipmentId: proformaItems.equipmentId,
      equipmentName: equipment.name,
      description: proformaItems.description,
      quantity: proformaItems.quantity,
      unitPrice: proformaItems.unitPrice,
      pointCount: proformaItems.pointCount,
      totalPrice: proformaItems.totalPrice,
      isSelected: proformaItems.isSelected,
      multiplierPercent: proformaItems.multiplierPercent,
      calibrationLocation: proformaItems.calibrationLocation,
      paramValues: proformaItems.paramValues,
    })
    .from(proformaItems)
    .leftJoin(equipment, eq(proformaItems.equipmentId, equipment.id))
    .where(eq(proformaItems.proformaId, proformaId));

  return { ...(result.rows[0] as Record<string, unknown>), items } as unknown as PrintProformaData;
}
