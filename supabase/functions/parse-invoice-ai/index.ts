import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY non configurata. Impostarla nei Secrets del progetto Supabase." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { rawXml } = await req.json();
    if (!rawXml || typeof rawXml !== "string") {
      return new Response(
        JSON.stringify({ error: "rawXml mancante o non valido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Tronca a 12000 caratteri per stare nei limiti
    const truncatedXml = rawXml.substring(0, 12000);

    const prompt = `Sei un parser di fatture elettroniche italiane SDI.
Estrai TUTTI i dati dal seguente XML (potrebbe essere parzialmente corrotto).
Rispondi SOLO con JSON valido, zero testo extra, zero markdown.

${truncatedXml}

Formato JSON richiesto (includi tutti i campi presenti, null se assenti):
{
  "invoiceNumber": "numero fattura",
  "invoiceDate": "YYYY-MM-DD",
  "invoiceType": "TD01",
  "currency": "EUR",
  "causal": "causale o null",
  "supplier": {
    "name": "denominazione fornitore",
    "vatNumber": "P.IVA solo cifre senza prefisso IT",
    "fiscalCode": "codice fiscale o null",
    "address": "indirizzo o null",
    "city": "comune o null",
    "province": "provincia 2 lettere o null",
    "cap": "CAP o null",
    "country": "IT"
  },
  "buyer": {
    "name": "denominazione compratore",
    "vatNumber": "P.IVA compratore solo cifre senza prefisso IT",
    "fiscalCode": "codice fiscale compratore o null"
  },
  "totalAmount": 0.00,
  "taxableAmount": 0.00,
  "taxAmount": 0.00,
  "payments": [
    {
      "method": "MP05",
      "dueDate": "YYYY-MM-DD o null",
      "amount": 0.00,
      "iban": "IBAN o null"
    }
  ],
  "lines": [
    {
      "lineNumber": 1,
      "description": "descrizione",
      "quantity": 1.00,
      "unitPrice": 0.00,
      "totalPrice": 0.00,
      "vatRate": 22.00,
      "unitOfMeasure": "KG o null"
    }
  ],
  "vatSummaries": [
    {
      "vatRate": 22.00,
      "taxableAmount": 0.00,
      "vatAmount": 0.00,
      "nature": "N2.2 o null"
    }
  ],
  "ddtNumbers": ["numero DDT se presente"],
  "orderNumbers": ["numero ordine se presente"]
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: `Anthropic API error: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    
    // Pulisci eventuale markdown wrapper
    const cleaned = text.replace(/```json\s*|```\s*/g, "").trim();
    
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response as JSON:", cleaned.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "AI response non parsabile come JSON" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ invoice: parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-invoice-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
