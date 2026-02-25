import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { stringSimilarity } from "@/lib/fuzzyMatch";
import { SuggestionPanel, type ScoredMatch } from "@/components/reconciliation/SuggestionPanel";
import { toast } from "sonner";

export default function Riconciliazione() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const queryClient = useQueryClient();
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const { data: transactions } = useQuery({
    queryKey: ["unmatched_transactions", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*")
        .eq("company_id", companyId!)
        .in("reconciliation_status", ["unmatched", "ai_suggested"])
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: invoices } = useQuery({
    queryKey: ["invoices_for_recon", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", companyId!)
        .neq("reconciliation_status", "reconciled");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: recentReconciliations } = useQuery({
    queryKey: ["recent_reconciliations", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reconciliations")
        .select("*, bank_transactions(transaction_date, amount, counterpart_name, description), invoices(invoice_number)")
        .eq("company_id", companyId!)
        .eq("status", "approved")
        .order("id", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: chartOfAccounts } = useQuery({
    queryKey: ["chart_of_accounts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("chart_of_accounts").select("*").eq("company_id", companyId!).order("code");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const { data: projects } = useQuery({
    queryKey: ["projects", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("company_id", companyId!).eq("status", "active").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const selectedTx = transactions?.find((t) => t.id === selectedTxId);

  const matches: ScoredMatch[] = useMemo(() => {
    if (!selectedTx || !invoices) return [];
    const txAmount = Math.abs(Number(selectedTx.amount));
    const txDate = new Date(selectedTx.transaction_date);
    const results: ScoredMatch[] = [];

    for (const inv of invoices) {
      const invAmount = Number(inv.total_amount);
      if (invAmount <= 0) continue;

      const diff = Math.abs(txAmount - invAmount) / invAmount;
      let confidence = 0;
      const reasons: string[] = [];

      if (diff < 0.001) {
        confidence = 0.97;
        reasons.push(`Importo esatto corrispondente (${formatCurrency(invAmount)})`);
      } else if (diff < 0.05) {
        confidence = 0.80;
        reasons.push(`Importo simile: differenza ${(diff * 100).toFixed(1)}%`);
      } else if (diff < 0.10) {
        confidence = 0.65;
        reasons.push(`Importo approssimativo: differenza ${(diff * 100).toFixed(1)}%`);
      } else {
        continue;
      }

      if (selectedTx.counterpart_name && inv.counterpart_name) {
        const sim = stringSimilarity(selectedTx.counterpart_name, inv.counterpart_name);
        if (sim > 0.7) {
          confidence += 0.10;
          reasons.push(`Controparte simile (${(sim * 100).toFixed(0)}% match)`);
        }
      }

      const invDate = new Date(inv.invoice_date);
      const daysDiff = Math.abs((txDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff < 7) {
        confidence += 0.05;
        reasons.push(`Date ravvicinate (${Math.round(daysDiff)} giorni)`);
      }

      confidence = Math.min(confidence, 0.99);

      results.push({
        invoice: inv,
        confidence,
        reasoning: reasons.join(". ") + ".",
      });
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }, [selectedTx, invoices]);

  const handleApprove = useCallback(async (params: {
    invoiceId: string | null;
    confidence: number;
    reasoning: string;
    chartOfAccountsId: string | null;
    projectId: string | null;
  }) => {
    if (!selectedTx || !companyId) return;
    setIsApproving(true);

    try {
      const { error: reconError } = await supabase.from("reconciliations").insert({
        bank_transaction_id: selectedTx.id,
        company_id: companyId,
        invoice_id: params.invoiceId,
        reconciled_amount: Math.abs(Number(selectedTx.amount)),
        status: "approved",
        ai_suggested: params.invoiceId !== null,
        ai_confidence: params.confidence,
        ai_reasoning: params.reasoning,
        chart_of_accounts_id: params.chartOfAccountsId,
        project_id: params.projectId,
      });
      if (reconError) throw reconError;

      const { error: txError } = await supabase.from("bank_transactions").update({ reconciliation_status: "reconciled" }).eq("id", selectedTx.id);
      if (txError) throw txError;

      if (params.invoiceId) {
        await supabase.from("invoices").update({ reconciliation_status: "reconciled", payment_status: "paid" }).eq("id", params.invoiceId);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["unmatched_transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["recent_reconciliations"] }),
        queryClient.invalidateQueries({ queryKey: ["invoices_for_recon"] }),
        queryClient.invalidateQueries({ queryKey: ["bank_accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["bank_transactions_all"] }),
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
      ]);

      setSelectedTxId(null);
      toast.success("Riconciliazione approvata");
    } catch (err: any) {
      toast.error("Errore: " + (err.message || "Salvataggio fallito"));
    } finally {
      setIsApproving(false);
    }
  }, [selectedTx, companyId, queryClient]);

  const handleReject = useCallback(() => {}, []);

  const unmatchedCount = transactions?.filter((t) => t.reconciliation_status === "unmatched").length ?? 0;
  const suggestedCount = transactions?.filter((t) => t.reconciliation_status === "ai_suggested").length ?? 0;
  const reconciledCount = recentReconciliations?.length ?? 0;

  if (!companyId) return <div className="text-muted-foreground p-8 text-center">Caricamento...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Riconciliazione</h2>

      <div className="flex gap-3">
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 px-3 py-1">🔴 Da classificare: {unmatchedCount}</Badge>
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 px-3 py-1">🟡 Suggeriti AI: {suggestedCount}</Badge>
        <Badge variant="outline" className="bg-success/10 text-success border-success/30 px-3 py-1">🟢 Riconciliati: {reconciledCount}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Da riconciliare</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-[600px] overflow-auto p-3">
            {transactions?.map((tx) => (
              <div key={tx.id} onClick={() => setSelectedTxId(tx.id)} className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedTxId === tx.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                <div className="flex justify-between items-start"><span className="text-xs text-muted-foreground">{formatDate(tx.transaction_date)}</span><StatusBadge status={tx.reconciliation_status} /></div>
                <p className={`text-lg font-bold mt-1 ${Number(tx.amount) >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(Number(tx.amount))}</p>
                <p className="text-sm truncate mt-0.5">{tx.description}</p>
                <p className="text-xs text-muted-foreground">{tx.counterpart_name}</p>
              </div>
            ))}
            {(!transactions || transactions.length === 0) && (<p className="text-sm text-muted-foreground text-center py-8">Nessun movimento da riconciliare</p>)}
          </CardContent>
        </Card>

        <SuggestionPanel selectedTx={selectedTx ?? null} matches={matches} chartOfAccounts={chartOfAccounts ?? []} projects={projects ?? []} onApprove={handleApprove} onReject={handleReject} isApproving={isApproving} />

        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Già riconciliati</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-[600px] overflow-auto p-3">
            {recentReconciliations?.map((r) => (
              <div key={r.id} className="p-3 rounded-lg border">
                <div className="flex justify-between items-start"><span className="text-xs text-muted-foreground">{(r.bank_transactions as any)?.transaction_date ? formatDate((r.bank_transactions as any).transaction_date) : "—"}</span><StatusBadge status={r.status} /></div>
                <p className="font-semibold mt-1">{formatCurrency(Number(r.reconciled_amount))}</p>
                <p className="text-sm text-muted-foreground">{(r.bank_transactions as any)?.counterpart_name}</p>
                {(r.invoices as any)?.invoice_number && (<p className="text-xs text-primary mt-0.5">→ {(r.invoices as any).invoice_number}</p>)}
              </div>
            ))}
            {(!recentReconciliations || recentReconciliations.length === 0) && (<p className="text-sm text-muted-foreground text-center py-8">Nessuna riconciliazione recente</p>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}