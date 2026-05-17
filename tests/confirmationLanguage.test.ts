import { describe, expect, it } from "vitest";
import { classifyConfirmationIntent } from "../src/domain/confirmationIntent";
import {
  confirmationSourceForContext,
  isExplicitConfirmation
} from "../src/tools/changeSetToolSupport";

describe("confirmation language", () => {
  it("accepts exact challenge matches despite punctuation and case", () => {
    expect(classifyConfirmationIntent({
      challenge: "Confirm pause delivery.",
      transcript: "confirm pause delivery"
    })).toMatchObject({
      intent: "confirm",
      method: "exact_challenge",
      matched_signals: ["exact_challenge"]
    });
    expect(classifyConfirmationIntent({
      challenge: "Confirm pause delivery.",
      transcript: "CONFIRM PAUSE DELIVERY!"
    }).intent).toBe("confirm");
  });

  it("accepts short safe English affirmatives", () => {
    [
      "yes",
      "correct",
      "confirmed",
      "go ahead",
      "confirm",
      "Yes, confirm those changes."
    ].forEach((transcript) => {
      expect(classifyConfirmationIntent({ transcript })).toMatchObject({
        intent: "confirm",
        method: "deterministic"
      });
      expect(isExplicitConfirmation(transcript)).toBe(true);
    });
  });

  it("rejects mixed confirm and deny or correction phrases", () => {
    [
      "confirm no",
      "confirm do not skip it",
      "Confirm don't pause it.",
      "confirm nevermind",
      "confirm stop",
      "yes, but not Monday",
      "go ahead but do not change it",
      "cancel that",
      "actually change it to Tuesday"
    ].forEach((transcript) => {
      expect(classifyConfirmationIntent({ transcript }).intent)
        .not.toBe("confirm");
      expect(isExplicitConfirmation(transcript)).toBe(false);
    });
  });

  it("treats uncertainty, non-English, mixed language, and long text as unclear", () => {
    [
      "wait",
      "Confirm what date was that?",
      "sí, confirmo",
      "yes, por favor",
      "Yes, I reviewed all of the delivery details and I want you to proceed with the change we discussed."
    ].forEach((transcript) => {
      expect(classifyConfirmationIntent({ transcript })).toMatchObject({
        intent: "unclear",
        method: "deterministic"
      });
    });
  });

  it("treats browser Realtime call IDs as realtime user turns", () => {
    expect(confirmationSourceForContext({
      actor: "agent",
      current_user_turn_id: "turn",
      identity_status: "confirmed",
      last_user_message: "Confirm pause delivery.",
      run_id: "browser_rtc_123",
      session_id: "rtc_123",
      resolved_customer_id: "cus_001"
    })).toBe("realtime_user_turn");
  });
});
