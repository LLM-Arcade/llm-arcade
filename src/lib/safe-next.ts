// The post-login ?next= target. Only a path on this site is allowed.
//
// A string check alone is not enough. Browsers read a backslash as a slash and
// drop tabs and newlines, so "/\evil.example" passes
// `startsWith("/") && !startsWith("//")` and then resolves to another host.
// Parse the value against our origin and keep it only if the origin is unchanged.
// Dot-segments can also normalize to a protocol-relative path: "/.//evil.example"
// becomes "//evil.example", so a normalized path may not start with "//" either.

export const safeNextPath = (raw: string | null, origin: string): string => {
  if (!raw || !raw.startsWith("/") || raw.includes("\\")) return "/";
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || url.pathname.startsWith("//")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
};
