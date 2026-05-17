import {
  CustomerSchema,
  KitchenExportDeltaSchema,
  PaymentFollowupSchema,
  PlanSchema,
  ServiceDateSchema
} from "./schema";
import {
  DEFAULT_SEED_SCENARIO_ID,
  EVAL_REFERENCE_DATE,
  rawSeedScenarios,
  SEED_SCENARIO_IDS,
  type SeedScenario,
  type SeedScenarioId
} from "./seedData";

export {
  DEFAULT_SEED_SCENARIO_ID,
  EVAL_REFERENCE_DATE,
  SEED_SCENARIO_IDS,
  type SeedScenario,
  type SeedScenarioId
};

const seedScenarios = rawSeedScenarios.map(validateSeedScenario);

const seedScenariosById = new Map(
  seedScenarios.map((scenario) => [scenario.seed_id, scenario])
);

export function listSeedScenarios(): SeedScenario[] {
  return seedScenarios.map(cloneSeedScenario);
}

export function getSeedScenario(seedId: string): SeedScenario | undefined {
  const scenario = seedScenariosById.get(seedId as SeedScenarioId);

  return scenario ? cloneSeedScenario(scenario) : undefined;
}

function validateSeedScenario(scenario: SeedScenario): SeedScenario {
  scenario.customers.forEach((customer) => CustomerSchema.parse(customer));
  scenario.plans.forEach((plan) => PlanSchema.parse(plan));
  Object.values(scenario.service_dates_by_customer_id).forEach((dates) => {
    dates.forEach((serviceDate) => ServiceDateSchema.parse(serviceDate));
  });
  scenario.payment_followups.forEach((followup) =>
    PaymentFollowupSchema.parse(followup)
  );
  scenario.kitchen_export_deltas.forEach((delta) =>
    KitchenExportDeltaSchema.parse(delta)
  );

  return scenario;
}

function cloneSeedScenario(scenario: SeedScenario): SeedScenario {
  return {
    ...scenario,
    customers: scenario.customers.map((customer) => ({
      ...customer,
      allergies: [...customer.allergies],
      customizations: {
        ...customer.customizations,
        dislikes: [...customer.customizations.dislikes],
        protein_preferences: [...customer.customizations.protein_preferences]
      }
    })),
    plans: scenario.plans.map((plan) => ({
      ...plan,
      delivery_days: [...plan.delivery_days]
    })),
    service_dates_by_customer_id: Object.fromEntries(
      Object.entries(scenario.service_dates_by_customer_id).map(
        ([customerId, dates]) => [
          customerId,
          dates.map((serviceDate) => ({ ...serviceDate }))
        ]
      )
    ),
    payment_followups: scenario.payment_followups.map((followup) => ({ ...followup })),
    kitchen_export_deltas: scenario.kitchen_export_deltas.map((delta) => ({
      ...delta,
      affected_dates: [...delta.affected_dates]
    }))
  };
}
