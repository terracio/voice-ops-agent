import { beforeEach, describe, expect, it } from "vitest";
import { getCustomer, resetDb } from "../src/domain/db";
import {
  ChangeOperationSchema,
  POLICY_IDS,
  PolicyId,
  type Confirmation,
  type Customer,
  type PolicyIdValue
} from "../src/domain/schema";
import {
  evaluateMealPlanPolicies,
  getPolicyResult,
  type MealPlanPolicyInput,
  type PolicyChangeSet,
  type PolicyOperation
} from "../src/domain/policies/mealplan.policy";

const NOW = "2026-05-11T10:04:00Z";
const PREVIEWED_AT = "2026-05-11T10:01:00Z";
const CONFIRMED_AT = "2026-05-11T10:02:00Z";

beforeEach(() => {
  resetDb();
});

function maya(overrides: Partial<Customer> = {}): Customer {
  const customer = getCustomer("cus_001");

  if (!customer) {
    throw new Error("Expected Maya to be seeded.");
  }

  return { ...customer, ...overrides };
}

function unsafe(type: string, extra: Record<string, unknown> = {}): PolicyOperation {
  return { type, ...extra };
}

function changeSet(
  overrides: Partial<PolicyChangeSet> = {}
): PolicyChangeSet {
  return {
    change_set_id: "cs_001",
    customer_id: "cus_001",
    status: "confirmed",
    operations: [{ type: "pause_dates", dates: ["2026-05-18"], reason: "travel" }],
    expected_state_version: 12,
    created_at: "2026-05-11T10:00:00Z",
    previewed_at: PREVIEWED_AT,
    confirmed_at: CONFIRMED_AT,
    expires_at: "2026-05-11T10:15:00Z",
    confirmation_id: "conf_001",
    policy_results: [],
    ...overrides
  };
}

function confirmation(
  overrides: Partial<Confirmation> = {}
): Confirmation {
  return {
    confirmation_id: "conf_001",
    run_id: "run_001",
    customer_id: "cus_001",
    change_set_id: "cs_001",
    source_user_turn_id: "turn_002",
    captured_by: "server",
    confirmed_by: "user",
    previewed_at: PREVIEWED_AT,
    confirmed_at: CONFIRMED_AT,
    transcript_excerpt: "Yes, confirm.",
    confirmation_source: "debug_user_turn",
    confirmation_type: "explicit_yes",
    ...overrides
  };
}

function validInput(
  overrides: Partial<MealPlanPolicyInput> = {}
): MealPlanPolicyInput {
  return {
    stage: "commit",
    now: NOW,
    customer: maya(),
    changeSet: changeSet(),
    confirmation: confirmation(),
    identity: { status: "confirmed", matched_customer_count: 1 },
    dateResolution: { ambiguous: false },
    medicalRiskSignals: [],
    preview: { shown: true, customization_deltas: [] },
    ...overrides
  };
}

function policy(
  input: MealPlanPolicyInput,
  policyId: PolicyIdValue
) {
  return getPolicyResult(evaluateMealPlanPolicies(input), policyId);
}

const spiceOperation: PolicyOperation = {
  type: "update_customization",
  field: "spice_level",
  previous_value: "normal",
  next_value: "spicy"
};

const previewWithSpiceDelta = {
  shown: true,
  customization_deltas: [
    {
      operation_index: 0,
      field: "spice_level" as const,
      before: "normal",
      after: "spicy"
    }
  ]
};

describe("MealPlan policy engine", () => {
  it("returns all stable policy IDs and allows a valid confirmed commit", () => {
    const evaluation = evaluateMealPlanPolicies(validInput());

    expect(evaluation.allowed).toBe(true);
    expect(evaluation.requires_escalation).toBe(false);
    expect(evaluation.results.map((result) => result.policy_id)).toEqual(
      POLICY_IDS
    );
    expect(evaluation.results.map((result) => result.policy_id)).not.toContain(
      "P004"
    );
    expect(evaluation.results.every((result) => result.passed)).toBe(true);
  });

  const cases: {
    id: PolicyIdValue;
    blocked: MealPlanPolicyInput;
    allowed: MealPlanPolicyInput;
    escalates?: boolean;
  }[] = [
    {
      id: PolicyId.IDENTITY_UNCERTAIN,
      blocked: validInput({
        customer: maya({ identity_confidence: "uncertain" }),
        identity: { status: "uncertain", matched_customer_count: 2 }
      }),
      allowed: validInput()
    },
    {
      id: PolicyId.AMBIGUOUS_DATE,
      blocked: validInput({ dateResolution: { ambiguous: true } }),
      allowed: validInput({ dateResolution: { ambiguous: false } })
    },
    {
      id: PolicyId.MISSING_PREVIEW,
      blocked: validInput({
        changeSet: changeSet({ status: "draft", previewed_at: undefined })
      }),
      allowed: validInput()
    },
    {
      id: PolicyId.MISSING_CONFIRMATION,
      blocked: validInput({ confirmation: undefined }),
      allowed: validInput()
    },
    {
      id: PolicyId.STALE_STATE_VERSION,
      blocked: validInput({ customer: maya({ state_version: 13 }) }),
      allowed: validInput()
    },
    {
      id: PolicyId.EXPIRED_CHANGESET,
      blocked: validInput({ now: "2026-05-11T10:16:00Z" }),
      allowed: validInput()
    },
    {
      id: PolicyId.ALLERGY_MUTATION_FORBIDDEN,
      blocked: validInput({
        changeSet: changeSet({
          operations: [
            unsafe("update_customization", {
              field: "allergies",
              previous_value: ["peanuts"],
              next_value: []
            })
          ]
        })
      }),
      allowed: validInput(),
      escalates: true
    },
    {
      id: PolicyId.MEDICAL_RISK_ESCALATION_REQUIRED,
      blocked: validInput({
        medicalRiskSignals: [
          { kind: "allergy", source: "structured_intent" }
        ]
      }),
      allowed: validInput(),
      escalates: true
    },
    {
      id: PolicyId.PAYMENT_SETTLEMENT_FORBIDDEN,
      blocked: validInput({
        changeSet: changeSet({ operations: [unsafe("mark_payment_paid")] })
      }),
      allowed: validInput({
        changeSet: changeSet({
          operations: [{ type: "create_payment_followup", reason: "failed_payment" }]
        })
      })
    },
    {
      id: PolicyId.KITCHEN_DELTA_BEFORE_COMMIT_FORBIDDEN,
      blocked: validInput({
        stage: "side_effect",
        confirmation: undefined,
        sideEffect: {
          type: "kitchen_delta",
          internal: true,
          sourceChangeSet: {
            change_set_id: "cs_001",
            customer_id: "cus_001",
            status: "previewed"
          }
        }
      }),
      allowed: validInput({
        stage: "side_effect",
        confirmation: undefined,
        sideEffect: {
          type: "kitchen_delta",
          internal: true,
          sourceChangeSet: {
            change_set_id: "cs_001",
            customer_id: "cus_001",
            status: "committed"
          }
        }
      })
    },
    {
      id: PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA,
      blocked: validInput({
        changeSet: changeSet({ operations: [spiceOperation] }),
        preview: undefined
      }),
      allowed: validInput({
        changeSet: changeSet({ operations: [spiceOperation] }),
        preview: previewWithSpiceDelta
      })
    }
  ];

  for (const item of cases) {
    it(`blocks and allows ${item.id}`, () => {
      const blocked = evaluateMealPlanPolicies(item.blocked);
      const blockedResult = getPolicyResult(blocked, item.id);
      const allowedResult = policy(item.allowed, item.id);

      expect(blockedResult.passed).toBe(false);
      expect(blocked.blocking_policy_ids).toContain(item.id);
      expect(allowedResult.passed).toBe(true);

      if (item.escalates) {
        expect(blocked.requires_escalation).toBe(true);
        expect(blocked.escalation_policy_ids).toContain(item.id);
      }
    });
  }

  it("escalates medical allergy risk without mutating allergy state", () => {
    const before = getCustomer("cus_001")?.allergies;
    const evaluation = evaluateMealPlanPolicies(
      validInput({
        medicalRiskSignals: [
          { kind: "allergy", source: "structured_intent" }
        ]
      })
    );

    expect(getPolicyResult(evaluation, PolicyId.MEDICAL_RISK_ESCALATION_REQUIRED))
      .toMatchObject({ passed: false, severity: "escalate" });
    expect(getPolicyResult(evaluation, PolicyId.ALLERGY_MUTATION_FORBIDDEN).passed)
      .toBe(true);
    expect(getCustomer("cus_001")?.allergies).toEqual(before);
  });

  it("blocks allergy and payment state changes detected from proposed state", () => {
    const allergyEvaluation = evaluateMealPlanPolicies(
      validInput({
        proposedCustomer: maya({ allergies: [] })
      })
    );
    const paymentEvaluation = evaluateMealPlanPolicies(
      validInput({
        proposedCustomer: maya({ payment_status: "current" })
      })
    );

    expect(getPolicyResult(allergyEvaluation, PolicyId.ALLERGY_MUTATION_FORBIDDEN))
      .toMatchObject({ passed: false, severity: "escalate" });
    expect(getPolicyResult(paymentEvaluation, PolicyId.PAYMENT_SETTLEMENT_FORBIDDEN))
      .toMatchObject({ passed: false, severity: "block" });
  });

  it("keeps payment settlement and kitchen delta out of valid ChangeSet operations", () => {
    expect(() => ChangeOperationSchema.parse({ type: "mark_payment_paid" }))
      .toThrow();
    expect(() =>
      ChangeOperationSchema.parse({
        type: "create_kitchen_export_delta",
        affected_dates: ["2026-05-18"]
      })
    ).toThrow();

    expect(
      policy(
        validInput({
          changeSet: changeSet({ operations: [unsafe("create_kitchen_export_delta")] })
        }),
        PolicyId.KITCHEN_DELTA_BEFORE_COMMIT_FORBIDDEN
      ).passed
    ).toBe(false);
  });
});
