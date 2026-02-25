
## Piano: Collegamento visivo commissione → transazione principale

### Approccio

Nella tabella di preview PDF, le righe commissione (`_isCommission === true`) verranno rese visivamente come "figlie" della transazione precedente:

1. **Indentazione e stile differenziato** — la riga commissione avrà:
   - Un piccolo indicatore `↳` prima della descrizione per suggerire che è derivata dalla riga sopra
   - Sfondo leggermente diverso (`bg-muted/30`) e testo più piccolo
   - Nessun bordo superiore, così visivamente si "attacca" alla riga sopra

2. **Nessuna modifica ai dati** — solo styling nella tabella preview (righe 836-855). La logica di import resta invariata.

### Dettaglio tecnico

Nel file `src/components/ImportCsvModal.tsx`, nella sezione `pdfStep === "preview"` (riga 837-854), modificare il rendering della `TableRow` per le commissioni:

- Se `tx._isCommission` è true, applicare classi CSS diverse: sfondo `bg-muted/20`, testo più piccolo, e prefisso `↳` nella colonna descrizione
- Rimuovere il bordo superiore della riga commissione con `border-t-0` per legarla visivamente alla riga sopra

### File da modificare

- `src/components/ImportCsvModal.tsx` — solo il blocco di rendering della tabella preview PDF (righe 837-854)
