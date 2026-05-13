import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VoiceConsoleView } from "../src/app/VoiceConsole";
import {
  applyVoiceConsoleAction,
  createInitialVoiceConsoleState
} from "../src/app/voiceConsoleController";

describe("voice console UI shell", () => {
  it("renders the required operational console regions", () => {
    const state = createInitialVoiceConsoleState("10:51:24");
    const html = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        state,
        onAction: () => undefined
      })
    );

    expect(html).toContain("MealPlan VoiceOps");
    expect(html).toContain("Local demo");
    expect(html).toContain("gpt-realtime-2");
    expect(html).toContain("Disconnected");
    expect(html).toContain("Agent");
    expect(html).toContain("Caller");
    expect(html).toContain("Live activity");
    expect(html).toContain("Call ID");
    expect(html).toContain("Control handoff");
    expect(html).toContain("Ephemeral credential (browser)");
    expect(html).toContain("Server-side only");
    expect(html).not.toContain("Transcript");
    expect(html).not.toContain("Audit log");
    expect(html).not.toContain("Before/after diff");
  });

  it("drives visible call state through the mocked controller contract", () => {
    const initial = createInitialVoiceConsoleState("10:51:24");
    const unavailableMute = applyVoiceConsoleAction(initial, {
      type: "toggleMute",
      at: "10:51:30"
    });

    expect(unavailableMute.isMuted).toBe(true);
    expect(unavailableMute.inputLevel).toBe(12);
    expect(unavailableMute.events[0]?.title).toBe("Session not connected");

    const started = applyVoiceConsoleAction(initial, {
      type: "start",
      at: "10:52:00"
    });

    expect(started.sessionStatus).toBe("connected");
    expect(started.agentMode).toBe("listening");
    expect(started.microphonePermission).toBe("granted");
    expect(started.controlHandoff).toBe("attached");
    expect(started.ephemeralCredential).toBe("issued");
    expect(started.callId).toMatch(/^local-call-/);
    expect(started.events[0]?.title).toBe("Session started");

    const muted = applyVoiceConsoleAction(started, {
      type: "toggleMute",
      at: "10:52:05"
    });

    expect(muted.isMuted).toBe(true);
    expect(muted.inputLevel).toBe(0);
    expect(muted.events[0]?.title).toBe("Caller muted");

    const stopped = applyVoiceConsoleAction(muted, {
      type: "stop",
      at: "10:52:30"
    });

    expect(stopped.sessionStatus).toBe("disconnected");
    expect(stopped.agentMode).toBe("idle");
    expect(stopped.controlHandoff).toBe("pending");
    expect(stopped.events[0]?.title).toBe("Session stopped");
  });

  it("keeps browser code out of server-only domain and tool modules", () => {
    const browserFiles = [
      "src/app/page.tsx",
      "src/app/VoiceConsole.tsx",
      "src/app/voiceConsoleController.ts",
      "src/app/voiceConsoleIcons.tsx",
      "src/app/voiceConsoleLabels.ts"
    ];

    for (const file of browserFiles) {
      const contents = readFileSync(file, "utf8");
      expect(contents).not.toMatch(/@\/(?:domain|tools|agent|audit)\b/);
      expect(contents).not.toMatch(/\.\.\/(?:domain|tools|agent|audit)\b/);
    }
  });
});
