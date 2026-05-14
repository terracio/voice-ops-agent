import { describe, expect, it } from "vitest";
import { isExplicitConfirmation } from "../src/tools/changeSetToolSupport";

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
});
