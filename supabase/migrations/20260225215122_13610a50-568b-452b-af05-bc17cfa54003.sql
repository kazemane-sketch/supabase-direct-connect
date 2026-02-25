
-- Step 1: Scorporare le commissioni dagli importi delle transazioni esistenti
-- (solo per importi negativi, dove amount include già la commissione)
UPDATE bank_transactions
SET amount = amount + commission
WHERE commission IS NOT NULL 
  AND commission > 0 
  AND amount < 0;

-- Step 2: Inserire righe commissione separate per ogni transazione con commissione
INSERT INTO bank_transactions (
  bank_account_id, company_id, transaction_date, value_date,
  amount, description, counterpart_name, reference,
  reconciliation_status, hash, raw_text, commission,
  cbi_flow_id, branch, import_batch_id
)
SELECT
  bank_account_id, company_id, transaction_date, value_date,
  -ABS(commission) as amount,
  'COMMISSIONI BANCARIE - ' || COALESCE(reference, description, '') as description,
  'Banca' as counterpart_name,
  reference,
  'unmatched' as reconciliation_status,
  md5(id::text || '_commission') as hash,
  raw_text,
  NULL as commission,
  cbi_flow_id, branch, import_batch_id
FROM bank_transactions
WHERE commission IS NOT NULL AND commission > 0;
