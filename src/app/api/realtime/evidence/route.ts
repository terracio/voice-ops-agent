import {
  handleRealtimeEvidenceMutationRequest,
  handleRealtimeEvidenceRequest
} from "./handler";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRealtimeEvidenceRequest(request);
}

export async function POST() {
  return handleRealtimeEvidenceMutationRequest();
}

export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
