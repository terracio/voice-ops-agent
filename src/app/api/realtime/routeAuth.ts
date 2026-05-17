import { NextResponse } from "next/server";

export function requireRealtimeRouteToken(request: Request): Response | null {
  const configuredToken = process.env.MEALPLAN_REALTIME_ROUTE_TOKEN?.trim();
  if (!configuredToken) {
    return NextResponse.json(
      {
        error: "realtime_route_misconfigured",
        message: "Missing MEALPLAN_REALTIME_ROUTE_TOKEN for realtime route authentication."
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 500
      }
    );
  }

  const providedToken = request.headers.get("x-mealplan-realtime-token")?.trim();
  if (providedToken !== configuredToken) {
    return NextResponse.json(
      {
        error: "realtime_route_unauthorized",
        message: "Missing or invalid realtime route token."
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 401
      }
    );
  }

  return null;
}
