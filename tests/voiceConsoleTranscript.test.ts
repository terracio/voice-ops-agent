import { describe, expect, it } from "vitest";
import {
  buildVoiceTranscriptState,
  normalizeTranscriptTurns
} from "../src/features/voice-console/voiceConsoleTranscript";
import type { EvidenceTranscriptItem } from "../src/features/voice-console/voiceConsoleEvidence";

function transcript(
  overrides: Partial<EvidenceTranscriptItem>
): EvidenceTranscriptItem {
  return {
    actor: "user",
    at: "09:00:00",
    id: "tr_default",
    kind: "realtime_transcript",
    text: "",
    turnId: "turn_default",
    ...overrides
  };
}

describe("voice console transcript normalization", () => {
  it("uses completed cumulative text instead of duplicate delta rows", () => {
    const turns = normalizeTranscriptTurns([
      transcript({ id: "tr_1", text: "Please", turnId: "turn_user_1" }),
      transcript({ id: "tr_2", text: "Please pause", turnId: "turn_user_1" }),
      transcript({
        id: "tr_3",
        text: "Please pause Monday delivery.",
        turnId: "turn_user_1"
      })
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      actor: "user",
      fragmentCount: 3,
      text: "Please pause Monday delivery.",
      turnId: "turn_user_1"
    });
  });

  it("concatenates partial-only assistant fragments", () => {
    const turns = normalizeTranscriptTurns([
      transcript({
        actor: "assistant",
        id: "tr_agent_1",
        text: "I can check",
        turnId: "turn_agent_1"
      }),
      transcript({
        actor: "assistant",
        id: "tr_agent_2",
        text: " that now.",
        turnId: "turn_agent_1"
      })
    ]);

    expect(turns).toEqual([
      expect.objectContaining({
        actor: "assistant",
        fragmentCount: 2,
        text: "I can check that now."
      })
    ]);
  });

  it("deduplicates equivalent assistant transcript event families", () => {
    const turns = normalizeTranscriptTurns([
      transcript({
        actor: "assistant",
        id: "tr_agent_text_done",
        text: "I’ll check that customer record now",
        turnId: "response_1"
      }),
      transcript({
        actor: "assistant",
        id: "tr_agent_audio_done",
        text: "I'll check that customer record now.",
        turnId: "response_1"
      })
    ]);

    expect(turns).toEqual([
      expect.objectContaining({
        actor: "assistant",
        fragmentCount: 2,
        text: "I'll check that customer record now."
      })
    ]);
  });

  it("prefers corrected final assistant text over a rough interim transcript", () => {
    const turns = normalizeTranscriptTurns([
      transcript({
        actor: "assistant",
        id: "tr_agent_interim",
        text: "Hi you’re through to Meal Plan support What can help with today",
        turnId: "response_2"
      }),
      transcript({
        actor: "assistant",
        id: "tr_agent_final",
        text: "Hi, you’re through to MealPlan support. What can I help you with today?",
        turnId: "response_2"
      })
    ]);

    expect(turns).toEqual([
      expect.objectContaining({
        actor: "assistant",
        fragmentCount: 2,
        text: "Hi, you’re through to MealPlan support. What can I help you with today?"
      })
    ]);
  });

  it("handles corrected assistant text with an inserted word", () => {
    const turns = normalizeTranscriptTurns([
      transcript({
        actor: "assistant",
        id: "tr_agent_interim",
        text: "Good morning How can help you with your Meal Plan today",
        turnId: "response_3"
      }),
      transcript({
        actor: "assistant",
        id: "tr_agent_final",
        text: "Good morning! How can I help you with your MealPlan today?",
        turnId: "response_3"
      })
    ]);

    expect(turns).toEqual([
      expect.objectContaining({
        actor: "assistant",
        fragmentCount: 2,
        text: "Good morning! How can I help you with your MealPlan today?"
      })
    ]);
  });

  it("keeps separate user and assistant turns for live panel state", () => {
    const state = buildVoiceTranscriptState([
      transcript({
        id: "tr_user_1",
        text: "Can you make next week spicy?",
        turnId: "turn_user_1"
      }),
      transcript({
        actor: "assistant",
        id: "tr_agent_1",
        text: "I will verify the account first.",
        turnId: "turn_agent_1"
      })
    ]);

    expect(state.currentCallerText).toBe("Can you make next week spicy?");
    expect(state.currentAgentText).toBe("I will verify the account first.");
    expect(state.history).toHaveLength(2);
  });

  it("returns empty live text when there is no transcript evidence", () => {
    expect(buildVoiceTranscriptState([])).toEqual({
      currentAgentText: "",
      currentCallerText: "",
      history: []
    });
  });
});
