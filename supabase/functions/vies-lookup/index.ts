import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// EU member states supported by VIES
const EU_COUNTRIES = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","EL","ES","FI","FR",
  "HR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO",
  "SE","SI","SK","XI" // XI = Northern Ireland
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { countryCode, vatNumber } = await req.json();

    if (!countryCode || !vatNumber) {
      return new Response(JSON.stringify({ valid: false, name: null, address: null, error: "Missing countryCode or vatNumber" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!EU_COUNTRIES.has(countryCode.toUpperCase())) {
      return new Response(JSON.stringify({ valid: false, name: null, address: null, error: "Non-EU country" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode: countryCode.toUpperCase(), vatNumber }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return new Response(JSON.stringify({ valid: false, name: null, address: null, error: `VIES HTTP ${response.status}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    return new Response(JSON.stringify({
      valid: data.valid === true,
      name: data.name && data.name !== "---" ? data.name.trim() : null,
      address: data.address && data.address !== "---" ? data.address.trim() : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ valid: false, name: null, address: null, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
