// A pragmatic check, not a full RFC 5322 parser: one "@", something on each
// side, and a dot in the domain part.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Trim and lower-case so the same address in any casing/spacing means the
// same user ("  Ivan@Mail.ru " and "ivan@mail.ru" normalize to one string).
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}
