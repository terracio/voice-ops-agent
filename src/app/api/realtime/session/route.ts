import { NextResponse } from "next/server";
import { mintBrowserRealtimeSession } from "../../../../agent/realtimeBrowserSession";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await mintBrowserRealtimeSession();
    return NextResponse.json(session, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create Realtime session.";
    const status = message.includes("OPENAI_API_KEY") ? 500 : 502;

    return NextResponse.json(
      {
        error: "realtime_session_unavailable",
        message
      },
      {
        headers: { "Cache-Control": "no-store" },
        status
      }
    );
  }
}
