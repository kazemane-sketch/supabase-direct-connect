import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface CompanyForm {
  name: string;
  vat_number: string;
  fiscal_code: string;
  address: string;
  city: string;
  zip_code: string;
  province: string;
  sdi_code: string;
  pec: string;
}

const emptyForm: CompanyForm = { name: "", vat_number: "", fiscal_code: "", address: "", city: "", zip_code: "", province: "", sdi_code: "", pec: "" };

export function AziendeTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        vat_number: form.vat_number.trim() || null,
        fiscal_code: form.fiscal_code.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        zip_code: form.zip_code.trim() || null,
        province: form.province.trim() || null,
        sdi_code: form.sdi_code.trim() || null,
        pec: form.pec.trim() || null,
      };
      if (editId) {
        const { error } = await supabase.from("companies").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("companies").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setForm(emptyForm);
      setEditId(null);
      setOpen(false);
      toast.success(editId ? "Azienda aggiornata" : "Azienda aggiunta");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Azienda eliminata");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (c: any) => {
    setForm({
      name: c.name || "", vat_number: c.vat_number || "", fiscal_code: c.fiscal_code || "",
      address: c.address || "", city: c.city || "", zip_code: c.zip_code || "",
      province: c.province || "", sdi_code: c.sdi_code || "", pec: c.pec || "",
    });
    setEditId(c.id);
    setOpen(true);
  };

  const openNew = () => { setForm(emptyForm); setEditId(null); setOpen(true); };

  const field = (label: string, key: keyof CompanyForm, placeholder?: string, maxLength?: number) => (
    <div>
      <Label>{label}</Label>
      <Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder || label} maxLength={maxLength || 200} />
    </div>
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Aziende</CardTitle>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" onClick={openNew}><Plus className="h-4 w-4" /> Aggiungi</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "Modifica azienda" : "Nuova azienda"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {field("Nome", "name", "Nome azienda")}
              <div className="grid grid-cols-2 gap-3">
                {field("P. IVA", "vat_number", "IT00000000000", 20)}
                {field("Codice Fiscale", "fiscal_code", "00000000000", 16)}
              </div>
              {field("Indirizzo", "address", "Via...")}
              <div className="grid grid-cols-3 gap-3">
                {field("Comune", "city", "Roma")}
                {field("CAP", "zip_code", "00100", 5)}
                {field("Provincia", "province", "RM", 2)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field("Codice SDI", "sdi_code", "QULXG4S", 7)}
                {field("PEC", "pec", "email@pec.it")}
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim()} className="w-full">
                {editId ? "Aggiorna" : "Salva"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>P. IVA</TableHead>
              <TableHead>Città</TableHead>
              <TableHead>SDI</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies?.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.vat_number || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{c.city || "—"}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-sm">{c.sdi_code || "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare "{c.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>Questa azione è irreversibile.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Elimina</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}