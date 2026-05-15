import { describe, expect, it } from "vitest";
import {
  buildRealtimeSidebandUrlFromLocation,
  resolveRealtimeSidebandUrl
} from "../src/realtime/server/sidebandUrl";

describe("Realtime sideband URL handoff", () => {
  it("derives a sideband URL from the SDP Location host", () => {
    expect(buildRealtimeSidebandUrlFromLocation({
      callId: "rtc_test_123456",
      location: "https://eu.api.openai.com/v1/realtime/calls/rtc_test_123456"
    })).toBe("wss://eu.api.openai.com/v1/realtime?call_id=rtc_test_123456");
  });

  it("accepts only matching OpenAI Realtime sideband URLs", () => {
    expect(resolveRealtimeSidebandUrl({
      callId: "rtc_test_123456",
      sidebandUrl: "wss://eu.api.openai.com/v1/realtime?call_id=rtc_test_123456"
    })).toBe("wss://eu.api.openai.com/v1/realtime?call_id=rtc_test_123456");

    expect(() => resolveRealtimeSidebandUrl({
      callId: "rtc_test_123456",
      sidebandUrl: "wss://example.com/v1/realtime?call_id=rtc_test_123456"
    })).toThrow("Invalid Realtime sideband_url");
  });
});
