import { describe, expect, it } from "vitest";
import {
  CustomerSchema,
  KitchenExportDeltaSchema,
  PaymentFollowupSchema,
  PlanSchema,
  ServiceDateSchema
} from "../src/domain/schema";
import {
  DEFAULT_SEED_SCENARIO_ID,
  EVAL_REFERENCE_DATE,
  getSeedScenario,
  listSeedScenarios,
  SEED_SCENARIO_IDS
} from "../src/domain/seed";

describe("seed scenarios", () => {
  it("lists and looks up deterministic scenarios", () => {
    const scenarios = listSeedScenarios();

    expect(scenarios.map((scenario) => scenario.seed_id)).toEqual([
      ...SEED_SCENARIO_IDS
    ]);
    expect(getSeedScenario("missing")).toBeUndefined();
    expect(getSeedScenario("maya_default")?.seed_id).toBe("maya_default");
  });

  it("uses a browser demo seed with all account archetypes by default", () => {
    const browserDemo = getSeedScenario(DEFAULT_SEED_SCENARIO_ID);

    expect(DEFAULT_SEED_SCENARIO_ID).toBe("browser_demo");
    expect(browserDemo?.customers.map((customer) => customer.customer_id))
      .toEqual(["cus_001", "cus_002", "cus_003", "cus_004", "cus_005"]);
    expect(browserDemo?.service_dates_by_customer_id.cus_002[0])
      .toMatchObject({
        service_date: "2026-05-12",
        kitchen_locked: true
      });
  });

  it("returns copies so callers cannot mutate canonical seed data", () => {
    const scenario = getSeedScenario("maya_default");
    expect(scenario).toBeDefined();

    scenario?.customers[0]?.allergies.push("shellfish");

    expect(getSeedScenario("maya_default")?.customers[0]?.allergies).toEqual([
      "peanuts"
    ]);
  });

  it("validates all seed records through domain schemas", () => {
    for (const scenario of listSeedScenarios()) {
      expect(scenario.eval_reference_date).toBe(EVAL_REFERENCE_DATE);

      for (const customer of scenario.customers) {
        expect(CustomerSchema.parse(customer)).toEqual(customer);
      }

      for (const plan of scenario.plans) {
        expect(PlanSchema.parse(plan)).toEqual(plan);
        expect(
          scenario.customers.some(
            (customer) =>
              customer.customer_id === plan.customer_id &&
              customer.plan_id === plan.plan_id
          )
        ).toBe(true);
      }

      for (const [customerId, serviceDates] of Object.entries(
        scenario.service_dates_by_customer_id
      )) {
        expect(
          scenario.customers.some(
            (customer) => customer.customer_id === customerId
          )
        ).toBe(true);

        for (const serviceDate of serviceDates) {
          expect(ServiceDateSchema.parse(serviceDate)).toEqual(serviceDate);
        }
      }

      for (const followup of scenario.payment_followups) {
        expect(PaymentFollowupSchema.parse(followup)).toEqual(followup);
        expect(followup.idempotency_key).not.toBe("");
      }

      for (const delta of scenario.kitchen_export_deltas) {
        expect(KitchenExportDeltaSchema.parse(delta)).toEqual(delta);
        expect(delta.idempotency_key).not.toBe("");
      }
    }
  });

  it("seeds Maya with fixed next-week delivery dates and failed payment", () => {
    const maya = getSeedScenario("maya_default");

    expect(maya?.customers[0]).toMatchObject({
      customer_id: "cus_001",
      name: "Maya",
      payment_status: "failed",
      customizations: {
        spice_level: "normal"
      }
    });
    expect(maya?.plans[0]?.delivery_days).toEqual([
      "Monday",
      "Wednesday",
      "Friday"
    ]);
    expect(maya?.service_dates_by_customer_id.cus_001).toEqual([
      {
        service_date: "2026-05-18",
        day_of_week: "Monday",
        status: "active",
        kitchen_cutoff_at: "2026-05-16T12:00:00+04:00",
        kitchen_locked: false
      },
      {
        service_date: "2026-05-20",
        day_of_week: "Wednesday",
        status: "active",
        kitchen_cutoff_at: "2026-05-18T12:00:00+04:00",
        kitchen_locked: false
      },
      {
        service_date: "2026-05-22",
        day_of_week: "Friday",
        status: "active",
        kitchen_cutoff_at: "2026-05-20T12:00:00+04:00",
        kitchen_locked: false
      }
    ]);
  });

  it("seeds locked cutoff, allergy risk, and uncertain identity cases", () => {
    const omar = getSeedScenario("omar_locked_cutoff");
    const lina = getSeedScenario("lina_allergy_risk");
    const duplicateIdentity = getSeedScenario("identity_uncertain");

    expect(omar?.service_dates_by_customer_id.cus_002[0]).toMatchObject({
      service_date: "2026-05-12",
      status: "locked",
      kitchen_locked: true,
      kitchen_cutoff_at: "2026-05-10T12:00:00+04:00"
    });
    expect(lina?.customers[0]?.allergies).toEqual(["tree nuts", "sesame"]);

    expect(duplicateIdentity?.customers).toHaveLength(2);
    expect(
      duplicateIdentity?.customers.every(
        (customer) => customer.identity_confidence === "uncertain"
      )
    ).toBe(true);
    expect(
      new Set(duplicateIdentity?.customers.map((customer) => customer.phone))
        .size
    ).toBe(1);
  });
});
