import * as db from "../../domain/db";
import type { Confirmation, ToolResult } from "../../domain/schema";
import { createMealPlanToolRegistry, type ToolExecutionContext } from "../../tools";
import { EvalCaseResultSchema, EvalCaseSchema, type EvalCase, type EvalCaseInput, type EvalCaseResult, type EvalMode, type EvalScriptStep } from "./caseSchema";
import { applyTrustedDateResolutionFromToolResult } from "./dateResolution";
export type ScriptedRunnerContext = { run_id: string; mode: EvalMode; run_started_at: string; now: () => string };

type Diagnostic = EvalCaseResult["diagnostics"][number];
type ToolCallRecord = EvalCaseResult["tool_calls"][number];
type TranscriptEntry = EvalCaseResult["transcript"][number];
type ScriptToolCall = Extract<EvalScriptStep, { type: "tool_call" }>;
type ScriptSetup = Extract<EvalScriptStep, { type: "setup" }>;
type ToolExpectation = ScriptToolCall["expect"];
type ContextPatch = { identity_status?: ToolExecutionContext["identity_status"]; resolved_customer_id?: string; reference_time?: string; current_time?: string };
type RunnerState = {
  diagnostics: Diagnostic[]; transcript: TranscriptEntry[]; toolCalls: ToolCallRecord[];
  auditIds: Set<string>; customerIds: Set<string>; changeSetIds: Set<string>; confirmationIds: Set<string>;
  lastChangeSetId?: string; lastConfirmationId?: string;
};
type StepInput = {
  step: EvalScriptStep; stepIndex: number; evalCase: EvalCase;
  registry: ReturnType<typeof createMealPlanToolRegistry>; toolContext: ToolExecutionContext; state: RunnerState;
  tick: (override?: string) => string;
};

export async function runScriptedEvalCase(
  rawCase: EvalCaseInput,
  context: ScriptedRunnerContext
): Promise<EvalCaseResult> {
  const evalCase = EvalCaseSchema.parse(rawCase);
  const tick = createMonotonicClock(context.now);
  const startedAt = tick();
  const sessionId = `script_${evalCase.case_id}`;
  const toolContext: ToolExecutionContext = {
    run_id: context.run_id,
    session_id: sessionId,
    actor: "agent",
    current_user_turn_id: `${evalCase.case_id}_start`,
    last_user_message: "",
    identity_status: "unknown",
    current_time: startedAt,
    reference_time: context.run_started_at
  };
  const state: RunnerState = {
    diagnostics: [],
    transcript: [...evalCase.transcript],
    toolCalls: [],
    auditIds: new Set(),
    customerIds: new Set(),
    changeSetIds: new Set(),
    confirmationIds: new Set()
  };
  const registry = createMealPlanToolRegistry();

  for (const [index, step] of evalCase.script.entries()) {
    await runStep({ step, stepIndex: index, evalCase, registry, toolContext, state, tick });
  }

  collectAuditState(state);
  const finishedAt = tick();
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  const passed = state.diagnostics.every((diagnostic) => diagnostic.severity !== "error");

  return EvalCaseResultSchema.parse({
    case_id: evalCase.case_id,
    title: evalCase.title,
    mode: evalCase.mode,
    seed_id: evalCase.seed_id,
    reward_basis: evalCase.reward_basis,
    evidence_kind: "scripted_operational_safety",
    status: passed ? "passed" : "failed",
    transcript: state.transcript,
    tool_calls: state.toolCalls,
    audit_ids: [...state.auditIds],
    audit_events: db.listAuditEvents(),
    confirmations: confirmationRecords(state),
    side_effects: { payment_followups: db.listPaymentFollowups(), kitchen_deltas: db.listKitchenExportDeltas() },
    final_state: finalState(state),
    scores: [{
      score_id: `${evalCase.case_id}:scripted_runner`,
      category: "operational_safety",
      passed,
      message: passed
        ? "Scripted runner executed registry tools and captured evidence."
        : "Scripted runner observed unexpected failures."
    }],
    diagnostics: state.diagnostics,
    run_metadata: { run_id: context.run_id, session_id: sessionId, started_at: startedAt, finished_at: finishedAt, duration_ms: durationMs },
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: durationMs
  });
}

async function runStep(input: StepInput): Promise<void> {
  const { step } = input;

  switch (step.type) {
    case "user":
    case "correction":
      addUserTurn(input, step.text, step.turn_id, step.context);
      return;
    case "assistant":
    case "debug":
      addTranscript(input, step.type === "assistant" ? "agent" : "system", step.text, step.turn_id);
      return;
    case "setup":
      runSetup(input, step);
      return;
    case "confirmation":
      addUserTurn(input, step.text, step.turn_id, step.context);
      await executeToolCall(input, {
        tool_name: "capture_confirmation",
        args: { change_set_id: step.change_set_id },
        expect: step.expect
      });
      return;
    case "tool_call":
      await executeToolCall(input, step);
  }
}

function addUserTurn(input: StepInput, text: string, turnId?: string, context?: ContextPatch): void {
  const id = turnId ?? `${input.evalCase.case_id}_turn_${input.stepIndex + 1}`;
  const createdAt = input.tick(context?.current_time);

  applyContextPatch(input.toolContext, context);
  input.toolContext.current_time = createdAt;
  input.toolContext.current_user_turn_id = id;
  input.toolContext.last_user_message = text;
  input.state.transcript.push({ turn_id: id, actor: "user", text, created_at: createdAt });
}

function addTranscript(input: StepInput, actor: TranscriptEntry["actor"], text: string, turnId?: string): void {
  input.state.transcript.push({
    turn_id: turnId ?? `${input.evalCase.case_id}_turn_${input.stepIndex + 1}`,
    actor,
    text,
    created_at: input.tick()
  });
}

function runSetup(input: StepInput, step: ScriptSetup): void {
  if (step.action === "set_context") {
    applyContextPatch(input.toolContext, step.context);
    return;
  }

  const customerId = step.customer_id ?? input.toolContext.resolved_customer_id;
  if (!customerId) {
    addDiagnostic(input.state, "error", "SETUP_CUSTOMER_REQUIRED", "Setup requires a customer id.");
    return;
  }

  const customerState = db.getCustomerState(customerId);
  if (!customerState) {
    addDiagnostic(input.state, "error", "SETUP_CUSTOMER_NOT_FOUND", `Unknown customer: ${customerId}`);
    return;
  }

  const nextState = {
    ...customerState,
    customer: {
      ...customerState.customer,
      state_version: customerState.customer.state_version + step.state_version_increment
    }
  };
  db.updateCustomerState(customerId, nextState);
  input.state.customerIds.add(customerId);
  addDiagnostic(input.state, "info", "SETUP_STALE_STATE", "Customer state version was advanced by setup.", {
    customer_id: customerId,
    state_version: nextState.customer.state_version
  });
}

async function executeToolCall(input: StepInput, step: Pick<ScriptToolCall, "tool_call_id" | "tool_name" | "args" | "expect">): Promise<void> {
  const tool = input.registry.get(step.tool_name);
  input.toolContext.current_time = input.tick();
  const args = resolveTokens(step.args ?? {}, input.state);
  const result = await input.registry.execute(step.tool_name, {
    modelArgs: args,
    context: input.toolContext
  });

  input.state.toolCalls.push({
    tool_call_id: step.tool_call_id ?? `${input.evalCase.case_id}_tool_${input.stepIndex + 1}`,
    tool_name: step.tool_name,
    risk: tool?.risk ?? "read",
    status: resultStatus(result),
    input: args,
    output: result.ok ? recordFromUnknown(result.data) : { error: result.error },
    audit_event_ids: result.audit_event_ids
  });
  collectToolOutput(input.state, result);
  applyTrustedDateResolutionFromToolResult({ context: input.toolContext, result, toolName: step.tool_name });
  validateExpectation(input.state, step.tool_name, result, step.expect);
}

function validateExpectation(
  state: RunnerState,
  toolName: string,
  result: ToolResult<unknown>,
  expect?: ToolExpectation
): void {
  const okMismatch = expect?.ok !== undefined && result.ok !== expect.ok;
  const codeMismatch = expect?.error_code !== undefined &&
    (result.ok || result.error.code !== expect.error_code);
  const policyMismatch = expect?.policy_id !== undefined &&
    (result.ok || result.error.policy_id !== expect.policy_id);

  if (okMismatch || codeMismatch || policyMismatch) {
    addDiagnostic(state, "error", "TOOL_EXPECTATION_MISMATCH", `Tool ${toolName} did not match its scripted expectation.`, {
      expected: expect,
      actual: result.ok ? { ok: true } : { ok: false, error: result.error }
    });
    return;
  }
  if (!expect && !result.ok) {
    addDiagnostic(state, "error", "TOOL_UNEXPECTED_FAILURE", `Tool ${toolName} failed unexpectedly.`, {
      error: result.error
    });
  }
}

function collectToolOutput(state: RunnerState, result: ToolResult<unknown>): void {
  result.audit_event_ids.forEach((id) => state.auditIds.add(id));
  if (result.ok && isRecord(result.data)) collectIds(state, result.data);
}

function collectIds(state: RunnerState, value: Record<string, unknown>): void {
  const changeSetId = stringField(value, "change_set_id");
  const confirmationId = stringField(value, "confirmation_id");
  const customerId = stringField(value, "customer_id");

  if (changeSetId) {
    state.changeSetIds.add(changeSetId);
    state.lastChangeSetId = changeSetId;
  }
  if (confirmationId) {
    state.confirmationIds.add(confirmationId);
    state.lastConfirmationId = confirmationId;
  }
  if (customerId) state.customerIds.add(customerId);
}

function collectAuditState(state: RunnerState): void {
  for (const event of db.listAuditEvents()) {
    state.auditIds.add(event.event_id);
    if (event.customer_id) state.customerIds.add(event.customer_id);
    if (event.change_set_id) state.changeSetIds.add(event.change_set_id);
    const confirmationId = stringField(event.details, "confirmation_id");
    if (confirmationId) state.confirmationIds.add(confirmationId);
  }
}
function confirmationRecords(state: RunnerState): EvalCaseResult["confirmations"] {
  return [...state.confirmationIds].flatMap((id) => {
    const confirmation = db.getConfirmation(id);
    return confirmation ? [toConfirmationRecord(confirmation)] : [];
  });
}
function finalState(state: RunnerState): EvalCaseResult["final_state"] {
  const customer_states = [...state.customerIds].flatMap((customerId) => {
    const customerState = db.getCustomerState(customerId);
    return customerState ? [{ customer_id: customerId, ...customerState }] : [];
  });
  const firstCustomerState = customer_states[0];
  return {
    customer_states,
    change_sets: [...state.changeSetIds].flatMap((id) => {
      const changeSet = db.getChangeSet(id);
      return changeSet ? [changeSet] : [];
    }),
    confirmations: [...state.confirmationIds].flatMap((id) => {
      const confirmation = db.getConfirmation(id);
      return confirmation ? [confirmation] : [];
    }),
    customer: firstCustomerState?.customer,
    plan: firstCustomerState?.plan,
    service_dates: firstCustomerState?.service_dates ?? [],
    payment_followups: db.listPaymentFollowups(),
    kitchen_deltas: db.listKitchenExportDeltas()
  };
}
function toConfirmationRecord(confirmation: Confirmation): EvalCaseResult["confirmations"][number] {
  return {
    confirmation_id: confirmation.confirmation_id,
    change_set_id: confirmation.change_set_id,
    customer_id: confirmation.customer_id,
    source_user_turn_id: confirmation.source_user_turn_id,
    captured_by: confirmation.captured_by,
    confirmed_by: confirmation.confirmed_by,
    previewed_at: confirmation.previewed_at,
    confirmed_at: confirmation.confirmed_at,
    confirmation_type: confirmation.confirmation_type,
    confirmation_intent: confirmation.confirmation_intent
  };
}
function applyContextPatch(context: ToolExecutionContext, patch?: ContextPatch): void {
  if (!patch) return;
  if (patch.identity_status) context.identity_status = patch.identity_status;
  if (patch.resolved_customer_id) context.resolved_customer_id = patch.resolved_customer_id;
  if (patch.reference_time) context.reference_time = patch.reference_time;
  if (patch.current_time) context.current_time = patch.current_time;
}
function resolveTokens(value: Record<string, unknown>, state: RunnerState): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveValue(entry, state)]));
}

function resolveValue(value: unknown, state: RunnerState): unknown {
  if (value === "$last_confirmation_id") return state.lastConfirmationId ?? "";
  if (value === "$last_change_set_id") return state.lastChangeSetId ?? "";
  if (Array.isArray(value)) return value.map((entry) => resolveValue(entry, state));
  return isRecord(value) ? resolveTokens(value, state) : value;
}

function resultStatus(result: ToolResult<unknown>): ToolCallRecord["status"] {
  return result.ok ? "ok" : result.error.policy_id ? "blocked" : "error";
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : { value };
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addDiagnostic(state: RunnerState, severity: Diagnostic["severity"], code: string, message: string, evidence?: Record<string, unknown>): void {
  state.diagnostics.push({ severity, code, message, evidence });
}

function createMonotonicClock(now: () => string): (override?: string) => string {
  let nextMs = Date.parse(now());

  return (override?: string) => {
    if (override) {
      nextMs = Math.max(nextMs, Date.parse(override) + 1000);
      return override;
    }

    const value = new Date(nextMs).toISOString();
    nextMs += 1000;
    return value;
  };
}
