

## Supabase Health Check — Piano

Ho analizzato l'intero codice sorgente del progetto e confrontato con lo schema attuale del tuo Supabase. Ecco il risultato.

### Stato attuale

**Tabelle** — Tutte le 12 tabelle richieste esistono gia nel tuo Supabase:
`companies`, `bank_accounts`, `bank_transactions`, `import_batches`, `invoices`, `invoice_lines`, `invoice_line_projects`, `invoice_import_files`, `counterparties`, `chart_of_accounts`, `products`, `projects`, `reconciliations`, `reconciliation_rules`

**Storage buckets** — Tutti e 3 esistono:
`invoice-imports`, `invoices-xml`, `invoices-pdf`

**Storage RLS policies** — Quasi complete, ma manca 1 policy:
- `invoice-imports`: ha SELECT, INSERT, DELETE ma **manca UPDATE** (necessario perche l'app usa `upsert: true` negli upload)

### Cosa produrro nella fase di implementazione

**Blocco A — HEALTHCHECK SQL**: un singolo script da incollare nel SQL Editor che verifica ogni tabella, ogni colonna critica, ogni bucket e ogni policy di storage, con output `OK` / `MISSING` su ogni riga.

**Blocco B — PATCH SQL**: una singola query che aggiunge la policy UPDATE mancante su `invoice-imports` (l'unico fix trovato). Usa `IF NOT EXISTS` / `CREATE POLICY ... IF NOT EXISTS` per non rompere nulla.

### Dettaglio tecnico

Le verifiche nel healthcheck copriranno:
- 14 tabelle (esistenza)
- ~25 colonne critiche (es: `invoices.raw_xml`, `invoices.pdf_storage_path`, `invoices.counterpart_id`, `counterparties.payment_method`, `invoice_import_files.had_replacement_chars`, etc.)
- 3 bucket storage
- 10 policy storage attese (SELECT/INSERT/UPDATE/DELETE per ogni bucket dove servono)
- Output formattato come tabella: `check_name | status`

La patch SQL conterr solo:
```sql
CREATE POLICY "Anyone can update invoice-imports"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'invoice-imports');
```

Nessuna migration Lovable Cloud, nessuna modifica strutturale — solo script da copiare manualmente nel tuo SQL Editor.

