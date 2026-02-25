import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { Wallet, FileText, FileMinus, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Link } from "react-router-dom";

export default function Index() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;

  const { data: bankAccounts } = useQuery({
    queryKey: ["bank_accounts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("*").eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: invoices } = useQuery({
    queryKey: ["invoices", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: transactions } = useQuery({
    queryKey: ["bank_transactions", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*, bank_accounts(bank_name, account_name)")
        .eq("company_id", companyId!)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const totalBalance = bankAccounts?.reduce((sum, a) => sum + Number(a.current_balance), 0) ?? 0;
  const activeUnpaid = invoices?.filter((i) => i.direction === "active" && i.payment_status !== "paid").reduce((s, i) => s + Number(i.total_amount) - Number(i.paid_amount), 0) ?? 0;
  const passiveUnpaid = invoices?.filter((i) => i.direction === "passive" && i.payment_status !== "paid").reduce((s, i) => s + Number(i.total_amount) - Number(i.paid_amount), 0) ?? 0;
  const unmatchedCount = transactions?.filter((t) => t.reconciliation_status === "unmatched").length ?? 0;

  const cashflowData = generateCashflowData(transactions ?? []);

  const now = new Date();
  const next7 = new Date(now);
  next7.setDate(next7.getDate() + 7);
  const upcomingInvoices = invoices
    ?.filter((i) => i.payment_status !== "paid" && i.due_date && new Date(i.due_date) <= next7)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 5) ?? [];

  const unmatchedTransactions = transactions?.filter((t) => t.reconciliation_status === "unmatched").slice(0, 5) ?? [];

  if (!companyId) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Caricamento...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="Saldo totale conti" value={formatCurrency(totalBalance)} icon={Wallet} variant="default" />
        <KpiCard title="Crediti aperti" value={formatCurrency(activeUnpaid)} icon={FileText} variant="success" />
        <KpiCard title="Debiti aperti" value={formatCurrency(passiveUnpaid)} icon={FileMinus} variant="warning" />
        <KpiCard title="Da riconciliare" value={String(unmatchedCount)} icon={AlertCircle} variant="destructive" />
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Cashflow — Ultimi 12 mesi</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cashflowData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
              />
              <Legend />
              <Bar dataKey="entrate" fill="hsl(var(--chart-income))" name="Entrate" radius={[4, 4, 0, 0]} />
              <Bar dataKey="uscite" fill="hsl(var(--chart-expense))" name="Uscite" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Fatture in scadenza — prossimi 7 giorni</CardTitle>
            <Link to="/scadenzario" className="text-xs text-primary hover:underline">Vedi tutto →</Link>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numero</TableHead>
                  <TableHead>Controparte</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.counterpart_name}</TableCell>
                    <TableCell>{formatDate(inv.due_date!)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(inv.total_amount))}</TableCell>
                  </TableRow>
                ))}
                {upcomingInvoices.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nessuna fattura in scadenza nei prossimi 7 giorni</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Movimenti non riconciliati</CardTitle>
          </CardHeader>
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
                {unmatchedTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{formatDate(tx.transaction_date)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{tx.description}</TableCell>
                    <TableCell className={`text-right font-semibold ${Number(tx.amount) >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(Number(tx.amount))}
                    </TableCell>
                    <TableCell><StatusBadge status={tx.reconciliation_status} /></TableCell>
                  </TableRow>
                ))}
                {unmatchedTransactions.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Tutti i movimenti sono riconciliati</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function generateCashflowData(transactions: any[]) {
  const months: Record<string, { entrate: number; uscite: number }> = {};
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
    months[key] = { entrate: 0, uscite: 0 };
  }

  transactions.forEach((tx) => {
    const d = new Date(tx.transaction_date);
    const key = d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
    if (months[key]) {
      const amt = Number(tx.amount);
      if (amt > 0) months[key].entrate += amt;
      else months[key].uscite += Math.abs(amt);
    }
  });

  return Object.entries(months).map(([month, data]) => ({ month, ...data }));
}