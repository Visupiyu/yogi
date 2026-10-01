// Customer sign-in return-to (client-safe, no I/O).
//
// A signed-out visitor sent to /login from a protected page used to land on "/"
// after signing in, losing where they were going. The protected page now sends
// them to /login?returnTo=<their path>, and the login page sends them back.
//
// returnTo is attacker-controllable (it is just a query string), so it is only
// ever honoured as a same-origin APPLICATION PATH. Anything else — an absolute
// URL, a protocol-relative "//host", a "/\host" (browsers treat the backslash as
// a slash), a javascript:/data: URL, control characters, or one of the sign-in
// pages themselves (a redirect loop) — falls back to "/".

const FALLBACK = "/";
const MAX_LENGTH = 1000;
// Pages that must never be a return target: bouncing back to one of them after a
// successful sign-in would loop or strand the user on a form.
const NEVER_RETURN_TO = ["/login", "/signup", "/forgot-password"];

export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string") return FALLBACK;
  const value = raw.trim();
  if (!value || value.length > MAX_LENGTH) return FALLBACK;
  // Must be a rooted path, and not "//host" or "/\host".
  if (value[0] !== "/" || value[1] === "/" || value[1] === "\\") return FALLBACK;
  // No backslashes, whitespace or control characters anywhere (URL-parser
  // differentials are the usual way these checks are bypassed).
  if (/[\\\u0000-\u001f\u007f\s]/.test(value)) return FALLBACK;

  let parsed: URL;
  try {
    parsed = new URL(value, "http://return-to.invalid");
  } catch {
    return FALLBACK;
  }
  // Resolving against a dummy origin must keep us on that origin.
  if (parsed.origin !== "http://return-to.invalid") return FALLBACK;

  const path = parsed.pathname;
  if (NEVER_RETURN_TO.some((p) => path === p || path.startsWith(p + "/"))) return FALLBACK;

  return path + parsed.search + parsed.hash;
}

/** Pure: the customer login URL that returns to `target` (itself validated). */
export function loginUrlFor(target: string): string {
  const safe = safeReturnTo(target);
  return safe === FALLBACK ? "/login" : `/login?returnTo=${encodeURIComponent(safe)}`;
}

/**
 * Client-only: the customer login URL that returns to the page the visitor is on
 * right now. Use for "this page needs a signed-in customer" redirects — not for
 * logout, where there is nothing to return to.
 */
export function customerLoginUrl(): string {
  if (typeof window === "undefined") return "/login";
  return loginUrlFor(window.location.pathname + window.location.search);
}
