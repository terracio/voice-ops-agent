import {
  REALTIME_RUNNER_TRANSPORT,
  type RealtimePlatformTracing,
  type RealtimeRunnerEnv
} from "./realtimeRunnerTypes";

export const DEFAULT_REALTIME_WORKFLOW_NAME =
  "MealPlan VoiceOps Realtime Eval";

export function createRealtimePlatformTracing(options: {
  env: RealtimeRunnerEnv;
  runId: string;
  sessionId: string;
  traceGroupId?: string;
  traceMetadata?: Record<string, unknown>;
  tracingDisabled?: boolean;
  workflowName?: string;
}): RealtimePlatformTracing {
  const disabled = options.tracingDisabled ?? (
    envFlagEnabled(options.env.OPENAI_REALTIME_DISABLE_TRACING) ||
    envFlagEnabled(options.env.OPENAI_AGENTS_DISABLE_TRACING)
  );

  if (disabled) return { enabled: false };

  const workflowName =
    options.workflowName ?? DEFAULT_REALTIME_WORKFLOW_NAME;

  return {
    enabled: true,
    group_id: options.traceGroupId ?? options.runId,
    metadata: compactMetadata({
      run_id: options.runId,
      session_id: options.sessionId,
      transport: REALTIME_RUNNER_TRANSPORT,
      ...options.traceMetadata
    }),
    workflow_name: workflowName
  };
}

function envFlagEnabled(value?: string): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function compactMetadata(
  metadata: Record<string, unknown>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter((entry) => entry[1] !== undefined && entry[1] !== null)
      .map(([key, value]) => [key, metadataValue(value)])
  );
}

function metadataValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value) ?? String(value);
}
