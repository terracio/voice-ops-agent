import { handleRealtimeCallRequest } from "./handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRealtimeCallRequest(request);
}
