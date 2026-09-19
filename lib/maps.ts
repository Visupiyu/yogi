// Address-string -> external maps SEARCH URL. Navigation ONLY: it opens the
// user's maps site/app (in a new tab) pointed at a plain address string --
// exactly the provider-neutral Google Maps web link the project already used in
// the legacy delivery pages. It is NOT tracking, NOT live location, NOT a Maps
// API call, NOT geocoding, and stores no coordinates.
//
// Returns null for an empty/blank address so callers render NO link rather than
// a maps query for nothing (never guesses a destination that does not exist).
export function mapsSearchUrl(address: string | null | undefined): string | null {
  const q = (address ?? "").trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
