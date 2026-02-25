import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = new Anthropic({ apiKey });

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
                data: pdfBase64,
              },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";
    const stopReason = response.stop_reason;
    console.log(`Response: ${rawText.length} chars, stop_reason: ${stopReason}`);

    const transactions = repairJson(rawText);

    if (stopReason !== "end_turn") {
      console.warn(`Response truncated (stop_reason: ${stopReason}), recovered ${transactions.length} transactions`);
    }

    return new Response(
      JSON.stringify({ transactions, count: transactions.length, truncated: stopReason !== "end_turn" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("parse-bank-pdf error:", e);

    if (e?.status === 429) {
      const retryAfter = e?.headers?.get?.("retry-after") || "30";
      return new Response(
        JSON.stringify({ error: "Rate limited", retryAfter: parseInt(retryAfter) }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": retryAfter } }
      );
    }

    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
