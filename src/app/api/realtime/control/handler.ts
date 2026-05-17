import { NextResponse } from "next/server";
import {
  RealtimeServerControlError,
  startRealtimeServerControl,
  type RealtimeSidebandSocketFactory
} from "../../../../realtime/server/serverControl";
import { requireRealtimeControlToken } from "../controlAuth";

export type RealtimeControlRouteOptions = {
  socketFactory?: RealtimeSidebandSocketFactory;
};

export async function handleRealtimeControlRequest(
  request: Request,
  options: RealtimeControlRouteOptions = {}
) {
  const authFailure = requireRealtimeControlToken(request);
  if (authFailure) return authFailure;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return realtimeControlError("Invalid JSON request body.", 400);
  }

  try {
    const callId = typeof body === "object" && body !== null
      ? (body as { call_id?: unknown }).call_id
      : undefined;
    const sidebandUrl = typeof body === "object" && body !== null
      ? (body as { sideband_url?: unknown }).sideband_url
      : undefined;
    const control = startRealtimeServerControl({
      callId,
      sidebandUrl,
      socketFactory: options.socketFactory
    });
    return NextResponse.json(control, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof RealtimeServerControlError) {
      return realtimeControlError(error.message, error.status);
    }
    return realtimeControlError("Unable to attach Realtime server control.", 502);
  }
}

function realtimeControlError(message: string, status: number) {
  return NextResponse.json(
    {
      error: "realtime_control_unavailable",
      message
    },
    {
      headers: { "Cache-Control": "no-store" },
      status
    }
  );
}
