import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface BankForm { bank_name: string; account_name: string; iban: string; currency: string; current_balance: string; company_id: string; }
const emptyForm: BankForm = { bank_name: "", account_name: "", iban: "", currency: "EUR", current_balance: "0", company_id: "" };

export function ContiBancariTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BankForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { data: accounts } = useQuery({
    queryKey: ["bank_accounts_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("*, companies(name)").order("bank_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { bank_name: form.bank_name.trim() || null, account_name: form.account_name.trim() || null, iban: form.iban.trim() || null, currency: form.currency || "EUR", current_balance: parseFloat(form.current_balance) || 0, company_id: form.company_id };
      if (editId) { const { error } = await supabase.from("bank_accounts").update(payload).eq("id", editId); if (error) throw error; }
      else { const { error } = await supabase.from("bank_accounts").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bank_accounts_all"] }); setForm(emptyForm); setEditId(null); setOpen(false); toast.success(editId ? "Conto aggiornato" : "Conto aggiunto"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("bank_accounts").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bank_accounts_all"] }); toast.success("Conto eliminato"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (a: any) => { setForm({ bank_name: a.bank_name || "", account_name: a.account_name || "", iban: a.iban || "", currency: a.currency || "EUR", current_balance: String(a.current_balance || 0), company_id: a.company_id }); setEditId(a.id); setOpen(true); };
  const openNew = () => { setForm(emptyForm); setEditId(null); setOpen(true); };
  const fmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Conti Bancari</CardTitle>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild><Button size="sm" className="gap-1" onClick={openNew}><Plus className="h-4 w-4" /> Aggiungi</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Modifica conto" : "Nuovo conto bancario"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Azienda</Label><Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}><SelectTrigger><SelectValue placeholder="Seleziona azienda" /></SelectTrigger><SelectContent>{companies?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Banca</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="Nome banca" /></div>
              <div><Label>Nome conto</Label><Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="Conto principale" /></div>
              <div><Label>IBAN</Label><Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="IT..." maxLength={34} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valuta</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="EUR" maxLength={3} /></div>
                <div><Label>Saldo attuale</Label><Input type="number" value={form.current_balance} onChange={(e) => setForm({ ...form, current_balance: e.target.value })} /></div>
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.company_id} className="w-full">{editId ? "Aggiorna" : "Salva"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Banca</TableHead><TableHead>Nome conto</TableHead><TableHead>IBAN</TableHead><TableHead>Azienda</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead className="w-24"></TableHead></TableRow></TableHeader>
          <TableBody>
            {accounts?.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.bank_name || "—"}</TableCell>
                <TableCell>{a.account_name || "—"}</TableCell>
                <TableCell className="font-mono text-sm">{a.iban || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{(a.companies as any)?.name || "—"}</TableCell>
                <TableCell className="text-right">{fmt.format(Number(a.current_balance))}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare questo conto?</AlertDialogTitle><AlertDialogDescription>Tutti i movimenti collegati verranno eliminati.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Elimina</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!accounts || accounts.length === 0) && (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nessun conto bancario</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}