import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Check, Eye, UserPlus, RefreshCw, Trash2, CheckCheck, Globe, Building2, Landmark, Briefcase, User } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { CounterpartyDetail } from "@/components/counterparties/CounterpartyDetail";
import { parseInvoiceFromXmlString } from "@/lib/xmlInvoiceParser";
import { upsertCounterpartyFromInvoice } from "@/lib/counterpartyUpsert";
import { lookupVatNumber, delay } from "@/lib/viesLookup";
import { Progress } from "@/components/ui/progress";

interface CounterpartyForm {
  name: string;
  type: string;
  vat_number: string;
  fiscal_code: string;
  address: string;
  city: string;
  province: string;
  cap: string;
  country: string;
  pec: string;
  sdi_code: string;
  phone: string;
  email: string;
  payment_terms_days: string;
  payment_method: string;
  iban: string;
  notes: string;
}

const ENTITY_TYPES = [
  { value: "azienda", label: "Azienda", icon: Building2 },
  { value: "pa", label: "PA", icon: Landmark },
  { value: "professionista", label: "Professionista", icon: Briefcase },
  { value: "persona", label: "Persona", icon: User },
] as const;

function getEntityIcon(entityType: string | null) {
  const found = ENTITY_TYPES.find(e => e.value === entityType);
  if (!found) return Building2;
  return found.icon;
}

const emptyForm: CounterpartyForm = {
  name: "", type: "fornitore", vat_number: "", fiscal_code: "",
  address: "", city: "", province: "", cap: "", country: "IT",
  pec: "", sdi_code: "", phone: "", email: "",
  payment_terms_days: "", payment_method: "", iban: "", notes: "",
};

export default function Controparti() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const queryClient = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<CounterpartyForm>(emptyForm);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [bulkApproveCount, setBulkApproveCount] = useState(0);
  const [activeTab, setActiveTab] = useState("fornitori");
  const [viesProgress, setViesProgress] = useState<{ current: number; total: number } | null>(null);
  const [newAnagraficaOpen, setNewAnagraficaOpen] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<string>("azienda");

  const { data: counterparties } = useQuery({
    queryKey: ["counterparties", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("counterparties")
        .select("*")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: invoices } = useQuery({
    queryKey: ["invoices", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, counterpart_id, counterpart_name, counterpart_vat, total_amount, payment_status, due_date, paid_amount")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        company_id: companyId,
        name: form.name.trim(),
        type: form.type,
        entity_type: selectedEntityType,
        vat_number: form.vat_number.trim() || null,
        fiscal_code: form.fiscal_code.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        province: form.province.trim() || null,
        cap: form.cap.trim() || null,
        country: form.country.trim() || "IT",
        pec: form.pec.trim() || null,
        sdi_code: form.sdi_code.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        payment_terms_days: form.payment_terms_days ? parseInt(form.payment_terms_days) : null,
        payment_method: form.payment_method.trim() || null,
        iban: form.iban.trim() || null,
        notes: form.notes.trim() || null,
        is_approved: true,
      };
      if (editId) {
        const { error } = await supabase.from("counterparties").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("counterparties").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counterparties"] });
      closeSheet();
      toast.success(editId ? "Controparte aggiornata" : "Controparte creata");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("counterparties")
        .update({ is_approved: true, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counterparties"] });
      toast.success("Controparte approvata");
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("counterparties")
        .update({ is_approved: true, approved_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counterparties"] });
      setSelected(new Set());
      setBulkApproveOpen(false);
      toast.success("Controparti approvate");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Unlink invoices first
      await supabase.from("invoices").update({ counterpart_id: null }).in("counterpart_id", ids);
      const { error } = await supabase.from("counterparties").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counterparties"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setSelected(new Set());
      setDeleteTarget(null);
      toast.success("Controparte/i eliminata/e");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reanalyzeNamesMutation = useMutation({
    mutationFn: async () => {
      // Get ALL invoices with raw_xml to find/create missing counterparties
      const { data: allInvoices } = await supabase
        .from("invoices")
        .select("id, raw_xml, original_filename, direction, counterpart_id, counterpart_vat")
        .eq("company_id", companyId!)
        .not("raw_xml", "is", null);

      if (!allInvoices || allInvoices.length === 0) throw new Error("Nessuna fattura con XML originale");

      let created = 0;
      let updated = 0;

      for (const inv of allInvoices) {
        try {
          const parsed = parseInvoiceFromXmlString(inv.raw_xml!);
          if (!parsed) continue;

          const companyVat = selectedCompany?.vat_number || null;
          const direction = parsed.buyer.vatNumber && companyVat?.includes(parsed.buyer.vatNumber) ? "passive" : "active";
          const cpVat = direction === "passive" ? parsed.supplier.vatNumber : parsed.buyer.vatNumber;
          const cpName = direction === "passive" ? parsed.supplier.name : parsed.buyer.name;

          if (!cpVat) continue;

          const { id: counterpartId, created: wasCreated } = await upsertCounterpartyFromInvoice(companyId!, companyVat, parsed);
          if (wasCreated) created++;
          else updated++;

          // Re-link invoice if needed
          if (counterpartId && counterpartId !== inv.counterpart_id) {
            await supabase.from("invoices").update({
              counterpart_id: counterpartId,
              counterpart_name: cpName || cpVat || "Sconosciuto",
            }).eq("id", inv.id);
          } else if (cpName && cpName.trim()) {
            await supabase.from("invoices").update({
              counterpart_name: cpName.trim(),
            }).eq("id", inv.id);
          }
        } catch (e) {
          console.warn("Error re-parsing invoice", inv.id, e);
        }
      }
      // Cleanup: elimina controparti orfane (0 fatture associate)
      const { data: allCps } = await supabase
        .from("counterparties")
        .select("id, vat_number")
        .eq("company_id", companyId!);

      if (allCps && allCps.length > 0) {
        const { data: allInvLinks } = await supabase
          .from("invoices")
          .select("counterpart_id")
          .eq("company_id", companyId!)
          .not("counterpart_id", "is", null);

        const linkedIds = new Set((allInvLinks || []).map(i => i.counterpart_id));

        // Also check by vat_number match
        const { data: allInvVats } = await supabase
          .from("invoices")
          .select("counterpart_vat")
          .eq("company_id", companyId!)
          .not("counterpart_vat", "is", null);

        const linkedVats = new Set((allInvVats || []).map(i => i.counterpart_vat));

        const orphanIds = allCps.filter(cp => 
          !linkedIds.has(cp.id) && !(cp.vat_number && linkedVats.has(cp.vat_number))
        ).map(cp => cp.id);

        let orphansDeleted = 0;
        if (orphanIds.length > 0) {
          const { error } = await supabase.from("counterparties").delete().in("id", orphanIds);
          if (!error) orphansDeleted = orphanIds.length;
        }

        return { created, updated, orphansDeleted };
      }

      return { created, updated, orphansDeleted: 0 };
    },
    onSuccess: ({ created, updated, orphansDeleted }) => {
      let msg = `${created} controparti create, ${updated} aggiornate`;
      if (orphansDeleted > 0) msg += `, ${orphansDeleted} orfane eliminate`;
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ["counterparties"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const viesEnrichMutation = useMutation({
    mutationFn: async () => {
      if (!counterparties) throw new Error("Nessuna controparte");
      
      // Filter counterparties with VAT but no vies_name
      const candidates = counterparties.filter(
        (cp: any) => cp.vat_number && !cp.vies_name
      );
      
      if (candidates.length === 0) throw new Error("Tutte le controparti hanno già il nome VIES");

      setViesProgress({ current: 0, total: candidates.length });
      let enriched = 0;

      for (let i = 0; i < candidates.length; i++) {
        const cp = candidates[i] as any;
        setViesProgress({ current: i + 1, total: candidates.length });

        try {
          // Extract country code from VAT (first 2 chars if letters, else IT)
          let countryCode = "IT";
          const vatStr = cp.vat_number || "";
          if (/^[A-Z]{2}/i.test(vatStr)) {
            countryCode = vatStr.substring(0, 2).toUpperCase();
          }

          const vies = await lookupVatNumber(vatStr, countryCode);
          
          if (vies.valid && vies.name) {
            const updates: Record<string, any> = { vies_name: vies.name };
            // Update main name if current name looks like a VAT number or is different
            if (!cp.name || cp.name === cp.vat_number || /^\d+$/.test(cp.name)) {
              updates.name = vies.name;
            }
            if (vies.address && !cp.address) {
              updates.address = vies.address;
            }
            await supabase.from("counterparties").update(updates).eq("id", cp.id);
            enriched++;
          }
        } catch {
          // Skip on error
        }

        // Rate limiting: 1.5 seconds between calls
        if (i < candidates.length - 1) {
          await delay(1500);
        }
      }

      setViesProgress(null);
      return { enriched, total: candidates.length };
    },
    onSuccess: ({ enriched, total }) => {
      toast.success(`${enriched}/${total} controparti arricchite da VIES`);
      queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
    onError: (e: any) => {
      setViesProgress(null);
      toast.error(e.message);
    },
  });

  const unapprovedCount = counterparties?.filter((c) => !c.is_approved).length ?? 0;

  const counterpartyStats = useMemo(() => {
    const stats: Record<string, { count: number; total: number; overdue: number }> = {};
    if (!invoices || !counterparties) return stats;
    const vatToCpId: Record<string, string> = {};
    const nameToCpId: Record<string, string> = {};
    counterparties.forEach(cp => {
      if (cp.vat_number) vatToCpId[cp.vat_number] = cp.id;
      if (cp.name) nameToCpId[cp.name.toLowerCase()] = cp.id;
    });
    invoices.forEach((inv) => {
      let cpId = inv.counterpart_id;
      if (!cpId && inv.counterpart_vat) cpId = vatToCpId[inv.counterpart_vat] || null;
      if (!cpId && inv.counterpart_name) cpId = nameToCpId[inv.counterpart_name.toLowerCase()] || null;
      if (!cpId) return;
      if (!stats[cpId]) stats[cpId] = { count: 0, total: 0, overdue: 0 };
      stats[cpId].count++;
      stats[cpId].total += Number(inv.total_amount);
      if (inv.payment_status !== "paid" && inv.due_date && new Date(inv.due_date) < new Date()) {
        stats[cpId].overdue += Number(inv.total_amount) - Number(inv.paid_amount);
      }
    });
    return stats;
  }, [invoices, counterparties]);

  const fornitori = counterparties?.filter((c) => c.type === "fornitore" || c.type === "entrambi") ?? [];
  const clienti = counterparties?.filter((c) => c.type === "cliente" || c.type === "entrambi") ?? [];
  const currentList = activeTab === "fornitori" ? fornitori : clienti;

  const closeSheet = () => {
    setSheetOpen(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const openNew = (type: string, entityType?: string) => {
    setEditId(null);
    setForm({ ...emptyForm, type });
    if (entityType) setSelectedEntityType(entityType);
    setSheetOpen(true);
    setNewAnagraficaOpen(false);
  };

  const openEdit = (cp: any) => {
    setEditId(cp.id);
    setForm({
      name: cp.name || "", type: cp.type || "fornitore",
      vat_number: cp.vat_number || "", fiscal_code: cp.fiscal_code || "",
      address: cp.address || "", city: cp.city || "",
      province: cp.province || "", cap: cp.cap || "",
      country: cp.country || "IT", pec: cp.pec || "",
      sdi_code: cp.sdi_code || "", phone: cp.phone || "",
      email: cp.email || "", payment_terms_days: cp.payment_terms_days?.toString() || "",
      payment_method: cp.payment_method || "", iban: cp.iban || "",
      notes: cp.notes || "",
    });
    setSelectedEntityType(cp.entity_type || "azienda");
    setSheetOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === currentList.length) setSelected(new Set());
    else setSelected(new Set(currentList.map(c => c.id)));
  };

  const handleBulkApproveAll = () => {
    const unapproved = currentList.filter(c => !c.is_approved);
    setBulkApproveCount(unapproved.length);
    setBulkApproveOpen(true);
  };

  const confirmBulkApprove = () => {
    const ids = selected.size > 0
      ? Array.from(selected).filter(id => currentList.find(c => c.id === id && !c.is_approved))
      : currentList.filter(c => !c.is_approved).map(c => c.id);
    if (ids.length > 0) bulkApproveMutation.mutate(ids);
    else { setBulkApproveOpen(false); toast.info("Nessuna controparte da approvare"); }
  };

  if (!companyId) return <div className="text-muted-foreground p-8 text-center">Caricamento...</div>;

  if (detailId) {
    return <CounterpartyDetail counterpartyId={detailId} companyId={companyId} onBack={() => setDetailId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Controparti</h2>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => reanalyzeNamesMutation.mutate()} disabled={reanalyzeNamesMutation.isPending}>
            <RefreshCw className={`h-4 w-4 ${reanalyzeNamesMutation.isPending ? "animate-spin" : ""}`} />
            Ri-analizza nomi
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => viesEnrichMutation.mutate()} disabled={viesEnrichMutation.isPending || !!viesProgress}>
            <Globe className={`h-4 w-4 ${viesEnrichMutation.isPending ? "animate-spin" : ""}`} />
            Arricchisci da VIES
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleBulkApproveAll}>
            <CheckCheck className="h-4 w-4" /> Approva tutti
          </Button>
          <Button className="gap-2" onClick={() => setNewAnagraficaOpen(true)}>
            <UserPlus className="h-4 w-4" /> Aggiungi anagrafica
          </Button>
        </div>
      </div>

      {viesProgress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Verifica {viesProgress.current}/{viesProgress.total} controparti...</span>
            <span>{Math.round((viesProgress.current / viesProgress.total) * 100)}%</span>
          </div>
          <Progress value={(viesProgress.current / viesProgress.total) * 100} />
        </div>
      )}

      {unapprovedCount > 0 && (
        <Alert className="border-warning/50 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription>
            <span className="font-medium">
              ⚠️ {unapprovedCount} controparte{unapprovedCount > 1 ? "i" : ""} in attesa di approvazione
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-2.5 bg-muted/50 border rounded-lg">
          <span className="text-sm font-medium">{selected.size} selezionat{selected.size > 1 ? "e" : "a"}</span>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            const unapprovedIds = Array.from(selected).filter(id => {
              const cp = counterparties?.find(c => c.id === id);
              return cp && !cp.is_approved;
            });
            if (unapprovedIds.length === 0) { toast.info("Tutte già approvate"); return; }
            setBulkApproveCount(unapprovedIds.length);
            setBulkApproveOpen(true);
          }}>
            <Check className="h-3.5 w-3.5" /> Approva selezionate
          </Button>
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => deleteMutation.mutate(Array.from(selected))}>
            <Trash2 className="h-3.5 w-3.5" /> Elimina selezionate
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Deseleziona</Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelected(new Set()); }}>
        <TabsList>
          <TabsTrigger value="fornitori">Fornitori ({fornitori.length})</TabsTrigger>
          <TabsTrigger value="clienti">Clienti ({clienti.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="fornitori">{renderTable(fornitori)}</TabsContent>
        <TabsContent value="clienti">{renderTable(clienti)}</TabsContent>
      </Tabs>

      {/* Edit Sheet (slide-over) */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) closeSheet(); }}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editId ? "Modifica controparte" : "Nuova controparte"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            {/* Entity type selector */}
            <div>
              <Label className="mb-2 block">Tipologia anagrafica</Label>
              <div className="grid grid-cols-4 gap-2">
                {ENTITY_TYPES.map((et) => {
                  const Icon = et.icon;
                  return (
                    <button
                      key={et.value}
                      type="button"
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all hover:border-primary/50 hover:bg-accent ${
                        selectedEntityType === et.value ? "border-primary bg-accent" : "border-border"
                      }`}
                      onClick={() => setSelectedEntityType(et.value)}
                    >
                      <Icon className="h-5 w-5 text-foreground" />
                      <span className="text-xs font-medium">{et.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Denominazione *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Ruolo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="fornitore">Fornitore</SelectItem>
                  <SelectItem value="entrambi">Entrambi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Partita IVA</Label>
              <Input value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} />
            </div>
            <div>
              <Label>Codice Fiscale</Label>
              <Input value={form.fiscal_code} onChange={(e) => setForm({ ...form, fiscal_code: e.target.value })} />
            </div>
            <div>
              <Label>PEC</Label>
              <Input value={form.pec} onChange={(e) => setForm({ ...form, pec: e.target.value })} />
            </div>
            <div>
              <Label>Codice SDI</Label>
              <Input value={form.sdi_code} onChange={(e) => setForm({ ...form, sdi_code: e.target.value })} maxLength={7} />
            </div>
            <div>
              <Label>Indirizzo</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>CAP</Label>
              <Input value={form.cap} onChange={(e) => setForm({ ...form, cap: e.target.value })} maxLength={5} />
            </div>
            <div>
              <Label>Città</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <Label>Provincia</Label>
              <Input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} maxLength={2} />
            </div>
            <div>
              <Label>Paese</Label>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} maxLength={2} />
            </div>
            <div>
              <Label>Telefono</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Giorni pagamento</Label>
              <Input type="number" value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })} />
            </div>
            <div>
              <Label>Metodo pagamento</Label>
              <Input value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} placeholder="es. MP05" />
            </div>
            <div className="col-span-2">
              <Label>IBAN</Label>
              <Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Note</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={closeSheet}>Annulla</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>
              {editId ? "Salva" : "Crea"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Le fatture collegate resteranno ma perderanno il riferimento alla controparte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteTarget && deleteMutation.mutate([deleteTarget.id])}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk approve confirmation */}
      <AlertDialog open={bulkApproveOpen} onOpenChange={setBulkApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approvare {bulkApproveCount} controparti?</AlertDialogTitle>
            <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkApprove}>Approva</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Anagrafica Dialog */}
      <Dialog open={newAnagraficaOpen} onOpenChange={setNewAnagraficaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova anagrafica</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-4 py-6">
            {ENTITY_TYPES.map((et) => {
              const Icon = et.icon;
              return (
                <button
                  key={et.value}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:border-primary/50 hover:bg-accent ${
                    selectedEntityType === et.value ? "border-primary bg-accent" : "border-border"
                  }`}
                  onClick={() => setSelectedEntityType(et.value)}
                >
                  <Icon className="h-7 w-7 text-foreground" />
                  <span className="text-sm font-medium">{et.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => setNewAnagraficaOpen(false)}>Annulla</Button>
            <Button onClick={() => openNew(activeTab === "fornitori" ? "fornitore" : "cliente", selectedEntityType)}>Crea</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  function renderTable(list: any[]) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={list.length > 0 && selected.size === list.length} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>P.IVA</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Fatture</TableHead>
                <TableHead className="text-right">Totale fatturato</TableHead>
                <TableHead className="text-right">Scaduto</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="w-32">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((cp) => {
                const s = counterpartyStats[cp.id] || { count: 0, total: 0, overdue: 0 };
                return (
                  <TableRow key={cp.id} className="group cursor-pointer" onClick={() => setDetailId(cp.id)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(cp.id)} onCheckedChange={() => toggleSelect(cp.id)} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {(() => {
                        const EntityIcon = getEntityIcon(cp.entity_type);
                        return (
                          <div className="flex items-center gap-2">
                            <EntityIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            {cp.name || <span className="text-muted-foreground italic">Nome mancante</span>}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{cp.vat_number || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{cp.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{s.count}</TableCell>
                    <TableCell className="text-right">{s.total > 0 ? formatCurrency(s.total) : "—"}</TableCell>
                    <TableCell className={`text-right ${s.overdue > 0 ? "text-destructive font-semibold" : ""}`}>
                      {s.overdue > 0 ? formatCurrency(s.overdue) : "—"}
                    </TableCell>
                    <TableCell>
                      {cp.is_approved ? (
                        <Badge className="bg-success text-success-foreground">Approvato</Badge>
                      ) : (
                        <Badge className="bg-warning text-warning-foreground">Da approvare</Badge>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-0.5">
                        {!cp.is_approved && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => approveMutation.mutate(cp.id)} title="Approva">
                            <Check className="h-4 w-4 text-success" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cp)} title="Modifica">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive" onClick={() => setDeleteTarget({ id: cp.id, name: cp.name })} title="Elimina">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Nessuna controparte trovata
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }
}