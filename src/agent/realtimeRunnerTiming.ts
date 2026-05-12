import type { RealtimeRunnerStatus } from "./realtimeRunnerTypes";

export function waitForRealtimeEventSettle(
  status: RealtimeRunnerStatus,
  settleMs = 0
): Promise<void> {
  if (status !== "completed" || settleMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, settleMs));
}
