import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const CONTROL_TOKEN_ENV = "MEALPLAN_REALTIME_CONTROL_TOKEN";
const CONTROL_AUTH_HEADER = "authorization";

export function requireRealtimeControlToken(request: Request): Response | null {
  const configuredToken = process.env[CONTROL_TOKEN_ENV]?.trim();
  if (!configuredToken) {
    return controlAuthError(
      "realtime_control_auth_misconfigured",
      `Missing ${CONTROL_TOKEN_ENV} for realtime control route authentication.`,
      500
    );
  }

  const providedToken = bearerToken(request.headers.get(CONTROL_AUTH_HEADER));
  if (!providedToken || !constantTimeEqual(providedToken, configuredToken)) {
    return controlAuthError(
      "realtime_control_unauthorized",
      "Missing or invalid realtime control token.",
      401
    );
  }

  return null;
}

function bearerToken(header: string | null): string | undefined {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function controlAuthError(error: string, message: string, status: number) {
  return NextResponse.json(
    { error, message },
    { headers: { "Cache-Control": "no-store" }, status }
  );
}
