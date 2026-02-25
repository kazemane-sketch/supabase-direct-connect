import { supabase } from "@/integrations/supabase/client";

export interface ViesResult {
  valid: boolean;
  name: string | null;
  address: string | null;
}

// EU country codes supported by VIES
const EU_COUNTRIES = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","EL","ES","FI","FR",
  "HR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO",
  "SE","SI","SK","XI"
]);

/**
 * Lookup a VAT number via VIES (through edge function proxy).
 * Returns { valid, name, address }. Never throws — returns fallback on error.
 */
export async function lookupVatNumber(
  vatNumber: string,
  countryCode: string = "IT"
): Promise<ViesResult> {
  const fallback: ViesResult = { valid: false, name: null, address: null };

  if (!vatNumber || !countryCode) return fallback;

  const cc = countryCode.toUpperCase();
  if (!EU_COUNTRIES.has(cc)) return fallback;

  // Strip country prefix if present in vatNumber
  let cleanVat = vatNumber;
  if (cleanVat.toUpperCase().startsWith(cc)) {
    cleanVat = cleanVat.substring(cc.length);
  }

  try {
    const { data, error } = await supabase.functions.invoke("vies-lookup", {
      body: { countryCode: cc, vatNumber: cleanVat },
    });

    if (error) return fallback;
    return {
      valid: data?.valid === true,
      name: data?.name || null,
      address: data?.address || null,
    };
  } catch {
    return fallback;
  }
}

/** Helper: delay for rate limiting */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
