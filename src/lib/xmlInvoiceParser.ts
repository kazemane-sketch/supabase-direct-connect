/**
 * xmlInvoiceParser.ts
 * 
 * Parser completo per fatture elettroniche italiane SDI (XML + P7M).
 * Testato su 290 file reali Caveco SRL - ottobre 2025.
 * 
 * Gestisce:
 * - File .xml puri
 * - File .xml.p7m binari (DER encoded CMS/CAdES)
 * - File .xml.p7m codificati in base64
 * - Namespace XML multipli: p:, b:, ns0:, ns1:, ns2:, ns3:, n1:, NS1:, nessuno
 * - Chiusura tag XML corrotta da firma digitale binaria
 */

// ─── TIPI ────────────────────────────────────────────────────────────────────

export interface ParsedSupplier {
  name: string;
  vatNumber: string;
  fiscalCode?: string;
  address?: string;
  city?: string;
  province?: string;
  cap?: string;
  country?: string;
  pec?: string;
  sdiCode?: string;
}

export interface ParsedBuyer {
  name: string;
  vatNumber: string;
  fiscalCode?: string;
  sdiCode?: string;
  pec?: string;
}

export interface ParsedPayment {
  method: string;        // MP01, MP05, MP12, ecc.
  dueDate?: string;      // YYYY-MM-DD
  amount: number;
  iban?: string;
  istituto?: string;
}

export interface ParsedLine {
  lineNumber: number;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  vatRate: number;
  unitOfMeasure?: string;
}

export interface ParsedVatSummary {
  vatRate: number;
  taxableAmount: number;
  vatAmount: number;
  nature?: string;       // N1-N7 per operazioni esenti/escluse
}

export interface ParsedInvoice {
  // Identificazione
  invoiceNumber: string;
  invoiceDate: string;       // YYYY-MM-DD
  invoiceType: string;       // TD01, TD04, TD06, ecc.
  currency: string;          // EUR

  // Controparte
  supplier: ParsedSupplier;
  buyer: ParsedBuyer;

  // Importi
  totalAmount: number;
  taxableAmount: number;
  taxAmount: number;
  
  // Pagamento (può essere multiplo - usiamo il primo o la somma)
  payments: ParsedPayment[];
  primaryPayment?: ParsedPayment;

  // Righe
  lines: ParsedLine[];
  vatSummaries: ParsedVatSummary[];

  // Riferimenti DDT/ordine
  ddtNumbers: string[];
  orderNumbers: string[];

  // Note/causale
  causal?: string;
}

// ─── ESTRAZIONE XML DA P7M ────────────────────────────────────────────────────

/**
 * Estrae il contenuto XML da un file P7M (binario o base64).
 * I file P7M sono envelope CMS/CAdES con l'XML incorporato.
 */
export function extractXmlFromP7mBytes(bytes: Uint8Array): string | null {
  let workingBytes = bytes;

  // Rileva se il file è codificato in base64 (inizia con lettere ASCII maiuscole tipo "MIID")
  const firstByte = bytes[0];
  const isBase64Encoded = firstByte >= 0x41 && firstByte <= 0x5A;
  
  if (isBase64Encoded) {
    try {
      const asciiText = new TextDecoder('ascii').decode(bytes).trim();
      const binaryStr = atob(asciiText);
      workingBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        workingBytes[i] = binaryStr.charCodeAt(i);
      }
    } catch {
      // Non è base64 valido, continua con i byte originali
      workingBytes = bytes;
    }
  }

  // Cerca l'inizio dell'XML nel binario
  // Proviamo: <?xml  oppure direttamente <FatturaElettronica o varianti con namespace
  const markers: number[][] = [
    [0x3C, 0x3F, 0x78, 0x6D, 0x6C],                           // <?xml
    [0x3C, 0x46, 0x61, 0x74, 0x74, 0x75, 0x72, 0x61],         // <Fattura
    [0x3C, 0x70, 0x3A, 0x46, 0x61, 0x74, 0x74, 0x75, 0x72, 0x61], // <p:Fattura
    [0x3C, 0x62, 0x3A, 0x46, 0x61, 0x74, 0x74, 0x75, 0x72, 0x61], // <b:Fattura
    [0x3C, 0x6E, 0x73, 0x30, 0x3A, 0x46],                      // <ns0:F
    [0x3C, 0x6E, 0x73, 0x32, 0x3A, 0x46],                      // <ns2:F
    [0x3C, 0x6E, 0x31, 0x3A, 0x46],                            // <n1:F
    [0x3C, 0x4E, 0x53, 0x31, 0x3A, 0x46],                      // <NS1:F
  ];

  let startIndex = -1;
  for (const marker of markers) {
    for (let i = 0; i < workingBytes.length - marker.length; i++) {
      let match = true;
      for (let j = 0; j < marker.length; j++) {
        if (workingBytes[i + j] !== marker[j]) { match = false; break; }
      }
      if (match) {
        if (startIndex === -1 || i < startIndex) startIndex = i;
        break;
      }
    }
    if (startIndex !== -1) break;
  }

  if (startIndex === -1) return null;

  // Rimuove TUTTI i byte di controllo dal binario PRIMA della decodifica.
  // Alcuni P7M hanno byte spuri (0x00, 0x03, 0x04 ecc.) intercalati
  // nei nomi dei tag XML, es: <Fattu\x04\x03raElettronicaBody>
  // Manteniamo solo: tab(0x09), newline(0x0A), CR(0x0D), e tutti >= 0x20
  const sliceRaw = workingBytes.slice(startIndex);
  const sliceClean = sliceRaw.filter(
    (b) => b >= 0x20 || b === 0x09 || b === 0x0A || b === 0x0D
  );
  // fatal:false scarta sequenze UTF-8 invalide rimaste (byte di continuazione isolati)
  const rawText = new TextDecoder('utf-8', { fatal: false })
    .decode(sliceClean);

  // Trova il tag di chiusura usando indexOf (veloce, no regex backtracking)
  // Copre TUTTI i namespace usati nelle fatture SDI italiane reali
  const closingVariants = [
    '</FatturaElettronica>',
    '</p:FatturaElettronica>',
    '</b:FatturaElettronica>',
    '</ns0:FatturaElettronica>',
    '</ns1:FatturaElettronica>',
    '</ns2:FatturaElettronica>',
    '</ns3:FatturaElettronica>',
    '</ns4:FatturaElettronica>',
    '</ns5:FatturaElettronica>',
    '</n1:FatturaElettronica>',
    '</NS1:FatturaElettronica>',
    '</NS2:FatturaElettronica>',
  ];

  for (const tag of closingVariants) {
    const pos = rawText.indexOf(tag);
    if (pos !== -1) {
      return rawText.substring(0, pos + tag.length);
    }
  }

  // Fallback: il tag di chiusura è corrotto dalla firma digitale
  // Troviamo la fine di FatturaElettronicaBody e ricostruiamo
  const bodyCloseIdx = rawText.lastIndexOf('</FatturaElettronicaBody>');
  if (bodyCloseIdx !== -1) {
    const openingMatch = rawText.match(/<([A-Za-z0-9_]*:?)FatturaElettronica[^>]*>/);
    const prefix = openingMatch ? openingMatch[1] : '';
    const xmlContent = rawText.substring(0, bodyCloseIdx + '</FatturaElettronicaBody>'.length);
    return xmlContent + `</${prefix}FatturaElettronica>`;
  }

  return null;
}

// ─── NORMALIZZAZIONE NAMESPACE ────────────────────────────────────────────────

/**
 * Rimuove tutti i prefissi namespace dall'XML per uniformare il parsing.
 * Gestisce: p:, b:, ns:, ns0:, ns1:, ns2:, ns3:, n1:, NS1:, ecc.
 */
function normalizeXmlNamespaces(xmlString: string): string {
  let s = xmlString;
  // PRIMA DI TUTTO: rimuove wrapper CDATA, mantenendo il testo interno
  // <![CDATA[testo]]> → testo
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Rimuove dichiarazioni namespace con prefisso: xmlns:xx="..."
  s = s.replace(/\s+xmlns:[a-zA-Z0-9_]+=["'][^"']*["']/g, '');
  // Rimuove dichiarazioni namespace di default: xmlns="..."
  s = s.replace(/\s+xmlns=["'][^"']*["']/g, '');
  // Rimuove prefissi dai tag apertura: <xx:Tag → <Tag
  s = s.replace(/<([A-Za-z0-9_]+):([A-Za-z])/g, '<$2');
  // Rimuove prefissi dai tag chiusura: </xx:Tag → </Tag
  s = s.replace(/<\/([A-Za-z0-9_]+):([A-Za-z])/g, '</$2');
  // Fix prefissi numerici corrotti senza colon: </2FatturaElettronicaBody> → </FatturaElettronicaBody>
  s = s.replace(/<\/([0-9]+)([A-Z])/g, '</$2');
  return s;
}

// ─── SANITIZZAZIONE ENCODING ──────────────────────────────────────────────────

/**
 * Converte byte ISO-8859-1 comuni in UTF-8 e rimuove control chars.
 * Da chiamare PRIMA del parsing XML e PRIMA dell'inserimento in DB.
 */
export function sanitizeEncoding(raw: string): string {
  return raw
    .replace(/\xB0/g, '°')
    .replace(/\xE0/g, 'à')
    .replace(/\xE8/g, 'è')
    .replace(/\xE9/g, 'é')
    .replace(/\xF2/g, 'ò')
    .replace(/\xF9/g, 'ù')
    .replace(/\x92/g, "'")
    .replace(/\x93/g, '"')
    .replace(/\x94/g, '"')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\uFFFD/g, '');
}

// ─── SANITIZZAZIONE ───────────────────────────────────────────────────────────

/**
 * Sanitizza XML grezzo prima del parsing: rimuove U+FFFD e control chars.
 * Ritorna flag hadReplacement se trovato U+FFFD.
 */
export function sanitizeXml(xml: string): { xml: string; hadReplacement: boolean } {
  const FFFD = '\uFFFD';
  const hadReplacement = xml.indexOf(FFFD) !== -1;
  let s = xml;
  // Rimuove U+FFFD (replacement character) — split+join per certezza
  if (hadReplacement) s = s.split(FFFD).join('');
  // Rimuove control chars tranne tab, newline, CR
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  return { xml: s, hadReplacement };
}

/**
 * Sanitizza testo estratto da XML: rimuove U+FFFD, control chars,
 * decodifica entities, normalizza spazi.
 */
export function sanitizeText(s: string): string {
  if (!s) return s;
  let r = s;
  // Rimuove U+FFFD — split+join è immune a problemi di regex escape
  r = r.split('\uFFFD').join('');
  // Rimuove control chars
  // eslint-disable-next-line no-control-regex
  r = r.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  // Decode entities (&lt; &gt; &apos; &quot; &amp;)
  r = decodeXmlEntities(r);
  // Normalizza spazi multipli
  r = r.replace(/\s{2,}/g, ' ');
  return r.trim();
}

// ─── HELPER DI PARSING ────────────────────────────────────────────────────────

/** Decodifica entità XML standard — &amp; DEVE essere sostituito per ULTIMO */
function decodeXmlEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Rimuove caratteri Unicode problematici che causano errori DB
 * (null bytes, surrogates isolati, control chars).
 */
export function stripBadUnicode(s: string): string {
  if (!s) return s;
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u0000/g, '').replace(/[\uD800-\uDFFF]/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** Estrae il testo del primo tag trovato (con sanitizzazione) */
function getTagText(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = xml.match(regex);
  return m ? sanitizeText(m[1].trim()) : '';
}

/** Estrae testo di un tag ignorando qualsiasi prefisso namespace */
function getTagTextAnyNs(xml: string, tag: string): string {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`);
  const m = xml.match(re);
  return m ? sanitizeText(m[1].trim()) : '';
}

/** Estrae tutti i valori di un tag (per tag ripetuti) */
function getAllTagTexts(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const results: string[] = [];
  let m;
  while ((m = regex.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

/** Estrae un blocco XML tra tag */
function getTagBlock(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = xml.match(regex);
  return m ? m[0] : '';
}

/** Estrae tutti i blocchi XML tra tag (per tag ripetuti) */
function getAllTagBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'g');
  return xml.match(regex) || [];
}

/** Converte stringa in numero float */
function parseAmount(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

// ─── PARSER PRINCIPALE ────────────────────────────────────────────────────────

/**
 * Parsa una stringa XML di fattura SDI e restituisce i dati strutturati.
 */
function parseXmlString(xmlString: string): ParsedInvoice | null {
  try {
    // Sanitizza encoding ISO-8859-1, poi rimuovi U+FFFD, poi normalizza namespace
    const encoded = sanitizeEncoding(xmlString);
    const { xml: sanitized } = sanitizeXml(encoded);
    const xml = normalizeXmlNamespaces(sanitized);

    // ── Header ──
    const header = getTagBlock(xml, 'FatturaElettronicaHeader');
    const body = getTagBlock(xml, 'FatturaElettronicaBody');

    if (!header || !body) return null;

    // ── Dati generali documento ──
    const datiGenerali = getTagBlock(body, 'DatiGenerali');
    const datiGeneraliDoc = getTagBlock(datiGenerali, 'DatiGeneraliDocumento');
    
    const invoiceType = getTagText(datiGeneraliDoc, 'TipoDocumento') || 'TD01';
    const currency = getTagText(datiGeneraliDoc, 'Divisa') || 'EUR';
    const invoiceDate = getTagText(datiGeneraliDoc, 'Data');
    const invoiceNumber = getTagText(datiGeneraliDoc, 'Numero');
    const totalAmount = parseAmount(getTagText(datiGeneraliDoc, 'ImportoTotaleDocumento'));
    const causal = getTagText(datiGeneraliDoc, 'Causale');

    // ── Fornitore (CedentePrestatore) ──
    const cedente = getTagBlock(header, 'CedentePrestatore');
    const cedenteDati = getTagBlock(cedente, 'DatiAnagrafici');
    const cedenteAnagrafica = getTagBlock(cedenteDati, 'Anagrafica');
    
    const supplierDenominazione = getTagText(cedenteAnagrafica, 'Denominazione');
    const supplierNome = getTagText(cedenteAnagrafica, 'Nome');
    const supplierCognome = getTagText(cedenteAnagrafica, 'Cognome');
    const supplierName = supplierDenominazione || 
                         [supplierCognome, supplierNome].filter(Boolean).join(' ') || '';
    
    const cedenteIdFiscale = getTagBlock(cedenteDati, 'IdFiscaleIVA');
    const supplierVat = getTagText(cedenteIdFiscale, 'IdCodice') || '';
    const supplierVatCountry = getTagText(cedenteIdFiscale, 'IdPaese') || 'IT';
    const supplierFiscalCode = getTagText(cedenteDati, 'CodiceFiscale') || '';
    
    const cedenteSede = getTagBlock(cedente, 'Sede');
    
    const supplier: ParsedSupplier = {
      name: supplierName,
      vatNumber: (supplierVatCountry !== 'IT' ? supplierVatCountry : '') + supplierVat,
      fiscalCode: supplierFiscalCode,
      address: getTagText(cedenteSede, 'Indirizzo'),
      city: getTagText(cedenteSede, 'Comune'),
      province: getTagText(cedenteSede, 'Provincia'),
      cap: getTagText(cedenteSede, 'CAP'),
      country: getTagText(cedenteSede, 'Nazione') || 'IT',
    };

    // Recupera SDI/PEC dal blocco DatiTrasmissione
    const datiTrasmissione = getTagBlock(header, 'DatiTrasmissione');
    const sdiCode = getTagText(datiTrasmissione, 'CodiceDestinatario');
    const pec = getTagText(datiTrasmissione, 'PECDestinatario');

    // ── Cessionario (CessionarioCommittente = compratore) ──
    const cessionario = getTagBlock(header, 'CessionarioCommittente');
    const cessionarioDati = getTagBlock(cessionario, 'DatiAnagrafici');
    const cessionarioAnagrafica = getTagBlock(cessionarioDati, 'Anagrafica');
    
    const buyerDenominazione = getTagText(cessionarioAnagrafica, 'Denominazione');
    const buyerNome = getTagText(cessionarioAnagrafica, 'Nome');
    const buyerCognome = getTagText(cessionarioAnagrafica, 'Cognome');
    const buyerName = buyerDenominazione || 
                      [buyerCognome, buyerNome].filter(Boolean).join(' ') || '';
    
    const cessionarioIdFiscale = getTagBlock(cessionarioDati, 'IdFiscaleIVA');
    const buyerVat = getTagText(cessionarioIdFiscale, 'IdCodice') || '';
    
    const buyer: ParsedBuyer = {
      name: buyerName,
      vatNumber: buyerVat,
      fiscalCode: getTagText(cessionarioDati, 'CodiceFiscale') || '',
    };

    // ── Pagamenti (namespace-aware) ──
    const payments: ParsedPayment[] = [];
    // Loop robusto su DettaglioPagamento con qualsiasi namespace
    const detRe = /<(?:\w+:)?DettaglioPagamento[^>]*>([\s\S]*?)<\/(?:\w+:)?DettaglioPagamento>/g;
    let payMatch;
    while ((payMatch = detRe.exec(xml)) !== null) {
      const block = payMatch[1];
      const method = getTagTextAnyNs(block, 'ModalitaPagamento');
      const dueDate = getTagTextAnyNs(block, 'DataScadenzaPagamento');
      const amountStr = getTagTextAnyNs(block, 'ImportoPagamento');
      const iban = getTagTextAnyNs(block, 'IBAN');
      const istituto = getTagTextAnyNs(block, 'IstitutoFinanziario');
      const amount = parseFloat((amountStr || '').replace(',', '.')) || 0;
      if (method || dueDate || amount) {
        payments.push({
          method: method || '',
          dueDate: dueDate || undefined,
          amount,
          iban: iban || undefined,
          istituto: istituto || undefined,
        });
      }
    }

    // Fallback: prova DatiPagamento (senza DettaglioPagamento separati)
    if (payments.length === 0) {
      const datiPagRe = /<(?:\w+:)?DatiPagamento[^>]*>([\s\S]*?)<\/(?:\w+:)?DatiPagamento>/;
      const datiMatch = xml.match(datiPagRe);
      if (datiMatch) {
        const block = datiMatch[1];
        const method = getTagTextAnyNs(block, 'ModalitaPagamento');
        const dueDate = getTagTextAnyNs(block, 'DataScadenzaPagamento');
        const amountStr = getTagTextAnyNs(block, 'ImportoPagamento');
        const iban = getTagTextAnyNs(block, 'IBAN');
        const amount = parseFloat((amountStr || '').replace(',', '.')) || totalAmount;
        payments.push({
          method: method || '',
          dueDate: dueDate || undefined,
          amount,
          iban: iban || undefined,
        });
      }
    }

    // Pagamento primario = primo con data scadenza, altrimenti primo
    const primaryPayment = payments.find(p => p.dueDate) || payments[0];

    // ── Righe fattura ──
    const lines: ParsedLine[] = [];
    const lineBlocks = getAllTagBlocks(body, 'DettaglioLinee');
    
    for (const block of lineBlocks) {
      const lineNum = parseInt(getTagText(block, 'NumeroLinea')) || lines.length + 1;
      const desc = getTagText(block, 'Descrizione');
      const qty = parseAmount(getTagText(block, 'Quantita')) || 1;
      const unitPrice = parseAmount(getTagText(block, 'PrezzoUnitario'));
      const totalPrice = parseAmount(getTagText(block, 'PrezzoTotale'));
      const vatRate = parseAmount(getTagText(block, 'AliquotaIVA'));
      const uom = getTagText(block, 'UnitaMisura');
      
      lines.push({
        lineNumber: lineNum,
        description: desc,
        quantity: qty,
        unitPrice,
        totalPrice,
        vatRate,
        unitOfMeasure: uom || undefined,
      });
    }

    // ── Riepilogo IVA ──
    const vatSummaries: ParsedVatSummary[] = [];
    const vatBlocks = getAllTagBlocks(body, 'DatiRiepilogo');
    
    for (const block of vatBlocks) {
      vatSummaries.push({
        vatRate: parseAmount(getTagText(block, 'AliquotaIVA')),
        taxableAmount: parseAmount(getTagText(block, 'ImponibileImporto')),
        vatAmount: parseAmount(getTagText(block, 'Imposta')),
        nature: getTagText(block, 'Natura') || undefined,
      });
    }

    // Calcola totale imponibile e IVA dai riepiloghi
    const taxableAmount = vatSummaries.reduce((sum, v) => sum + v.taxableAmount, 0);
    const taxAmount = vatSummaries.reduce((sum, v) => sum + v.vatAmount, 0);

    // ── Riferimenti DDT e Ordini ──
    const ddtNumbers: string[] = [];
    const datiDdt = getAllTagBlocks(datiGenerali, 'DatiDDT');
    for (const block of datiDdt) {
      const num = getTagText(block, 'NumeroDDT');
      if (num) ddtNumbers.push(num);
    }

    const orderNumbers: string[] = [];
    const datiOrdine = getAllTagBlocks(datiGenerali, 'DatiOrdineAcquisto');
    for (const block of datiOrdine) {
      const num = getTagText(block, 'IdDocumento');
      if (num) orderNumbers.push(num);
    }

    return {
      invoiceNumber,
      invoiceDate,
      invoiceType,
      currency,
      supplier,
      buyer,
      totalAmount,
      taxableAmount,
      taxAmount,
      payments,
      primaryPayment,
      lines,
      vatSummaries,
      ddtNumbers,
      orderNumbers,
      causal: causal || undefined,
    };

  } catch (error) {
    console.error('[xmlInvoiceParser] Errore parsing XML:', error);
    return null;
  }
}

// ─── API PUBBLICA ─────────────────────────────────────────────────────────────

/**
 * Parsa una fattura da stringa XML grezza (già estratta).
 * Usare questo per il re-parsing di raw_xml salvato nel DB.
 */
export function parseInvoiceFromXmlString(xmlString: string): ParsedInvoice | null {
  if (!xmlString) return null;
  return parseXmlString(xmlString);
}

/**
 * Estrae e parsa una fattura da un file (XML puro o P7M firmato).
 * Usare questo durante l'import da file.
 */
export async function parseInvoiceFromFile(
  file: File
): Promise<{ invoice: ParsedInvoice | null; rawXml: string | null }> {
  try {
    const filename = file.name.toLowerCase();
    let xmlString: string | null = null;

    if (filename.endsWith('.p7m')) {
      // File P7M: legge come binario ed estrae XML
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      xmlString = extractXmlFromP7mBytes(bytes);
    } else if (filename.endsWith('.xml')) {
      // File XML puro: legge come testo
      xmlString = await file.text();
    }

    if (!xmlString) {
      console.warn(`[xmlInvoiceParser] Impossibile estrarre XML da: ${file.name}`);
      return { invoice: null, rawXml: null };
    }

    const invoice = parseXmlString(xmlString);
    return { invoice, rawXml: xmlString };

  } catch (error) {
    console.error(`[xmlInvoiceParser] Errore file ${file.name}:`, error);
    return { invoice: null, rawXml: null };
  }
}

/**
 * Estrae e parsa una fattura da un entry JSZip (per import da ZIP).
 * 
 * Uso:
 *   const zip = await JSZip.loadAsync(zipFile);
 *   for (const [name, entry] of Object.entries(zip.files)) {
 *     const result = await parseInvoiceFromZipEntry(name, entry);
 *   }
 */
export async function parseInvoiceFromZipEntry(
  filename: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zipEntry: any
): Promise<{ invoice: ParsedInvoice | null; rawXml: string | null }> {
  try {
    const lowerName = filename.toLowerCase();
    let xmlString: string | null = null;

    if (lowerName.endsWith('.p7m')) {
      // Legge come Uint8Array per preservare il binario
      const bytes: Uint8Array = await zipEntry.async('uint8array');
      xmlString = extractXmlFromP7mBytes(bytes);
    } else if (lowerName.endsWith('.xml')) {
      xmlString = await zipEntry.async('text');
    }
    // Ignora altri tipi di file (es. .xsl, directory)

    if (!xmlString) {
      return { invoice: null, rawXml: null };
    }

    const invoice = parseXmlString(xmlString);
    return { invoice, rawXml: xmlString };

  } catch (error) {
    console.error(`[xmlInvoiceParser] Errore zip entry ${filename}:`, error);
    return { invoice: null, rawXml: null };
  }
}

/**
 * Conta le fatture valide in un file ZIP senza importarle.
 * Usare nella preview modal.
 */
export async function previewInvoicesFromZip(
  zipFile: File,
  onProgress?: (current: number, total: number, filename: string) => void
): Promise<Array<{
  filename: string;
  invoice: ParsedInvoice | null;
  rawXml: string | null;
  hadReplacement?: boolean;
}>> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(zipFile);
  
  // Filtra entries valide prima per avere il totale
  const entries: Array<[string, any]> = [];
  for (const [filename, entry] of Object.entries(zip.files)) {
    if ((entry as any).dir) continue;
    const lowerName = filename.toLowerCase();
    if (!lowerName.endsWith('.xml') && !lowerName.endsWith('.p7m')) continue;
    entries.push([filename, entry]);
  }

  const total = entries.length;
  const results: Array<{ filename: string; invoice: ParsedInvoice | null; rawXml: string | null; hadReplacement?: boolean }> = [];
  
  for (let i = 0; i < entries.length; i++) {
    const [filename, entry] = entries[i];
    onProgress?.(i + 1, total, filename);
    
    // Yield al browser per aggiornare la UI
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    
    try {
      const result = await parseInvoiceFromZipEntry(filename, entry);
      // Controlla se aveva replacement chars
      let hadReplacement = false;
      if (result.rawXml) {
        hadReplacement = /\uFFFD/.test(result.rawXml);
      }
      results.push({ filename, ...result, hadReplacement });
    } catch (e) {
      console.warn(`[previewInvoicesFromZip] Error on ${filename}:`, e);
      results.push({ filename, invoice: null, rawXml: null, hadReplacement: false });
    }
  }
  
  return results;
}
