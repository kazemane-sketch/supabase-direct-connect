import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Eye, AlertTriangle, RefreshCw, Download, Upload, Paperclip, FileUp, Trash2, Search, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { InvoiceLineEditor } from "@/components/invoices/InvoiceLineEditor";
import { InvoiceDocument } from "@/components/invoices/InvoiceDocument";
import { ImportXmlModal } from "@/components/invoices/ImportXmlModal";
import { QuarantenaTab } from "@/components/invoices/QuarantenaTab";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { reanalyzeInvoice, cleanupDuplicateCounterparties } from "@/lib/counterpartyUpsert";

import { PAYMENT_LABELS } from "@/lib/paymentLabels";

// Payment method mapping with colors
const PAYMENT_METHODS: Record<string, { label: string; color: string }> = {
  MP01: { label: "Contanti", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  MP02: { label: "RIBA", color: "bg-blue-100 text-blue-800 border-blue-200" },
  MP04: { label: "Contanti", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  MP05: { label: "Bonifico", color: "bg-green-100 text-green-800 border-green-200" },
  MP06: { label: "Vaglia", color: "bg-gray-100 text-gray-800 border-gray-200" },
  MP07: { label: "Bollettino", color: "bg-gray-100 text-gray-800 border-gray-200" },
  MP08: { label: "Carta", color: "bg-pink-100 text-pink-800 border-pink-200" },
  MP09: { label: "RID", color: "bg-orange-100 text-orange-800 border-orange-200" },
  MP10: { label: "RID utenze", color: "bg-orange-100 text-orange-800 border-orange-200" },
  MP11: { label: "RID veloce", color: "bg-orange-100 text-orange-800 border-orange-200" },
  MP12: { label: "RIBA", color: "bg-blue-100 text-blue-800 border-blue-200" },
  MP19: { label: "SEPA DD", color: "bg-purple-100 text-purple-800 border-purple-200" },
  MP21: { label: "Bonifico istantaneo", color: "bg-green-100 text-green-800 border-green-200" },
  MP22: { label: "Trattenuta", color: "bg-gray-100 text-gray-800 border-gray-200" },
};

function getPaymentMethodBadge(code: string | null | undefined) {
  if (!code) return null;
  const method = PAYMENT_METHODS[code];
  if (method) {
    return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${method.color}`}>{method.label}</Badge>;
  }
  const label = PAYMENT_LABELS[code] ?? code;
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{label}</Badge>;
}

// Get payment method: prefer DB column, fallback to counterparty default
function getInvoicePaymentMethod(inv: any): string | null {
  if (inv.payment_method) return inv.payment_method;
  if (inv.counterparties?.payment_method) return inv.counterparties.payment_method;
  return null;
}

export default function Fatture() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  const { data: invoices } = useQuery({
    queryKey: ["invoices", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, counterparties(id, name, is_approved, payment_method)")
        .eq("company_id", companyId!)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const reanalyzeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, raw_xml, original_filename")
        .eq("company_id", companyId!)
        .not("raw_xml", "is", null);
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Nessuna fattura con XML originale trovata");

      let counterpartiesCreated = 0;
      for (const inv of data) {
        try {
          const result = await reanalyzeInvoice(companyId!, selectedCompany?.vat_number || null, inv as any);
          if (result.created) counterpartiesCreated++;
        } catch (e) {
          console.warn("Error re-analyzing invoice", inv.id, e);
        }
      }

      // Clean up duplicate counterparties
      const dupsRemoved = await cleanupDuplicateCounterparties(companyId!);

      return { total: data.length, counterpartiesCreated, dupsRemoved };
    },
    onSuccess: ({ total, counterpartiesCreated, dupsRemoved }) => {
      const parts = [`${total} fatture ri-analizzate`, `${counterpartiesCreated} controparti create/aggiornate`];
      if (dupsRemoved > 0) parts.push(`${dupsRemoved} duplicati rimossi`);
      toast.success(parts.join(", "));
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
    onError: (err: any) => toast.error(err.message || "Errore durante la ri-analisi"),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      // Delete lines first, then invoices
      const { data: invIds } = await supabase.from("invoices").select("id").eq("company_id", companyId!);
      if (invIds && invIds.length > 0) {
        const ids = invIds.map(i => i.id);
        await supabase.from("invoice_line_projects").delete().in("invoice_line_id",
          (await supabase.from("invoice_lines").select("id").in("invoice_id", ids)).data?.map(l => l.id) ?? []
        );
        await supabase.from("invoice_lines").delete().in("invoice_id", ids);
        await supabase.from("invoices").delete().eq("company_id", companyId!);
      }
    },
    onSuccess: () => {
      toast.success("Tutte le fatture eliminate");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setQuickFilter = (type: string) => {
    const now = new Date();
    switch (type) {
      case "this_month":
        setDateFrom(startOfMonth(now));
        setDateTo(endOfMonth(now));
        break;
      case "last_month":
        setDateFrom(startOfMonth(subMonths(now, 1)));
        setDateTo(endOfMonth(subMonths(now, 1)));
        break;
      case "last_3":
        setDateFrom(startOfMonth(subMonths(now, 2)));
        setDateTo(endOfMonth(now));
        break;
      case "all":
        setDateFrom(undefined);
        setDateTo(undefined);
        break;
    }
  };

  if (!companyId) return <div className="text-muted-foreground p-8 text-center">Caricamento...</div>;

  // Filter invoices
  const filterInvoices = (list: any[]) => {
    return list.filter((inv) => {
      if (dateFrom && new Date(inv.invoice_date) < dateFrom) return false;
      if (dateTo && new Date(inv.invoice_date) > dateTo) return false;
      if (statusFilter === "unpaid" && inv.payment_status === "paid") return false;
      if (statusFilter === "paid" && inv.payment_status !== "paid") return false;
      if (statusFilter === "overdue" && !(inv.payment_status !== "paid" && inv.due_date && new Date(inv.due_date) < new Date())) return false;
      if (searchText && !inv.counterpart_name?.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });
  };

  const active = filterInvoices(invoices?.filter((i) => i.direction === "active") ?? []);
  const passive = filterInvoices(invoices?.filter((i) => i.direction === "passive") ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Fatture</h2>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-destructive">
                <Trash2 className="h-4 w-4" /> Elimina tutte
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminare tutte le fatture?</AlertDialogTitle>
                <AlertDialogDescription>Questa azione è irreversibile. Tutte le fatture e le relative righe saranno eliminate.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteAllMutation.mutate()} className="bg-destructive text-destructive-foreground">Elimina tutte</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" className="gap-2" onClick={() => reanalyzeMutation.mutate()} disabled={reanalyzeMutation.isPending}>
            <RefreshCw className={`h-4 w-4 ${reanalyzeMutation.isPending ? "animate-spin" : ""}`} />
            Ri-analizza
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" /> Importa XML
          </Button>
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Aggiungi
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cerca controparte..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="pl-8 w-48 h-9" />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, "dd/MM/yy") : "Dal"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className={cn("p-3 pointer-events-auto")} locale={it} />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {dateTo ? format(dateTo, "dd/MM/yy") : "Al"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className={cn("p-3 pointer-events-auto")} locale={it} />
          </PopoverContent>
        </Popover>
        <div className="flex gap-1">
          {[
            { label: "Questo mese", value: "this_month" },
            { label: "Mese scorso", value: "last_month" },
            { label: "Ultimi 3 mesi", value: "last_3" },
            { label: "Tutto", value: "all" },
          ].map((q) => (
            <Button key={q.value} variant="ghost" size="sm" className="text-xs h-8" onClick={() => setQuickFilter(q.value)}>{q.label}</Button>
          ))}
        </div>
        <div className="flex gap-1 ml-2">
          {[
            { label: "Tutti", value: "all" },
            { label: "Non pagate", value: "unpaid" },
            { label: "Pagate", value: "paid" },
            { label: "Scadute", value: "overdue" },
          ].map((f) => (
            <Button key={f.value} variant={statusFilter === f.value ? "default" : "ghost"} size="sm" className="text-xs h-8" onClick={() => setStatusFilter(f.value)}>{f.label}</Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Fatture Attive ({active.length})</TabsTrigger>
          <TabsTrigger value="passive">Fatture Passive ({passive.length})</TabsTrigger>
          <TabsTrigger value="quarantena">Quarantena</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <Card className="shadow-sm"><CardContent className="p-0"><InvoiceTable invoices={active} companyId={companyId} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="passive">
          <Card className="shadow-sm"><CardContent className="p-0"><InvoiceTable invoices={passive} companyId={companyId} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="quarantena">
          <QuarantenaTab companyId={companyId} />
        </TabsContent>
      </Tabs>

      <ImportXmlModal open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

async function downloadOriginalXml(invoice: any) {
  if (!invoice.raw_xml) { toast.error("Nessun XML originale disponibile"); return; }
  const blob = new Blob([invoice.raw_xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = invoice.original_filename || `fattura-${invoice.invoice_number || invoice.id}.xml`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function InvoiceTable({ invoices, companyId }: { invoices: any[]; companyId: string }) {
  const [detailInvoice, setDetailInvoice] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === invoices.length) setSelected(new Set());
    else setSelected(new Set(invoices.map(i => i.id)));
  };

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Delete line projects, lines, then invoices
      const { data: lineIds } = await supabase.from("invoice_lines").select("id").in("invoice_id", ids);
      if (lineIds && lineIds.length > 0) {
        await supabase.from("invoice_line_projects").delete().in("invoice_line_id", lineIds.map(l => l.id));
      }
      await supabase.from("invoice_lines").delete().in("invoice_id", ids);
      await supabase.from("invoices").delete().in("id", ids);
    },
    onSuccess: () => {
      toast.success("Fatture eliminate");
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const uploadPdfMutation = useMutation({
    mutationFn: async ({ invoiceId, file }: { invoiceId: string; file: File }) => {
      const path = `${companyId}/${invoiceId}.pdf`;
      const { error: uploadError } = await supabase.storage.from("invoices-pdf").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase.from("invoices").update({ pdf_storage_path: path }).eq("id", invoiceId);
      if (updateError) throw updateError;
      return path;
    },
    onSuccess: () => {
      toast.success("PDF allegato correttamente");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && detailInvoice) {
      uploadPdfMutation.mutate({ invoiceId: detailInvoice.id, file });
    }
  };

  const openPdfNewTab = async (path: string) => {
    const { data, error } = await supabase.storage.from("invoices-pdf").createSignedUrl(path, 3600);
    if (error || !data) { toast.error("Errore apertura PDF"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const downloadPdf = async (path: string, filename: string) => {
    const { data, error } = await supabase.storage.from("invoices-pdf").download(path);
    if (error) { toast.error("Errore download PDF"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const paymentMethodFromInv = (inv: any) => getInvoicePaymentMethod(inv);

  return (
    <>
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-2 bg-muted/50 border-b">
          <span className="text-sm font-medium">{selected.size} selezionate</span>
          <Button variant="destructive" size="sm" className="gap-1" onClick={() => deleteMutation.mutate(Array.from(selected))}>
            <Trash2 className="h-3.5 w-3.5" /> Elimina selezionate
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={invoices.length > 0 && selected.size === invoices.length} onCheckedChange={toggleAll} />
            </TableHead>
            <TableHead>Numero</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Scadenza</TableHead>
            <TableHead>Controparte</TableHead>
            <TableHead className="text-right">Importo</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead>Metodo</TableHead>
            <TableHead>Riconciliata</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => {
            const cpNotApproved = inv.counterparties && !inv.counterparties.is_approved;
            const pm = paymentMethodFromInv(inv);
            return (
              <TableRow key={inv.id} className="group cursor-pointer" onClick={() => setDetailInvoice(inv)}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(inv.id)} onCheckedChange={() => toggleSelect(inv.id)} />
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5">
                    {inv.pdf_storage_path && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                    {inv.invoice_number}
                  </div>
                </TableCell>
                <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                <TableCell>{inv.due_date ? formatDate(inv.due_date) : "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {inv.counterpart_name}
                    {cpNotApproved && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge className="bg-warning text-warning-foreground text-[10px] px-1.5 py-0 gap-1">
                            <AlertTriangle className="h-3 w-3" /> Non approvato
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>Fornitore non approvato — revisiona in Controparti</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="font-semibold">{formatCurrency(Number(inv.total_amount))}</div>
                  <div className="text-xs text-muted-foreground">{formatCurrency(Number(inv.subtotal || (inv.total_amount - (inv.vat_amount || 0))))} excl.</div>
                </TableCell>
                <TableCell><StatusBadge status={inv.payment_status} /></TableCell>
                <TableCell>{getPaymentMethodBadge(pm)}</TableCell>
                <TableCell>
                  <Badge variant={inv.reconciliation_status === "reconciled" ? "default" : "outline"} className={inv.reconciliation_status === "reconciled" ? "bg-success text-success-foreground" : ""}>
                    {inv.reconciliation_status === "reconciled" ? "Sì" : "No"}
                  </Badge>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailInvoice(inv)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive" onClick={() => deleteMutation.mutate([inv.id])}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {invoices.length === 0 && (
            <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nessuna fattura trovata</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      {/* Detail Dialog */}
      <Dialog open={!!detailInvoice} onOpenChange={(open) => { if (!open) setDetailInvoice(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between flex-wrap gap-2">
              <span>Fattura {detailInvoice?.invoice_number || "—"} — {detailInvoice?.counterpart_name}</span>
              <div className="flex gap-2">
                {detailInvoice?.raw_xml && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadOriginalXml(detailInvoice)}>
                    <Download className="h-3.5 w-3.5" /> XML
                  </Button>
                )}
                {detailInvoice?.pdf_storage_path && (
                  <>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openPdfNewTab(detailInvoice.pdf_storage_path)}>
                      Apri in nuova scheda
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadPdf(detailInvoice.pdf_storage_path, `fattura-${detailInvoice.invoice_number || detailInvoice.id}.pdf`)}>
                      <Download className="h-3.5 w-3.5" /> PDF
                    </Button>
                  </>
                )}
                {!detailInvoice?.pdf_storage_path && (
                  <>
                    <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} />
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => pdfInputRef.current?.click()} disabled={uploadPdfMutation.isPending}>
                      <Upload className="h-3.5 w-3.5" /> Allega PDF
                    </Button>
                  </>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {detailInvoice && (
            <Tabs defaultValue="dati">
              <TabsList>
                <TabsTrigger value="dati">Dati</TabsTrigger>
                <TabsTrigger value="documento">Documento</TabsTrigger>
              </TabsList>
              <TabsContent value="dati" className="space-y-4 mt-4">
                {/* Header info */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Numero</span>
                    <p className="font-medium">{detailInvoice.invoice_number || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Data</span>
                    <p className="font-medium">{formatDate(detailInvoice.invoice_date)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Scadenza</span>
                    <p className="font-medium">{detailInvoice.due_date ? formatDate(detailInvoice.due_date) : "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Totale</span>
                    <p className="font-semibold">{formatCurrency(Number(detailInvoice.total_amount))}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Imponibile</span>
                    <p className="font-medium">{formatCurrency(Number(detailInvoice.subtotal || 0))}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IVA</span>
                    <p className="font-medium">{formatCurrency(Number(detailInvoice.vat_amount || 0))}</p>
                  </div>
                </div>

                {/* Counterparty info */}
                <div className="border rounded-lg p-3 space-y-2 text-sm">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Controparte</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">Nome</span>
                      <p className="font-medium">{detailInvoice.counterpart_name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">P.IVA</span>
                      <p className="font-medium">{detailInvoice.counterpart_vat || "—"}</p>
                    </div>
                  </div>
                   <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground text-xs">Metodo:</span>
                    {getInvoicePaymentMethod(detailInvoice) 
                      ? getPaymentMethodBadge(getInvoicePaymentMethod(detailInvoice))
                      : <span className="text-xs text-muted-foreground italic">Non presente in XML</span>
                    }
                    <span className="text-muted-foreground text-xs ml-2">Stato:</span>
                    <StatusBadge status={detailInvoice.payment_status} />
                  </div>
                </div>

                {detailInvoice.original_filename && (
                  <div className="text-xs text-muted-foreground">File: {detailInvoice.original_filename}</div>
                )}
                <InvoiceLineEditor invoiceId={detailInvoice.id} companyId={companyId} invoiceDirection={detailInvoice.direction} />
              </TabsContent>

              <TabsContent value="documento" className="mt-4">
                {detailInvoice.pdf_storage_path ? (
                  <div className="border rounded-lg overflow-hidden bg-muted/30 min-h-[500px]">
                    <PdfViewer path={detailInvoice.pdf_storage_path} />
                  </div>
                ) : detailInvoice.raw_xml ? (
                  <InvoiceDocument invoice={detailInvoice} />
                ) : (
                  <p className="text-center text-muted-foreground py-8">Nessun documento disponibile. Allega un PDF o importa da XML.</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PdfViewer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  if (!url && !error) {
    supabase.storage.from("invoices-pdf").createSignedUrl(path, 3600).then(({ data, error: err }) => {
      if (err || !data) setError(true);
      else setUrl(data.signedUrl);
    });
  }

  if (error) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Errore caricamento PDF</div>;
  if (!url) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Caricamento...</div>;

  return <iframe src={url} className="w-full h-full min-h-[500px]" title="PDF fattura" />;
}