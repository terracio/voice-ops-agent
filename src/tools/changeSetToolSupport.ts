import * as db from "../domain/db";
import {
  applyChangeOperations,
  buildChangeSetPreview,
  confirmationIssue,
  evaluateChangeSetPolicies,
  metadataFor,
  uniquePolicyIds
} from "../domain/changeSetPreview";
import {
  classifyConfirmationIntent,
  confirmationChallengePhraseForChangeSet
} from "../domain/confirmationIntent";
import type { ResolveServiceDatesOutput } from "../domain/dateResolver";
import { PolicyId, type ChangeOperation, type ChangeSet, type ToolResult } from "../domain/schema";
import type { ToolExecutionContext } from "./context";
import { failedToolResult } from "./types";
import {
  ValidateChangeSetToolOutputSchema,
  type CreateChangeSetToolInput,
  type PreviewChangeSetToolOutput,
  type ValidateChangeSetToolOutput
} from "./changeSetToolSchemas";

export function validateChangeSetState(
  changeSet: ChangeSet,
  state: db.CustomerState,
  now: string
): ValidateChangeSetToolOutput {
  const metadata = metadataFor(changeSet.change_set_id);
  const preview = buildChangeSetPreview(
    changeSet,
    state,
    changeSet.previewed_at ?? now
  );
  const previewEvaluation = evaluateChangeSetPolicies(changeSet, state, {
    stage: "preview",
    now,
    date_resolution: metadata.date_resolution,
    medical_risk_signals: metadata.medical_risk_signals,
    preview: { shown: true, customization_deltas: preview.customization_deltas }
  });
  const confirmation = changeSet.confirmation_id
    ? db.getConfirmation(changeSet.confirmation_id)
    : undefined;
  const commitPreview = changeSet.previewed_at
    ? buildChangeSetPreview(changeSet, state, changeSet.previewed_at)
    : undefined;
  const commitEvaluation = evaluateChangeSetPolicies(changeSet, state, {
    stage: "commit",
    now,
    confirmation,
    proposed_customer: applyChangeOperations(state, changeSet.operations).customer,
    date_resolution: metadata.date_resolution,
    medical_risk_signals: metadata.medical_risk_signals,
    preview: {
      shown: Boolean(commitPreview),
      customization_deltas: commitPreview?.customization_deltas ?? []
    }
  });
  const issue = confirmationIssue(
    changeSet,
    confirmation,
    changeSet.confirmation_id ?? "",
    metadata
  );
  const blockingIds = uniquePolicyIds([
    ...commitEvaluation.blocking_policy_ids,
    ...(issue ? [PolicyId.MISSING_CONFIRMATION] : [])
  ]);

  return ValidateChangeSetToolOutputSchema.parse({
    change_set_id: changeSet.change_set_id,
    status: changeSet.status,
    allowed_to_preview:
      changeSet.status !== "committed" &&
      changeSet.status !== "expired" &&
      previewEvaluation.allowed,
    allowed_to_commit: commitEvaluation.allowed && !issue,
    requires_confirmation: Boolean(issue),
    requires_escalation:
      previewEvaluation.requires_escalation ||
      commitEvaluation.requires_escalation,
    policy_results: commitEvaluation.results,
    blocking_policy_ids: blockingIds,
    escalation_policy_ids: uniquePolicyIds([
      ...previewEvaluation.escalation_policy_ids,
      ...commitEvaluation.escalation_policy_ids
    ])
  });
}

export function requireResolvedCustomer(
  context: ToolExecutionContext
): ToolResult<string> {
  if (context.identity_status !== "confirmed" || !context.resolved_customer_id) {
    return failedToolResult({
      code: "TOOL_IDENTITY_UNRESOLVED",
      message: "ChangeSet tools require a confirmed resolved customer.",
      policy_id: PolicyId.IDENTITY_UNCERTAIN
    });
  }

  return ok(context.resolved_customer_id, []);
}

export function requireOwnedChangeSet(
  changeSetId: string,
  customerId: string
): ToolResult<ChangeSet> {
  const changeSet = db.getChangeSet(changeSetId);
  if (!changeSet) {
    return failedToolResult({
      code: "CHANGE_SET_NOT_FOUND",
      message: `Unknown ChangeSet: ${changeSetId}`
    });
  }
  if (changeSet.customer_id !== customerId) {
    return failedToolResult({
      code: "TOOL_CHANGE_SET_CUSTOMER_MISMATCH",
      message: "ChangeSet does not belong to the resolved customer.",
      policy_id: PolicyId.IDENTITY_UNCERTAIN
    });
  }

  return ok(changeSet, []);
}

export function trustedDateResolutionForChangeSet(
  args: CreateChangeSetToolInput,
  context: ToolExecutionContext,
  customerId: string
): ToolResult<ResolveServiceDatesOutput | undefined> {
  if (args.date_resolution && args.date_resolution.customer_id !== customerId) {
    return failedToolResult({
      code: "DATE_RESOLUTION_CUSTOMER_MISMATCH",
      message: "Date resolution does not belong to the resolved customer.",
      policy_id: PolicyId.IDENTITY_UNCERTAIN
    });
  }

  const dates = dateOperationDates(args.operations);
  if (dates.length === 0) return ok(undefined, []);

  const trustedResolution = (context.trusted_date_resolutions ?? []).find(
    (resolution) => dateResolutionCoversOperationDates(resolution, dates, customerId)
  );
  if (trustedResolution) return ok(trustedResolution, []);

  return failedToolResult({
    code: "DATE_RESOLUTION_REQUIRED",
    message: "Date-changing ChangeSets require server-generated date resolution evidence.",
    policy_id: PolicyId.AMBIGUOUS_DATE
  });
}

function dateOperationDates(operations: ChangeOperation[]): string[] {
  return [...new Set(operations.flatMap((operation) =>
    operation.type === "pause_dates" || operation.type === "resume_dates"
      ? operation.dates
      : []
  ))];
}

function dateResolutionCoversOperationDates(
  resolution: ResolveServiceDatesOutput,
  dates: string[],
  customerId: string
): boolean {
  if (resolution.customer_id !== customerId || resolution.ambiguous) {
    return false;
  }
  const actionableDates = new Set(resolution.actionable_service_dates);
  return dates.every((date) => actionableDates.has(date));
}

export function nonActionableItems(changeSet: ChangeSet): string[] {
  const state = db.getCustomerState(changeSet.customer_id);
  if (!state) return [];

  const dates = new Map(
    state.service_dates.map((serviceDate) => [
      serviceDate.service_date,
      serviceDate.status
    ])
  );
  const items = new Set<string>();

  changeSet.operations.forEach((operation) => {
    if (operation.type !== "pause_dates" && operation.type !== "resume_dates") {
      return;
    }
    operation.dates.forEach((date) => {
      const status = dates.get(date);
      if (!status) items.add(`No scheduled service date exists for ${date}.`);
      if (operation.type === "pause_dates" && status === "paused") {
        items.add(`Service date ${date} is already paused.`);
      }
      if (operation.type === "resume_dates" && status === "active") {
        items.add(`Service date ${date} is already active.`);
      }
    });
  });

  return [...items];
}

export function isExplicitConfirmation(message: string): boolean {
  return classifyConfirmationIntent({ transcript: message }).intent === "confirm";
}

export function confirmationChallengeForChangeSet(
  changeSet: ChangeSet
): PreviewChangeSetToolOutput["confirmation_challenge"] {
  const phrase = confirmationChallengePhraseForChangeSet(changeSet);
  return {
    phrase,
    instruction: `Ask the caller to say exactly: "${phrase}"`
  };
}

export function requireConfirmationTurnAfterPreview(
  changeSet: ChangeSet,
  context: ToolExecutionContext
): ToolResult<never> | undefined {
  const previewedAt = changeSet.previewed_at;
  const confirmationTurnAt = context.last_user_turn_at ?? context.current_time;
  if (
    !previewedAt ||
    !confirmationTurnAt ||
    new Date(confirmationTurnAt).getTime() <= new Date(previewedAt).getTime()
  ) {
    return failedToolResult({
      code: "CONFIRMATION_NOT_EXPLICIT",
      message: "Confirmation must come from a user turn after preview."
    });
  }

  return undefined;
}

export function confirmationSourceForContext(
  context: ToolExecutionContext
): "scripted_user_turn" | "debug_user_turn" | "realtime_user_turn" | "model_eval_user_turn" {
  if (context.session_id.includes("eval")) return "model_eval_user_turn";
  if (context.session_id.includes("realtime") || context.session_id.startsWith("rtc_")) {
    return "realtime_user_turn";
  }
  if (context.session_id.includes("script")) return "scripted_user_turn";
  return "debug_user_turn";
}

export function timeFromContext(context: ToolExecutionContext): string {
  return context.current_time ?? new Date().toISOString();
}

export function ok<T>(data: T, audit_event_ids: string[]): ToolResult<T> {
  return { ok: true, data, audit_event_ids };
}
