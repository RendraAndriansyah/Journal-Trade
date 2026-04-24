export function getCurrencySymbol(currency: string): string {
  if (currency === 'IDR') return 'Rp';
  if (currency === 'USDC') return '¢';
  return '$';
}

function formatNumber(amount: number): string {
  const parts = amount.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // Optional: remove .00 if it's an integer and currency is IDR? 
  // Let's keep it to 2 decimal places to be consistent with previous .toFixed(2)
  return parts.join('.');
}

export function formatCurrencyValue(amount: number, currency: string): string {
  const sym = getCurrencySymbol(currency);
  const space = sym === 'Rp' ? ' ' : '';
  const formatted = formatNumber(amount);
  return `${sym}${space}${formatted}`;
}

export function formatCurrencyWithSign(amount: number, currency: string): string {
  const sym = getCurrencySymbol(currency);
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  const space = sym === 'Rp' ? ' ' : '';
  const formatted = formatNumber(Math.abs(amount));
  return `${sign}${sym}${space}${formatted}`;
}
