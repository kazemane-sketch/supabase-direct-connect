import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Upload, Trash2 } from "lucide-react";
import { ImportCsvModal } from "@/components/ImportCsvModal";
import { toast } from "sonner";
import TransactionFilters, { INITIAL_FILTERS, type TransactionFilterValues } from "@/components/movimenti/TransactionFilters";
import FilterSummary from "@/components/movimenti/FilterSummary";

export default function Movimenti() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const [importOpen, setImportOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "single" | "bulk" | "account"; id?: string; accountName?: string; accountId?: string } | null>(null);
  const [filters, setFilters] = useState<TransactionFilterValues>(INITIAL_FILTERS);

  const queryClient = useQueryClient();

  const { data: accounts } = useQuery({
    queryKey: ["bank_accounts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("*").eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: transactions, refetch } = useQuery({
    queryKey: ["bank_transactions_all", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*, bank_accounts(bank_name, account_name)")
        .eq("company_id", companyId!)
        .order("transaction_date", { ascending: false });
      if (error) throw error;

      // Riordina: posiziona le commissioni subito dopo la transazione madre
      const commissions: any[] = [];
      const normals: any[] = [];
      for (const tx of data || []) {
        if (tx.description?.startsWith("COMMISSIONI BANCARIE")) {
          commissions.push(tx);
        } else {
          normals.push(tx);
        }
      }
      const result: any[] = [];
      const usedCommissions = new Set<string>();
      for (const tx of normals) {
        result.push(tx);
        // Trova commissioni corrispondenti (stessa data + stesso reference)
        for (const c of commissions) {
          if (usedCommissions.has(c.id)) continue;
          if (
            c.transaction_date === tx.transaction_date &&
            c.reference && tx.reference &&
            c.reference === tx.reference
          ) {
            result.push(c);
            usedCommissions.add(c.id);
          }
        }
      }
      // Aggiungi eventuali commissioni orfane alla fine
      for (const c of commissions) {
        if (!usedCommissions.has(c.id)) result.push(c);
      }
      return result;
    },
    enabled: !!companyId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["bank_transactions_all"] });
    queryClient.invalidateQueries({ queryKey: ["bank_transactions"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["kpi"] });
    setSelectedIds(new Set());
  };

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("bank_transactions").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} movimento/i eliminato/i`);
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message || "Errore durante l'eliminazione"),
  });

  const deleteByAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const { error, count } = await supabase
        .from("bank_transactions")
        .delete({ count: "exact" })
        .eq("bank_account_id", accountId)
        .eq("company_id", companyId!);
      if (error) throw error;
      return count ?? 0;
    },
    onSuccess: (count) => {
      toast.success(`${count} movimenti eliminati dal conto`);
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message || "Errore durante l'eliminazione"),
  });

  const handleConfirmDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "single" && deleteConfirm.id) {
      deleteMutation.mutate([deleteConfirm.id]);
    } else if (deleteConfirm.type === "bulk") {
      deleteMutation.mutate(Array.from(selectedIds));
    } else if (deleteConfirm.type === "account" && deleteConfirm.accountId) {
      deleteByAccountMutation.mutate(deleteConfirm.accountId);
    }
    setDeleteConfirm(null);
  };

  if (!companyId) return <div className="text-muted-foreground p-8 text-center">Caricamento...</div>;

  const applyFilters = (txs: any[]) => {
    return txs.filter((t) => {
      if (filters.dateFrom) {
        const d = new Date(t.transaction_date);
        if (d < filters.dateFrom) return false;
      }
      if (filters.dateTo) {
        const d = new Date(t.transaction_date);
        const end = new Date(filters.dateTo);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const desc = (t.description || "").toLowerCase();
        const cp = (t.counterpart_name || "").toLowerCase();
        if (!desc.includes(q) && !cp.includes(q)) return false;
      }
      if (filters.type === "income" && Number(t.amount) < 0) return false;
      if (filters.type === "expense" && Number(t.amount) >= 0) return false;
      if (filters.status === "unmatched" && t.reconciliation_status !== "unmatched") return false;
      if (filters.status === "matched" && t.reconciliation_status === "unmatched") return false;
      return true;
    });
  };

  const filterByAccount = (accountId?: string) => {
    const byAccount = accountId ? transactions?.filter((t) => t.bank_account_id === accountId) : transactions;
    return applyFilters(byAccount ?? []);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (txs: any[]) => {
    const allIds = txs.map((t) => t.id);
    const allSelected = allIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      allIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Movimenti Bancari</h2>
        <Button className="gap-2" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Importa
        </Button>
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <span className="text-sm font-medium">{selectedIds.size} movimenti selezionati</span>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1"
            onClick={() => setDeleteConfirm({ type: "bulk" })}
          >
            <Trash2 className="h-3.5 w-3.5" /> Elimina selezionati
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
            Deseleziona
          </Button>
        </div>
      )}
      {/* Filter bar */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <TransactionFilters filters={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      {/* Filter summary */}
      <FilterSummary transactions={applyFilters(transactions ?? [])} />

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Tutti i conti</TabsTrigger>
          {accounts?.map((a) => (
            <TabsTrigger key={a.id} value={a.id}>
              {a.bank_name} — {a.account_name}
            </TabsTrigger>
          ))}
        </TabsList>

        {["all", ...(accounts?.map((a) => a.id) ?? [])].map((tabVal) => {
          const tabTxs = filterByAccount(tabVal === "all" ? undefined : tabVal);
          const account = accounts?.find((a) => a.id === tabVal);
          return (
            <TabsContent key={tabVal} value={tabVal}>
              {tabVal !== "all" && account && (
                <div className="flex justify-end mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() =>
                      setDeleteConfirm({
                        type: "account",
                        accountId: account.id,
                        accountName: `${account.bank_name} — ${account.account_name}`,
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Svuota conto
                  </Button>
                </div>
              )}
              <Card className="shadow-sm">
                <CardContent className="p-0">
                  <TransactionTable
                    transactions={tabTxs}
                    onRowClick={setSelectedTx}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onToggleSelectAll={() => toggleSelectAll(tabTxs)}
                    onDeleteSingle={(id) => setDeleteConfirm({ type: "single", id })}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      <ImportCsvModal
        open={importOpen}
        onOpenChange={setImportOpen}
        companyId={companyId}
        accounts={accounts ?? []}
      />

      {/* Transaction Detail Modal */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Dettaglio Movimento</DialogTitle>
          </DialogHeader>
          {selectedTx && (
            <div className="space-y-3">
              <DetailRow label="Data operazione" value={formatDate(selectedTx.transaction_date)} />
              <DetailRow label="Data valuta" value={selectedTx.value_date ? formatDate(selectedTx.value_date) : "—"} />
              <DetailRow
                label="Importo"
                value={formatCurrency(Number(selectedTx.amount))}
                className={Number(selectedTx.amount) >= 0 ? "text-success font-semibold" : "text-destructive font-semibold"}
              />
              <DetailRow label="Descrizione" value={selectedTx.description || "—"} />
              <DetailRow label="Controparte" value={selectedTx.counterpart_name || "—"} />
              <DetailRow label="Riferimento" value={selectedTx.reference || "—"} />
              <DetailRow label="ID Flusso CBI" value={selectedTx.cbi_flow_id || "—"} />
              <DetailRow label="Filiale disponente" value={selectedTx.branch || "—"} />
              <DetailRow
                label="Conto"
                value={`${(selectedTx.bank_accounts as any)?.bank_name || ""} — ${(selectedTx.bank_accounts as any)?.account_name || ""}`}
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm text-muted-foreground">Stato riconciliazione</span>
                <StatusBadge status={selectedTx.reconciliation_status} />
              </div>
              {selectedTx.raw_text && (
                <Accordion type="single" collapsible className="mt-2">
                  <AccordionItem value="raw">
                    <AccordionTrigger className="text-sm">Dettaglio completo</AccordionTrigger>
                    <AccordionContent>
                      <pre className="whitespace-pre-wrap text-xs text-muted-foreground bg-muted p-3 rounded-md">
                        {selectedTx.raw_text}
                      </pre>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === "single" && "Sei sicuro di voler eliminare questo movimento?"}
              {deleteConfirm?.type === "bulk" && `Sei sicuro di voler eliminare ${selectedIds.size} movimenti selezionati?`}
              {deleteConfirm?.type === "account" && (
                <>
                  Eliminare <strong>TUTTI</strong> i movimenti di {deleteConfirm.accountName}?
                  <br />
                  Questa azione non è reversibile.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${className || ""}`}>{value}</span>
    </div>
  );
}

interface TransactionTableProps {
  transactions: any[];
  onRowClick: (tx: any) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onDeleteSingle: (id: string) => void;
}

function TransactionTable({ transactions, onRowClick, selectedIds, onToggleSelect, onToggleSelectAll, onDeleteSingle }: TransactionTableProps) {
  const allSelected = transactions.length > 0 && transactions.every((t) => selectedIds.has(t.id));
  const someSelected = transactions.some((t) => selectedIds.has(t.id));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={onToggleSelectAll}
            />
          </TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Conto</TableHead>
          <TableHead className="text-right">Importo</TableHead>
          <TableHead>Descrizione</TableHead>
          <TableHead>Controparte</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead className="w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => {
          const isCommission = tx.description?.startsWith("COMMISSIONI BANCARIE");
          return (
          <TableRow key={tx.id} className={`cursor-pointer group ${isCommission ? "bg-muted/20 border-t-0" : ""}`}>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedIds.has(tx.id)}
                onCheckedChange={() => onToggleSelect(tx.id)}
              />
            </TableCell>
            <TableCell onClick={() => onRowClick(tx)} className={isCommission ? "text-xs text-muted-foreground" : ""}>
              {isCommission ? "" : formatDate(tx.transaction_date)}
            </TableCell>
            <TableCell onClick={() => onRowClick(tx)} className={`text-sm ${isCommission ? "text-xs text-muted-foreground" : "text-muted-foreground"}`}>
              {isCommission ? "" : (tx.bank_accounts as any)?.bank_name}
            </TableCell>
            <TableCell onClick={() => onRowClick(tx)} className={`text-right font-semibold ${isCommission ? "text-xs" : ""} ${Number(tx.amount) >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(Number(tx.amount))}
            </TableCell>
            <TableCell onClick={() => onRowClick(tx)} className={`max-w-[350px] ${isCommission ? "pl-6" : ""}`}>
              <span className={`line-clamp-2 ${isCommission ? "text-xs text-muted-foreground" : "text-sm"}`}>
                {isCommission ? `↳ ${tx.description}` : tx.description}
              </span>
            </TableCell>
            <TableCell onClick={() => onRowClick(tx)} className={isCommission ? "text-xs text-muted-foreground" : ""}>
              {isCommission ? "" : tx.counterpart_name}
            </TableCell>
            <TableCell onClick={() => onRowClick(tx)}><StatusBadge status={tx.reconciliation_status} /></TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onDeleteSingle(tx.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </Button>
            </TableCell>
          </TableRow>
          );
        })}
        {transactions.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
              Nessun movimento trovato
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}