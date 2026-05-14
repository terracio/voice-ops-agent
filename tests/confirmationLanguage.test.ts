import { describe, expect, it } from "vitest";
import {
  confirmationSourceForContext,
  isExplicitConfirmation,
  matchesConfirmationChallenge
} from "../src/tools/changeSetToolSupport";

describe("confirmation language", () => {
  it("accepts explicit action confirmations from voice turns", () => {
    expect(isExplicitConfirmation("Confirm pause for May 18th, 2026."))
      .toBe(true);
    expect(isExplicitConfirmation("Yes, confirm those changes.")).toBe(true);
    expect(isExplicitConfirmation("Go ahead.")).toBe(true);
  });

  it("rejects corrections and questions as confirmations", () => {
    expect(isExplicitConfirmation("Actually change it to May 19th."))
      .toBe(false);
    expect(isExplicitConfirmation("Confirm what date was that?")).toBe(false);
  });

  it("matches server challenge phrases without punctuation sensitivity", () => {
    expect(matchesConfirmationChallenge(
      "confirm payment follow up",
      "Confirm payment follow-up."
    )).toBe(true);
    expect(matchesConfirmationChallenge(
      "yes confirm it",
      "Confirm payment follow-up."
    )).toBe(false);
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
