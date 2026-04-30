export function formatCents(cents: number, currency = 'INR'): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}
