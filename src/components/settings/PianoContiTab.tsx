import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface AccountForm { code: string; name: string; type: string; }
const emptyForm: AccountForm = { code: "", name: "", type: "cost" };

export function PianoContiTab({ companyId }: { companyId?: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { data: accounts } = useQuery({
    queryKey: ["chart_of_accounts", companyId],
    queryFn: async () => { const { data, error } = await supabase.from("chart_of_accounts").select("*").eq("company_id", companyId!).order("code"); if (error) throw error; return data; },
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { code: form.code.trim() || null, name: form.name.trim() || null, type: form.type, company_id: companyId };
      if (editId) { const { error } = await supabase.from("chart_of_accounts").update(payload).eq("id", editId); if (error) throw error; }
      else { const { error } = await supabase.from("chart_of_accounts").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["chart_of_accounts", companyId] }); setForm(emptyForm); setEditId(null); setOpen(false); toast.success(editId ? "Conto aggiornato" : "Conto aggiunto"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["chart_of_accounts", companyId] }); toast.success("Conto eliminato"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (a: any) => { setForm({ code: a.code || "", name: a.name || "", type: a.type || "cost" }); setEditId(a.id); setOpen(true); };
  const openNew = () => { setForm(emptyForm); setEditId(null); setOpen(true); };
  const typeLabels: Record<string, string> = { revenue: "Ricavo", cost: "Costo", asset: "Attivo", liability: "Passivo" };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Piano dei Conti</CardTitle>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild><Button size="sm" className="gap-1" onClick={openNew}><Plus className="h-4 w-4" /> Aggiungi</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Modifica conto" : "Nuovo conto"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Codice</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="100" maxLength={20} /></div>
                <div><Label>Tipo</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome conto" /></div>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim()} className="w-full">{editId ? "Aggiorna" : "Salva"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Codice</TableHead><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead className="w-24"></TableHead></TableRow></TableHeader>
          <TableBody>
            {accounts?.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-sm">{a.code || "—"}</TableCell>
                <TableCell>{a.name || "—"}</TableCell>
                <TableCell><StatusBadge status={a.type || ""} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare "{a.name}"?</AlertDialogTitle><AlertDialogDescription>Questa azione è irreversibile.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Elimina</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!accounts || accounts.length === 0) && (<TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nessun conto configurato</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}