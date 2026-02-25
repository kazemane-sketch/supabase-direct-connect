import { useRef, useMemo } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { parseInvoiceFromXmlString } from "@/lib/xmlInvoiceParser";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const PAYMENT_LABELS: Record<string, string> = {
  MP01: "Contanti",
  MP05: "Bonifico",
  MP08: "Carta",
  MP09: "RID",
  MP12: "RIBA",
  MP21: "SDD",
};

interface InvoiceDocumentProps {
  invoice: any;
}

export function InvoiceDocument({ invoice }: InvoiceDocumentProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => {
    if (!invoice.raw_xml) return null;
    try {
      return parseInvoiceFromXmlString(invoice.raw_xml);
    } catch {
      return null;
    }
  }, [invoice.raw_xml]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Fattura ${invoice.invoice_number || ""}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 24px; }
      .doc { max-width: 700px; margin: 0 auto; border: 1px solid #ccc; }
      .header { background: #f5f5f5; padding: 16px 20px; border-bottom: 2px solid #333; }
      .header h1 { font-size: 16px; margin-bottom: 4px; }
      .header .meta { display: flex; gap: 24px; font-size: 11px; color: #555; }
      .parties { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #ddd; }
      .party { padding: 12px 20px; }
      .party:first-child { border-right: 1px solid #ddd; }
      .party h3 { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; }
      .party .name { font-weight: 700; font-size: 12px; margin-bottom: 2px; }
      .party .detail { color: #555; font-size: 10px; line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f5f5f5; text-align: left; padding: 6px 12px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 1px solid #ddd; }
      th.right, td.right { text-align: right; }
      td { padding: 6px 12px; border-bottom: 1px solid #eee; font-size: 10.5px; }
      .totals { padding: 12px 20px; border-top: 2px solid #333; }
      .totals .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; }
      .totals .grand { font-weight: 700; font-size: 14px; border-top: 1px solid #ccc; padding-top: 6px; margin-top: 4px; }
      .payment { padding: 12px 20px; background: #fafafa; border-top: 1px solid #ddd; font-size: 10.5px; color: #555; }
      .payment strong { color: #1a1a1a; }
      @media print { body { padding: 0; } .doc { border: none; } }
    </style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  // Map new ParsedInvoice to template variables
  const supplier = parsed?.supplier;
  const buyer = parsed?.buyer;
  const lines = parsed?.lines ?? [];
  const vatSummaries = parsed?.vatSummaries ?? [];
  const payment = parsed?.primaryPayment;
  const pm = payment?.method ? (PAYMENT_LABELS[payment.method] || payment.method) : null;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5" /> Stampa
        </Button>
      </div>
      <div ref={printRef}>
        <div className="doc border rounded-lg overflow-hidden bg-white text-foreground" style={{ fontSize: "12px" }}>
          {/* Header */}
          <div className="bg-muted/50 px-5 py-4 border-b-2 border-foreground/20">
            <h1 className="text-base font-bold">
              FATTURA N. {invoice.invoice_number || "—"}
            </h1>
            <div className="flex gap-6 text-xs text-muted-foreground mt-1">
              <span>Data: <strong className="text-foreground">{formatDate(invoice.invoice_date)}</strong></span>
              {invoice.due_date && <span>Scadenza: <strong className="text-foreground">{formatDate(invoice.due_date)}</strong></span>}
              {parsed?.invoiceType && <span>Tipo: <strong className="text-foreground">{parsed.invoiceType}</strong></span>}
            </div>
          </div>

          {/* Parties */}
          {(supplier || buyer) && (
            <div className="grid grid-cols-2 border-b">
              <div className="px-5 py-3 border-r">
                <h3 className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                  {invoice.direction === "passive" ? "Fornitore" : "Cedente"}
                </h3>
                <p className="font-bold text-sm">{supplier?.name || invoice.counterpart_name}</p>
                <div className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                  {supplier?.vatNumber && <p>P.IVA: {supplier.vatNumber}</p>}
                  {supplier?.fiscalCode && <p>C.F.: {supplier.fiscalCode}</p>}
                  {supplier?.address && <p>{supplier.address}</p>}
                  {(supplier?.cap || supplier?.city || supplier?.province) && (
                    <p>{[supplier.cap, supplier.city, supplier.province].filter(Boolean).join(" ")}</p>
                  )}
                </div>
              </div>
              <div className="px-5 py-3">
                <h3 className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                  {invoice.direction === "passive" ? "Cliente" : "Cessionario"}
                </h3>
                <p className="font-bold text-sm">{buyer?.name || ""}</p>
                <div className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                  {buyer?.vatNumber && <p>P.IVA: {buyer.vatNumber}</p>}
                  {buyer?.fiscalCode && <p>C.F.: {buyer.fiscalCode}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Lines table */}
          {lines.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left px-3 py-2 font-semibold text-[9px] uppercase tracking-wider text-muted-foreground">Descrizione</th>
                  <th className="text-right px-3 py-2 font-semibold text-[9px] uppercase tracking-wider text-muted-foreground">Qtà</th>
                  <th className="text-left px-3 py-2 font-semibold text-[9px] uppercase tracking-wider text-muted-foreground">U.M.</th>
                  <th className="text-right px-3 py-2 font-semibold text-[9px] uppercase tracking-wider text-muted-foreground">Prezzo</th>
                  <th className="text-right px-3 py-2 font-semibold text-[9px] uppercase tracking-wider text-muted-foreground">IVA</th>
                  <th className="text-right px-3 py-2 font-semibold text-[9px] uppercase tracking-wider text-muted-foreground">Totale</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((r, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="px-3 py-1.5 max-w-[250px] truncate">{r.description}</td>
                    <td className="px-3 py-1.5 text-right">{r.quantity || ""}</td>
                    <td className="px-3 py-1.5">{r.unitOfMeasure || ""}</td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(r.unitPrice)}</td>
                    <td className="px-3 py-1.5 text-right">{r.vatRate}%</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(r.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Totals */}
          <div className="px-5 py-3 border-t-2 border-foreground/20">
            {vatSummaries.map((r, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="text-muted-foreground">Imponibile (IVA {r.vatRate}%)</span>
                <span>{formatCurrency(r.taxableAmount)}</span>
              </div>
            ))}
            {vatSummaries.map((r, i) => (
              <div key={`iva-${i}`} className="flex justify-between text-xs py-0.5">
                <span className="text-muted-foreground">IVA {r.vatRate}%</span>
                <span>{formatCurrency(r.vatAmount)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-sm pt-2 mt-1 border-t">
              <span>TOTALE DOCUMENTO</span>
              <span>{formatCurrency(Number(invoice.total_amount))}</span>
            </div>
          </div>

          {/* Payment */}
          {payment && (pm || payment.iban) && (
            <div className="px-5 py-3 bg-muted/30 border-t text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {pm && <span>Pagamento: <strong className="text-foreground">{pm}</strong></span>}
                {payment.dueDate && <span>Scadenza: <strong className="text-foreground">{formatDate(payment.dueDate)}</strong></span>}
                {payment.amount > 0 && <span>Importo: <strong className="text-foreground">{formatCurrency(payment.amount)}</strong></span>}
              </div>
              {payment.iban && (
                <p className="mt-1">IBAN: <strong className="text-foreground font-mono text-[10px]">{payment.iban}</strong></p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}