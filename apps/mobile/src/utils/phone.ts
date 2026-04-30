/** Loose client-side phone normalization. The server is the source of truth. */
export function normalizePhoneInput(raw: string, defaultCountry = '+91'): string {
  const trimmed = raw.trim().replace(/[\s-]/g, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('0')) return defaultCountry + trimmed.slice(1);
  if (/^[6-9]\d{9}$/.test(trimmed) && defaultCountry === '+91') {
    return defaultCountry + trimmed;
  }
  return defaultCountry + trimmed;
}

export function isLikelyValidPhone(raw: string): boolean {
  return /^\+\d{10,15}$/.test(raw);
}
