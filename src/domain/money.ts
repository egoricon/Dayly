// Money is always integer kopecks. Display format: '1 020,00 BYN'
// (thousands separated by U+202F, minus sign U+2212).

const THIN_NBSP = ' ';
const MINUS = '−';

/** 102000 -> '1 020,00', -1996 -> '−19,96' */
export function formatKopecks(kopecks: number): string {
  const abs = Math.abs(kopecks);
  const rubles = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = String(rubles).replace(/\B(?=(\d{3})+(?!\d))/g, THIN_NBSP);
  const sign = kopecks < 0 ? MINUS : '';
  return `${sign}${grouped},${String(cents).padStart(2, '0')}`;
}

/** 2750 -> '27,50 BYN' */
export function formatMoney(kopecks: number): string {
  return `${formatKopecks(kopecks)} BYN`;
}

/**
 * Parses user input like '3,5', '12.40', '1 020' into kopecks.
 * Returns null for anything that is not a non-negative amount with at most 2 decimals.
 */
export function parseAmount(input: string): number | null {
  const normalized = input.replace(/[\s  ]/g, '').replace(',', '.');
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(normalized);
  if (!match) return null;
  const rubles = Number(match[1]);
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  const kopecks = rubles * 100 + cents;
  return Number.isSafeInteger(kopecks) ? kopecks : null;
}
