// Error-text redaction shared by server instrumentation (instrumentation.ts)
// and the client error intake (app/api/client-errors). Dependency-free so it is
// safe on both sides. Removes the shapes of things that must never reach a log
// line: credentials, tokens, keys, email addresses, phone numbers, query
// strings and long opaque identifiers. Deliberately aggressive — a log that
// loses a little detail is better than one that leaks a secret.

const PATTERNS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, "[redacted-key]"],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, "[redacted-api-key]"],
  [/\brzp_(live|test)_[0-9A-Za-z]+/g, "[redacted-razorpay-key]"],
  [/\bre_[0-9A-Za-z_]{16,}/g, "[redacted-resend-key]"],
  [/\b(sk|pk)_(live|test)_[0-9A-Za-z]+/g, "[redacted-key]"],
  [/"private_key"\s*:\s*"[^"]*"/g, '"private_key":"[redacted]"'],
  [/\b(password|secret|token|api[_-]?key|authorization)\b\s*[:=]\s*\S+/gi, "$1=[redacted]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/(?<!\d)(\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g, "[phone]"],
  [/\?[^\s"'#]*/g, "?[query]"],
  [/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted-id]"],
];

export function redactText(input: unknown, maxLength = 300): string {
  let text = typeof input === "string" ? input : input instanceof Error ? input.message : String(input ?? "");
  for (const [pattern, replacement] of PATTERNS) text = text.replace(pattern, replacement);
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** A path with any query string / fragment removed. */
export function redactPath(input: unknown): string {
  const path = typeof input === "string" ? input : "";
  return path.split(/[?#]/)[0].slice(0, 200);
}
