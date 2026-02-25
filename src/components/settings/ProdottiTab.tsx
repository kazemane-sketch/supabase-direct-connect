import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

const CATEGORIES = ["inerti", "calcare", "argilla", "servizi", "altro"];
const UNITS = ["tonnellate", "viaggio", "ore", "pezzi", "mc", "mq", "kg"];

export function ProdottiTab({ companyId }: { companyId: string | undefined }) {
  const queryClient = useQueryClient();
  const [editProduct, setEditProduct] = useState<any>(null);
  const [showDialog, setShowDialog] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", companyId],
    queryFn: async () => { const { data, error } = await supabase.from("products").select("*").eq("company_id", companyId!).order("category").order("name"); if (error) throw error; return data; },
    enabled: !!companyId,
  });

  const upsertMutation = useMutation({
    mutationFn: async (product: any) => {
      if (product.id) { const { error } = await supabase.from("products").update({ name: product.name, category: product.category, unit: product.unit, price_per_unit: product.price_per_unit, is_active: product.is_active }).eq("id", product.id); if (error) throw error; }
      else { const { error } = await supabase.from("products").insert({ company_id: companyId!, name: product.name, category: product.category, unit: product.unit, price_per_unit: product.price_per_unit, is_active: true }); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products", companyId] }); setShowDialog(false); setEditProduct(null); toast.success("Prodotto salvato"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("products").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products", companyId] }); toast.success("Prodotto eliminato"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => { setEditProduct({ name: "", category: "inerti", unit: "tonnellate", price_per_unit: 0, is_active: true }); setShowDialog(true); };
  const openEdit = (p: any) => { setEditProduct({ ...p }); setShowDialog(true); };

  if (!companyId) return <p className="text-muted-foreground p-4">Seleziona un'azienda.</p>;

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Prodotti</CardTitle>
        <Button size="sm" className="gap-1" onClick={openNew}><Plus className="h-3 w-3" /> Aggiungi</Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Unità</TableHead><TableHead className="text-right">Prezzo unit.</TableHead><TableHead>Stato</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
          <TableBody>
            {products?.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell><Badge variant="secondary">{p.category}</Badge></TableCell>
                <TableCell>{p.unit}</TableCell>
                <TableCell className="text-right">{p.price_per_unit ? formatCurrency(Number(p.price_per_unit)) : "—"}</TableCell>
                <TableCell><Badge variant={p.is_active ? "default" : "outline"}>{p.is_active ? "Attivo" : "Inattivo"}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!products || products.length === 0) && !isLoading && (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nessun prodotto</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editProduct?.id ? "Modifica Prodotto" : "Nuovo Prodotto"}</DialogTitle></DialogHeader>
          {editProduct && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editProduct.name} onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Categoria</Label><Select value={editProduct.category} onValueChange={(v) => setEditProduct({ ...editProduct, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Unità</Label><Select value={editProduct.unit} onValueChange={(v) => setEditProduct({ ...editProduct, unit: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div><Label>Prezzo unitario</Label><Input type="number" value={editProduct.price_per_unit || ""} onChange={(e) => setEditProduct({ ...editProduct, price_per_unit: Number(e.target.value) })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Annulla</Button>
            <Button onClick={() => upsertMutation.mutate(editProduct)} disabled={!editProduct?.name}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}