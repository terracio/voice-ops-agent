import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  OOB_TRANSCRIPTION_INSTRUCTIONS,
  OOB_TRANSCRIPTION_INSTRUCTIONS_SOURCE_PATH
} from "../src/realtime/config/outOfBandTranscription";
import { runRealtimeAgentSmoke } from "../src/realtime/runner/runner";
import {
  REALTIME_RUNNER_TRANSPORT,
  type RealtimeRunnerResult,
  type RealtimeSessionLike
} from "../src/realtime/runner/types";
import { loadRealtimeEvalCase } from "../src/evals/realtime/caseLoader";
import { writeRealtimeReports } from "../src/evals/realtime/reporting";
import type { RealtimeCrawlScoring } from "../src/evals/realtime/scorerTypes";

class FakeOobSession implements RealtimeSessionLike {
  readonly close = vi.fn();
  readonly connect = vi.fn(async () => undefined);
  readonly sendAudio = vi.fn((_audio: ArrayBuffer, options?: { commit?: boolean }) => {
    if (!options?.commit) return;
    this.emit("transport_event", {
      item_id: "item_user_audio",
      type: "input_audio_buffer.committed"
    });
    this.emit("transport_event", {
      item: {
        content: [{ type: "input_audio" }],
        id: "item_user_audio",
        role: "user",
        status: "completed"
      },
      type: "conversation.item.added"
    });
  });
  readonly sendMessage = vi.fn(() => undefined);
  readonly transport = {
    requestResponse: vi.fn((response?: Record<string, unknown>) => {
      if (response?.metadata &&
        (response.metadata as Record<string, unknown>).purpose ===
          "oob_realtime_transcription") {
        this.emitOobResponse();
        return;
      }
      this.emit("transport_event", { type: "response.done" });
    })
  };

  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();

  on(eventName: string, handler: (...args: unknown[]) => void): void {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }

  private emit(eventName: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(eventName) ?? []) handler(...args);
  }

  private emitOobResponse(): void {
    this.emit("transport_event", {
      response: { id: "resp_oob" },
      type: "response.created"
    });
    this.emit("transport_event", {
      delta: "customer id c u s underscore zero zero one",
      response_id: "resp_oob",
      type: "response.output_text.delta"
    });
    this.emit("transport_event", {
      response_id: "resp_oob",
      text: "customer id c u s underscore zero zero one",
      type: "response.output_text.done"
    });
    this.emit("transport_event", {
      response: { id: "resp_oob" },
      type: "response.done"
    });
  }
}

describe("Realtime out-of-band transcription diagnostics", () => {
  it("loads the strict transcription prompt from markdown", () => {
    expect(OOB_TRANSCRIPTION_INSTRUCTIONS_SOURCE_PATH).toMatch(
      /src\/realtime\/config\/outOfBandTranscription\.md$/
    );
    expect(OOB_TRANSCRIPTION_INSTRUCTIONS).toContain(
      "Transcribe the latest referenced user audio item"
    );
    expect(OOB_TRANSCRIPTION_INSTRUCTIONS).toContain(
      "Do not use MealPlan context"
    );
    expect(OOB_TRANSCRIPTION_INSTRUCTIONS).toContain(
      "If only fragments are clear, output only those fragments."
    );
  });

  it("captures a text-only diagnostic transcript outside the main turn", async () => {
    const fakeSession = new FakeOobSession();
    const result = await runRealtimeAgentSmoke({
      apiKey: "sk-test",
      audio: new ArrayBuffer(800),
      outOfBandTranscription: true,
      runId: "run_oob",
      sessionFactory: () => fakeSession
    });

    expect(result.status).toBe("completed");
    expect(result.out_of_band_transcription).toEqual({
      response_id: "resp_oob",
      status: "completed",
      transcript: "customer id c u s underscore zero zero one"
    });
    expect(fakeSession.transport.requestResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: "none",
        instructions: expect.stringContaining("latest referenced user audio item"),
        input: [{ id: "item_user_audio", type: "item_reference" }],
        output_modalities: ["text"],
        tool_choice: "none",
        tools: []
      })
    );
  });

  it("writes out-of-band realtime transcription diagnostics when present", () => {
    const reportDir = join(
      "reports",
      "realtime",
      "walk",
      "customer_identity_lookup",
      "unit_oob_report_trace"
    );
    rmSync(reportDir, { force: true, recursive: true });

    const paths = writeRealtimeReports({
      caseId: "customer_identity_lookup",
      env_file_status: "loaded",
      preparedInput: {
        audio_metadata: { source: "test" },
        input_mode: "audio",
        input_text: "Please look up Maya."
      },
      realtimeCase: loadRealtimeEvalCase({ caseId: "customer_identity_lookup", stage: "walk" }),
      result: {
        ...createResult(),
        run_id: "unit_oob_report_trace",
        session_id: "unit_oob_report_trace_session",
        out_of_band_transcription: {
          response_id: "resp_oob",
          status: "completed",
          transcript: "customer id c u s underscore zero zero one"
        }
      },
      scoring: createScoring(),
      stage: "walk"
    });

    const report = JSON.parse(readFileSync(paths.json_path, "utf8"));
    expect(report.out_of_band_transcription).toMatchObject({
      response_id: "resp_oob",
      status: "completed",
      transcript: "customer id c u s underscore zero zero one"
    });
    expect(readFileSync(paths.markdown_path, "utf8")).toContain(
      "customer id c u s underscore zero zero one"
    );

    rmSync(reportDir, { force: true, recursive: true });
  });
});

function createResult(): RealtimeRunnerResult {
  return {
    audit_events: [],
    audit_ids: [],
    event_counts: {},
    final_state: {
      customer_states: [],
      kitchen_deltas: [],
      payment_followups: []
    },
    model: "gpt-realtime-2",
    platform_tracing: { enabled: true },
    run_id: "unit_report_trace",
    session_id: "unit_report_trace_session",
    status: "completed",
    tool_calls: [],
    trace: [],
    transcript_fragments: [],
    transport: REALTIME_RUNNER_TRANSPORT
  };
}

function createScoring(): RealtimeCrawlScoring {
  return {
    diagnostics: [],
    score_failures: 0,
    scores: [],
    status: "passed"
  };
}
