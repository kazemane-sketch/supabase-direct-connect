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

interface ProjectForm { name: string; code: string; status: string; budget: string; start_date: string; end_date: string; }
const emptyForm: ProjectForm = { name: "", code: "", status: "active", budget: "", start_date: "", end_date: "" };

export function ProgettiTab({ companyId }: { companyId?: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { data: projects } = useQuery({
    queryKey: ["projects", companyId],
    queryFn: async () => { const { data, error } = await supabase.from("projects").select("*").eq("company_id", companyId!).order("code"); if (error) throw error; return data; },
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { name: form.name.trim(), code: form.code.trim() || null, status: form.status, budget: form.budget ? parseFloat(form.budget) : null, start_date: form.start_date || null, end_date: form.end_date || null, company_id: companyId };
      if (editId) { const { error } = await supabase.from("projects").update(payload).eq("id", editId); if (error) throw error; }
      else { const { error } = await supabase.from("projects").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["projects", companyId] }); setForm(emptyForm); setEditId(null); setOpen(false); toast.success(editId ? "Progetto aggiornato" : "Progetto aggiunto"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("projects").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["projects", companyId] }); toast.success("Progetto eliminato"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (p: any) => { setForm({ name: p.name || "", code: p.code || "", status: p.status || "active", budget: p.budget ? String(p.budget) : "", start_date: p.start_date || "", end_date: p.end_date || "" }); setEditId(p.id); setOpen(true); };
  const openNew = () => { setForm(emptyForm); setEditId(null); setOpen(true); };
  const fmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Progetti</CardTitle>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild><Button size="sm" className="gap-1" onClick={openNew}><Plus className="h-4 w-4" /> Aggiungi</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Modifica progetto" : "Nuovo progetto"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome progetto" /></div>
                <div><Label>Codice</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="COD" maxLength={10} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Stato</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Attivo</SelectItem><SelectItem value="completed">Completato</SelectItem><SelectItem value="archived">Archiviato</SelectItem></SelectContent></Select></div>
                <div><Label>Budget</Label><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="0.00" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data inizio</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>Data fine</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim()} className="w-full">{editId ? "Aggiorna" : "Salva"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Codice</TableHead><TableHead>Nome</TableHead><TableHead>Stato</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="w-24"></TableHead></TableRow></TableHeader>
          <TableBody>
            {projects?.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-sm">{p.code || "—"}</TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
                <TableCell className="text-right">{p.budget ? fmt.format(Number(p.budget)) : "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare "{p.name}"?</AlertDialogTitle><AlertDialogDescription>Questa azione è irreversibile.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Elimina</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!projects || projects.length === 0) && (<TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nessun progetto</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}