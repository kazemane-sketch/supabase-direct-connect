import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { getPaymentLabel } from "@/lib/paymentLabels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InvoiceLineEditor } from "@/components/invoices/InvoiceLineEditor";
import { InvoiceDocument } from "@/components/invoices/InvoiceDocument";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";

interface Props {
  counterpartyId: string;
  companyId: string;
  onBack: () => void;
}

function extractPaymentMethod(rawXml: string | null): string | null {
  if (!rawXml) return null;
  const match = rawXml.match(/<ModalitaPagamento>(MP\d+)<\/ModalitaPagamento>/);
  return match ? match[1] : null;
}

export function CounterpartyDetail({ counterpartyId, companyId, onBack }: Props) {
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  const { data: cp } = useQuery({
    queryKey: ["counterparty", counterpartyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("counterparties").select("*").eq("id", counterpartyId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["counterparty_invoices", counterpartyId, companyId],
    queryFn: async () => {
      const { data: byId } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", companyId)
        .eq("counterpart_id", counterpartyId)
        .order("invoice_date", { ascending: false });
      
      if (!cp) return byId || [];
      
      const { data: byName } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", companyId)
        .is("counterpart_id", null)
        .ilike("counterpart_name", cp.name)
        .order("invoice_date", { ascending: false });
      
      const allIds = new Set((byId || []).map((i) => i.id));
      const merged = [...(byId || [])];
      (byName || []).forEach((inv) => { if (!allIds.has(inv.id)) merged.push(inv); });
      return merged;
    },
    enabled: !!cp,
  });

  const { data: reconciliations } = useQuery({
    queryKey: ["counterparty_reconciliations", counterpartyId, companyId],
    queryFn: async () => {
      const invoiceIds = invoices?.map((i) => i.id) ?? [];
      if (invoiceIds.length === 0) return [];
      const { data, error } = await supabase
        .from("reconciliations")
        .select("*, bank_transactions(transaction_date, description, amount, counterpart_name)")
        .eq("company_id", companyId)
        .in("invoice_id", invoiceIds);
      if (error) throw error;
      return data;
    },
    enabled: !!invoices && invoices.length > 0,
  });

  const now = new Date();

  const scadenzario = useMemo(() => {
    return (invoices || [])
      .filter((i) => i.due_date)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
  }, [invoices]);

  const getDueDateColor = (dueDate: string, paymentStatus: string) => {
    if (paymentStatus === "paid") return "text-success";
    const due = new Date(dueDate);
    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return "text-destructive font-semibold";
    if (diff <= 7) return "text-warning font-semibold";
    return "";
  };

  if (!cp) return <div className="text-muted-foreground p-8 text-center">Caricamento...</div>;

  const field = (label: string, value: string | null | undefined) => (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-semibold">{cp.name}</h2>
        {cp.is_approved ? (
          <Badge className="bg-success text-success-foreground">Approvato</Badge>
        ) : (
          <Badge className="bg-warning text-warning-foreground">Da approvare</Badge>
        )}
        {cp.auto_created && <Badge variant="outline">Creato automaticamente</Badge>}
      </div>

      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-base">Anagrafica</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {field("Tipo", cp.type)}
            {field("P.IVA", cp.vat_number)}
            {field("Codice Fiscale", cp.fiscal_code)}
            {field("Indirizzo", cp.address)}
            {field("Città", cp.city)}
            {field("Provincia", cp.province)}
            {field("CAP", cp.cap)}
            {field("Paese", cp.country)}
            {field("PEC", cp.pec)}
            {field("Codice SDI", cp.sdi_code)}
            {field("Telefono", cp.phone)}
            {field("Email", cp.email)}
            {field("Giorni pagamento", cp.payment_terms_days?.toString())}
            {field("Metodo pagamento", getPaymentLabel(cp.payment_method))}
            {field("IBAN", cp.iban)}
            {field("Note", cp.notes)}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="fatture">
        <TabsList>
          <TabsTrigger value="fatture">Fatture ({invoices?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="scadenzario">Scadenzario</TabsTrigger>
          <TabsTrigger value="riconciliazioni">Riconciliazioni ({reconciliations?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="fatture">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numero</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead>Direzione</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead>Pagamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invoices || []).map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedInvoice(inv)}
                    >
                      <TableCell className="font-medium">{inv.invoice_number || "—"}</TableCell>
                      <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                      <TableCell>{inv.due_date ? formatDate(inv.due_date) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{inv.direction === "active" ? "Attiva" : "Passiva"}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(Number(inv.total_amount))}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{getPaymentLabel(extractPaymentMethod(inv.raw_xml))}</TableCell>
                      <TableCell><StatusBadge status={inv.payment_status} /></TableCell>
                    </TableRow>
                  ))}
                  {(!invoices || invoices.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nessuna fattura</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scadenzario">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data scadenza</TableHead>
                    <TableHead>Fattura</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scadenzario.map((inv) => (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedInvoice(inv)}>
                      <TableCell className={getDueDateColor(inv.due_date!, inv.payment_status)}>
                        {formatDate(inv.due_date!)}
                      </TableCell>
                      <TableCell className="font-medium">{inv.invoice_number || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(Number(inv.total_amount))}</TableCell>
                      <TableCell><StatusBadge status={inv.payment_status} /></TableCell>
                    </TableRow>
                  ))}
                  {scadenzario.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nessuna scadenza</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="riconciliazioni">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrizione</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(reconciliations || []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.bank_transactions?.transaction_date ? formatDate(r.bank_transactions.transaction_date) : "—"}</TableCell>
                      <TableCell className="max-w-[250px] truncate">{r.bank_transactions?.description || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(Number(r.reconciled_amount))}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                    </TableRow>
                  ))}
                  {(!reconciliations || reconciliations.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nessuna riconciliazione</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => { if (!open) setSelectedInvoice(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Fattura {selectedInvoice?.invoice_number || "—"} — {selectedInvoice?.counterpart_name}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <Tabs defaultValue="dati">
              <TabsList>
                <TabsTrigger value="dati">Dati</TabsTrigger>
                <TabsTrigger value="documento">Documento</TabsTrigger>
              </TabsList>
              <TabsContent value="dati" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Numero</span>
                    <p className="font-medium">{selectedInvoice.invoice_number || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Data</span>
                    <p className="font-medium">{formatDate(selectedInvoice.invoice_date)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Scadenza</span>
                    <p className="font-medium">{selectedInvoice.due_date ? formatDate(selectedInvoice.due_date) : "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Totale</span>
                    <p className="font-semibold">{formatCurrency(Number(selectedInvoice.total_amount))}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Imponibile</span>
                    <p className="font-medium">{formatCurrency(Number(selectedInvoice.subtotal || 0))}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IVA</span>
                    <p className="font-medium">{formatCurrency(Number(selectedInvoice.vat_amount || 0))}</p>
                  </div>
                </div>
                <div className="border rounded-lg p-3 space-y-2 text-sm">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Controparte</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">Nome</span>
                      <p className="font-medium">{selectedInvoice.counterpart_name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">P.IVA</span>
                      <p className="font-medium">{selectedInvoice.counterpart_vat || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground text-xs">Metodo:</span>
                    {extractPaymentMethod(selectedInvoice.raw_xml) 
                      ? <span className="text-xs font-medium">{getPaymentLabel(extractPaymentMethod(selectedInvoice.raw_xml))}</span>
                      : <span className="text-xs text-muted-foreground italic">Non presente in XML</span>
                    }
                    {!extractPaymentMethod(selectedInvoice.raw_xml) && cp?.payment_method && (
                      <span className="text-xs text-muted-foreground">
                        (Default controparte: {getPaymentLabel(cp.payment_method)})
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs ml-2">Stato:</span>
                    <StatusBadge status={selectedInvoice.payment_status} />
                  </div>
                </div>
                <InvoiceLineEditor invoiceId={selectedInvoice.id} companyId={companyId} invoiceDirection={selectedInvoice.direction} />
              </TabsContent>
              <TabsContent value="documento" className="mt-4">
                {selectedInvoice.raw_xml ? (
                  <InvoiceDocument invoice={selectedInvoice} />
                ) : (
                  <p className="text-center text-muted-foreground py-8">Nessun documento disponibile.</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}