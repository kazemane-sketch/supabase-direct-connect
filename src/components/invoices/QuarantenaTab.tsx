import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import {
  parseInvoiceFromXmlString,
  extractXmlFromP7mBytes,
  stripBadUnicode,
  type ParsedInvoice,
} from "@/lib/xmlInvoiceParser";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Download, RotateCcw, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface Props {
  companyId: string;
}

async function parseWithAI(rawXml: string): Promise<ParsedInvoice | null> {
  const { data, error } = await supabase.functions.invoke("parse-invoice-ai", {
    body: { rawXml },
  });
  if (error || !data?.invoice) return null;
  const ai = data.invoice;
  if (!ai.invoiceNumber) return null;
  return {
    invoiceNumber: ai.invoiceNumber || "",
    invoiceDate: ai.invoiceDate || "",
    invoiceType: ai.invoiceType || "TD01",
    currency: ai.currency || "EUR",
    causal: ai.causal || undefined,
    supplier: {
      name: ai.supplier?.name || "",
      vatNumber: ai.supplier?.vatNumber || "",
      fiscalCode: ai.supplier?.fiscalCode || undefined,
      address: ai.supplier?.address || undefined,
      city: ai.supplier?.city || undefined,
      province: ai.supplier?.province || undefined,
      cap: ai.supplier?.cap || undefined,
      country: ai.supplier?.country || "IT",
    },
    buyer: { name: "", vatNumber: "" },
    totalAmount: ai.totalAmount || 0,
    taxableAmount: ai.taxableAmount || 0,
    taxAmount: ai.taxAmount || 0,
    payments: (ai.payments || []).map((p: any) => ({
      method: p.method || "MP05", dueDate: p.dueDate || undefined,
      amount: p.amount || 0, iban: p.iban || undefined,
    })),
    primaryPayment: ai.payments?.[0] ? {
      method: ai.payments[0].method || "MP05",
      dueDate: ai.payments[0].dueDate || undefined,
      amount: ai.payments[0].amount || 0,
      iban: ai.payments[0].iban || undefined,
    } : undefined,
    lines: (ai.lines || []).map((l: any) => ({
      lineNumber: l.lineNumber || 1, description: l.description || "",
      quantity: l.quantity || 1, unitPrice: l.unitPrice || 0,
      totalPrice: l.totalPrice || 0, vatRate: l.vatRate || 0,
      unitOfMeasure: l.unitOfMeasure || undefined,
    })),
    vatSummaries: (ai.vatSummaries || []).map((v: any) => ({
      vatRate: v.vatRate || 0, taxableAmount: v.taxableAmount || 0,
      vatAmount: v.vatAmount || 0, nature: v.nature || undefined,
    })),
    ddtNumbers: ai.ddtNumbers || [],
    orderNumbers: ai.orderNumbers || [],
  };
}

async function extractXmlFromBlob(blob: Blob, filename: string): Promise<string | null> {
  const lowerName = filename.toLowerCase();
  if (lowerName.endsWith(".p7m")) {
    const buffer = await blob.arrayBuffer();
    return extractXmlFromP7mBytes(new Uint8Array(buffer));
  }
  // XML file
  return await blob.text();
}

async function insertInvoiceSafe(
  companyId: string,
  inv: ParsedInvoice,
  filename: string
): Promise<string | null> {
  const direction = inv.supplier.vatNumber ? "passive" : "active";
  const cpVat = direction === "passive" ? inv.supplier.vatNumber : inv.buyer.vatNumber;
  const cpName = direction === "passive" ? inv.supplier.name : inv.buyer.name;

  const { data, error } = await supabase.from("invoices").insert({
    company_id: companyId,
    direction,
    invoice_number: stripBadUnicode(inv.invoiceNumber),
    invoice_date: inv.invoiceDate,
    due_date: inv.primaryPayment?.dueDate || null,
    total_amount: inv.totalAmount,
    subtotal: inv.taxableAmount,
    vat_amount: inv.taxAmount,
    counterpart_name: stripBadUnicode(cpName || cpVat || "Sconosciuto"),
    counterpart_vat: cpVat || null,
    payment_status: "unpaid",
    reconciliation_status: "unmatched",
    source: "xml_sdi",
    raw_xml: null,
    payment_method: inv.primaryPayment?.method || null,
    original_filename: filename,
  }).select("id").single();

  if (error) throw error;

  if (data && inv.lines.length > 0) {
    await supabase.from("invoice_lines").insert(
      inv.lines.map((l, idx) => ({
        invoice_id: data.id,
        description: stripBadUnicode(l.description),
        quantity: l.quantity || 1,
        unit_price: l.unitPrice,
        vat_rate: l.vatRate,
        total: l.totalPrice,
        sort_order: idx + 1,
        unit_of_measure: l.unitOfMeasure || null,
        product_id: null,
        quantity_tons: null,
      }))
    );
  }

  return data?.id || null;
}

export function QuarantenaTab({ companyId }: Props) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState<Record<string, string>>({});

  const { data: quarantined } = useQuery({
    queryKey: ["quarantined_files", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_import_files")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "quarantined")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const downloadFile = async (storagePath: string, filename: string) => {
    const { data } = await supabase.storage.from("invoice-imports").download(storagePath);
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const markResolved = async (id: string, invoiceId: string) => {
    await supabase.from("invoice_import_files").update({
      status: "imported",
      invoice_id: invoiceId,
      error_code: null,
      error_message: null,
    } as any).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["quarantined_files"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const handleReimport = async (item: any) => {
    setLoading(p => ({ ...p, [item.id]: "reimport" }));
    try {
      const { data: blob } = await supabase.storage.from("invoice-imports").download(item.storage_path);
      if (!blob) { toast.error("File non trovato in storage"); return; }

      const rawXml = await extractXmlFromBlob(blob, item.filename);
      if (!rawXml) { toast.error("Impossibile estrarre XML dal file"); return; }

      const inv = parseInvoiceFromXmlString(rawXml);
      if (!inv) { toast.error("Parsing XML fallito"); return; }

      const invoiceId = await insertInvoiceSafe(companyId, inv, item.filename);
      if (invoiceId) {
        await markResolved(item.id, invoiceId);
        toast.success(`✅ ${item.filename} re-importato con successo`);
      }
    } catch (e: any) {
      toast.error(`Re-import fallito: ${e.message}`);
    } finally {
      setLoading(p => { const n = { ...p }; delete n[item.id]; return n; });
    }
  };

  const handleAiParse = async (item: any) => {
    setLoading(p => ({ ...p, [item.id]: "ai" }));
    try {
      const { data: blob } = await supabase.storage.from("invoice-imports").download(item.storage_path);
      if (!blob) { toast.error("File non trovato in storage"); return; }

      const rawXml = await extractXmlFromBlob(blob, item.filename);
      if (!rawXml) { toast.error("Impossibile estrarre XML dal file"); return; }

      toast.info(`✨ Analisi AI in corso per ${item.filename}...`);
      const inv = await parseWithAI(rawXml);
      if (!inv) { toast.error("AI non è riuscita a parsare il file"); return; }

      const invoiceId = await insertInvoiceSafe(companyId, inv, item.filename);
      if (invoiceId) {
        await markResolved(item.id, invoiceId);
        toast.success(`✅ ${item.filename} importato tramite AI`);
      }
    } catch (e: any) {
      toast.error(`AI parse fallito: ${e.message}`);
    } finally {
      setLoading(p => { const n = { ...p }; delete n[item.id]; return n; });
    }
  };

  if (!quarantined || quarantined.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-12 text-center text-muted-foreground">
          Nessun file in quarantena
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Errore</TableHead>
              <TableHead>Dettaglio</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quarantined.map((item: any) => {
              const itemLoading = loading[item.id];
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium max-w-[200px] truncate">{item.filename}</TableCell>
                  <TableCell className="text-sm">{formatDate(item.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{item.error_code}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">
                    {item.error_message}
                    {item.had_replacement_chars && (
                      <span className="text-warning ml-1">⚠ U+FFFD</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="Download file originale"
                        onClick={() => downloadFile(item.storage_path, item.filename)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="Re-import safe (parsing locale, senza raw_xml)"
                        disabled={!!itemLoading}
                        onClick={() => handleReimport(item)}
                      >
                        {itemLoading === "reimport" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title="Prova con AI"
                        disabled={!!itemLoading}
                        onClick={() => handleAiParse(item)}
                      >
                        {itemLoading === "ai" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}