import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, FileQuestion } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";

export interface ScoredMatch {
  invoice: any;
  confidence: number;
  reasoning: string;
}

interface SuggestionPanelProps {
  selectedTx: any | null;
  matches: ScoredMatch[];
  chartOfAccounts: any[];
  projects: any[];
  onApprove: (params: {
    invoiceId: string | null;
    confidence: number;
    reasoning: string;
    chartOfAccountsId: string | null;
    projectId: string | null;
  }) => Promise<void>;
  onReject: () => void;
  isApproving: boolean;
}

export function SuggestionPanel({
  selectedTx,
  matches,
  chartOfAccounts,
  projects,
  onApprove,
  onReject,
  isApproving,
}: SuggestionPanelProps) {
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [noInvoiceMode, setNoInvoiceMode] = useState(false);

  // Reset state when transaction changes
  const txId = selectedTx?.id ?? null;
  useEffect(() => {
    setCurrentMatchIndex(0);
    setCategoryId(null);
    setProjectId(null);
    setNoInvoiceMode(false);
  }, [txId]);

  if (!selectedTx) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Suggerimenti AI</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground text-center py-16">
            Seleziona un movimento a sinistra per vedere i suggerimenti
          </p>
        </CardContent>
      </Card>
    );
  }

  const currentMatch = matches[currentMatchIndex];
  const hasMatches = matches.length > 0 && !noInvoiceMode;

  const handleReject = () => {
    if (currentMatchIndex < matches.length - 1) {
      setCurrentMatchIndex((i) => i + 1);
    } else {
      setNoInvoiceMode(true);
    }
  };

  const handleApprove = async () => {
    if (noInvoiceMode || !currentMatch) {
      await onApprove({
        invoiceId: null,
        confidence: 1.0,
        reasoning: "Classificazione manuale senza fattura collegata.",
        chartOfAccountsId: categoryId,
        projectId,
      });
    } else {
      await onApprove({
        invoiceId: currentMatch.invoice.id,
        confidence: currentMatch.confidence,
        reasoning: currentMatch.reasoning,
        chartOfAccountsId: categoryId,
        projectId,
      });
    }
  };

  const confidenceColor = (c: number) =>
    c > 0.85 ? "text-success" : c > 0.7 ? "text-warning" : "text-destructive";

  const progressColor = (c: number) =>
    c > 0.85 ? "[&>div]:bg-success" : c > 0.7 ? "[&>div]:bg-warning" : "[&>div]:bg-destructive";

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Suggerimenti AI</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Selected transaction summary */}
        <div className="p-3 rounded-lg border bg-muted/20">
          <p className="text-xs text-muted-foreground">Movimento selezionato</p>
          <p className={`text-lg font-bold ${Number(selectedTx.amount) >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(Number(selectedTx.amount))}
          </p>
          <p className="text-sm truncate">{selectedTx.description}</p>
          <p className="text-xs text-muted-foreground">{selectedTx.counterpart_name} — {formatDate(selectedTx.transaction_date)}</p>
        </div>

        {hasMatches && currentMatch ? (
          <div className="space-y-4">
            {/* Matched invoice */}
            <div className="p-3 rounded-lg border bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Fattura suggerita ({currentMatchIndex + 1}/{matches.length})</p>
              <p className="font-semibold">{currentMatch.invoice.invoice_number}</p>
              <p className="text-sm">{currentMatch.invoice.counterpart_name}</p>
              <p className="text-sm font-medium mt-1">{formatCurrency(Number(currentMatch.invoice.total_amount))}</p>
              <p className="text-xs text-muted-foreground">{formatDate(currentMatch.invoice.invoice_date)}</p>
            </div>

            {/* Confidence bar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Confidenza</span>
                <span className={confidenceColor(currentMatch.confidence)}>
                  {(currentMatch.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <Progress
                value={currentMatch.confidence * 100}
                className={`h-2 transition-all duration-700 ${progressColor(currentMatch.confidence)}`}
              />
            </div>

            {/* Reasoning */}
            <p className="text-sm italic text-muted-foreground">{currentMatch.reasoning}</p>
          </div>
        ) : (
          <div className="p-3 rounded-lg border border-dashed bg-muted/10 text-center">
            <FileQuestion className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Nessuna fattura collegata</p>
            <p className="text-xs text-muted-foreground mt-1">Assegna categoria e progetto per classificare il movimento</p>
          </div>
        )}

        {/* Category dropdown */}
        <div>
          <label className="text-xs font-medium mb-1 block">Categoria contabile</label>
          <Select value={categoryId ?? ""} onValueChange={(v) => setCategoryId(v || null)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Seleziona categoria..." />
            </SelectTrigger>
            <SelectContent>
              {chartOfAccounts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ` : ""}{c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Project dropdown */}
        <div>
          <label className="text-xs font-medium mb-1 block">Progetto</label>
          <Select value={projectId ?? ""} onValueChange={(v) => setProjectId(v || null)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Seleziona progetto..." />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code ? `${p.code} — ` : ""}{p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleApprove}
            disabled={isApproving}
            className="flex-1 gap-1 bg-success hover:bg-success/90 text-success-foreground"
          >
            <Check className="h-4 w-4" /> Approva
          </Button>
          {hasMatches && currentMatch && (
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={isApproving}
              className="flex-1 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <X className="h-4 w-4" /> Rifiuta
            </Button>
          )}
        </div>

        {/* No-invoice shortcut */}
        {hasMatches && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={() => setNoInvoiceMode(true)}
          >
            <FileQuestion className="h-3 w-3 mr-1" /> Nessuna fattura collegata
          </Button>
        )}
      </CardContent>
    </Card>
  );
}