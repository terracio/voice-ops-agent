import { describe, expect, it } from "vitest";
import { classifyIdentityConfirmationIntent } from "../src/domain/identityConfirmationIntent";

function intent(transcript: string, candidateName = "Maya") {
  return classifyIdentityConfirmationIntent({ candidateName, transcript });
}

describe("identity confirmation intent", () => {
  it.each([
    "Yes, that's me.",
    "I confirm I am Maya.",
    "This is Maya.",
    "confirm am Maya I confirm I am Maya."
  ])("classifies explicit self-confirmation: %s", (transcript) => {
    expect(intent(transcript)).toMatchObject({
      intent: "confirm_self",
      rejected_signals: []
    });
  });

  it.each([
    "I am Maya's husband.",
    "This is Maya's friend.",
    "I am Maya's assistant calling for her.",
    "I am Maya's caregiver."
  ])("rejects third-party or possessive claims: %s", (transcript) => {
    expect(intent(transcript)).toMatchObject({
      intent: "third_party"
    });
  });

  it.each([
    "No, I am not Maya.",
    "Actually this is Lina.",
    "Maybe that's Maya."
  ])("rejects denial or correction: %s", (transcript) => {
    expect(intent(transcript).intent).not.toBe("confirm_self");
  });

  it("does not accept candidate-name substrings with trailing text", () => {
    expect(intent("I am Maya and I need to talk about someone else's account."))
      .toMatchObject({ intent: "deny" });
  });
});
