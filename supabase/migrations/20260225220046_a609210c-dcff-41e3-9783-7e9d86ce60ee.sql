DELETE FROM bank_transactions 
WHERE description LIKE 'COMMISSIONI BANCARIE%' 
  AND hash NOT LIKE 'imp_%';