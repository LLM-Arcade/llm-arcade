import { verifyToken } from "@clerk/backend";
import { decodeProtectedHeader } from "jose";

export interface ClerkBindings {
  APP_ORIGIN: string;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_ISSUER?: string;
  CLERK_JWT_KEY?: string;
}

// Match @clerk/backend 3.26.5's session-only header path, including its
// category and pending-session checks. Keep the parity tests when upgrading.
const SESSION_CATEGORY = "cl_B7d4PD111AAA";
export async function readClerkIdentity(request: Request, env: ClerkBindings) {
  if (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY || !env.CLERK_ISSUER) throw new Error("Optional Clerk accounts are not configured");
  const header = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9_.-]{1,16384}$/.test(header)) return null;
  const token = header.slice(7);
  try {
    const protectedHeader = decodeProtectedHeader(token);
    if (protectedHeader.cat !== undefined && protectedHeader.cat !== SESSION_CATEGORY) return null;
    if (protectedHeader.typ === "at+jwt" || protectedHeader.typ === "application/at+jwt") return null;
    const claims = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY, jwtKey: env.CLERK_JWT_KEY,
      issuer: env.CLERK_ISSUER, authorizedParties: [new URL(env.APP_ORIGIN).origin],
      clockSkewInMs: 5000,
    });
    if (typeof claims.sub !== "string" || !claims.sub || claims.sub.startsWith("mch_") ||
        typeof claims.sid !== "string" || !claims.sid || claims.sts === "pending") return null;
    return { subject: claims.sub, sessionId: claims.sid };
  } catch { return null; }
}

export async function readVerifiedClerkEmail(identity: { subject: string }, env: ClerkBindings) {
  // A fixed provider endpoint, no redirects, bounded body and server-only key.
  // Avoid constructing/deserializing the SDK's complete management client for
  // every account link; the official SDK still performs token verification.
  const response = await fetch("https://api.clerk.com/v1/users/" + encodeURIComponent(identity.subject), {
    headers: { Authorization: "Bearer " + env.CLERK_SECRET_KEY, "Clerk-API-Version": "2026-05-12" },
    redirect: "manual", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Clerk account verification is unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Clerk account verification returned no body");
  const decoder = new TextDecoder();
  let size = 0, text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 65536) { await reader.cancel(); throw new Error("Clerk account verification response is too large"); }
    text += decoder.decode(value, { stream: true });
  }
  const user = JSON.parse(text + decoder.decode()) as {
    id?: unknown; primary_email_address_id?: unknown;
    email_addresses?: { id?: unknown; email_address?: unknown; verification?: { status?: unknown } }[];
  } | null;
  if (!user || user.id !== identity.subject || typeof user.primary_email_address_id !== "string" || !Array.isArray(user.email_addresses)) return null;
  const primary = user.email_addresses.find(email => email && email.id === user.primary_email_address_id);
  if (primary?.verification?.status !== "verified" || typeof primary.email_address !== "string") return null;
  const email = primary.email_address.trim().toLowerCase();
  return email && email.length <= 254 && email.includes("@") ? email : null;
}
