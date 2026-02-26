import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/format";
import {
  parseInvoiceFromFile,
  previewInvoicesFromZip,
  sanitizeXml,
  sanitizeEncoding,
  stripBadUnicode,
  type ParsedInvoice,
} from "@/lib/xmlInvoiceParser";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Upload, Check, AlertTriangle, X, User, CalendarDays, Euro, FileWarning, ChevronDown, Sparkles, ShieldAlert, Download, RotateCcw } from "lucide-react";
import { toast } from "sonner";

// ─── AI FALLBACK PARSING ──────────────────────────────────────────────────────

async function parseWithAI(rawXml: string): Promise<ParsedInvoice | null> {
  try {
    const { data, error } = await supabase.functions.invoke("parse-invoice-ai", {
      body: { rawXml },
    });
    if (error || !data?.invoice) return null;
    const ai = data.invoice;
    if (!ai.invoiceNumber) return null;
    return {
      invoiceNumber: ai.invoiceNumber || "",
      invoiceDate: ai.invoiceDate || "",
      invoiceType: ai.invoiceType || "TD01",
      currency: ai.currency || "EUR",
      causal: ai.causal || undefined,
      supplier: {
        name: ai.supplier?.name || "",
        vatNumber: ai.supplier?.vatNumber || "",
        fiscalCode: ai.supplier?.fiscalCode || undefined,
        address: ai.supplier?.address || undefined,
        city: ai.supplier?.city || undefined,
        province: ai.supplier?.province || undefined,
        cap: ai.supplier?.cap || undefined,
        country: ai.supplier?.country || "IT",
      },
      buyer: { name: "", vatNumber: "" },
      totalAmount: ai.totalAmount || 0,
      taxableAmount: ai.taxableAmount || 0,
      taxAmount: ai.taxAmount || 0,
      payments: (ai.payments || []).map((p: any) => ({
        method: p.method || "MP05", dueDate: p.dueDate || undefined,
        amount: p.amount || 0, iban: p.iban || undefined,
      })),
      primaryPayment: ai.payments?.[0] ? {
        method: ai.payments[0].method || "MP05",
        dueDate: ai.payments[0].dueDate || undefined,
        amount: ai.payments[0].amount || 0,
        iban: ai.payments[0].iban || undefined,
      } : undefined,
      lines: (ai.lines || []).map((l: any) => ({
        lineNumber: l.lineNumber || 1, description: l.description || "",
        quantity: l.quantity || 1, unitPrice: l.unitPrice || 0,
        totalPrice: l.totalPrice || 0, vatRate: l.vatRate || 0,
        unitOfMeasure: l.unitOfMeasure || undefined,
      })),
      vatSummaries: (ai.vatSummaries || []).map((v: any) => ({
        vatRate: v.vatRate || 0, taxableAmount: v.taxableAmount || 0,
        vatAmount: v.vatAmount || 0, nature: v.nature || undefined,
      })),
      ddtNumbers: ai.ddtNumbers || [],
      orderNumbers: ai.orderNumbers || [],
    };
  } catch { return null; }
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface ImportXmlModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PreviewItem {
  filename: string;
  invoice: ParsedInvoice | null;
  rawXml: string | null;
  originalBlob?: Blob;
  originalType?: string;
  parsedByAI?: boolean;
  hadReplacement?: boolean;
}

interface QuarantineItem {
  filename: string;
  errorCode: string;
  errorMessage: string;
  storagePath: string;
  hadReplacement: boolean;
  invoice?: ParsedInvoice | null;
  rawXml?: string | null;
}

interface ImportResult {
  imported: number;
  duplicates: number;
  counterpartiesCreated: number;
  totalPassive: number;
  totalActive: number;
  duePayments: number;
  dueAmount: number;
  errors: number;
  quarantined: QuarantineItem[];
  totalFiles: number;
}

type Step = "upload" | "analyzing" | "preview" | "importing" | "result";

export function ImportXmlModal({ open, onOpenChange }: ImportXmlModalProps) {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [allPreviews, setAllPreviews] = useState<PreviewItem[]>([]);
  const [failedFiles, setFailedFiles] = useState<PreviewItem[]>([]);
  const [totalFilesCount, setTotalFilesCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0, filename: "" });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [aiPending, setAiPending] = useState(0);
  const [aiTotal, setAiTotal] = useState(0);

  const reset = () => {
    setStep("upload");
    setAllPreviews([]);
    setFailedFiles([]);
    setTotalFilesCount(0);
    setProgress(0);
    setAnalysisProgress({ current: 0, total: 0, filename: "" });
    setResult(null);
    setAiPending(0);
    setAiTotal(0);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const items: PreviewItem[] = [];
    const failed: PreviewItem[] = [];
    const aiCandidates: { filename: string; rawXml: string; hadReplacement: boolean; originalBlob: Blob }[] = [];
    let totalFiles = 0;

    setStep("analyzing");

    for (const file of Array.from(files)) {
      const name = file.name.toLowerCase();
      try {
        if (name.endsWith(".zip")) {
          // Pre-read zip bytes to extract original blobs per entry
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(file);
          const zipResults = await previewInvoicesFromZip(file, (current, total, filename) => {
            setAnalysisProgress({ current, total, filename });
          });
          totalFiles += zipResults.length;
          for (const r of zipResults) {
            // Get original bytes from zip entry
            let originalBlob: Blob | undefined;
            const entry = zip.file(r.filename) || Object.values(zip.files).find(f => f.name === r.filename);
            if (entry && !(entry as any).dir) {
              const bytes = await (entry as any).async('uint8array');
              const ext = r.filename.toLowerCase();
              const mime = ext.endsWith('.p7m') ? 'application/pkcs7-mime' : 'text/xml';
              originalBlob = new Blob([bytes], { type: mime });
            }
            if (r.invoice) {
              items.push({ ...r, hadReplacement: r.hadReplacement, originalBlob });
            } else if (r.rawXml) {
              const { hadReplacement } = sanitizeXml(r.rawXml);
              aiCandidates.push({ filename: r.filename, rawXml: r.rawXml, hadReplacement, originalBlob: originalBlob || new Blob([r.rawXml], { type: 'text/xml' }) });
            } else {
              failed.push({ filename: r.filename, invoice: null, rawXml: null, originalBlob });
            }
          }
        } else if (name.endsWith(".p7m") || name.endsWith(".xml")) {
          totalFiles++;
          setAnalysisProgress({ current: totalFiles, total: totalFiles, filename: file.name });
          const originalBlob = new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' });
          const { invoice, rawXml } = await parseInvoiceFromFile(file);
          if (invoice) {
            const hadReplacement = rawXml ? rawXml.indexOf('\uFFFD') !== -1 : false;
            items.push({ filename: file.name, invoice, rawXml, hadReplacement, originalBlob });
          } else if (rawXml) {
            const { hadReplacement } = sanitizeXml(rawXml);
            aiCandidates.push({ filename: file.name, rawXml, hadReplacement, originalBlob });
          } else {
            failed.push({ filename: file.name, invoice: null, rawXml: null, originalBlob });
          }
        }
      } catch (e) {
        totalFiles++;
        console.warn(`Errore processing ${file.name}:`, e);
        failed.push({ filename: file.name, invoice: null, rawXml: null });
      }
    }

    if (items.length === 0 && failed.length === 0 && aiCandidates.length === 0) {
      toast.error("Nessun file valido trovato");
      setStep("upload");
      return;
    }

    // Show preview IMMEDIATELY — don't wait for AI
    setTotalFilesCount(totalFiles);
    setAllPreviews([...items]);
    setFailedFiles([...failed]);
    setStep("preview");

    // Sanity check: verify payment parsing didn't regress
    const parsedWithMethod = items.filter(i => i.invoice?.primaryPayment?.method).length;
    const xmlHasModalita = items.filter(i => i.rawXml && i.rawXml.includes('ModalitaPagamento')).length;
    if (xmlHasModalita > 0 && parsedWithMethod === 0) {
      console.error('[REGRESSION] Payment parsing broke!', { xmlHasModalita, parsedWithMethod });
      toast.error(`⚠️ Regression: ${xmlHasModalita} file contengono ModalitaPagamento ma il parser non ne ha estratto nessuno`);
    }

    // AI fallback — fire-and-forget, updates state progressively
    if (aiCandidates.length > 0) {
      setAiTotal(aiCandidates.length);
      setAiPending(aiCandidates.length);
      toast.info(`✨ Analisi AI in corso per ${aiCandidates.length} file...`);
      // Don't await this — it runs in background
      (async () => {
        for (const candidate of aiCandidates) {
          try {
            const aiInvoice = await parseWithAI(candidate.rawXml);
            if (aiInvoice) {
              setAllPreviews(prev => [...prev, {
                filename: candidate.filename,
                invoice: aiInvoice,
                rawXml: candidate.rawXml,
                parsedByAI: true,
                hadReplacement: candidate.hadReplacement,
                originalBlob: candidate.originalBlob,
              }]);
            } else {
              setFailedFiles(prev => [...prev, {
                filename: candidate.filename, invoice: null, rawXml: candidate.rawXml,
                originalBlob: candidate.originalBlob,
              }]);
            }
          } catch {
            setFailedFiles(prev => [...prev, {
              filename: candidate.filename, invoice: null, rawXml: candidate.rawXml,
              originalBlob: candidate.originalBlob,
            }]);
          }
          setAiPending(prev => prev - 1);
        }
        toast.success(`✨ Analisi AI completata: ${aiCandidates.length} file elaborati`);
      })();
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) processFiles(e.target.files);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  /** Normalizza VAT: rimuovi prefisso IT, spazi, caratteri non alfanumerici */
  const normalizeVat = (vat: string | null | undefined): string => {
    if (!vat) return "";
    return vat.replace(/^IT/i, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  };

  const getDirection = (inv: ParsedInvoice): "active" | "passive" | "quarantine" => {
    const normCompany = normalizeVat(selectedCompany?.vat_number);
    if (!normCompany) return "passive";
    const normBuyer = normalizeVat(inv.buyer.vatNumber) || normalizeVat(inv.buyer.fiscalCode);
    const normSupplier = normalizeVat(inv.supplier.vatNumber) || normalizeVat(inv.supplier.fiscalCode);
    // Confronto esatto (no includes)
    if (normBuyer && normBuyer === normCompany) return "passive";
    if (normSupplier && normSupplier === normCompany) return "active";
    return "quarantine";
  };

  // ─── IMPORT MUTATION ──────────────────────────────────────────────────────────

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");

      const batchId = crypto.randomUUID();
      const res: ImportResult = {
        imported: 0, duplicates: 0, counterpartiesCreated: 0,
        totalPassive: 0, totalActive: 0, duePayments: 0, dueAmount: 0,
        errors: 0, quarantined: [], totalFiles: totalFilesCount,
      };

      const allItems = [...allPreviews, ...failedFiles];
      const total = allItems.length;
      let done = 0;

      for (const item of allItems) {
        const inv = item.invoice;

        // Upload file ORIGINALE in storage SEMPRE (blob originale, non rawXml derivato)
        let storagePath = `${companyId}/${batchId}/${item.filename}`;
        if (item.originalBlob) {
          await supabase.storage.from("invoice-imports").upload(storagePath, item.originalBlob, { upsert: true });
        } else if (item.rawXml) {
          // Fallback: salva XML estratto se non abbiamo il blob originale
          const blob = new Blob([item.rawXml], { type: "text/xml" });
          await supabase.storage.from("invoice-imports").upload(storagePath, blob, { upsert: true });
        } else {
          storagePath = `${companyId}/${batchId}/no-xml_${item.filename}`;
          const placeholder = new Blob(["NO_XML_EXTRACTED"], { type: "text/plain" });
          await supabase.storage.from("invoice-imports").upload(storagePath, placeholder, { upsert: true });
        }

        // Se non ha invoice parsata → quarantena
        if (!inv) {
          const isP7m = item.filename.toLowerCase().endsWith('.p7m');
          let errorMessage = "Impossibile estrarre XML dal file";
          let errorCode = "PARSE_FAILED";
          if (item.rawXml) {
            errorMessage = "XML estratto ma parsing struttura fallito";
            errorCode = "XML_STRUCTURE_INVALID";
          } else if (isP7m) {
            errorMessage = "Estrazione XML da firma digitale PKCS#7 fallita";
            errorCode = "P7M_EXTRACTION_FAILED";
          }
          const qi: QuarantineItem = {
            filename: item.filename,
            errorCode,
            errorMessage,
            storagePath,
            hadReplacement: item.hadReplacement || false,
          };
          res.quarantined.push(qi);
          await supabase.from("invoice_import_files").insert({
            batch_id: batchId,
            company_id: companyId,
            filename: item.filename,
            source_type: item.filename.toLowerCase().endsWith('.p7m') ? 'p7m' : 'xml',
            storage_path: storagePath,
            status: 'quarantined',
            error_code: qi.errorCode,
            error_message: qi.errorMessage,
            had_replacement_chars: qi.hadReplacement,
          } as any);
          done++;
          setProgress(Math.round((done / total) * 100));
          continue;
        }

        // Da qui in poi abbiamo una fattura valida
        const direction = getDirection(inv);

        // TASK D: se direzione sconosciuta → quarantena con DIRECTION_UNKNOWN
        if (direction === "quarantine") {
          const qi: QuarantineItem = {
            filename: item.filename,
            errorCode: "DIRECTION_UNKNOWN",
            errorMessage: `Impossibile determinare direzione: supplier VAT=${inv.supplier.vatNumber}, buyer VAT=${inv.buyer.vatNumber}, company VAT=${selectedCompany?.vat_number}`,
            storagePath,
            hadReplacement: item.hadReplacement || false,
            invoice: inv,
          };
          res.quarantined.push(qi);
          await supabase.from("invoice_import_files").insert({
            batch_id: batchId, company_id: companyId, filename: item.filename,
            source_type: item.filename.toLowerCase().endsWith('.p7m') ? 'p7m' : 'xml',
            storage_path: storagePath, status: 'quarantined',
            error_code: qi.errorCode, error_message: qi.errorMessage,
            had_replacement_chars: qi.hadReplacement,
          } as any);
          done++;
          setProgress(Math.round((done / total) * 100));
          continue;
        }

        const cpVat = direction === "passive" ? inv.supplier.vatNumber : inv.buyer.vatNumber;
        const cpName = direction === "passive" ? inv.supplier.name : inv.buyer.name;

        // Dedup check
        const { data: existing } = await supabase
          .from("invoices").select("id")
          .eq("company_id", companyId)
          .eq("invoice_number", inv.invoiceNumber)
          .eq("counterpart_vat", cpVat || "")
          .maybeSingle();

        if (existing) {
          res.duplicates++;
          await supabase.from("invoice_import_files").insert({
            batch_id: batchId, company_id: companyId, filename: item.filename,
            source_type: item.filename.toLowerCase().endsWith('.p7m') ? 'p7m' : 'xml',
            storage_path: storagePath, status: 'imported',
            invoice_id: existing.id, had_replacement_chars: item.hadReplacement || false,
          } as any);
          done++;
          setProgress(Math.round((done / total) * 100));
          continue;
        }

        // Counterparty upsert
        let counterpartId: string | null = null;
        if (cpVat) {
          const { data: existingCp } = await supabase
            .from("counterparties").select("id, name, is_approved")
            .eq("company_id", companyId).eq("vat_number", cpVat)
            .order("is_approved", { ascending: false })
            .order("created_at", { ascending: true }).limit(1);

          const found = existingCp?.[0];
          if (found) {
            counterpartId = found.id;
            if (cpName && cpName.trim() && (!found.name || found.name === cpVat)) {
              await supabase.from("counterparties").update({ name: cpName.trim() }).eq("id", found.id);
            }
          } else {
            const cpType = direction === "passive" ? "fornitore" : "cliente";
            const insertData: Record<string, any> = {
              company_id: companyId, name: cpName || cpVat || "Sconosciuto",
              vat_number: cpVat, type: cpType, is_approved: false, auto_created: true,
            };
            if (direction === "passive") {
              insertData.fiscal_code = inv.supplier.fiscalCode || null;
              insertData.address = inv.supplier.address || null;
              insertData.city = inv.supplier.city || null;
              insertData.province = inv.supplier.province || null;
              insertData.cap = inv.supplier.cap || null;
            }
            if (inv.primaryPayment) {
              insertData.payment_method = inv.primaryPayment.method || null;
              insertData.iban = inv.primaryPayment.iban || null;
            }
            const { data: newCp } = await supabase
              .from("counterparties").insert(insertData as any).select("id").single();
            counterpartId = newCp?.id || null;
            if (newCp) res.counterpartiesCreated++;
          }
        }

        // Insert invoice
        const dueDate = inv.primaryPayment?.dueDate || null;
        const { data: newInvoice, error: invError } = await supabase
          .from("invoices").insert({
            company_id: companyId, direction,
            invoice_number: stripBadUnicode(inv.invoiceNumber), invoice_date: inv.invoiceDate,
            due_date: dueDate, total_amount: inv.totalAmount,
            subtotal: inv.taxableAmount, vat_amount: inv.taxAmount,
            counterpart_name: stripBadUnicode(cpName || cpVat || "Sconosciuto"),
            counterpart_vat: cpVat || null, counterpart_id: counterpartId,
            payment_status: "unpaid", reconciliation_status: "unmatched",
            source: "xml_sdi", raw_xml: item.rawXml ? sanitizeEncoding(item.rawXml) : null,
            payment_method: inv.primaryPayment?.method || null,
            original_filename: item.filename,
          }).select("id").single();

        if (invError || !newInvoice) {
          console.error("Insert invoice error:", invError);
          const qi: QuarantineItem = {
            filename: item.filename, errorCode: "DB_INSERT_FAILED",
            errorMessage: invError?.message || "Errore inserimento fattura",
            storagePath, hadReplacement: item.hadReplacement || false,
            invoice: inv,
          };
          res.quarantined.push(qi);
          await supabase.from("invoice_import_files").insert({
            batch_id: batchId, company_id: companyId, filename: item.filename,
            source_type: item.filename.toLowerCase().endsWith('.p7m') ? 'p7m' : 'xml',
            storage_path: storagePath, status: 'quarantined',
            error_code: qi.errorCode, error_message: qi.errorMessage,
            had_replacement_chars: qi.hadReplacement,
          } as any);
          res.errors++;
          done++;
          setProgress(Math.round((done / total) * 100));
          continue;
        }

        // Insert invoice lines
        if (inv.lines.length > 0) {
          const lineInserts = inv.lines.map((line, idx) => ({
            invoice_id: newInvoice.id, description: stripBadUnicode(line.description),
            quantity: line.quantity || 1, unit_price: line.unitPrice,
            vat_rate: line.vatRate, total: line.totalPrice,
            sort_order: idx + 1, unit_of_measure: line.unitOfMeasure || null,
            product_id: null, quantity_tons: null,
          }));
          await supabase.from("invoice_lines").insert(lineInserts);
        }

        // Log success
        await supabase.from("invoice_import_files").insert({
          batch_id: batchId, company_id: companyId, filename: item.filename,
          source_type: item.filename.toLowerCase().endsWith('.p7m') ? 'p7m' : 'xml',
          storage_path: storagePath, status: 'imported',
          invoice_id: newInvoice.id, had_replacement_chars: item.hadReplacement || false,
        } as any);

        res.imported++;
        if (direction === "passive") res.totalPassive += Math.abs(inv.totalAmount);
        else res.totalActive += Math.abs(inv.totalAmount);
        if (dueDate) {
          res.duePayments++;
          res.dueAmount += inv.primaryPayment?.amount || Math.abs(inv.totalAmount);
        }

        done++;
        setProgress(Math.round((done / total) * 100));
      }

      return res;
    },
    onSuccess: (r) => {
      if (r) { setResult(r); setStep("result"); }
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeItem = (idx: number) => {
    setAllPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const downloadQuarantinedFile = async (storagePath: string, filename: string) => {
    const { data } = await supabase.storage.from("invoice-imports").download(storagePath);
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const retryImportSafe = async (q: QuarantineItem) => {
    if (!companyId || !q.invoice) return;
    const inv = q.invoice;
    const direction = getDirection(inv);
    if (direction === "quarantine") {
      toast.error("Impossibile determinare la direzione della fattura (DIRECTION_UNKNOWN)");
      return;
    }
    const cpVat = direction === "passive" ? inv.supplier.vatNumber : inv.buyer.vatNumber;
    const cpName = direction === "passive" ? inv.supplier.name : inv.buyer.name;
    try {
      const { data: newInvoice, error } = await supabase.from("invoices").insert({
        company_id: companyId, direction,
        invoice_number: stripBadUnicode(inv.invoiceNumber), invoice_date: inv.invoiceDate,
        due_date: inv.primaryPayment?.dueDate || null, total_amount: inv.totalAmount,
        subtotal: inv.taxableAmount, vat_amount: inv.taxAmount,
        counterpart_name: stripBadUnicode(cpName || cpVat || "Sconosciuto"),
        counterpart_vat: cpVat || null,
        payment_status: "unpaid", reconciliation_status: "unmatched",
        source: "xml_sdi", raw_xml: q.rawXml ? sanitizeEncoding(q.rawXml) : null,
        payment_method: inv.primaryPayment?.method || null,
        original_filename: q.filename,
      }).select("id").single();
      if (error) { toast.error(`Re-import fallito: ${error.message}`); return; }
      // Update import log
      await supabase.from("invoice_import_files").update({
        status: 'imported', invoice_id: newInvoice.id, error_code: null, error_message: null,
      } as any).eq("storage_path", q.storagePath).eq("company_id", companyId);
      // Insert lines
      if (inv.lines.length > 0) {
        await supabase.from("invoice_lines").insert(inv.lines.map((l, idx) => ({
          invoice_id: newInvoice.id, description: stripBadUnicode(l.description),
          quantity: l.quantity || 1, unit_price: l.unitPrice, vat_rate: l.vatRate,
          total: l.totalPrice, sort_order: idx + 1, unit_of_measure: l.unitOfMeasure || null,
          product_id: null, quantity_tons: null,
        })));
      }
      toast.success(`✅ ${q.filename} re-importato con successo`);
      setResult(prev => prev ? {
        ...prev, imported: prev.imported + 1, errors: prev.errors - 1,
        quarantined: prev.quarantined.filter(x => x.storagePath !== q.storagePath),
      } : prev);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: any) { toast.error(`Re-import fallito: ${e.message}`); }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importa Fatture XML SDI</DialogTitle>
        </DialogHeader>

        {/* ── STEP: UPLOAD ── */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm font-medium mb-1">Trascina qui i file XML, P7M o ZIP</p>
              <p className="text-xs text-muted-foreground mb-4">oppure clicca per selezionare</p>
              <input type="file" accept=".xml,.p7m,.P7M,.zip" multiple onChange={handleFileInput} className="hidden" id="xml-file-input" />
              <Button variant="outline" onClick={() => document.getElementById("xml-file-input")?.click()}>Seleziona file</Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• File XML FatturaPA (.xml)</p>
              <p>• File firmati digitalmente (.xml.p7m)</p>
              <p>• Archivi ZIP contenenti fatture XML/P7M</p>
              <p>• Selezione multipla con Ctrl+click</p>
            </div>
          </div>
        )}

        {/* ── STEP: ANALYZING (progress bar reale) ── */}
        {step === "analyzing" && (
          <div className="space-y-4 py-8 text-center">
            <p className="text-sm font-medium">Analisi fatture in corso…</p>
            <Progress value={analysisProgress.total > 0 ? (analysisProgress.current / analysisProgress.total) * 100 : 0} className="w-full" />
            <p className="text-sm text-muted-foreground">
              {analysisProgress.current} / {analysisProgress.total} file analizzati
            </p>
            {analysisProgress.filename && (
              <p className="text-xs text-muted-foreground truncate max-w-md mx-auto">{analysisProgress.filename}</p>
            )}
          </div>
        )}

        {/* ── STEP: PREVIEW ── */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {totalFilesCount} file trovati — {allPreviews.length} fatture riconosciute
                  </p>
                  {failedFiles.length > 0 && (
                    <p className="text-xs text-destructive font-medium">
                      ⚠ {failedFiles.length} file in quarantena (non riconosciuti)
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Conteggio: {allPreviews.length} riconosciuti + {failedFiles.length} falliti{aiPending > 0 ? ` + ${aiPending} AI in corso` : ''} = {allPreviews.length + failedFiles.length + aiPending} / {totalFilesCount} totali
                  </p>
                  {aiPending > 0 && (
                    <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> AI in corso: {aiPending} file
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={reset}>Annulla</Button>
                  <Button size="sm" onClick={() => { setStep("importing"); importMutation.mutate(); }} disabled={allPreviews.length === 0}>
                    Importa {allPreviews.length} fatture
                  </Button>
                </div>
              </div>

              {failedFiles.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive">
                      <ShieldAlert className="h-3 w-3" />
                      Mostra {failedFiles.length} file in quarantena
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-1 p-2 rounded bg-destructive/10 text-xs space-y-0.5 max-h-32 overflow-y-auto">
                      {failedFiles.map((f, i) => (
                        <p key={i} className="text-muted-foreground truncate">• {f.filename}</p>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Numero</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Controparte</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Righe</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPreviews.map((item, idx) => {
                    const inv = item.invoice!;
                    const direction = getDirection(inv);
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant={direction === "active" ? "default" : direction === "quarantine" ? "destructive" : "secondary"}>
                              {direction === "active" ? "Attiva" : direction === "quarantine" ? "Dir.?" : "Passiva"}
                            </Badge>
                            {item.parsedByAI && (
                              <Badge variant="outline" className="text-xs gap-0.5">
                                <Sparkles className="h-3 w-3" />AI
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                        <TableCell>{inv.invoiceDate}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {direction === "passive" ? inv.supplier.name : inv.buyer.name}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(inv.totalAmount)}</TableCell>
                        <TableCell>
                          {inv.primaryPayment?.method ? (
                            <Badge variant="outline" className="text-[10px]">{inv.primaryPayment.method}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">assente in XML</span>
                          )}
                        </TableCell>
                        <TableCell>{inv.lines.length}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── STEP: IMPORTING ── */}
        {step === "importing" && (
          <div className="space-y-4 py-8 text-center">
            <p className="text-sm font-medium">Importazione in corso...</p>
            <Progress value={progress} className="w-full" />
            <p className="text-xs text-muted-foreground">{progress}%</p>
          </div>
        )}

        {/* ── STEP: RESULT ── */}
        {step === "result" && result && (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Importazione completata</h3>

            {/* Bilancio totale — TASK E: conteggio coerente */}
            <div className="text-sm font-medium p-3 rounded bg-muted">
              Totale: {result.imported + result.duplicates + result.quarantined.length} / {result.totalFiles} file processati
              {" "}({result.imported} importate, {result.duplicates} duplicate, {result.quarantined.length} quarantena)
            </div>

            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-success" />
                  <span className="font-medium">{result.imported} fatture importate</span>
                </div>
                {result.duplicates > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <span>{result.duplicates} duplicate saltate</span>
                  </div>
                )}
                {result.counterpartiesCreated > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-primary" />
                    <span>{result.counterpartiesCreated} controparti create</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Euro className="h-4 w-4 text-destructive" />
                  <span>Totale passivo: {formatCurrency(result.totalPassive)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Euro className="h-4 w-4 text-success" />
                  <span>Totale attivo: {formatCurrency(result.totalActive)}</span>
                </div>
                {result.duePayments > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarDays className="h-4 w-4 text-warning" />
                    <span>Scadenze: {result.duePayments} pagamenti per {formatCurrency(result.dueAmount)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── QUARANTENA DETTAGLIATA ── */}
            {result.quarantined.length > 0 && (
              <Card className="border-destructive/50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <ShieldAlert className="h-4 w-4" />
                    {result.quarantined.length} file in quarantena
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {result.quarantined.map((q, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 p-2 rounded bg-muted text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{q.filename}</p>
                          <p className="text-muted-foreground">
                            <Badge variant="outline" className="text-[10px] mr-1">{q.errorCode}</Badge>
                            {q.errorMessage}
                          </p>
                          {q.hadReplacement && (
                            <p className="text-warning text-[10px]">⚠ Conteneva caratteri corrotti (U+FFFD)</p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {q.errorCode === "DB_INSERT_FAILED" && q.invoice && (
                            <Button
                              variant="ghost" size="icon" className="h-6 w-6"
                              title="Re-import safe (senza raw_xml)"
                              onClick={() => retryImportSafe(q)}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => downloadQuarantinedFile(q.storagePath, q.filename)}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Button className="w-full" onClick={() => handleClose(false)}>Chiudi</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}