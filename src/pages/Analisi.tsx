import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard } from "@/components/KpiCard";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { TrendingUp, TrendingDown, Target, Percent, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function Analisi() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;

  const { data: reconciliations } = useQuery({
    queryKey: ["recon_analysis", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reconciliations")
        .select("*, chart_of_accounts(name, type, code), projects(name, code, budget), invoices(id)")
        .eq("company_id", companyId!)
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: projects } = useQuery({
    queryKey: ["projects_analysis", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const reconInvoiceIds = useMemo(() => {
    return reconciliations?.filter((r) => r.invoice_id).map((r) => r.invoice_id!) ?? [];
  }, [reconciliations]);

  const { data: lineProjectSplits } = useQuery({
    queryKey: ["line_project_splits", reconInvoiceIds],
    queryFn: async () => {
      if (reconInvoiceIds.length === 0) return [];
      const { data, error } = await supabase
        .from("invoice_lines")
        .select("invoice_id, total, invoice_line_projects(project_id, percentage)")
        .in("invoice_id", reconInvoiceIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: reconInvoiceIds.length > 0,
  });

  const projectSplitAmounts = useMemo(() => {
    const map: Record<string, number> = {};
    if (!lineProjectSplits) return map;
    for (const line of lineProjectSplits) {
      const splits: any[] = line.invoice_line_projects ?? [];
      for (const sp of splits) {
        const amt = (Number(line.total) * Number(sp.percentage)) / 100;
        map[sp.project_id] = (map[sp.project_id] || 0) + amt;
      }
    }
    return map;
  }, [lineProjectSplits]);

  const { data: salesLines } = useQuery({
    queryKey: ["product_sales_lines", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_lines")
        .select("*, products(name, unit, category), invoices!inner(company_id, direction, invoice_date)")
        .eq("invoices.company_id", companyId!)
        .eq("invoices.direction", "active");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const costByCategory = reconciliations
    ?.filter((r) => (r.chart_of_accounts as any)?.type === "cost" && (r.chart_of_accounts as any)?.name)
    .reduce((acc, r) => {
      const name = (r.chart_of_accounts as any).name;
      acc[name] = (acc[name] || 0) + Math.abs(Number(r.reconciled_amount));
      return acc;
    }, {} as Record<string, number>) ?? {};

  const pieData = Object.entries(costByCategory).map(([name, value]) => ({ name, value }));

  const totalRevenue = reconciliations
    ?.filter((r) => (r.chart_of_accounts as any)?.type === "revenue")
    .reduce((s, r) => s + Math.abs(Number(r.reconciled_amount)), 0) ?? 0;

  const totalCosts = reconciliations
    ?.filter((r) => (r.chart_of_accounts as any)?.type === "cost")
    .reduce((s, r) => s + Math.abs(Number(r.reconciled_amount)), 0) ?? 0;

  const [salesDateFrom, setSalesDateFrom] = useState("");
  const [salesDateTo, setSalesDateTo] = useState("");
  const [salesProjectFilter, setSalesProjectFilter] = useState("all");

  const filteredSalesLines = useMemo(() => {
    if (!salesLines) return [];
    return salesLines.filter((sl) => {
      const inv = sl.invoices as any;
      if (!inv) return false;
      if (salesDateFrom && inv.invoice_date < salesDateFrom) return false;
      if (salesDateTo && inv.invoice_date > salesDateTo) return false;
      return true;
    });
  }, [salesLines, salesDateFrom, salesDateTo]);

  const productSalesData = useMemo(() => {
    const map: Record<string, { name: string; unit: string; tons: number; revenue: number; count: number }> = {};
    for (const sl of filteredSalesLines) {
      const prod = sl.products as any;
      const name = prod?.name || sl.description || "Altro";
      const unit = prod?.unit || "—";
      if (!map[name]) map[name] = { name, unit, tons: 0, revenue: 0, count: 0 };
      map[name].tons += Number(sl.quantity_tons || sl.quantity || 0);
      map[name].revenue += Number(sl.total || 0);
      map[name].count += 1;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filteredSalesLines]);

  const monthlyProductData = useMemo(() => {
    const monthMap: Record<string, Record<string, number>> = {};
    for (const sl of filteredSalesLines) {
      const inv = sl.invoices as any;
      if (!inv?.invoice_date) continue;
      const d = new Date(inv.invoice_date);
      const monthKey = d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
      const prod = (sl.products as any)?.name || "Altro";
      if (!monthMap[monthKey]) monthMap[monthKey] = {};
      monthMap[monthKey][prod] = (monthMap[monthKey][prod] || 0) + Number(sl.quantity_tons || sl.quantity || 0);
    }
    return Object.entries(monthMap).map(([month, prods]) => ({ month, ...prods }));
  }, [filteredSalesLines]);

  const productNames = useMemo(() => {
    const names = new Set<string>();
    filteredSalesLines.forEach((sl) => {
      const n = (sl.products as any)?.name || "Altro";
      names.add(n);
    });
    return Array.from(names);
  }, [filteredSalesLines]);

  if (!companyId) return <div className="text-muted-foreground p-8 text-center">Caricamento...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Analisi</h2>

      <Tabs defaultValue="ricavi">
        <TabsList>
          <TabsTrigger value="ricavi">Ricavi & Costi</TabsTrigger>
          <TabsTrigger value="progetti">Per Progetto</TabsTrigger>
          <TabsTrigger value="vendite">Vendite per Prodotto</TabsTrigger>
        </TabsList>

        <TabsContent value="ricavi" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard title="Ricavi totali" value={formatCurrency(totalRevenue)} icon={TrendingUp} variant="success" />
            <KpiCard title="Costi totali" value={formatCurrency(totalCosts)} icon={TrendingDown} variant="destructive" />
            <KpiCard title="Margine" value={formatCurrency(totalRevenue - totalCosts)} icon={Percent} variant={totalRevenue - totalCosts >= 0 ? "success" : "destructive"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-base">Ripartizione costi</CardTitle></CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-12">Dati insufficienti</p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-base">Conto economico</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead className="text-right">Totale</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {pieData.map((item) => (
                      <TableRow key={item.name}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.value)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{totalCosts > 0 ? ((item.value / totalCosts) * 100).toFixed(1) : 0}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="progetti" className="space-y-4">
          {projects?.map((proj) => {
            const projRecon = reconciliations?.filter((r) => (r.projects as any)?.code === proj.code) ?? [];
            const reconSpent = projRecon.filter((r) => (r.chart_of_accounts as any)?.type === "cost").reduce((s, r) => s + Math.abs(Number(r.reconciled_amount)), 0);
            const reconRevenue = projRecon.filter((r) => (r.chart_of_accounts as any)?.type === "revenue").reduce((s, r) => s + Math.abs(Number(r.reconciled_amount)), 0);
            const splitAmount = projectSplitAmounts[proj.id] || 0;
            const spent = reconSpent + splitAmount;
            const revenue = reconRevenue;
            const margin = revenue - spent;

            return (
              <Card key={proj.id} className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    {proj.code} — {proj.name}
                    {splitAmount > 0 && <span className="text-xs font-normal text-muted-foreground">(incl. {formatCurrency(splitAmount)} da ripartizioni)</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard title="Budget" value={formatCurrency(Number(proj.budget || 0))} icon={Target} />
                    <KpiCard title="Speso" value={formatCurrency(spent)} icon={TrendingDown} variant="destructive" />
                    <KpiCard title="Ricavi" value={formatCurrency(revenue)} icon={TrendingUp} variant="success" />
                    <KpiCard title="Margine" value={formatCurrency(margin)} icon={Percent} variant={margin >= 0 ? "success" : "destructive"} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {(!projects || projects.length === 0) && <p className="text-center text-muted-foreground py-8">Nessun progetto trovato</p>}
        </TabsContent>

        <TabsContent value="vendite" className="space-y-4">
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div><Label className="text-xs">Da</Label><Input type="date" value={salesDateFrom} onChange={(e) => setSalesDateFrom(e.target.value)} className="h-8 w-40 text-xs" /></div>
                <div><Label className="text-xs">A</Label><Input type="date" value={salesDateTo} onChange={(e) => setSalesDateTo(e.target.value)} className="h-8 w-40 text-xs" /></div>
                <div><Label className="text-xs">Progetto</Label><Select value={salesProjectFilter} onValueChange={setSalesProjectFilter}><SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tutti</SelectItem>{projects?.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard title="Tonnellate vendute" value={productSalesData.reduce((s, p) => s + p.tons, 0).toLocaleString("it-IT", { maximumFractionDigits: 1 })} icon={Package} />
            <KpiCard title="Ricavo totale" value={formatCurrency(productSalesData.reduce((s, p) => s + p.revenue, 0))} icon={TrendingUp} variant="success" />
            <KpiCard title="Prezzo medio/ton" value={(() => { const totalTons = productSalesData.reduce((s, p) => s + p.tons, 0); const totalRev = productSalesData.reduce((s, p) => s + p.revenue, 0); return totalTons > 0 ? formatCurrency(totalRev / totalTons) : "—"; })()} icon={Target} />
          </div>

          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-base">Dettaglio vendite per prodotto</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Prodotto</TableHead><TableHead className="text-right">Quantità</TableHead><TableHead>Unità</TableHead><TableHead className="text-right">Ricavo totale</TableHead><TableHead className="text-right">Prezzo medio</TableHead></TableRow></TableHeader>
                <TableBody>
                  {productSalesData.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.tons.toLocaleString("it-IT", { maximumFractionDigits: 1 })}</TableCell>
                      <TableCell className="text-muted-foreground">{row.unit}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.revenue)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{row.tons > 0 ? formatCurrency(row.revenue / row.tons) : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {productSalesData.length === 0 && (<TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nessun dato di vendita</TableCell></TableRow>)}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {monthlyProductData.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-base">Tonnellate per prodotto / mese</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={monthlyProductData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    {productNames.map((name, i) => (<Bar key={name} dataKey={name} fill={COLORS[i % COLORS.length]} stackId="a" />))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}