import { beforeEach, describe, expect, it } from "vitest";
import {
  createPreviewAuditEvent,
  createReadAuditEvent
} from "../src/audit";
import {
  appendAuditEvent,
  findCustomers,
  getAuditEventsByChangeSetId,
  getAuditEventsByRunAndChangeSetId,
  getAuditEventsByRunId,
  getChangeSet,
  getConfirmation,
  getCustomer,
  getCustomerState,
  getKitchenExportDelta,
  getPaymentFollowup,
  listAuditEvents,
  listKitchenExportDeltas,
  listPaymentFollowups,
  resetDb,
  saveChangeSet,
  saveConfirmation,
  saveKitchenExportDelta,
  savePaymentFollowup,
  updateCustomerState
} from "../src/domain/db";
import type {
  ChangeSet,
  Confirmation,
  KitchenExportDelta,
  PaymentFollowup
} from "../src/domain/schema";

beforeEach(() => {
  resetDb();
});

function draftChangeSet(): ChangeSet {
  return {
    change_set_id: "cs_001",
    customer_id: "cus_001",
    status: "previewed",
    operations: [
      {
        type: "pause_dates",
        dates: ["2026-05-18"],
        reason: "travel"
      }
    ],
    expected_state_version: 12,
    created_at: "2026-05-11T10:00:00Z",
    previewed_at: "2026-05-11T10:01:00Z",
    expires_at: "2026-05-11T10:15:00Z",
    policy_results: []
  };
}

function confirmation(): Confirmation {
  return {
    confirmation_id: "conf_001",
    run_id: "run_001",
    customer_id: "cus_001",
    change_set_id: "cs_001",
    source_user_turn_id: "turn_002",
    captured_by: "server",
    confirmed_by: "user",
    previewed_at: "2026-05-11T10:01:00Z",
    confirmed_at: "2026-05-11T10:02:00Z",
    transcript_excerpt: "Yes, confirm that.",
    confirmation_source: "debug_user_turn",
    confirmation_type: "explicit_yes"
  };
}

function paymentFollowup(
  followupId: string,
  idempotencyKey: string
): PaymentFollowup {
  return {
    followup_id: followupId,
    customer_id: "cus_001",
    idempotency_key: idempotencyKey,
    reason: "failed_payment",
    status: "open",
    created_at: "2026-05-11T10:03:00Z",
    source_change_set_id: "cs_001"
  };
}

function kitchenDelta(deltaId: string, idempotencyKey: string): KitchenExportDelta {
  return {
    delta_id: deltaId,
    customer_id: "cus_001",
    change_set_id: "cs_001",
    idempotency_key: idempotencyKey,
    affected_dates: ["2026-05-18"],
    summary: "Pause Monday delivery.",
    created_at: "2026-05-11T10:04:00Z"
  };
}

describe("resettable mock DB", () => {
  it("resets to requested seed data and isolates returned records", () => {
    resetDb("identity_uncertain");

    expect(findCustomers({ phone: "+971500000099" }).map((c) => c.customer_id))
      .toEqual(["cus_004", "cus_005"]);

    const customer = getCustomer("cus_004");
    expect(customer).toBeDefined();
    customer?.allergies.push("shellfish");

    expect(getCustomer("cus_004")?.allergies).toEqual(["peanuts"]);

    saveChangeSet(draftChangeSet());
    appendAuditEvent(
      createReadAuditEvent({
        run_id: "run_001",
        actor: "agent",
        event_type: "read",
        customer_id: "cus_004",
        tool_name: "get_customer",
        details: {
          resource_type: "customer",
          resource_id: "cus_004"
        }
      })
    );

    resetDb();

    expect(getCustomer("cus_004")).toBeUndefined();
    expect(getChangeSet("cs_001")).toBeUndefined();
    expect(listAuditEvents()).toEqual([]);
    expect(getCustomer("cus_001")?.state_version).toBe(12);
  });

  it("reads and updates customer state while persisting state version", () => {
    const currentState = getCustomerState("cus_001");
    expect(currentState).toBeDefined();
    if (!currentState) {
      throw new Error("Expected Maya customer state to be seeded.");
    }

    expect(currentState?.plan.delivery_days).toEqual([
      "Monday",
      "Wednesday",
      "Friday"
    ]);

    const updatedState = {
      ...currentState,
      customer: {
        ...currentState.customer,
        state_version: currentState.customer.state_version + 1,
        customizations: {
          ...currentState.customer.customizations,
          spice_level: "spicy" as const
        }
      },
      service_dates: currentState.service_dates.map((serviceDate) =>
        serviceDate.service_date === "2026-05-18"
          ? { ...serviceDate, status: "paused" as const }
          : serviceDate
      )
    };

    const savedState = updateCustomerState("cus_001", updatedState);

    expect(savedState.customer.state_version).toBe(13);
    expect(getCustomer("cus_001")?.state_version).toBe(13);
    expect(getCustomerState("cus_001")?.customer.customizations.spice_level)
      .toBe("spicy");
    expect(getCustomerState("cus_001")?.service_dates[0]?.status).toBe(
      "paused"
    );

    resetDb();

    expect(getCustomer("cus_001")?.state_version).toBe(12);
    expect(getCustomerState("cus_001")?.service_dates[0]?.status).toBe(
      "active"
    );
  });

  it("stores ChangeSets and confirmations separately from customer state", () => {
    const savedChangeSet = saveChangeSet(draftChangeSet());
    const savedConfirmation = saveConfirmation(confirmation());

    expect(savedChangeSet.change_set_id).toBe("cs_001");
    expect(getChangeSet("cs_001")?.operations).toEqual(
      draftChangeSet().operations
    );
    expect(savedConfirmation.captured_by).toBe("server");
    expect(getConfirmation("conf_001")?.change_set_id).toBe("cs_001");
    expect(getCustomer("cus_001")?.state_version).toBe(12);
  });

  it("stores side-effect records idempotently by idempotency key", () => {
    const savedFollowup = savePaymentFollowup(
      paymentFollowup("pf_001", "cs_001:create_payment_followup:0")
    );
    const duplicateFollowup = savePaymentFollowup(
      paymentFollowup("pf_duplicate", "cs_001:create_payment_followup:0")
    );
    const savedDelta = saveKitchenExportDelta(
      kitchenDelta("kd_001", "cs_001:kitchen_delta:cus_001")
    );
    const duplicateDelta = saveKitchenExportDelta(
      kitchenDelta("kd_duplicate", "cs_001:kitchen_delta:cus_001")
    );

    expect(savedFollowup.followup_id).toBe("pf_001");
    expect(duplicateFollowup.followup_id).toBe("pf_001");
    expect(getPaymentFollowup("pf_001")?.idempotency_key).toBe(
      "cs_001:create_payment_followup:0"
    );
    expect(listPaymentFollowups("cus_001")).toHaveLength(1);
    expect(savedDelta.delta_id).toBe("kd_001");
    expect(duplicateDelta.delta_id).toBe("kd_001");
    expect(getKitchenExportDelta("kd_001")?.affected_dates).toEqual([
      "2026-05-18"
    ]);
    expect(listKitchenExportDeltas("cus_001")).toHaveLength(1);
  });

  it("appends audit events and exposes run and ChangeSet query helpers", () => {
    const readEvent = appendAuditEvent(
      createReadAuditEvent({
        run_id: "run_001",
        actor: "agent",
        event_type: "read",
        customer_id: "cus_001",
        tool_name: "get_customer",
        details: {
          resource_type: "customer",
          resource_id: "cus_001"
        }
      })
    );
    const previewEvent = appendAuditEvent(
      createPreviewAuditEvent({
        run_id: "run_001",
        actor: "system",
        event_type: "preview",
        customer_id: "cus_001",
        tool_name: "preview_change_set",
        change_set_id: "cs_001",
        details: {
          operation_count: 1,
          delta_previewed: true
        }
      })
    );

    expect(listAuditEvents().map((event) => event.event_id)).toEqual([
      readEvent.event_id,
      previewEvent.event_id
    ]);
    expect(getAuditEventsByRunId("run_001")).toHaveLength(2);
    expect(getAuditEventsByChangeSetId("cs_001")).toHaveLength(1);
    expect(getAuditEventsByRunAndChangeSetId("run_001", "cs_001")[0])
      .toMatchObject({ event_type: "preview" });
  });
});
