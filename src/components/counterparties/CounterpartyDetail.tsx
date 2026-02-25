import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { getPaymentLabel } from "@/lib/paymentLabels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InvoiceLineEditor } from "@/components/invoices/InvoiceLineEditor";
import { InvoiceDocument } from "@/components/invoices/InvoiceDocument";
import { ArrowLeft, Pencil, Building2, Landmark, Briefcase, User, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  counterpartyId: string;
  companyId: string;
  onBack: () => void;
}

const ENTITY_TYPES = [
  { value: "azienda", label: "Azienda", icon: Building2 },
  { value: "pa", label: "PA", icon: Landmark },
  { value: "professionista", label: "Professionista", icon: Briefcase },
  { value: "persona", label: "Persona", icon: User },
] as const;

function getEntityIcon(entityType: string | null) {
  return ENTITY_TYPES.find(e => e.value === entityType)?.icon || Building2;
}

function extractPaymentMethod(rawXml: string | null): string | null {
  if (!rawXml) return null;
  const match = rawXml.match(/<ModalitaPagamento>(MP\d+)<\/ModalitaPagamento>/);
  return match ? match[1] : null;
}

export function CounterpartyDetail({ counterpartyId, companyId, onBack }: Props) {
  const queryClient = useQueryClient();
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

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

  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.from("counterparties").update(updates).eq("id", counterpartyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counterparty", counterpartyId] });
      queryClient.invalidateQueries({ queryKey: ["counterparties"] });
      setEditing(false);
      toast.success("Controparte aggiornata");
    },
    onError: (e: any) => toast.error(e.message),
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

  const startEditing = () => {
    setForm({
      name: cp.name || "",
      type: cp.type || "fornitore",
      entity_type: (cp as any).entity_type || "azienda",
      vat_number: cp.vat_number || "",
      fiscal_code: cp.fiscal_code || "",
      address: cp.address || "",
      city: cp.city || "",
      province: cp.province || "",
      cap: cp.cap || "",
      country: cp.country || "IT",
      pec: cp.pec || "",
      sdi_code: cp.sdi_code || "",
      phone: cp.phone || "",
      email: cp.email || "",
      payment_terms_days: cp.payment_terms_days?.toString() || "",
      payment_method: cp.payment_method || "",
      iban: cp.iban || "",
      notes: cp.notes || "",
    });
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      name: form.name?.trim() || cp.name,
      type: form.type,
      entity_type: form.entity_type,
      vat_number: form.vat_number?.trim() || null,
      fiscal_code: form.fiscal_code?.trim() || null,
      address: form.address?.trim() || null,
      city: form.city?.trim() || null,
      province: form.province?.trim() || null,
      cap: form.cap?.trim() || null,
      country: form.country?.trim() || "IT",
      pec: form.pec?.trim() || null,
      sdi_code: form.sdi_code?.trim() || null,
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      payment_terms_days: form.payment_terms_days ? parseInt(form.payment_terms_days) : null,
      payment_method: form.payment_method?.trim() || null,
      iban: form.iban?.trim() || null,
      notes: form.notes?.trim() || null,
    });
  };

  const EntityIcon = getEntityIcon((cp as any).entity_type);

  const field = (label: string, value: string | null | undefined) => (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );

  const editField = (label: string, key: string, opts?: { maxLength?: number; type?: string; placeholder?: string }) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        value={form[key] || ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        maxLength={opts?.maxLength}
        type={opts?.type}
        placeholder={opts?.placeholder}
        className="h-8 text-sm"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <EntityIcon className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold">{cp.name}</h2>
        {cp.is_approved ? (
          <Badge className="bg-success text-success-foreground">Approvato</Badge>
        ) : (
          <Badge className="bg-warning text-warning-foreground">Da approvare</Badge>
        )}
        {cp.auto_created && <Badge variant="outline">Creato automaticamente</Badge>}
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Anagrafica</CardTitle>
            {!editing ? (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditing}>
                <Pencil className="h-3.5 w-3.5" /> Modifica
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(false)}>
                  <X className="h-3.5 w-3.5" /> Annulla
                </Button>
                <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={updateMutation.isPending}>
                  <Save className="h-3.5 w-3.5" /> Salva
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-4">
              {/* Entity type selector */}
              <div>
                <Label className="text-xs mb-2 block">Tipologia anagrafica</Label>
                <div className="grid grid-cols-4 gap-2">
                  {ENTITY_TYPES.map((et) => {
                    const Icon = et.icon;
                    return (
                      <button
                        key={et.value}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all hover:border-primary/50 hover:bg-accent ${
                          form.entity_type === et.value ? "border-primary bg-accent" : "border-border"
                        }`}
                        onClick={() => setForm({ ...form, entity_type: et.value })}
                      >
                        <Icon className="h-5 w-5 text-foreground" />
                        <span className="text-xs font-medium">{et.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {editField("Denominazione *", "name")}
                <div>
                  <Label className="text-xs">Ruolo</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cliente">Cliente</SelectItem>
                      <SelectItem value="fornitore">Fornitore</SelectItem>
                      <SelectItem value="entrambi">Entrambi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editField("P.IVA", "vat_number")}
                {editField("Codice Fiscale", "fiscal_code")}
                {editField("Indirizzo", "address")}
                {editField("Città", "city")}
                {editField("Provincia", "province", { maxLength: 2 })}
                {editField("CAP", "cap", { maxLength: 5 })}
                {editField("Paese", "country", { maxLength: 2 })}
                {editField("PEC", "pec")}
                {editField("Codice SDI", "sdi_code", { maxLength: 7 })}
                {editField("Telefono", "phone")}
                {editField("Email", "email")}
                {editField("Giorni pagamento", "payment_terms_days", { type: "number" })}
                {editField("Metodo pagamento", "payment_method", { placeholder: "es. MP05" })}
                {editField("IBAN", "iban")}
              </div>
              <div className="col-span-full">
                {editField("Note", "notes")}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {field("Tipologia", ENTITY_TYPES.find(e => e.value === (cp as any).entity_type)?.label || "Azienda")}
              {field("Ruolo", cp.type)}
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
          )}
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
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedInvoice(inv)}>
                      <TableCell className="font-medium">{inv.invoice_number || "—"}</TableCell>
                      <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                      <TableCell>{inv.due_date ? formatDate(inv.due_date) : "—"}</TableCell>
                      <TableCell><Badge variant="outline">{inv.direction === "active" ? "Attiva" : "Passiva"}</Badge></TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(Number(inv.total_amount))}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{getPaymentLabel(extractPaymentMethod(inv.raw_xml))}</TableCell>
                      <TableCell><StatusBadge status={inv.payment_status} /></TableCell>
                    </TableRow>
                  ))}
                  {(!invoices || invoices.length === 0) && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nessuna fattura</TableCell></TableRow>
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
                      <TableCell className={getDueDateColor(inv.due_date!, inv.payment_status)}>{formatDate(inv.due_date!)}</TableCell>
                      <TableCell className="font-medium">{inv.invoice_number || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(Number(inv.total_amount))}</TableCell>
                      <TableCell><StatusBadge status={inv.payment_status} /></TableCell>
                    </TableRow>
                  ))}
                  {scadenzario.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nessuna scadenza</TableCell></TableRow>
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
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nessuna riconciliazione</TableCell></TableRow>
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
            <DialogTitle>Fattura {selectedInvoice?.invoice_number || "—"} — {selectedInvoice?.counterpart_name}</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <Tabs defaultValue="dati">
              <TabsList>
                <TabsTrigger value="dati">Dati</TabsTrigger>
                <TabsTrigger value="documento">Documento</TabsTrigger>
              </TabsList>
              <TabsContent value="dati" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  {field("Numero", selectedInvoice.invoice_number)}
                  {field("Data", formatDate(selectedInvoice.invoice_date))}
                  {field("Scadenza", selectedInvoice.due_date ? formatDate(selectedInvoice.due_date) : "—")}
                  <div><span className="text-muted-foreground">Totale</span><p className="font-semibold">{formatCurrency(Number(selectedInvoice.total_amount))}</p></div>
                  {field("Imponibile", formatCurrency(Number(selectedInvoice.subtotal || 0)))}
                  {field("IVA", formatCurrency(Number(selectedInvoice.vat_amount || 0)))}
                </div>
                <div className="border rounded-lg p-3 space-y-2 text-sm">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Controparte</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {field("Nome", selectedInvoice.counterpart_name)}
                    {field("P.IVA", selectedInvoice.counterpart_vat)}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground text-xs">Metodo:</span>
                    {extractPaymentMethod(selectedInvoice.raw_xml)
                      ? <span className="text-xs font-medium">{getPaymentLabel(extractPaymentMethod(selectedInvoice.raw_xml))}</span>
                      : <span className="text-xs text-muted-foreground italic">Non presente in XML</span>
                    }
                    {!extractPaymentMethod(selectedInvoice.raw_xml) && cp?.payment_method && (
                      <span className="text-xs text-muted-foreground">(Default controparte: {getPaymentLabel(cp.payment_method)})</span>
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
