import { describe, expect, it, beforeEach } from "vitest";
import {
  captureServerConfirmation,
  commitChangeSet,
  createChangeSet,
  previewChangeSet
} from "../src/domain/changeSet";
import * as db from "../src/domain/db";
import { resolveServiceDates } from "../src/domain/dateResolver";
import {
  evaluateMealPlanPolicies,
  getPolicyResult
} from "../src/domain/policies/mealplan.policy";
import { PolicyId, type ChangeSet, type Confirmation } from "../src/domain/schema";
import { materializeCommittedKitchenDeltas } from "../src/domain/sideEffects";

const RUN_ID = "run_locked_service_date";
const CUSTOMER_ID = "cus_002";
const LOCKED_DATE = "2026-05-12";
const CREATED_AT = "2026-05-11T10:00:00Z";
const PREVIEWED_AT = "2026-05-11T10:01:00Z";
const CONFIRMED_AT = "2026-05-11T10:02:00Z";
const COMMITTED_AT = "2026-05-11T10:03:00Z";

beforeEach(() => db.resetDb("omar_locked_cutoff"));

function lockedPauseChangeSet(overrides: Partial<ChangeSet> = {}): ChangeSet {
  return {
    change_set_id: "cs_locked_pause",
    customer_id: CUSTOMER_ID,
    status: "confirmed",
    operations: [{ type: "pause_dates", dates: [LOCKED_DATE], reason: "travel" }],
    expected_state_version: 3,
    created_at: CREATED_AT,
    previewed_at: PREVIEWED_AT,
    confirmed_at: CONFIRMED_AT,
    expires_at: "2026-05-11T10:15:00Z",
    confirmation_id: "conf_locked_pause",
    policy_results: [],
    ...overrides
  };
}

function confirmation(): Confirmation {
  return {
    confirmation_id: "conf_locked_pause",
    run_id: RUN_ID,
    customer_id: CUSTOMER_ID,
    change_set_id: "cs_locked_pause",
    source_user_turn_id: "turn_locked_pause",
    captured_by: "server",
    confirmed_by: "user",
    previewed_at: PREVIEWED_AT,
    confirmed_at: CONFIRMED_AT,
    transcript_excerpt: "Yes, confirm those changes.",
    confirmation_source: "debug_user_turn",
    confirmation_type: "explicit_yes"
  };
}

describe("locked service date policy", () => {
  it("escalates pause or resume writes against kitchen-locked service dates", () => {
    const state = db.getCustomerState(CUSTOMER_ID);
    if (!state) throw new Error("Expected Omar seed state.");

    const evaluation = evaluateMealPlanPolicies({
      stage: "commit",
      now: COMMITTED_AT,
      customer: state.customer,
      serviceDates: state.service_dates,
      changeSet: lockedPauseChangeSet(),
      confirmation: confirmation(),
      identity: { status: "confirmed", matched_customer_count: 1 },
      dateResolution: { ambiguous: false },
      medicalRiskSignals: [],
      preview: { shown: true, customization_deltas: [] }
    });

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.requires_escalation).toBe(true);
    expect(getPolicyResult(evaluation, PolicyId.LOCKED_SERVICE_DATE_FORBIDDEN))
      .toMatchObject({ passed: false, severity: "escalate" });
  });

  it("blocks the ChangeSet lifecycle before commit for locked dates", () => {
    const before = db.getCustomerState(CUSTOMER_ID)?.service_dates;

    const created = createChangeSet({
      run_id: RUN_ID,
      customer_id: CUSTOMER_ID,
      change_set_id: "cs_locked_pause",
      operations: [{ type: "pause_dates", dates: [LOCKED_DATE], reason: "travel" }],
      date_resolution: resolveServiceDates({
        customer_id: CUSTOMER_ID,
        phrase: "Pause tomorrow's meal.",
        requested_days: ["Tuesday"]
      }),
      now: CREATED_AT
    });
    expect(created.ok).toBe(true);

    const preview = previewChangeSet({
      change_set_id: "cs_locked_pause",
      now: PREVIEWED_AT
    });
    expect(preview.ok).toBe(true);
    expect(db.getChangeSet("cs_locked_pause")).toMatchObject({
      status: "previewed"
    });

    expect(captureServerConfirmation({
      run_id: RUN_ID,
      customer_id: CUSTOMER_ID,
      change_set_id: "cs_locked_pause",
      confirmation_id: "conf_locked_pause",
      source_user_turn_id: "turn_locked_pause",
      transcript_excerpt: "Yes, confirm those changes.",
      confirmation_source: "debug_user_turn",
      confirmation_type: "explicit_yes",
      now: CONFIRMED_AT
    }).ok).toBe(true);
    expect(commitChangeSet({
      change_set_id: "cs_locked_pause",
      confirmation_id: "conf_locked_pause",
      now: COMMITTED_AT
    })).toMatchObject({
      ok: false,
      error: { policy_id: PolicyId.LOCKED_SERVICE_DATE_FORBIDDEN }
    });
    expect(db.getCustomerState(CUSTOMER_ID)?.service_dates).toEqual(before);
    expect(db.listKitchenExportDeltas(CUSTOMER_ID)).toEqual([]);
  });

  it("keeps kitchen side-effect materialization from emitting locked dates", () => {
    const committed = db.saveChangeSet(lockedPauseChangeSet({
      status: "committed",
      committed_at: COMMITTED_AT
    }));

    const result = materializeCommittedKitchenDeltas({
      changeSet: committed,
      run_id: RUN_ID,
      now: COMMITTED_AT
    });

    expect(result).toMatchObject({
      audit_event_ids: [],
      created_side_effect_ids: [],
      blocked_attempts: []
    });
    expect(db.listKitchenExportDeltas(CUSTOMER_ID)).toEqual([]);
  });
});
