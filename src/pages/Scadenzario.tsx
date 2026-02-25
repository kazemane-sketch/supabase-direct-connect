import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { StatusBadge } from "@/components/StatusBadge";
import { CalendarIcon, Download, Check, FileText, Users, Eye } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Scadenzario() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [typeFilter, setTypeFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<"none" | "week" | "month">("none");

  const { data: invoices } = useQuery({
    queryKey: ["invoices_scadenzario", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, counterparties(id, name, type, is_approved)")
        .eq("company_id", companyId!)
        .not("due_date", "is", null)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const markPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const inv = invoices?.find((i) => i.id === invoiceId);
      if (!inv) return;
      const { error } = await supabase
        .from("invoices")
        .update({ payment_status: "paid", paid_amount: inv.total_amount })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices_scadenzario"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Fattura segnata come pagata");
    },
  });

  const now = new Date();

  const filtered = useMemo(() => {
    let list = invoices || [];

    if (typeFilter === "payments") list = list.filter((i) => i.direction === "passive");
    else if (typeFilter === "collections") list = list.filter((i) => i.direction === "active");

    if (periodFilter === "overdue") {
      list = list.filter((i) => i.payment_status !== "paid" && new Date(i.due_date!) < now);
    } else if (periodFilter === "thisWeek") {
      const endWeek = new Date(now);
      endWeek.setDate(now.getDate() + (7 - now.getDay()));
      list = list.filter((i) => {
        const d = new Date(i.due_date!);
        return d >= now && d <= endWeek;
      });
    } else if (periodFilter === "thisMonth") {
      const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      list = list.filter((i) => {
        const d = new Date(i.due_date!);
        return d >= now && d <= endMonth;
      });
    } else if (periodFilter === "future") {
      list = list.filter((i) => new Date(i.due_date!) > now);
    }

    if (dateFrom) list = list.filter((i) => new Date(i.due_date!) >= dateFrom);
    if (dateTo) list = list.filter((i) => new Date(i.due_date!) <= dateTo);

    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((i) => {
        const cpName = (i as any).counterparties?.name || i.counterpart_name || "";
        return cpName.toLowerCase().includes(s) || (i.invoice_number || "").toLowerCase().includes(s);
      });
    }

    return list;
  }, [invoices, typeFilter, periodFilter, dateFrom, dateTo, search]);

  const summary = useMemo(() => {
    const unpaid = (invoices || []).filter((i) => i.payment_status !== "paid");
    const daPagare = unpaid.filter((i) => i.direction === "passive").reduce((s, i) => s + Number(i.total_amount) - Number(i.paid_amount), 0);
    const daIncassare = unpaid.filter((i) => i.direction === "active").reduce((s, i) => s + Number(i.total_amount) - Number(i.paid_amount), 0);
    const scaduto = unpaid.filter((i) => new Date(i.due_date!) < now).reduce((s, i) => s + Number(i.total_amount) - Number(i.paid_amount), 0);
    const next30 = new Date(now);
    next30.setDate(next30.getDate() + 30);
    const prossimi30 = unpaid.filter((i) => {
      const d = new Date(i.due_date!);
      return d >= now && d <= next30;
    }).reduce((s, i) => s + Number(i.total_amount) - Number(i.paid_amount), 0);
    return { daPagare, daIncassare, scaduto, prossimi30 };
  }, [invoices]);

  const getRowClass = (inv: any) => {
    if (inv.payment_status === "paid") return "bg-success/5";
    const due = new Date(inv.due_date!);
    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return "bg-destructive/8";
    if (diff <= 7) return "bg-warning/8";
    if (diff <= 30) return "bg-amber-50";
    return "bg-muted/30";
  };

  const getDueBadge = (inv: any) => {
    if (inv.payment_status === "paid") return <Badge className="bg-success text-success-foreground">Pagato</Badge>;
    const due = new Date(inv.due_date!);
    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return <Badge className="bg-destructive text-destructive-foreground">Scaduto</Badge>;
    if (diff <= 7) return <Badge className="bg-warning text-warning-foreground">7gg</Badge>;
    if (diff <= 30) return <Badge variant="outline" className="border-warning text-warning">30gg</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">Futuro</Badge>;
  };

  const getGroupKey = useCallback((dueDate: string) => {
    const d = new Date(dueDate);
    if (groupBy === "month") return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    if (groupBy === "week") {
      const startOfWeek = new Date(d);
      startOfWeek.setDate(d.getDate() - d.getDay() + 1);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `${formatDate(startOfWeek.toISOString())} — ${formatDate(endOfWeek.toISOString())}`;
    }
    return "";
  }, [groupBy]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return { "": filtered };
    const groups: Record<string, typeof filtered> = {};
    filtered.forEach((inv) => {
      const key = getGroupKey(inv.due_date!);
      if (!groups[key]) groups[key] = [];
      groups[key].push(inv);
    });
    return groups;
  }, [filtered, groupBy, getGroupKey]);

  const exportCsv = () => {
    const header = "Data scadenza;Fornitore/Cliente;N. Fattura;Importo;Direzione;Stato pagamento\n";
    const rows = filtered.map((inv) => {
      const cpName = (inv as any).counterparties?.name || inv.counterpart_name || "";
      return `${inv.due_date};${cpName};${inv.invoice_number || ""};${Number(inv.total_amount).toFixed(2)};${inv.direction === "active" ? "Incasso" : "Pagamento"};${inv.payment_status}`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scadenzario_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!companyId) return <div className="text-muted-foreground p-8 text-center">Caricamento...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Scadenzario</h2>
        <Button variant="outline" className="gap-2" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Esporta CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Da pagare (fornitori)</p><p className="text-lg font-bold text-destructive">{formatCurrency(summary.daPagare)}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Da incassare (clienti)</p><p className="text-lg font-bold text-success">{formatCurrency(summary.daIncassare)}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Scaduto non pagato</p><p className="text-lg font-bold text-destructive">{formatCurrency(summary.scaduto)}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Prossimi 30 giorni</p><p className="text-lg font-bold text-warning">{formatCurrency(summary.prossimi30)}</p></CardContent></Card>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1"><label className="text-xs text-muted-foreground">Dal</label><Popover><PopoverTrigger asChild><Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateFrom ? format(dateFrom, "dd/MM/yyyy") : "—"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className={cn("p-3 pointer-events-auto")} /></PopoverContent></Popover></div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">Al</label><Popover><PopoverTrigger asChild><Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateTo ? format(dateTo, "dd/MM/yyyy") : "—"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} className={cn("p-3 pointer-events-auto")} /></PopoverContent></Popover></div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">Tipo</label><Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tutti</SelectItem><SelectItem value="payments">Solo pagamenti</SelectItem><SelectItem value="collections">Solo incassi</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">Periodo</label><Select value={periodFilter} onValueChange={setPeriodFilter}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tutti</SelectItem><SelectItem value="overdue">Scaduto</SelectItem><SelectItem value="thisWeek">Questa settimana</SelectItem><SelectItem value="thisMonth">Questo mese</SelectItem><SelectItem value="future">Futuro</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">Cerca</label><Input placeholder="Fornitore/cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-[180px]" /></div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">Raggruppa</label><Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}><SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nessuno</SelectItem><SelectItem value="week">Per settimana</SelectItem><SelectItem value="month">Per mese</SelectItem></SelectContent></Select></div>
            {(dateFrom || dateTo || typeFilter !== "all" || periodFilter !== "all" || search) && (<Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setTypeFilter("all"); setPeriodFilter("all"); setSearch(""); }}>Reset</Button>)}
          </div>
          <p className="text-xs text-muted-foreground mt-2">{filtered.length} scadenz{filtered.length === 1 ? "a" : "e"} trovate</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Data scadenza</TableHead><TableHead>Fornitore/Cliente</TableHead><TableHead>N. Fattura</TableHead><TableHead className="text-right">Importo</TableHead><TableHead>Metodo pagamento</TableHead><TableHead>Stato</TableHead><TableHead className="w-32">Azioni</TableHead></TableRow></TableHeader>
            <TableBody>
              {Object.entries(grouped).map(([groupLabel, items]) => (
                <>
                  {groupBy !== "none" && groupLabel && (<TableRow key={`group-${groupLabel}`}><TableCell colSpan={7} className="bg-muted/60 font-semibold text-sm py-2 capitalize">{groupLabel} ({items.length})</TableCell></TableRow>)}
                  {items.map((inv: any) => {
                    const cpName = inv.counterparties?.name || inv.counterpart_name || "—";
                    return (
                      <TableRow key={inv.id} className={getRowClass(inv)}>
                        <TableCell className="font-medium">{formatDate(inv.due_date)}</TableCell>
                        <TableCell>{cpName}</TableCell>
                        <TableCell>{inv.invoice_number || "—"}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(Number(inv.total_amount) - Number(inv.paid_amount))}</TableCell>
                        <TableCell className="text-muted-foreground">{inv.payment_method || "—"}</TableCell>
                        <TableCell>{getDueBadge(inv)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {inv.payment_status !== "paid" && (<Button variant="ghost" size="icon" className="h-7 w-7" title="Segna come pagato" onClick={() => markPaidMutation.mutate(inv.id)}><Check className="h-3.5 w-3.5 text-success" /></Button>)}
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Vai alla fattura" onClick={() => navigate("/fatture")}><FileText className="h-3.5 w-3.5" /></Button>
                            {inv.counterparties?.id && (<Button variant="ghost" size="icon" className="h-7 w-7" title="Vai alla controparte" onClick={() => navigate("/controparti")}><Users className="h-3.5 w-3.5" /></Button>)}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </>
              ))}
              {filtered.length === 0 && (<TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nessuna scadenza trovata</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}