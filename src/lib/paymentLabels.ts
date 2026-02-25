export const PAYMENT_LABELS: Record<string, string> = {
  MP01: 'Contanti',
  MP02: 'RIBA',
  MP04: 'Contanti',
  MP05: 'Bonifico',
  MP06: 'Vaglia',
  MP07: 'Bollettino',
  MP08: 'Carta',
  MP09: 'RID',
  MP10: 'RID utenze',
  MP11: 'RID veloce',
  MP12: 'RIBA',
  MP19: 'SEPA DD',
  MP21: 'Bonifico istantaneo',
  MP22: 'Trattenuta',
};

export function getPaymentLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return PAYMENT_LABELS[code] ?? code;
}
