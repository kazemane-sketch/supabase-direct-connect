import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { stringSimilarity } from "@/lib/fuzzyMatch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, AlertTriangle, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";

// Filter out non-real invoice lines (e.g. summary lines with 0 price)
function isRealInvoiceLine(line: any): boolean {
  if (!line.description) return false;
  if (line.unit_price === 0 && line.total === 0 && line.quantity <= 1) return false;
  return true;
}

interface InvoiceLineEditorProps {
  invoiceId: string;
  companyId: string;
  invoiceDirection?: string;
}

export function InvoiceLineEditor({ invoiceId, companyId, invoiceDirection }: InvoiceLineEditorProps) {
  const queryClient = useQueryClient();

  const { data: lines, isLoading } = useQuery({
    queryKey: ["invoice_lines", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_lines")
        .select("*, invoice_line_projects(*, projects(name, code)), products(name, unit, category)")
        .eq("invoice_id", invoiceId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: projects } = useQuery({
    queryKey: ["projects", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("company_id", companyId).eq("status", "active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("company_id", companyId).eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const addLineMutation = useMutation({
    mutationFn: async () => {
      const sortOrder = (lines?.length ?? 0) + 1;
      const { error } = await supabase.from("invoice_lines").insert({
        invoice_id: invoiceId,
        description: "Nuova riga",
        quantity: 1,
        unit_price: 0,
        total: 0,
        sort_order: sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoice_lines", invoiceId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateLineMutation = useMutation({
    mutationFn: async (params: { id: string; description: string; quantity: number; unit_price: number; vat_rate: number; product_id: string | null; quantity_tons: number | null; unit_of_measure: string | null }) => {
      const total = params.quantity * params.unit_price;
      const { error } = await supabase.from("invoice_lines").update({
        description: params.description,
        quantity: params.quantity,
        unit_price: params.unit_price,
        vat_rate: params.vat_rate,
        total,
        product_id: params.product_id,
        quantity_tons: params.quantity_tons,
        unit_of_measure: params.unit_of_measure,
      }).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoice_lines", invoiceId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteLineMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoice_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoice_lines", invoiceId] }),
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Caricamento righe...</p>;

  const isActive = invoiceDirection === "active";
  const filteredLines = lines?.filter((l) => isRealInvoiceLine(l)) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Righe fattura</h3>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => addLineMutation.mutate()}>
          <Plus className="h-3 w-3" /> Aggiungi riga
        </Button>
      </div>

      {filteredLines.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Nessuna riga. Clicca "Aggiungi riga" per iniziare.</p>
      )}

      {filteredLines.map((line) => (
        <InvoiceLineRow
          key={line.id}
          line={line}
          projects={projects ?? []}
          products={products ?? []}
          showProductSuggestion={isActive}
          onUpdate={(params) => updateLineMutation.mutate({ id: line.id, ...params })}
          onDelete={() => deleteLineMutation.mutate(line.id)}
          invoiceLineId={line.id}
        />
      ))}
    </div>
  );
}

function InvoiceLineRow({
  line,
  projects,
  products,
  showProductSuggestion,
  onUpdate,
  onDelete,
  invoiceLineId,
}: {
  line: any;
  projects: any[];
  products: any[];
  showProductSuggestion: boolean;
  onUpdate: (params: { description: string; quantity: number; unit_price: number; vat_rate: number; product_id: string | null; quantity_tons: number | null; unit_of_measure: string | null }) => void;
  onDelete: () => void;
  invoiceLineId: string;
}) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(line.description || "");
  const [quantity, setQuantity] = useState(String(line.quantity ?? 1));
  const [unitPrice, setUnitPrice] = useState(String(line.unit_price ?? 0));
  const [vatRate, setVatRate] = useState(String(line.vat_rate ?? 22));
  const [productId, setProductId] = useState<string>(line.product_id || "");
  const [quantityTons, setQuantityTons] = useState(String(line.quantity_tons ?? ""));
  const [unitOfMeasure, setUnitOfMeasure] = useState(line.unit_of_measure || "");
  const [editing, setEditing] = useState(false);

  // AI product suggestion based on description similarity
  const suggestedProduct = useMemo(() => {
    if (!showProductSuggestion || line.product_id || !line.description || products.length === 0) return null;
    let best: { product: any; score: number } | null = null;
    for (const p of products) {
      const score = stringSimilarity(line.description.toLowerCase(), p.name.toLowerCase());
      if (score > 0.3 && (!best || score > best.score)) {
        best = { product: p, score };
      }
    }
    return best;
  }, [line.description, line.product_id, products, showProductSuggestion]);

  const lineProjects: any[] = line.invoice_line_projects ?? [];
  const totalPerc = lineProjects.reduce((s: number, lp: any) => s + Number(lp.percentage), 0);
  const percWarning = lineProjects.length > 0 && Math.abs(totalPerc - 100) > 0.01;

  const linkedProduct = line.products as any;

  const handleSave = () => {
    onUpdate({
      description,
      quantity: Number(quantity),
      unit_price: Number(unitPrice),
      vat_rate: Number(vatRate),
      product_id: productId || null,
      quantity_tons: quantityTons ? Number(quantityTons) : null,
      unit_of_measure: unitOfMeasure || null,
    });
    setEditing(false);
  };

  const acceptSuggestion = () => {
    if (!suggestedProduct) return;
    const p = suggestedProduct.product;
    onUpdate({
      description: line.description,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      vat_rate: Number(line.vat_rate),
      product_id: p.id,
      quantity_tons: p.unit === "tonnellate" ? Number(line.quantity) : null,
      unit_of_measure: p.unit,
    });
  };

  const addProjectMutation = useMutation({
    mutationFn: async (projId: string) => {
      const remaining = 100 - totalPerc;
      const { error } = await supabase.from("invoice_line_projects").insert({
        invoice_line_id: invoiceLineId,
        project_id: projId,
        percentage: Math.max(remaining, 0),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoice_lines"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateProjectMutation = useMutation({
    mutationFn: async (params: { id: string; percentage: number; notes: string }) => {
      const { error } = await supabase.from("invoice_line_projects").update({
        percentage: params.percentage,
        notes: params.notes || null,
      }).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoice_lines"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoice_line_projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoice_lines"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const assignedProjectIds = lineProjects.map((lp: any) => lp.project_id);
  const availableProjects = projects.filter((p) => !assignedProjectIds.includes(p.id));

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-3">
        {/* AI suggestion banner */}
        {suggestedProduct && !editing && (
          <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-md p-2">
            <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-xs flex-1">
              Suggerimento: <strong>{suggestedProduct.product.name}</strong> ({suggestedProduct.product.unit}) — {(suggestedProduct.score * 100).toFixed(0)}% match
            </span>
            <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={acceptSuggestion}>
              <Check className="h-3 w-3" /> Accetta
            </Button>
          </div>
        )}

        {/* Line details */}
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-2">
            {editing ? (
              <div className="space-y-2">
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrizione" />
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs">Quantità</Label><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
                  <div><Label className="text-xs">Prezzo unit.</Label><Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} /></div>
                  <div><Label className="text-xs">IVA %</Label><Input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} /></div>
                </div>
                {/* Product fields */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Prodotto</Label>
                    <Select value={productId} onValueChange={(v) => {
                      setProductId(v);
                      const prod = products.find((p) => p.id === v);
                      if (prod) {
                        setUnitOfMeasure(prod.unit);
                        if (prod.unit === "tonnellate") setQuantityTons(quantity);
                      }
                    }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Tonnellate</Label><Input type="number" value={quantityTons} onChange={(e) => setQuantityTons(e.target.value)} placeholder="—" className="h-8 text-xs" /></div>
                  <div><Label className="text-xs">Unità misura</Label><Input value={unitOfMeasure} onChange={(e) => setUnitOfMeasure(e.target.value)} placeholder="tonnellate" className="h-8 text-xs" /></div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave}>Salva</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Annulla</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setEditing(true)}>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{line.description}</p>
                    {linkedProduct && (
                      <Badge variant="secondary" className="text-xs">{linkedProduct.name}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {line.quantity} × {formatCurrency(Number(line.unit_price))} · IVA {line.vat_rate}%
                    {line.quantity_tons && ` · ${Number(line.quantity_tons).toLocaleString("it-IT")} ${line.unit_of_measure || "ton"}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatCurrency(Number(line.total))}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Project assignments */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Assegnazione progetti</span>
            {percWarning && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Totale {totalPerc.toFixed(0)}% ≠ 100%
              </span>
            )}
          </div>

          {lineProjects.map((lp: any) => (
            <ProjectAssignmentRow
              key={lp.id}
              assignment={lp}
              onUpdate={(perc, notes) => updateProjectMutation.mutate({ id: lp.id, percentage: perc, notes })}
              onDelete={() => deleteProjectMutation.mutate(lp.id)}
            />
          ))}

          {availableProjects.length > 0 && (
            <Select onValueChange={(v) => addProjectMutation.mutate(v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="+ Aggiungi progetto" />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectAssignmentRow({ assignment, onUpdate, onDelete }: {
  assignment: any;
  onUpdate: (percentage: number, notes: string) => void;
  onDelete: () => void;
}) {
  const [perc, setPerc] = useState(String(assignment.percentage));
  const [notes, setNotes] = useState(assignment.notes || "");
  const projectName = assignment.projects ? `${assignment.projects.code} — ${assignment.projects.name}` : "Progetto";

  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
      <span className="text-xs font-medium flex-1 truncate">{projectName}</span>
      <Input type="number" value={perc} onChange={(e) => setPerc(e.target.value)} onBlur={() => onUpdate(Number(perc), notes)} className="h-7 w-20 text-xs text-right" min={0} max={100} />
      <span className="text-xs text-muted-foreground">%</span>
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => onUpdate(Number(perc), notes)} placeholder="Note" className="h-7 w-28 text-xs" />
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}