import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function Cashflow() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const [showProjection, setShowProjection] = useState(false);

  const { data: transactions } = useQuery({
    queryKey: ["all_transactions_cf", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*")
        .eq("company_id", companyId!)
        .order("transaction_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const chartData = useMemo(() => {
    if (!transactions) return [];
    const monthMap: Record<string, { entrate: number; uscite: number }> = {};
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
      monthMap[key] = { entrate: 0, uscite: 0 };
    }

    transactions.forEach((tx) => {
      const d = new Date(tx.transaction_date);
      const key = d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
      if (monthMap[key]) {
        const amt = Number(tx.amount);
        if (amt > 0) monthMap[key].entrate += amt;
        else monthMap[key].uscite += Math.abs(amt);
      }
    });

    let cumulative = 0;
    const data = Object.entries(monthMap).map(([month, vals]) => {
      cumulative += vals.entrate - vals.uscite;
      return { month, ...vals, saldo: cumulative, projected: null as number | null };
    });

    if (showProjection) {
      const avgEntrate = data.reduce((s, d) => s + d.entrate, 0) / data.length;
      const avgUscite = data.reduce((s, d) => s + d.uscite, 0) / data.length;
      for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const key = d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
        cumulative += avgEntrate - avgUscite;
        data.push({ month: key, entrate: 0, uscite: 0, saldo: 0, projected: cumulative });
      }
    }

    return data;
  }, [transactions, showProjection]);

  const tableData = chartData.filter((d) => d.projected === null);

  if (!companyId) return <div className="text-muted-foreground p-8 text-center">Caricamento...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Cashflow</h2>

      <div className="flex items-center gap-2">
        <Switch checked={showProjection} onCheckedChange={setShowProjection} id="projection" />
        <Label htmlFor="projection">Mostra previsioni</Label>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Andamento Cashflow</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Area type="monotone" dataKey="entrate" fill="hsl(217 91% 60% / 0.15)" stroke="hsl(var(--chart-income))" name="Entrate" />
              <Area type="monotone" dataKey="uscite" fill="hsl(0 84% 60% / 0.15)" stroke="hsl(var(--chart-expense))" name="Uscite" />
              <Area type="monotone" dataKey="saldo" fill="hsl(142 71% 45% / 0.1)" stroke="hsl(var(--chart-balance))" name="Saldo cumulativo" strokeWidth={2} />
              {showProjection && (
                <Area type="monotone" dataKey="projected" stroke="hsl(var(--chart-balance))" name="Previsione" strokeDasharray="5 5" fill="none" />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Riepilogo mensile</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mese</TableHead>
                <TableHead className="text-right">Entrate</TableHead>
                <TableHead className="text-right">Uscite</TableHead>
                <TableHead className="text-right">Saldo netto</TableHead>
                <TableHead className="text-right">Saldo cumulativo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row) => {
                const net = row.entrate - row.uscite;
                return (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right text-success">{formatCurrency(row.entrate)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(row.uscite)}</TableCell>
                    <TableCell className={`text-right font-semibold ${net >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(net)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.saldo)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}