import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PDFDocument } from "pdf-lib";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, AlertCircle, CheckCircle2, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

interface ImportCsvModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  accounts: Array<{ id: string; bank_name: string | null; account_name: string | null }>;
}

type Step = "upload" | "mapping" | "preview" | "result";
type PdfStep = "upload" | "parsing" | "preview" | "result";
type ImportTab = "csv" | "pdf";

const TARGET_FIELDS = [
  { key: "transaction_date", label: "Data operazione", required: true },
  { key: "amount", label: "Importo", required: true },
  { key: "description", label: "Descrizione", required: false },
  { key: "counterpart_name", label: "Controparte", required: false },
  { key: "reference", label: "Riferimento", required: false },
  { key: "value_date", label: "Data valuta", required: false },
  { key: "counterpart_iban", label: "IBAN controparte", required: false },
] as const;

type TargetFieldKey = typeof TARGET_FIELDS[number]["key"];

// ── CSV helpers ──

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };
  const firstLine = lines[0];
  const separator = firstLine.includes(";") ? ";" : ",";
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === separator && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else current += ch;
    }
    result.push(current.trim());
    return result;
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function parseItalianNumber(val: string): number | null {
  if (!val || val.trim() === "") return null;
  let cleaned = val.replace(/[€\s]/g, "").trim();
  if (cleaned.includes(",")) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(val: string): string | null {
  if (!val || val.trim() === "") return null;
  const trimmed = val.trim();
  const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) { const [, d, m, y] = dmy; return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; }
  const ymd = trimmed.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymd) { const [, y, m, d] = ymd; return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; }
  return null;
}

function generateHash(row: Record<string, string | null>): string {
  const str = [row.transaction_date, row.amount, row.description, row.counterpart_name, row.reference]
    .filter(Boolean).join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `imp_${Math.abs(hash).toString(36)}`;
}

// ── PDF parsed row type ──

interface PdfTransaction {
  date: string;
  value_date: string | null;
  amount: number;
  commission: number | null;
  description: string;
  counterpart: string | null;
  reference: string | null;
  cbi_flow_id: string | null;
  branch: string | null;
  raw_text: string | null;
  _hasWarning?: boolean;
  _isCommission?: boolean;
}

export function ImportCsvModal({ open, onOpenChange, companyId, accounts }: ImportCsvModalProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>("csv");

  // CSV state
  const [step, setStep] = useState<Step>("upload");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [fileName, setFileName] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<TargetFieldKey, string>>({} as any);
  const [importResult, setImportResult] = useState<{ imported: number; duplicated: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PDF state
  const [pdfStep, setPdfStep] = useState<PdfStep>("upload");
  const [pdfAccountId, setPdfAccountId] = useState<string>("");
  const [pdfFileName, setPdfFileName] = useState("");
  const [pdfTransactions, setPdfTransactions] = useState<PdfTransaction[]>([]);
  const [pdfResult, setPdfResult] = useState<{ imported: number; duplicated: number } | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ chunk: number; total: number; found: number }>({ chunk: 0, total: 0, found: 0 });
  const [pdfFailedChunks, setPdfFailedChunks] = useState<number[]>([]);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const reset = () => {
    setStep("upload"); setSelectedAccountId(""); setFileName("");
    setCsvHeaders([]); setCsvRows([]); setMapping({} as any); setImportResult(null);
    setPdfStep("upload"); setPdfAccountId(""); setPdfFileName("");
    setPdfTransactions([]); setPdfResult(null); setIsParsing(false);
    setPdfProgress({ chunk: 0, total: 0, found: 0 }); setPdfFailedChunks([]);
  };

  const handleClose = (val: boolean) => { if (!val) reset(); onOpenChange(val); };

  // ── CSV handlers ──

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0) { toast.error("File CSV vuoto o non valido"); return; }
      setCsvHeaders(headers); setCsvRows(rows);
      const autoMap: Record<string, string> = {};
      headers.forEach((h) => {
        const lower = h.toLowerCase();
        if (lower.includes("data") && !lower.includes("valuta")) autoMap.transaction_date = h;
        else if (lower.includes("valuta") && lower.includes("data")) autoMap.value_date = h;
        else if (lower.includes("import") || lower === "dare" || lower === "avere" || lower.includes("amount")) autoMap.amount = h;
        else if (lower.includes("descri") || lower.includes("causale") || lower.includes("motivo")) autoMap.description = h;
        else if (lower.includes("contropart") || lower.includes("beneficiar") || lower.includes("ordinant")) autoMap.counterpart_name = h;
        else if (lower.includes("riferiment") || lower.includes("cro") || lower.includes("trn")) autoMap.reference = h;
        else if (lower.includes("iban") && lower.includes("contropart")) autoMap.counterpart_iban = h;
      });
      setMapping(autoMap as any);
      setStep("mapping");
    };
    reader.readAsText(file, "UTF-8");
  };

  const previewRows = csvRows.slice(0, 5);
  const mappedPreview = previewRows.map((row) => {
    const obj: Record<string, string> = {};
    TARGET_FIELDS.forEach(({ key }) => {
      const col = mapping[key];
      if (col) { const idx = csvHeaders.indexOf(col); obj[key] = idx >= 0 ? row[idx] ?? "" : ""; }
      else obj[key] = "";
    });
    return obj;
  });
  const canProceedToPreview = mapping.transaction_date && mapping.amount && selectedAccountId;

  const importMutation = useMutation({
    mutationFn: async () => {
      const records: any[] = [];
      const hashes = new Set<string>();
      for (const row of csvRows) {
        const mapped: Record<string, string | null> = {};
        TARGET_FIELDS.forEach(({ key }) => {
          const col = mapping[key];
          if (col) { const idx = csvHeaders.indexOf(col); mapped[key] = idx >= 0 && row[idx]?.trim() ? row[idx].trim() : null; }
          else mapped[key] = null;
        });
        const date = parseDate(mapped.transaction_date || "");
        const amount = parseItalianNumber(mapped.amount || "");
        if (!date || amount === null) continue;
        const valueDate = mapped.value_date ? parseDate(mapped.value_date) : null;
        const hash = generateHash({ ...mapped, transaction_date: date, amount: String(amount) });
        if (hashes.has(hash)) continue;
        hashes.add(hash);
        records.push({
          bank_account_id: selectedAccountId, company_id: companyId,
          transaction_date: date, value_date: valueDate, amount,
          description: mapped.description || null, counterpart_name: mapped.counterpart_name || null,
          counterpart_iban: mapped.counterpart_iban || null, reference: mapped.reference || null,
          reconciliation_status: "unmatched", hash,
        });
      }
      if (records.length === 0) throw new Error("Nessun record valido trovato nel file");
      const { data, error } = await supabase.from("bank_transactions")
        .upsert(records, { onConflict: "hash", ignoreDuplicates: true }).select();
      if (error) throw error;
      const imported = data?.length ?? 0;
      const duplicated = records.length - imported;
      await supabase.from("import_batches").insert({
        company_id: companyId, bank_account_id: selectedAccountId,
        import_type: "bank_csv", file_name: fileName,
        records_imported: imported, records_duplicated: duplicated,
        status: imported > 0 ? "success" : "partial",
      });
      return { imported, duplicated };
    },
    onSuccess: (result) => {
      setImportResult(result); setStep("result");
      queryClient.invalidateQueries({ queryKey: ["bank_transactions_all"] });
      queryClient.invalidateQueries({ queryKey: ["bank_transactions"] });
      toast.success(`${result.imported} movimenti importati`);
    },
    onError: (err: any) => { toast.error(err.message || "Errore durante l'importazione"); },
  });

  // ── PDF handlers ──

  const CHUNK_SIZE = 10;

  const handlePdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.includes("pdf")) { toast.error("Seleziona un file PDF"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("File troppo grande (max 20MB)"); return; }
    setPdfFileName(file.name);
    setIsParsing(true);
    setPdfStep("parsing");
    setPdfProgress({ chunk: 0, total: 0, found: 0 });
    setPdfFailedChunks([]);

    try {
      const buffer = await file.arrayBuffer();

      // Split PDF in chunks nel frontend
      const pdfDoc = await PDFDocument.load(buffer);
      const totalPages = pdfDoc.getPageCount();
      const totalChunks = Math.ceil(totalPages / CHUNK_SIZE);

      setPdfProgress({ chunk: 0, total: totalChunks, found: 0 });

      const chunks: string[] = [];
      if (totalPages <= CHUNK_SIZE) {
        const bytes = new Uint8Array(buffer);
        chunks.push(btoa(bytes.reduce((data, byte) => data + String.fromCharCode(byte), "")));
      } else {
        for (let i = 0; i < totalPages; i += CHUNK_SIZE) {
          const chunkDoc = await PDFDocument.create();
          const endPage = Math.min(i + CHUNK_SIZE, totalPages);
          const pageIndices = Array.from({ length: endPage - i }, (_, k) => i + k);
          const pages = await chunkDoc.copyPages(pdfDoc, pageIndices);
          pages.forEach(page => chunkDoc.addPage(page));
          const chunkBytes = await chunkDoc.save();
          const chunkUint8 = new Uint8Array(chunkBytes);
          chunks.push(btoa(chunkUint8.reduce((data, byte) => data + String.fromCharCode(byte), "")));
        }
      }

      console.log(`PDF split: ${totalPages} pagine → ${chunks.length} chunk`);

      // Invia ogni chunk separatamente alla Edge Function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let allTransactions: PdfTransaction[] = [];
      const failedChunks: number[] = [];

      for (let i = 0; i < chunks.length; i++) {
        setPdfProgress({ chunk: i + 1, total: chunks.length, found: allTransactions.length });

        let attempts = 0;
        const maxAttempts = 3;
        let success = false;

        while (attempts < maxAttempts && !success) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120000);

            const response = await fetch(`${supabaseUrl}/functions/v1/parse-bank-pdf`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`,
                "apikey": supabaseKey,
              },
              body: JSON.stringify({ pdfBase64: chunks[i] }),
              signal: controller.signal,
            });
            clearTimeout(timeout);

            if (response.status === 429) {
              const data = await response.json().catch(() => ({}));
              const waitSec = Math.min(60, data.retryAfter || 30);
              attempts++;
              if (attempts < maxAttempts) {
                toast.info(`Rate limit raggiunto, riprovo tra ${waitSec}s...`, { id: "pdf-rate-limit" });
                await new Promise(r => setTimeout(r, waitSec * 1000));
                continue;
              }
            }

            if (!response.ok) {
              const errBody = await response.json().catch(() => ({}));
              throw new Error(errBody.error || `Errore server: ${response.status}`);
            }

            const data = await response.json();
            const chunkTxns: PdfTransaction[] = [];

            for (const t of (data.transactions || [])) {
              // Scorporo commissione dall'importo principale
              const rawAmount = typeof t.amount === "number" ? t.amount : 0;
              const commissionVal = typeof t.commission === "number" && t.commission > 0 ? t.commission : 0;
              const netAmount = rawAmount < 0 ? rawAmount + commissionVal : rawAmount;
              const mainTx: PdfTransaction = {
                date: t.date || "",
                value_date: t.value_date || null,
                amount: netAmount,
                commission: typeof t.commission === "number" ? t.commission : null,
                description: t.description || "",
                counterpart: t.counterpart || null,
                reference: t.reference || null,
                cbi_flow_id: t.cbi_flow_id || null,
                branch: t.branch || null,
                raw_text: t.raw_text || null,
                _hasWarning: !t.date || typeof t.amount !== "number" || t.amount === 0,
              };
              chunkTxns.push(mainTx);

              if (typeof t.commission === "number" && t.commission > 0) {
                chunkTxns.push({
                  date: t.date || "",
                  value_date: t.value_date || null,
                  amount: -Math.abs(t.commission),
                  commission: null,
                  description: `COMMISSIONI BANCARIE - ${t.reference || t.description || ""}`,
                  counterpart: "Banca Monte dei Paschi di Siena",
                  reference: t.reference || null,
                  cbi_flow_id: t.cbi_flow_id || null,
                  branch: t.branch || null,
                  raw_text: t.raw_text || null,
                  _hasWarning: false,
                  _isCommission: true,
                });
              }
            }

            allTransactions = [...allTransactions, ...chunkTxns];
            console.log(`Chunk ${i + 1}/${chunks.length}: ${chunkTxns.length} movimenti (totale: ${allTransactions.length})`);
            success = true;

          } catch (err: any) {
            attempts++;
            console.error(`Chunk ${i + 1} tentativo ${attempts} fallito:`, err.message);
            if (attempts >= maxAttempts) {
              failedChunks.push(i + 1);
            } else {
              await new Promise(r => setTimeout(r, 5000));
            }
          }
        }

        if (i < chunks.length - 1 && success) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      setPdfFailedChunks(failedChunks);

      if (failedChunks.length > 0) {
        toast.warning(`${failedChunks.length} chunk non elaborati (chunk ${failedChunks.join(", ")}). Risultati parziali: ${allTransactions.length} movimenti trovati.`);
      }

      if (allTransactions.length === 0) {
        toast.error("Nessun movimento trovato nel PDF");
        setPdfStep("upload");
      } else {
        setPdfTransactions(allTransactions);
        setPdfStep("preview");
        toast.success(`Trovati ${allTransactions.length} movimenti in ${chunks.length} chunk`);
      }
    } catch (err: any) {
      console.error("PDF parse error:", err);
      toast.error(err.message || "Errore durante l'analisi del PDF");
      setPdfStep("upload");
    } finally {
      setIsParsing(false);
    }
  };

  const removePdfRow = (index: number) => {
    setPdfTransactions((prev) => prev.filter((_, i) => i !== index));
  };

  const pdfImportMutation = useMutation({
    mutationFn: async () => {
      const records: any[] = [];
      const hashes = new Set<string>();

      for (const tx of pdfTransactions) {
        const date = parseDate(tx.date);
        if (!date || tx.amount === 0) continue;
        const valueDate = tx.value_date ? parseDate(tx.value_date) : null;
        const hash = generateHash({
          transaction_date: date, amount: String(tx.amount),
          description: tx.description, counterpart_name: tx.counterpart,
          reference: tx.reference,
        });
        if (hashes.has(hash)) continue;
        hashes.add(hash);
        records.push({
          bank_account_id: pdfAccountId, company_id: companyId,
          transaction_date: date, value_date: valueDate, amount: tx.amount,
          description: tx.description || null, counterpart_name: tx.counterpart || null,
          reference: tx.reference || null, reconciliation_status: "unmatched", hash,
          raw_text: tx.raw_text || null,
          commission: tx.commission || null,
          cbi_flow_id: tx.cbi_flow_id || null,
          branch: tx.branch || null,
        });
      }
      if (records.length === 0) throw new Error("Nessun record valido da importare");
      const { data, error } = await supabase.from("bank_transactions")
        .upsert(records, { onConflict: "hash", ignoreDuplicates: true }).select();
      if (error) throw error;
      const imported = data?.length ?? 0;
      const duplicated = records.length - imported;
      await supabase.from("import_batches").insert({
        company_id: companyId, bank_account_id: pdfAccountId,
        import_type: "bank_pdf", file_name: pdfFileName,
        records_imported: imported, records_duplicated: duplicated,
        status: imported > 0 ? "success" : "partial",
      });
      return { imported, duplicated };
    },
    onSuccess: (result) => {
      setPdfResult(result); setPdfStep("result");
      queryClient.invalidateQueries({ queryKey: ["bank_transactions_all"] });
      queryClient.invalidateQueries({ queryKey: ["bank_transactions"] });
      toast.success(`${result.imported} movimenti importati dal PDF`);
    },
    onError: (err: any) => { toast.error(err.message || "Errore durante l'importazione"); },
  });

  const warningCount = pdfTransactions.filter((t) => t._hasWarning).length;

  // ── Shared step indicator ──
  const StepIndicator = ({ steps, current }: { steps: string[]; current: string }) => (
    <div className="flex items-center gap-2 mb-4">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
            current === s ? "bg-primary text-primary-foreground" :
            steps.indexOf(current) > i ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
          }`}>{i + 1}</div>
          {i < steps.length - 1 && <div className="w-8 h-px bg-border" />}
        </div>
      ))}
    </div>
  );

  // ── Account selector (shared) ──
  const AccountSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div className="space-y-2">
      <Label>Conto bancario *</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Seleziona un conto" /></SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.bank_name} — {a.account_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  // ── Result view (shared) ──
  const MONTH_NAMES_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

  const ResultView = ({ result, onClose, transactions: txList }: { result: { imported: number; duplicated: number }; onClose: () => void; transactions?: Array<{ date?: string; transaction_date?: string }> }) => {
    let minDate: string | null = null;
    let maxDate: string | null = null;
    const presentMonths = new Set<string>();
    const missingMonths: string[] = [];

    if (txList && txList.length > 0) {
      const dates = txList
        .map(t => parseDate(t.transaction_date || t.date || ""))
        .filter(Boolean) as string[];
      if (dates.length > 0) {
        dates.sort();
        minDate = dates[0];
        maxDate = dates[dates.length - 1];

        // Collect present months
        for (const d of dates) {
          const dt = new Date(d);
          presentMonths.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
        }

        // Find missing months in the range
        const start = new Date(minDate);
        const end = new Date(maxDate);
        let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
        while (cursor <= endMonth) {
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
          if (!presentMonths.has(key)) {
            missingMonths.push(`${MONTH_NAMES_IT[cursor.getMonth()]} ${cursor.getFullYear()}`);
          }
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
    }

    const presentMonthLabels = Array.from(presentMonths).sort().map(key => {
      const [y, m] = key.split("-");
      return `${MONTH_NAMES_IT[parseInt(m) - 1]} ${y}`;
    });

    return (
      <div className="space-y-4 py-4">
        <div className="flex flex-col items-center gap-3">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <p className="text-lg font-semibold">Importazione completata</p>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tot. movimenti importati</span>
            <span className="font-semibold text-success">{result.imported}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Movimenti saltati (duplicati)</span>
            <span className="font-semibold text-warning">{result.duplicated}</span>
          </div>
          {minDate && maxDate && (
            <>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="text-muted-foreground">Periodo coperto</span>
                <span className="font-medium">
                  {new Date(minDate).toLocaleDateString("it-IT")} — {new Date(maxDate).toLocaleDateString("it-IT")}
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-muted-foreground">Mesi presenti</span>
                <span className="font-medium text-right max-w-[60%]">{presentMonthLabels.join(", ")}</span>
              </div>
              {missingMonths.length > 0 && (
                <div className="flex justify-between items-start">
                  <span className="text-muted-foreground">Mesi mancanti</span>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                    {missingMonths.map(m => (
                      <Badge key={m} variant="outline" className="bg-warning/15 text-warning border-warning/30 text-xs">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {missingMonths.length > 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <p className="text-muted-foreground">
              Risultano <strong>{missingMonths.length} mesi mancanti</strong> nel periodo importato.
              Puoi caricare altri PDF per completare i mesi mancanti — i duplicati vengono esclusi automaticamente.
            </p>
          </div>
        )}

        {missingMonths.length === 0 && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-center">
            <p className="text-muted-foreground">
              Puoi caricare altri PDF — i duplicati vengono esclusi automaticamente.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()}>Chiudi</Button>
          <Button onClick={() => {
            if (activeTab === "pdf") {
              setPdfStep("upload");
              setPdfTransactions([]);
              setPdfResult(null);
            } else {
              setStep("upload");
              setFileName("");
              setCsvHeaders([]);
              setCsvRows([]);
              setImportResult(null);
            }
          }}>Importa altro file</Button>
        </DialogFooter>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Importa movimenti bancari</DialogTitle>
          <DialogDescription>Seleziona il formato e carica il file</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ImportTab)}>
          <TabsList className="w-full">
            <TabsTrigger value="csv" className="flex-1 gap-2">
              <FileText className="h-4 w-4" /> Carica CSV
            </TabsTrigger>
            <TabsTrigger value="pdf" className="flex-1 gap-2">
              <FileText className="h-4 w-4" /> Carica PDF
            </TabsTrigger>
          </TabsList>

          {/* ═══════════ CSV TAB ═══════════ */}
          <TabsContent value="csv" className="space-y-4 mt-4">
            <StepIndicator steps={["upload", "mapping", "preview", "result"]} current={step} />

            {step === "upload" && (
              <div className="space-y-4">
                <AccountSelect value={selectedAccountId} onChange={setSelectedAccountId} />
                <div className="space-y-2">
                  <Label>File CSV *</Label>
                  <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
                  <div onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                    {fileName ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileText className="h-5 w-5 text-primary" /><span className="font-medium">{fileName}</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Clicca per selezionare un file CSV</p>
                        <p className="text-xs text-muted-foreground mt-1">Formati supportati: CSV, TXT (separatore , o ;)</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === "mapping" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Colonne: <span className="font-medium">{csvHeaders.length}</span> | Righe: <span className="font-medium">{csvRows.length}</span>
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {TARGET_FIELDS.map(({ key, label, required }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">{label} {required && <span className="text-destructive">*</span>}</Label>
                      <Select value={mapping[key] || "__none__"}
                        onValueChange={(v) => setMapping((prev) => ({ ...prev, [key]: v === "__none__" ? "" : v }))}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="— Non mappato —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Non mappato —</SelectItem>
                          {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setStep("upload")}>Indietro</Button>
                  <Button onClick={() => setStep("preview")} disabled={!canProceedToPreview}>Anteprima</Button>
                </DialogFooter>
              </div>
            )}

            {step === "preview" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Anteprima delle prime {previewRows.length} righe su {csvRows.length} totali</p>
                <div className="overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {TARGET_FIELDS.filter(({ key }) => mapping[key]).map(({ key, label }) => (
                          <TableHead key={key} className="text-xs whitespace-nowrap">{label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mappedPreview.map((row, i) => (
                        <TableRow key={i}>
                          {TARGET_FIELDS.filter(({ key }) => mapping[key]).map(({ key }) => (
                            <TableCell key={key} className="text-sm py-2 whitespace-nowrap">
                              {key === "amount" ? (
                                <span className={parseItalianNumber(row[key]) !== null
                                  ? (parseItalianNumber(row[key])! >= 0 ? "text-success font-medium" : "text-destructive font-medium")
                                  : "text-destructive"}>
                                  {parseItalianNumber(row[key]) !== null
                                    ? formatCurrency(parseItalianNumber(row[key])!) : "⚠ Non valido"}
                                </span>
                              ) : key === "transaction_date" || key === "value_date" ? (
                                <span className={parseDate(row[key]) ? "" : "text-destructive"}>
                                  {parseDate(row[key]) ? new Date(parseDate(row[key])!).toLocaleDateString("it-IT")
                                    : row[key] ? "⚠ Non valido" : "—"}
                                </span>
                              ) : (row[key] || "—")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setStep("mapping")}>Indietro</Button>
                  <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
                    {importMutation.isPending ? "Importazione..." : `Importa ${csvRows.length} movimenti`}
                  </Button>
                </DialogFooter>
              </div>
            )}

            {step === "result" && importResult && (
              <ResultView result={importResult} onClose={() => handleClose(false)} transactions={csvRows.map(row => {
                const col = mapping.transaction_date;
                const idx = col ? csvHeaders.indexOf(col) : -1;
                return { date: idx >= 0 ? row[idx] : "" };
              })} />
            )}
          </TabsContent>

          {/* ═══════════ PDF TAB ═══════════ */}
          <TabsContent value="pdf" className="space-y-4 mt-4">
            <StepIndicator steps={["upload", "parsing", "preview", "result"]} current={pdfStep} />

            {pdfStep === "upload" && (
              <div className="space-y-4">
                <AccountSelect value={pdfAccountId} onChange={setPdfAccountId} />
                <div className="space-y-2">
                  <Label>Estratto conto PDF *</Label>
                  <input ref={pdfInputRef} type="file" accept=".pdf" onChange={handlePdfFileChange}
                    className="hidden" disabled={!pdfAccountId} />
                  <div onClick={() => pdfAccountId && pdfInputRef.current?.click()}
                    className={`border-2 border-dashed border-border rounded-lg p-8 text-center transition-colors ${
                      pdfAccountId ? "cursor-pointer hover:border-primary/50 hover:bg-primary/5" : "opacity-50 cursor-not-allowed"
                    }`}>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Clicca per caricare un estratto conto PDF</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supportati: UniCredit, Intesa Sanpaolo, MPS, BCC, Banco BPM
                    </p>
                    {!pdfAccountId && (
                      <p className="text-xs text-destructive mt-2">Seleziona prima un conto bancario</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {pdfStep === "parsing" && (
              <div className="flex flex-col items-center gap-4 py-12">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Analisi del PDF in corso con AI...</p>
                <p className="text-xs text-muted-foreground">{pdfFileName}</p>
                {pdfProgress.total > 0 && (
                  <div className="w-full max-w-xs space-y-2">
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(pdfProgress.chunk / pdfProgress.total) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Chunk {pdfProgress.chunk}/{pdfProgress.total}</span>
                      <span>{pdfProgress.found} movimenti trovati</span>
                    </div>
                  </div>
                )}
                {pdfProgress.total > 1 && (
                  <p className="text-xs text-muted-foreground">
                    PDF grande ({pdfProgress.total} parti) — ogni parte viene elaborata separatamente
                  </p>
                )}
              </div>
            )}

            {pdfStep === "preview" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Trovati <span className="text-primary">{pdfTransactions.length}</span> movimenti
                  </p>
                  {warningCount > 0 && (
                    <Badge variant="outline" className="text-warning border-warning gap-1">
                      <AlertCircle className="h-3 w-3" /> {warningCount} con dati incompleti
                    </Badge>
                  )}
                </div>

                <div className="overflow-auto rounded-md border max-h-[350px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs text-right">Importo</TableHead>
                        <TableHead className="text-xs">Descrizione</TableHead>
                        <TableHead className="text-xs">Controparte</TableHead>
                        <TableHead className="text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pdfTransactions.map((tx, i) => (
                        <TableRow key={i} className={
                          tx._isCommission
                            ? "bg-muted/20 border-t-0"
                            : tx._hasWarning ? "bg-warning/10" : ""
                        }>
                          <TableCell className={`py-2 whitespace-nowrap ${tx._isCommission ? "text-xs text-muted-foreground" : "text-sm"}`}>
                            {tx._isCommission ? "" : (tx.date || <span className="text-destructive">⚠ Mancante</span>)}
                          </TableCell>
                          <TableCell className={`py-2 text-right font-semibold whitespace-nowrap ${
                            tx._isCommission ? "text-xs" : "text-sm"
                          } ${tx.amount >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(tx.amount)}
                          </TableCell>
                          <TableCell className={`py-2 max-w-[200px] truncate ${tx._isCommission ? "text-xs text-muted-foreground pl-6" : "text-sm"}`}>
                            {tx._isCommission ? `↳ ${tx.description || "Commissione"}` : (tx.description || "—")}
                          </TableCell>
                          <TableCell className={`py-2 ${tx._isCommission ? "text-xs text-muted-foreground" : "text-sm"}`}>
                            {tx._isCommission ? "" : (tx.counterpart || "—")}
                          </TableCell>
                          <TableCell className="py-2">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePdfRow(i)}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => { setPdfStep("upload"); setPdfTransactions([]); }}>
                    Indietro
                  </Button>
                  <Button onClick={() => pdfImportMutation.mutate()}
                    disabled={pdfImportMutation.isPending || pdfTransactions.length === 0}>
                    {pdfImportMutation.isPending ? "Importazione..." : `Importa ${pdfTransactions.length} movimenti`}
                  </Button>
                </DialogFooter>
              </div>
            )}

            {pdfStep === "result" && pdfResult && (
              <ResultView result={pdfResult} onClose={() => handleClose(false)} transactions={pdfTransactions.map(tx => ({ date: tx.date }))} />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}