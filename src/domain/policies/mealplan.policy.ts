import {
  POLICY_IDS,
  PolicyId,
  PolicyResultSchema,
  type ChangeOperation,
  type ChangeSet,
  type Confirmation,
  type Customer,
  type PolicyIdValue,
  type PolicyResult
} from "../schema";

export type UnsafeStructuredOperation = {
  type: string;
  [key: string]: unknown;
};

export type PolicyOperation = ChangeOperation | UnsafeStructuredOperation;

export type PolicyChangeSet = Omit<ChangeSet, "operations"> & { operations: PolicyOperation[] };

export type CustomizationPreviewDelta = {
  operation_index: number;
  field: "spice_level" | "dislikes" | "protein_preferences";
  before: unknown;
  after: unknown;
};

export type MedicalRiskSignal = { kind: "allergy" | "medical"; source: string };

export type MealPlanPolicyInput = {
  stage: "preview" | "commit" | "side_effect";
  now: string;
  customer?: Customer;
  proposedCustomer?: Customer;
  changeSet?: PolicyChangeSet;
  confirmation?: Confirmation;
  identity?: {
    status: "confirmed" | "uncertain";
    matched_customer_count?: number;
  };
  dateResolution?: {
    ambiguous: boolean;
    reason?: string;
  };
  medicalRiskSignals?: MedicalRiskSignal[];
  preview?: {
    shown: boolean;
    customization_deltas: CustomizationPreviewDelta[];
  };
  sideEffect?: {
    type: "kitchen_delta" | "payment_followup";
    internal: boolean;
    sourceChangeSet?: Pick<PolicyChangeSet, "change_set_id" | "customer_id" | "status">;
  };
};

export type MealPlanPolicyEvaluation = {
  allowed: boolean; requires_escalation: boolean; results: PolicyResult[];
  blocking_policy_ids: PolicyIdValue[]; escalation_policy_ids: PolicyIdValue[];
};
type PolicyCheck = (input: MealPlanPolicyInput) => Omit<PolicyResult, "policy_id">;

const policyChecks: Record<PolicyIdValue, PolicyCheck> = {
  [PolicyId.IDENTITY_UNCERTAIN]: identityPolicy,
  [PolicyId.AMBIGUOUS_DATE]: ambiguousDatePolicy,
  [PolicyId.MISSING_PREVIEW]: missingPreviewPolicy,
  [PolicyId.MISSING_CONFIRMATION]: missingConfirmationPolicy,
  [PolicyId.STALE_STATE_VERSION]: staleStatePolicy,
  [PolicyId.EXPIRED_CHANGESET]: expiredChangeSetPolicy,
  [PolicyId.ALLERGY_MUTATION_FORBIDDEN]: allergyMutationPolicy,
  [PolicyId.MEDICAL_RISK_ESCALATION_REQUIRED]: medicalRiskPolicy,
  [PolicyId.PAYMENT_SETTLEMENT_FORBIDDEN]: paymentSettlementPolicy,
  [PolicyId.KITCHEN_DELTA_BEFORE_COMMIT_FORBIDDEN]: kitchenDeltaPolicy,
  [PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA]: customizationDeltaPolicy
};

export function evaluateMealPlanPolicies(
  input: MealPlanPolicyInput
): MealPlanPolicyEvaluation {
  const results = POLICY_IDS.map((policyId) => makeResult(policyId, policyChecks[policyId](input)));
  const failingResults = results.filter((result) => !result.passed);
  const blockingResults = failingResults.filter(
    (result) => result.severity === "block" || result.severity === "escalate"
  );
  const escalationResults = failingResults.filter((result) => result.severity === "escalate");

  return {
    allowed: failingResults.length === 0,
    requires_escalation: escalationResults.length > 0,
    results,
    blocking_policy_ids: blockingResults.map((result) => result.policy_id),
    escalation_policy_ids: escalationResults.map((result) => result.policy_id)
  };
}

export function getPolicyResult(evaluation: MealPlanPolicyEvaluation, policyId: PolicyIdValue) {
  const result = evaluation.results.find((candidate) => candidate.policy_id === policyId);
  if (!result) {
    throw new Error(`Missing policy result for ${policyId}.`);
  }
  return result;
}

function identityPolicy(input: MealPlanPolicyInput) {
  if (!isMutatingStage(input)) {
    return pass("Identity policy does not apply to read-only work.");
  }

  const uncertainCustomer = input.customer?.identity_confidence === "uncertain";
  const uncertainInput = input.identity?.status === "uncertain";
  const duplicateMatch = (input.identity?.matched_customer_count ?? 1) !== 1;

  if (uncertainCustomer || uncertainInput || duplicateMatch) {
    return fail("escalate", "Customer identity is uncertain; writes require clarification.");
  }

  return pass("Customer identity is confirmed.");
}

function ambiguousDatePolicy(input: MealPlanPolicyInput) {
  if (!isMutatingStage(input)) {
    return pass("Ambiguous date policy does not apply to read-only work.");
  }

  if (input.dateResolution?.ambiguous) {
    return fail("block", "Date resolution is ambiguous; exact service dates are required.");
  }

  return pass("Date inputs are exact service dates or not date-related.");
}

function missingPreviewPolicy(input: MealPlanPolicyInput) {
  if (input.stage !== "commit") {
    return pass("Preview is only required before commit.");
  }

  if (
    !input.changeSet?.previewed_at ||
    input.preview?.shown === false ||
    input.changeSet.status === "draft"
  ) {
    return fail("block", "Commit requires a previewed ChangeSet.");
  }

  return pass("ChangeSet was previewed before commit.");
}

function missingConfirmationPolicy(input: MealPlanPolicyInput) {
  if (input.stage !== "commit") {
    return pass("Confirmation is only required before commit.");
  }

  const changeSet = input.changeSet;
  const confirmation = input.confirmation;

  if (!changeSet || !confirmation || !changeSet.confirmation_id) {
    return fail("block", "Commit requires server-captured explicit confirmation.");
  }

  const matchesChangeSet =
    confirmation.confirmation_id === changeSet.confirmation_id &&
    confirmation.change_set_id === changeSet.change_set_id &&
    confirmation.customer_id === changeSet.customer_id;
  const followsPreview =
    Boolean(changeSet.previewed_at) &&
    confirmation.previewed_at === changeSet.previewed_at &&
    Date.parse(confirmation.confirmed_at) > Date.parse(changeSet.previewed_at as string);

  if (!matchesChangeSet || !followsPreview) {
    return fail("block", "Confirmation must match the previewed ChangeSet.");
  }

  return pass("Server-captured confirmation matches the ChangeSet.");
}

function staleStatePolicy(input: MealPlanPolicyInput) {
  if (input.stage !== "commit" || !input.customer || !input.changeSet) {
    return pass("State version check only applies to commit.");
  }

  if (input.customer.state_version !== input.changeSet.expected_state_version) {
    return fail("block", "Current state version differs from the previewed ChangeSet.");
  }

  return pass("State version matches the previewed ChangeSet.");
}

function expiredChangeSetPolicy(input: MealPlanPolicyInput) {
  if (input.stage !== "commit" || !input.changeSet) {
    return pass("Expiry check only applies to commit.");
  }

  if (
    input.changeSet.status === "expired" ||
    Date.parse(input.now) > Date.parse(input.changeSet.expires_at)
  ) {
    return fail("block", "Expired ChangeSets cannot be committed.");
  }

  return pass("ChangeSet is not expired.");
}

function allergyMutationPolicy(input: MealPlanPolicyInput) {
  if (operations(input).some(isAllergyMutation) || allergiesChanged(input)) {
    return fail("escalate", "Allergy records cannot be modified by the agent.");
  }

  return pass("No allergy mutation was requested.");
}

function medicalRiskPolicy(input: MealPlanPolicyInput) {
  if ((input.medicalRiskSignals ?? []).length > 0) {
    return fail("escalate", "Medical or allergy-risk intent requires escalation.");
  }

  return pass("No medical or allergy-risk signal was present.");
}

function paymentSettlementPolicy(input: MealPlanPolicyInput) {
  if (operations(input).some(isPaymentSettlement) || paymentStatusChanged(input)) {
    return fail("block", "Payment settlement actions are forbidden.");
  }

  return pass("No payment settlement action was requested.");
}

function kitchenDeltaPolicy(input: MealPlanPolicyInput) {
  const attemptedKitchenOperation = operations(input).some(isKitchenDeltaOperation);
  const sideEffect = input.sideEffect;
  const invalidSideEffect =
    sideEffect?.type === "kitchen_delta" &&
    (!sideEffect.internal || sideEffect.sourceChangeSet?.status !== "committed");

  if (attemptedKitchenOperation || invalidSideEffect) {
    return fail("block", "Kitchen deltas are internal-only after commit.");
  }

  return pass("No kitchen delta is being created before commit.");
}

function customizationDeltaPolicy(input: MealPlanPolicyInput) {
  const customizationOps: {
    operation: PolicyOperation & { field: string };
    index: number;
  }[] = [];
  operations(input).forEach((operation, index) => {
    if (isCustomizationUpdate(operation) && operation.field !== "allergies") {
      customizationOps.push({ operation, index });
    }
  });

  const missingDelta = customizationOps.some(({ operation, index }) => {
    if (!hasKey(operation, "previous_value") || input.preview?.shown !== true) {
      return true;
    }

    return !input.preview.customization_deltas.some(
      (delta) =>
        delta.operation_index === index &&
        delta.field === String(operation.field) &&
        hasKey(delta, "before") &&
        hasKey(delta, "after")
    );
  });

  if (missingDelta) {
    return fail("block", "Customization updates require previewed before/after deltas.");
  }

  return pass("Customization updates include before/after deltas.");
}

function makeResult(
  policy_id: PolicyIdValue,
  result: Omit<PolicyResult, "policy_id">
): PolicyResult {
  return PolicyResultSchema.parse({ policy_id, ...result });
}

function pass(message: string): Omit<PolicyResult, "policy_id"> {
  return { severity: "info", passed: true, message };
}
function fail(severity: "block" | "escalate", message: string): Omit<PolicyResult, "policy_id"> {
  return { severity, passed: false, message };
}
function operations(input: MealPlanPolicyInput): PolicyOperation[] {
  return input.changeSet?.operations ?? [];
}
function isMutatingStage(input: MealPlanPolicyInput): boolean {
  return input.stage === "commit" || input.stage === "side_effect";
}

function isCustomizationUpdate(
  operation: PolicyOperation
): operation is PolicyOperation & { field: string } {
  return operation.type === "update_customization" && typeof operation.field === "string";
}

function isAllergyMutation(operation: PolicyOperation): boolean {
  return (
    operation.type === "update_allergies" ||
    operation.type === "remove_allergy" ||
    operation.type === "add_allergy" ||
    (isCustomizationUpdate(operation) && operation.field === "allergies")
  );
}

function isPaymentSettlement(operation: PolicyOperation): boolean {
  if (
    operation.type === "mark_payment_paid" ||
    operation.type === "charge_card" ||
    operation.type === "settle_payment"
  ) {
    return true;
  }

  return operation.type === "update_payment_status" || fieldValue(operation) === "payment_status";
}

function isKitchenDeltaOperation(operation: PolicyOperation): boolean {
  return (
    operation.type === "create_kitchen_export_delta" ||
    operation.type === "materialize_kitchen_delta"
  );
}

function allergiesChanged(input: MealPlanPolicyInput): boolean {
  return Boolean(input.customer && input.proposedCustomer &&
    input.customer.allergies.join("\u0000") !== input.proposedCustomer.allergies.join("\u0000"));
}

function paymentStatusChanged(input: MealPlanPolicyInput): boolean {
  return Boolean(
    input.customer &&
      input.proposedCustomer &&
      input.customer.payment_status !== input.proposedCustomer.payment_status
  );
}

function hasKey(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function fieldValue(operation: PolicyOperation): unknown {
  return hasKey(operation, "field") ? (operation as { field: unknown }).field : undefined;
}
