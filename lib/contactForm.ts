// Contact form rules — pure (no server or mail imports), shared by the page
// (UX only) and /api/contact (authoritative). The server never trusts that the
// page ran them.

export const CONTACT_LIMITS = { name: 100, email: 254, subject: 200, message: 2000 } as const;

export type ContactInput = { name: string; email: string; subject: string; message: string };
export type ContactErrors = Partial<Record<keyof ContactInput, string>>;

// Pragmatic address check: one "@", no whitespace/control characters (which also
// rules out header injection through the address), a dotted domain.
const EMAIL_RE = /^[^\s@<>(),;:"\\[\]]+@[^\s@<>(),;:"\\[\]]+\.[^\s@<>(),;:"\\[\]]{2,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Single-line field: control characters and line breaks collapse to one space. */
export function cleanLine(v: unknown): string {
  return typeof v === "string" ? v.replace(/[\r\n\t\u2028\u2029]+/g, " ").replace(CONTROL_RE, "").replace(/ {2,}/g, " ").trim() : "";
}

/** Multi-line field: keeps line breaks, drops other control characters. */
export function cleanText(v: unknown): string {
  return typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(CONTROL_RE, "").trim() : "";
}

export function validateContact(raw: Partial<Record<keyof ContactInput, unknown>>): {
  ok: boolean;
  value: ContactInput;
  errors: ContactErrors;
} {
  const value: ContactInput = {
    name: cleanLine(raw.name),
    email: cleanLine(raw.email).toLowerCase(),
    subject: cleanLine(raw.subject),
    message: cleanText(raw.message),
  };
  const errors: ContactErrors = {};
  if (!value.name) errors.name = "Please enter your name.";
  else if (value.name.length > CONTACT_LIMITS.name) errors.name = `Name must be ${CONTACT_LIMITS.name} characters or fewer.`;
  if (!value.email) errors.email = "Please enter your email address.";
  else if (value.email.length > CONTACT_LIMITS.email || !EMAIL_RE.test(value.email)) errors.email = "Please enter a valid email address.";
  if (!value.subject) errors.subject = "Please enter a subject.";
  else if (value.subject.length > CONTACT_LIMITS.subject) errors.subject = `Subject must be ${CONTACT_LIMITS.subject} characters or fewer.`;
  if (!value.message) errors.message = "Please enter your message.";
  else if (value.message.length > CONTACT_LIMITS.message) errors.message = `Message must be ${CONTACT_LIMITS.message} characters or fewer.`;
  return { ok: Object.keys(errors).length === 0, value, errors };
}
