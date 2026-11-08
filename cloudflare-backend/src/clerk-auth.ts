import { createClerkClient } from "@clerk/backend";

export interface ClerkBindings {
  APP_ORIGIN: string;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_ISSUER?: string;
  CLERK_JWT_KEY?: string;
}

// Configuration and public verification-key caches only; never cache a user,
// incoming request, bearer token or authorization result across requests.
const clients = new WeakMap<ClerkBindings, ReturnType<typeof createClerkClient>>();

export async function readClerkIdentity(request: Request, env: ClerkBindings) {
  if (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY || !env.CLERK_ISSUER) throw new Error("Optional Clerk accounts are not configured");
  if (!/^Bearer [A-Za-z0-9_.-]{1,16384}$/.test(request.headers.get("authorization") ?? "")) return null;
  let client = clients.get(env);
  if (!client) {
    client = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.CLERK_PUBLISHABLE_KEY,
      telemetry: { disabled: true } });
    clients.set(env, client);
  }
  const state = await client.authenticateRequest(request, {
    authorizedParties: [new URL(env.APP_ORIGIN).origin], issuer: env.CLERK_ISSUER,
    acceptsToken: "session_token", jwtKey: env.CLERK_JWT_KEY,
  });
  if (!state.isAuthenticated) return null;
  const auth = state.toAuth();
  if (!auth.userId || !auth.sessionId) return null;
  return { subject: auth.userId, sessionId: auth.sessionId, client };
}

export async function readVerifiedClerkEmail(identity: NonNullable<Awaited<ReturnType<typeof readClerkIdentity>>>) {
  const user = await identity.client.users.getUser(identity.subject);
  if (user.id !== identity.subject) return null;
  const primary = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
  if (primary?.verification?.status !== "verified") return null;
  return primary.emailAddress.trim().toLowerCase();
}
