import { useMemo } from "react";
import { formatCurrency } from "@/lib/format";

interface Props {
  transactions: any[];
}

export default function FilterSummary({ transactions }: Props) {
  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of transactions) {
      const a = Number(tx.amount);
      if (a >= 0) income += a;
      else expense += a;
    }
    return { count: transactions.length, income, expense, balance: income + expense };
  }, [transactions]);

  if (stats.count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/50 px-4 py-2 text-sm">
      <span className="font-medium">{stats.count} movimenti trovati</span>
      <span className="text-muted-foreground">•</span>
      <span className="text-success font-medium">Entrate: {formatCurrency(stats.income)}</span>
      <span className="text-muted-foreground">•</span>
      <span className="text-destructive font-medium">Uscite: {formatCurrency(stats.expense)}</span>
      <span className="text-muted-foreground">•</span>
      <span className={`font-semibold ${stats.balance >= 0 ? "text-success" : "text-destructive"}`}>
        Saldo periodo: {formatCurrency(stats.balance)}
      </span>
    </div>
  );
}