export const OPENAI_REALTIME_SIDEBAND_URL =
  "wss://api.openai.com/v1/realtime";

export function resolveRealtimeSidebandUrl(options: {
  callId: string;
  sidebandUrl?: unknown;
}): string {
  if (options.sidebandUrl === undefined) {
    return defaultRealtimeSidebandUrl(options.callId);
  }
  if (typeof options.sidebandUrl !== "string") {
    throw new Error("Invalid Realtime sideband_url.");
  }

  const parsed = new URL(options.sidebandUrl);
  if (
    parsed.protocol !== "wss:" ||
    parsed.pathname !== "/v1/realtime" ||
    parsed.searchParams.get("call_id") !== options.callId ||
    !isAllowedOpenAiHost(parsed.hostname)
  ) {
    throw new Error("Invalid Realtime sideband_url.");
  }
  return parsed.toString();
}

export function buildRealtimeSidebandUrlFromLocation(options: {
  callId: string;
  location: string;
}): string {
  const parsed = new URL(options.location, "https://api.openai.com");
  return `wss://${parsed.host}/v1/realtime?call_id=${encodeURIComponent(options.callId)}`;
}

function defaultRealtimeSidebandUrl(callId: string): string {
  return `${OPENAI_REALTIME_SIDEBAND_URL}?call_id=${encodeURIComponent(callId)}`;
}

function isAllowedOpenAiHost(hostname: string): boolean {
  return hostname === "api.openai.com" || hostname.endsWith(".api.openai.com");
}
