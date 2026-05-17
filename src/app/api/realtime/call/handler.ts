import { NextResponse } from "next/server";
import { requireRealtimeRouteToken } from "../routeAuth";
import { exchangeBrowserRealtimeSdpOffer } from "../../../../realtime/server/browserSession";
import {
  startRealtimeServerControl,
  type RealtimeSidebandSocketFactory
} from "../../../../realtime/server/serverControl";

export type RealtimeCallRouteOptions = {
  fetchImpl?: Parameters<typeof exchangeBrowserRealtimeSdpOffer>[0]["fetchImpl"];
  socketFactory?: RealtimeSidebandSocketFactory;
};

export async function handleRealtimeCallRequest(
  request: Request,
  options: RealtimeCallRouteOptions = {}
) {
  const authFailure = requireRealtimeRouteToken(request);
  if (authFailure) {
    return authFailure;
  }

  try {
    const offerSdp = await request.text();
    const exchange = await exchangeBrowserRealtimeSdpOffer({
      fetchImpl: options.fetchImpl,
      offerSdp
    });

    startRealtimeServerControl({
      callId: exchange.call_id,
      sidebandUrl: exchange.sideband_url,
      socketFactory: options.socketFactory
    });

    return new Response(exchange.answer_sdp, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/sdp",
        "Location": exchange.location,
        "X-Realtime-Call-Id": exchange.call_id
      }
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create Realtime call.";
    const status = message.includes("OPENAI_API_KEY") ? 500 : 502;

    return NextResponse.json(
      {
        error: "realtime_call_unavailable",
        message
      },
      {
        headers: { "Cache-Control": "no-store" },
        status
      }
    );
  }
}
