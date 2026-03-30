export function getCurrencySymbol(currency: string): string {
  if (currency === 'IDR') return 'Rp';
  if (currency === 'USDC') return '¢';
  return '$';
}

export function formatCurrencyValue(amount: number, currency: string): string {
  const sym = getCurrencySymbol(currency);
  const formatted = amount.toFixed(2);
  return `${sym}${formatted}`;
}

export function formatCurrencyWithSign(amount: number, currency: string): string {
  const sym = getCurrencySymbol(currency);
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  const formatted = Math.abs(amount).toFixed(2);
  // Using IDR might not need decimal if they are large, but for now we keep .toFixed(2)
  return `${sign}${sym}${formatted}`;
}
