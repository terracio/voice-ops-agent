"use client";

import { useEffect, useState } from "react";
import {
  EMPTY_VOICE_CONSOLE_EVIDENCE,
  evidenceErrorState,
  evidenceLoadingState,
  toVoiceConsoleEvidenceState,
  type VoiceConsoleEvidenceState
} from "../evidence/voiceConsoleEvidence";

const DEFAULT_EVIDENCE_ENDPOINT = "/api/realtime/evidence";
const DEFAULT_POLL_INTERVAL_MS = 1000;

export type UseRealtimeEvidenceOptions = {
  callId: string | null;
  enabled: boolean;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
};

export function useRealtimeEvidence({
  callId,
  enabled,
  endpoint = DEFAULT_EVIDENCE_ENDPOINT,
  fetchImpl = fetch,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
}: UseRealtimeEvidenceOptions): VoiceConsoleEvidenceState {
  const [evidence, setEvidence] = useState<VoiceConsoleEvidenceState>(
    EMPTY_VOICE_CONSOLE_EVIDENCE
  );

  useEffect(() => {
    if (!enabled || !callId) {
      setEvidence((current) =>
        current.status === "idle" ? current : EMPTY_VOICE_CONSOLE_EVIDENCE
      );
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function refreshEvidence() {
      setEvidence((current) =>
        current.status === "idle" ? evidenceLoadingState() : current
      );
      try {
        const response = await fetchImpl(`${endpoint}?call_id=${callId}`, {
          cache: "no-store",
          signal: controller.signal
        });
        if (response.status === 404) {
          if (!cancelled) setEvidence(evidenceLoadingState());
          return;
        }
        if (!response.ok) {
          throw new Error(`Evidence unavailable (${response.status})`);
        }
        const payload: unknown = await response.json();
        if (!cancelled) setEvidence(toVoiceConsoleEvidenceState(payload));
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setEvidence(evidenceErrorState(errorMessage(error)));
        }
      }
    }

    void refreshEvidence();
    const interval = window.setInterval(() => {
      void refreshEvidence();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [callId, enabled, endpoint, fetchImpl, pollIntervalMs]);

  return evidence;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load evidence.";
}
