import Anthropic from "npm:@anthropic-ai/sdk";
import { PDFDocument } from "npm:pdf-lib";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function splitPdfIntoChunks(pdfBase64: string, chunkSize = 10): Promise<string[]> {
  const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const totalPages = pdfDoc.getPageCount();

  if (totalPages <= chunkSize) {
    return [pdfBase64];
  }

  const chunks: string[] = [];
  for (let i = 0; i < totalPages; i += chunkSize) {
    const chunkDoc = await PDFDocument.create();
    const endPage = Math.min(i + chunkSize, totalPages);
    const pages = await chunkDoc.copyPages(pdfDoc, Array.from({ length: endPage - i }, (_, k) => i + k));
    pages.forEach(page => chunkDoc.addPage(page));
    const chunkBytes = await chunkDoc.save();
    let binary = "";
    const bytes = new Uint8Array(chunkBytes);
    const len = bytes.byteLength;
    for (let j = 0; j < len; j++) {
      binary += String.fromCharCode(bytes[j]);
    }
    chunks.push(btoa(binary));
  }

  console.log(`PDF split into ${chunks.length} chunks (${totalPages} pages, ${chunkSize} per chunk)`);
  return chunks;
}

const PROMPT = `Sei un esperto contabile italiano. Estrai TUTTI i movimenti bancari da questo estratto conto bancario italiano (formato MPS Monte dei Paschi di Siena o simile).

Per OGNI movimento, estrai TUTTI questi campi:
- date: data operazione in formato "DD/MM/YYYY"
- value_date: data valuta in formato "DD/MM/YYYY"
- amount: importo numerico (negativo = uscite/addebiti, positivo = entrate/accrediti)
- commission: importo commissioni se presente (es. "IMPORTO COMMISSIONI: 1,50"), altrimenti null
- description: causale principale/descrizione del movimento
- counterpart: nome della controparte (beneficiario o ordinante)
- reference: numero di riferimento, CRO, TRN
- cbi_flow_id: ID flusso CBI se presente, altrimenti null
- branch: filiale disponente se presente, altrimenti null
- raw_text: il TESTO COMPLETO e integrale del movimento, incluse tutte le righe di dettaglio, senza troncare nulla

IMPORTANTE:
- Se un movimento ha commissioni ("IMPORTO COMMISSIONI: X,XX"), metti il valore in "commission" come numero positivo (es. 1.50)
- Negativi = uscite/addebiti. Positivi = entrate/accrediti.
- Includi TUTTI i movimenti senza eccezioni, non saltare nessuna pagina.
- Nel campo raw_text includi TUTTO il testo del movimento, ogni riga.

Restituisci SOLO un array JSON valido, nessun altro testo:
[{"date":"DD/MM/YYYY","value_date":"DD/MM/YYYY","amount":-123.45,"commission":1.50,"description":"testo causale","counterpart":"nome","reference":"ref","cbi_flow_id":"id o null","branch":"filiale o null","raw_text":"testo completo integrale"}]`;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function repairJson(raw: string): any[] {
  let s = raw.replace(/```json/g, "").replace(/```/g, "").trim();
  try { const p = JSON.parse(s); return Array.isArray(p) ? p : []; } catch {}
  const lastComplete = s.lastIndexOf("},");
  if (lastComplete > 0) {
    const attempt = s.substring(0, lastComplete + 1) + "]";
    try { const p = JSON.parse(attempt); return Array.isArray(p) ? p : []; } catch {}
  }
  const lastObj = s.lastIndexOf("}");
  if (lastObj > 0) {
    const attempt = s.substring(0, lastObj + 1) + "]";
    try { const p = JSON.parse(attempt); return Array.isArray(p) ? p : []; } catch {}
  }
  console.error("JSON repair failed, raw length:", s.length);
  return [];
}

async function processChunk(client: Anthropic, chunkBase64: string): Promise<any[]> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 16384,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: chunkBase64,
            },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "";
  const stopReason = response.stop_reason;
  console.log(`Chunk response: ${rawText.length} chars, stop_reason: ${stopReason}`);
  
  const results = repairJson(rawText);
  if (stopReason === "end_turn" && results.length === 0 && rawText.length > 100) {
    console.error("Parse failed despite end_turn, raw preview:", rawText.substring(0, 200));
  }
  if (stopReason !== "end_turn") {
    console.warn(`Response truncated (stop_reason: ${stopReason}), recovered ${results.length} transactions`);
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pdfBase64 } = await req.json();

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: "No PDF data provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured. Set it in Supabase project Secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = new Anthropic({ apiKey });
    const chunks = await splitPdfIntoChunks(pdfBase64, 10);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        let allTransactions: any[] = [];
        let failedChunks: number[] = [];

        for (let i = 0; i < chunks.length; i++) {
          console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
          send({ type: "progress", chunk: i + 1, total: chunks.length, found: allTransactions.length });

          let attempts = 0;
          const maxAttempts = 3;
          while (attempts < maxAttempts) {
            try {
              const txns = await processChunk(client, chunks[i]);
              allTransactions = allTransactions.concat(txns);
              console.log(`Chunk ${i + 1}: found ${txns.length} transactions`);
              break;
            } catch (chunkErr: any) {
              attempts++;
              if (chunkErr?.status === 429 && attempts < maxAttempts) {
                const waitSec = Math.min(60, (chunkErr?.headers?.get?.("retry-after") || 30) * 1);
                console.log(`Rate limited on chunk ${i + 1}, waiting ${waitSec}s (attempt ${attempts}/${maxAttempts})...`);
                await delay(waitSec * 1000);
              } else {
                console.error(`Chunk ${i + 1} failed (attempt ${attempts}):`, chunkErr?.message || chunkErr);
                failedChunks.push(i + 1);
                break;
              }
            }
          }

          if (i < chunks.length - 1) {
            await delay(3000);
          }
        }

        console.log(`Total transactions extracted: ${allTransactions.length}, failed chunks: ${failedChunks.length}`);

        send({
          type: "done",
          transactions: allTransactions,
          count: allTransactions.length,
          failedChunks: failedChunks.length > 0 ? failedChunks : undefined,
        });

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("parse-bank-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
