import { describe, expect, it } from "vitest";
import { scaffoldStatus, ScaffoldStatusSchema } from "../src/domain/schema";

describe("scaffold", () => {
  it("validates the placeholder domain status", () => {
    const status = scaffoldStatus();

    expect(ScaffoldStatusSchema.parse(status)).toEqual({
      project: "mealplan-voiceops",
      ready: true
    });
  });
});
