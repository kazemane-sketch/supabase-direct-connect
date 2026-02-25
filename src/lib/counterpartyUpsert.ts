import { supabase } from "@/integrations/supabase/client";
import { parseInvoiceFromXmlString, type ParsedInvoice } from "@/lib/xmlInvoiceParser";
import { lookupVatNumber } from "@/lib/viesLookup";

/**
 * Determine direction from parsed invoice + company VAT.
 */
function getDirectionFromParsed(inv: ParsedInvoice, companyVat: string | null): "active" | "passive" {
  if (!companyVat) return "passive";
  if (inv.buyer.vatNumber && companyVat.includes(inv.buyer.vatNumber)) return "passive";
  if (inv.supplier.vatNumber && companyVat.includes(inv.supplier.vatNumber)) return "active";
  return "passive";
}

/**
 * Upsert a counterparty from parsed invoice data.
 * Returns the counterparty ID.
 */
export async function upsertCounterpartyFromInvoice(
  companyId: string,
  companyVat: string | null,
  inv: ParsedInvoice,
): Promise<{ id: string; created: boolean }> {
  const direction = getDirectionFromParsed(inv, companyVat);
  const cpVat = direction === "passive" ? inv.supplier.vatNumber : inv.buyer.vatNumber;
  const cpName = direction === "passive" ? inv.supplier.name : inv.buyer.name;
  const cpType = direction === "passive" ? "fornitore" : "cliente";

  if (!cpVat) {
    return { id: "", created: false };
  }

  // Find existing by vat_number
  const { data: existingList } = await supabase
    .from("counterparties")
    .select("id, type, name, is_approved, created_at")
    .eq("company_id", companyId)
    .eq("vat_number", cpVat)
    .order("is_approved", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);

  const existingCp = existingList?.[0] ?? null;

  if (existingCp) {
    const updates: Record<string, any> = {};
    if (existingCp.type !== cpType && existingCp.type !== "entrambi") {
      updates.type = "entrambi";
    }
    if (cpName && cpName.trim() && (!existingCp.name || existingCp.name.trim() === "" || existingCp.name === cpVat)) {
      updates.name = cpName.trim();
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from("counterparties").update(updates).eq("id", existingCp.id);
    }
    return { id: existingCp.id, created: false };
  }

  // Create new counterparty — try VIES enrichment first
  const supplierData = direction === "passive" ? inv.supplier : null;
  const countryCode = supplierData?.country || "IT";
  let viesName: string | null = null;
  let viesAddress: string | null = null;

  try {
    const vies = await lookupVatNumber(cpVat, countryCode);
    if (vies.valid && vies.name) {
      viesName = vies.name;
      viesAddress = vies.address;
    }
  } catch {
    // VIES fallback silenzioso
  }

  const finalName = viesName || cpName || cpVat || "Sconosciuto";

  const insertData: Record<string, any> = {
    company_id: companyId,
    name: finalName,
    vat_number: cpVat,
    type: cpType,
    is_approved: false,
    auto_created: true,
    vies_name: viesName,
  };

  if (direction === "passive" && supplierData) {
    insertData.fiscal_code = supplierData.fiscalCode || null;
    insertData.address = viesAddress || supplierData.address || null;
    insertData.city = supplierData.city || null;
    insertData.province = supplierData.province || null;
    insertData.cap = supplierData.cap || null;
  }

  if (inv.primaryPayment) {
    insertData.payment_method = inv.primaryPayment.method || null;
    insertData.iban = inv.primaryPayment.iban || null;
  }

  const { data: newCp } = await supabase
    .from("counterparties")
    .insert(insertData as any)
    .select("id")
    .single();

  return { id: newCp?.id ?? "", created: true };
}

/**
 * Re-analyze a single invoice from its raw_xml: upsert counterparty and re-link.
 */
export async function reanalyzeInvoice(
  companyId: string,
  companyVat: string | null,
  invoice: { id: string; raw_xml: string; original_filename: string | null },
): Promise<{ created: boolean }> {
  const parsed = parseInvoiceFromXmlString(invoice.raw_xml);
  if (!parsed) return { created: false };

  const direction = getDirectionFromParsed(parsed, companyVat);
  const cpName = direction === "passive" ? parsed.supplier.name : parsed.buyer.name;
  const cpVat = direction === "passive" ? parsed.supplier.vatNumber : parsed.buyer.vatNumber;

  const { id: counterpartId, created } = await upsertCounterpartyFromInvoice(companyId, companyVat, parsed);

  // Update invoice fields
  const updateData: Record<string, any> = {
    invoice_number: parsed.invoiceNumber,
    invoice_date: parsed.invoiceDate,
    due_date: parsed.primaryPayment?.dueDate || null,
    total_amount: parsed.totalAmount,
    subtotal: parsed.taxableAmount,
    vat_amount: parsed.taxAmount,
    counterpart_name: cpName || cpVat || "Sconosciuto",
    counterpart_vat: cpVat || null,
    direction,
  };
  if (counterpartId) {
    updateData.counterpart_id = counterpartId;
  }

  await supabase.from("invoices").update(updateData).eq("id", invoice.id);

  return { created };
}

/**
 * Clean up duplicate counterparties for a company.
 */
export async function cleanupDuplicateCounterparties(companyId: string): Promise<number> {
  const { data: allCps } = await supabase
    .from("counterparties")
    .select("id, vat_number, is_approved, created_at, name")
    .eq("company_id", companyId)
    .not("vat_number", "is", null);

  if (!allCps || allCps.length === 0) return 0;

  const byVat = new Map<string, typeof allCps>();
  for (const cp of allCps) {
    if (!cp.vat_number) continue;
    const list = byVat.get(cp.vat_number) || [];
    list.push(cp);
    byVat.set(cp.vat_number, list);
  }

  let removed = 0;
  for (const [, group] of byVat) {
    if (group.length <= 1) continue;

    group.sort((a, b) => {
      if (a.is_approved !== b.is_approved) return a.is_approved ? -1 : 1;
      return (a.created_at || "").localeCompare(b.created_at || "");
    });

    const keeper = group[0];
    const duplicates = group.slice(1);

    for (const dup of duplicates) {
      await supabase
        .from("invoices")
        .update({ counterpart_id: keeper.id })
        .eq("counterpart_id", dup.id)
        .eq("company_id", companyId);

      await supabase.from("counterparties").delete().eq("id", dup.id);
      removed++;
    }

    if (!keeper.name || keeper.name === keeper.vat_number) {
      const bestName = group.find(g => g.name && g.name !== g.vat_number);
      if (bestName) {
        await supabase.from("counterparties").update({ name: bestName.name }).eq("id", keeper.id);
      }
    }
  }

  return removed;
}
