import {
  captureServerConfirmation,
  commitChangeSet,
  createChangeSet,
  previewChangeSet
} from "../domain/changeSet";
import * as db from "../domain/db";
import {
  confirmationChallengeForChangeSet,
  confirmationSourceForContext,
  isExplicitConfirmation,
  nonActionableItems,
  ok,
  requiresTranscriptConfirmation,
  requireConfirmationTurnAfterPreview,
  requireOwnedChangeSet,
  requireResolvedCustomer,
  timeFromContext,
  validateChangeSetState,
  validateDateResolutionCustomer
} from "./changeSetToolSupport";
import { defineTool, failedToolResult } from "./types";
import {
  CaptureConfirmationToolInputSchema,
  CaptureConfirmationToolOutputSchema,
  CommitChangeSetToolInputSchema,
  CommitChangeSetToolOutputSchema,
  CreateChangeSetToolInputSchema,
  CreateChangeSetToolOutputSchema,
  PreviewChangeSetToolInputSchema,
  PreviewChangeSetToolOutputSchema,
  ValidateChangeSetToolInputSchema,
  ValidateChangeSetToolOutputSchema
} from "./changeSetToolSchemas";

export const createChangeSetTool = defineTool({
  name: "create_change_set",
  description: "Create a pending ChangeSet for the resolved customer.",
  risk: "preview",
  inputSchema: CreateChangeSetToolInputSchema,
  outputSchema: CreateChangeSetToolOutputSchema,
  metadata: {
    display_name: "Create ChangeSet",
    eval_tags: ["changeset", "preview"],
    timeline: { event_label: "ChangeSet proposed" }
  },
  execute(args, context) {
    const customerId = requireResolvedCustomer(context);
    if (!customerId.ok) return customerId;

    const dateResolutionIssue = validateDateResolutionCustomer(
      args,
      customerId.data
    );
    if (dateResolutionIssue) return dateResolutionIssue;

    return createChangeSet({
      run_id: context.run_id,
      customer_id: customerId.data,
      change_set_id: args.change_set_id,
      operations: args.operations,
      now: timeFromContext(context),
      ttl_minutes: args.ttl_minutes,
      date_resolution: args.date_resolution,
      medical_risk_signals: args.medical_risk_signals
    });
  }
});

export const validateChangeSetTool = defineTool({
  name: "validate_change_set",
  description: "Run current policy validation for a ChangeSet.",
  risk: "preview",
  inputSchema: ValidateChangeSetToolInputSchema,
  outputSchema: ValidateChangeSetToolOutputSchema,
  metadata: {
    display_name: "Validate ChangeSet",
    eval_tags: ["changeset", "policy"],
    timeline: { event_label: "ChangeSet validated" }
  },
  execute(args, context) {
    const customerId = requireResolvedCustomer(context);
    if (!customerId.ok) return customerId;

    const ownership = requireOwnedChangeSet(args.change_set_id, customerId.data);
    if (!ownership.ok) return ownership;

    const state = db.getCustomerState(ownership.data.customer_id);
    if (!state) {
      return failedToolResult({
        code: "CUSTOMER_NOT_FOUND",
        message: `Unknown customer: ${ownership.data.customer_id}`
      });
    }

    return ok(
      validateChangeSetState(ownership.data, state, timeFromContext(context)),
      []
    );
  }
});

export const previewChangeSetTool = defineTool({
  name: "preview_change_set",
  description: "Preview before and after deltas for a pending ChangeSet.",
  risk: "preview",
  inputSchema: PreviewChangeSetToolInputSchema,
  outputSchema: PreviewChangeSetToolOutputSchema,
  metadata: {
    display_name: "Preview ChangeSet",
    eval_tags: ["changeset", "preview"],
    timeline: { event_label: "ChangeSet previewed" }
  },
  execute(args, context) {
    const customerId = requireResolvedCustomer(context);
    if (!customerId.ok) return customerId;

    const ownership = requireOwnedChangeSet(args.change_set_id, customerId.data);
    if (!ownership.ok) return ownership;

    const result = previewChangeSet({
      change_set_id: args.change_set_id,
      now: timeFromContext(context)
    });
    if (!result.ok) return result;

    return ok({
      ...result.data,
      confirmation_challenge: confirmationChallengeForChangeSet(
        ownership.data
      ),
      non_actionable_items: nonActionableItems(ownership.data),
      requires_confirmation: true
    }, result.audit_event_ids);
  }
});

export const captureConfirmationTool = defineTool({
  name: "capture_confirmation",
  description: "Capture server confirmation from the current user turn.",
  risk: "write",
  inputSchema: CaptureConfirmationToolInputSchema,
  outputSchema: CaptureConfirmationToolOutputSchema,
  metadata: {
    display_name: "Capture confirmation",
    eval_tags: ["changeset", "confirmation"],
    timeline: { event_label: "Confirmation captured" }
  },
  execute(args, context) {
    const customerId = requireResolvedCustomer(context);
    if (!customerId.ok) return customerId;

    const ownership = requireOwnedChangeSet(args.change_set_id, customerId.data);
    if (!ownership.ok) return ownership;

    const transcript = context.last_user_message.trim();
    if (
      requiresTranscriptConfirmation(context) &&
      !isExplicitConfirmation(transcript)
    ) {
      return failedToolResult({
        code: "CONFIRMATION_NOT_EXPLICIT",
        message: "Confirmation must come from an explicit current user turn."
      });
    }

    const turnIssue = requireConfirmationTurnAfterPreview(
      ownership.data,
      context
    );
    if (turnIssue) return turnIssue;

    return captureServerConfirmation({
      run_id: context.run_id,
      customer_id: customerId.data,
      change_set_id: args.change_set_id,
      source_user_turn_id: context.current_user_turn_id,
      transcript_excerpt: transcript,
      confirmation_source: confirmationSourceForContext(context),
      confirmation_type: "explicit_yes",
      now: timeFromContext(context)
    });
  }
});

export const commitChangeSetTool = defineTool({
  name: "commit_change_set",
  description: "Commit a previewed ChangeSet with server confirmation.",
  risk: "write",
  inputSchema: CommitChangeSetToolInputSchema,
  outputSchema: CommitChangeSetToolOutputSchema,
  metadata: {
    display_name: "Commit ChangeSet",
    eval_tags: ["changeset", "commit"],
    timeline: { event_label: "ChangeSet commit requested" }
  },
  execute(args, context) {
    const customerId = requireResolvedCustomer(context);
    if (!customerId.ok) return customerId;

    const ownership = requireOwnedChangeSet(args.change_set_id, customerId.data);
    if (!ownership.ok) return ownership;

    return commitChangeSet({
      change_set_id: args.change_set_id,
      confirmation_id: args.confirmation_id,
      now: timeFromContext(context)
    });
  }
});

export const changeSetTools = [
  createChangeSetTool,
  validateChangeSetTool,
  previewChangeSetTool,
  captureConfirmationTool,
  commitChangeSetTool
];
