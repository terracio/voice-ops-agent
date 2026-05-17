import { createHash, randomBytes } from "node:crypto";

const SESSION_TTL_MS = 60 * 60 * 1000;

type SessionBinding = {
  callId: string;
  expiresAtMs: number;
  tokenHash: string;
};

const sessionByTokenHash = ((globalThis as typeof globalThis & {
  __mealplanRealtimeEvidenceSessionByTokenHash?: Map<string, SessionBinding>;
}).__mealplanRealtimeEvidenceSessionByTokenHash ??=
  new Map<string, SessionBinding>());

export function resetRealtimeEvidenceSessionStore(): void {
  sessionByTokenHash.clear();
}

export function issueRealtimeEvidenceSession(options: {
  callId: string;
  now?: () => Date;
}): string {
  pruneExpiredSessions(options.now);
  const token = randomBytes(32).toString("base64url");
  sessionByTokenHash.set(hashToken(token), {
    callId: options.callId,
    expiresAtMs: nowMs(options.now) + SESSION_TTL_MS,
    tokenHash: hashToken(token)
  });
  return token;
}

export function validateRealtimeEvidenceSession(options: {
  callId: string;
  now?: () => Date;
  token: string;
}): boolean {
  pruneExpiredSessions(options.now);
  const binding = sessionByTokenHash.get(hashToken(options.token));
  if (!binding) return false;
  if (binding.callId !== options.callId) return false;
  if (binding.expiresAtMs <= nowMs(options.now)) {
    sessionByTokenHash.delete(binding.tokenHash);
    return false;
  }
  return true;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function nowMs(now?: () => Date): number {
  return (now ?? (() => new Date()))().getTime();
}

function pruneExpiredSessions(now?: () => Date): void {
  const currentMs = nowMs(now);
  for (const [tokenHash, binding] of sessionByTokenHash.entries()) {
    if (binding.expiresAtMs <= currentMs) {
      sessionByTokenHash.delete(tokenHash);
    }
  }
}
