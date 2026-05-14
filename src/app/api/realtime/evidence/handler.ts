import { NextResponse } from "next/server";
import {
  getRealtimeEvidenceSnapshot,
  RealtimeEvidenceCallIdSchema
} from "../../../../evidence";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store"
};

export async function handleRealtimeEvidenceRequest(request: Request) {
  const callId = new URL(request.url).searchParams.get("call_id");
  const parsedCallId = RealtimeEvidenceCallIdSchema.safeParse(callId);

  if (!parsedCallId.success) {
    return evidenceError(
      "missing_or_invalid_call_id",
      "Provide a valid Realtime call_id.",
      400
    );
  }

  const snapshot = getRealtimeEvidenceSnapshot(parsedCallId.data);
  if (!snapshot) {
    return evidenceError(
      "evidence_not_found",
      "No Realtime evidence exists for that call_id.",
      404
    );
  }

  return NextResponse.json(snapshot, { headers: NO_STORE_HEADERS });
}

export async function handleRealtimeEvidenceMutationRequest() {
  return evidenceError(
    "evidence_is_read_only",
    "Realtime evidence can only be read from the browser.",
    405
  );
}

function evidenceError(error: string, message: string, status: number) {
  return NextResponse.json(
    { error, message },
    { headers: NO_STORE_HEADERS, status }
  );
}
