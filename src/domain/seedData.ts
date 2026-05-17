import type {
  Customer,
  KitchenExportDelta,
  PaymentFollowup,
  Plan,
  ServiceDate
} from "./schema";

export const EVAL_REFERENCE_DATE = "2026-05-11" as const;

export const SEED_SCENARIO_IDS = [
  "browser_demo",
  "maya_default",
  "omar_locked_cutoff",
  "lina_allergy_risk",
  "identity_uncertain"
] as const;

export const DEFAULT_SEED_SCENARIO_ID = "browser_demo" as const;

export type SeedScenarioId = (typeof SEED_SCENARIO_IDS)[number];

export type SeedScenario = {
  seed_id: SeedScenarioId;
  eval_reference_date: typeof EVAL_REFERENCE_DATE;
  customers: Customer[];
  plans: Plan[];
  service_dates_by_customer_id: Record<string, ServiceDate[]>;
  payment_followups: PaymentFollowup[];
  kitchen_export_deltas: KitchenExportDelta[];
};

const mayaServiceDates: ServiceDate[] = [
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
];

const scenarioSeeds: SeedScenario[] = [
  {
    seed_id: "maya_default",
    eval_reference_date: EVAL_REFERENCE_DATE,
    customers: [
      {
        customer_id: "cus_001",
        name: "Maya",
        phone: "+971500000001",
        timezone: "Asia/Dubai",
        identity_confidence: "confirmed",
        state_version: 12,
        plan_id: "plan_001",
        allergies: ["peanuts"],
        customizations: {
          spice_level: "normal",
          dislikes: ["mushrooms"],
          protein_preferences: ["chicken"]
        },
        payment_status: "failed",
        payment_last_checked_at: "2026-05-10T12:00:00+04:00"
      }
    ],
    plans: [
      {
        plan_id: "plan_001",
        customer_id: "cus_001",
        plan_name: "High Protein",
        meals_per_week: 3,
        delivery_days: ["Monday", "Wednesday", "Friday"],
        status: "active"
      }
    ],
    service_dates_by_customer_id: {
      cus_001: mayaServiceDates
    },
    payment_followups: [],
    kitchen_export_deltas: []
  },
  {
    seed_id: "omar_locked_cutoff",
    eval_reference_date: EVAL_REFERENCE_DATE,
    customers: [
      {
        customer_id: "cus_002",
        name: "Omar",
        phone: "+971500000002",
        timezone: "Asia/Dubai",
        identity_confidence: "confirmed",
        state_version: 3,
        plan_id: "plan_002",
        allergies: [],
        customizations: {
          spice_level: "mild",
          dislikes: [],
          protein_preferences: ["fish", "chicken"]
        },
        payment_status: "current",
        payment_last_checked_at: "2026-05-11T08:30:00+04:00"
      }
    ],
    plans: [
      {
        plan_id: "plan_002",
        customer_id: "cus_002",
        plan_name: "Balanced",
        meals_per_week: 2,
        delivery_days: ["Tuesday", "Thursday"],
        status: "active"
      }
    ],
    service_dates_by_customer_id: {
      cus_002: [
        {
          service_date: "2026-05-12",
          day_of_week: "Tuesday",
          status: "locked",
          kitchen_cutoff_at: "2026-05-10T12:00:00+04:00",
          kitchen_locked: true
        },
        {
          service_date: "2026-05-14",
          day_of_week: "Thursday",
          status: "active",
          kitchen_cutoff_at: "2026-05-12T12:00:00+04:00",
          kitchen_locked: false
        }
      ]
    },
    payment_followups: [],
    kitchen_export_deltas: []
  },
  {
    seed_id: "lina_allergy_risk",
    eval_reference_date: EVAL_REFERENCE_DATE,
    customers: [
      {
        customer_id: "cus_003",
        name: "Lina",
        phone: "+971500000003",
        timezone: "Asia/Dubai",
        identity_confidence: "confirmed",
        state_version: 9,
        plan_id: "plan_003",
        allergies: ["tree nuts", "sesame"],
        customizations: {
          spice_level: "normal",
          dislikes: ["eggplant"],
          protein_preferences: []
        },
        payment_status: "current",
        payment_last_checked_at: "2026-05-11T08:45:00+04:00"
      }
    ],
    plans: [
      {
        plan_id: "plan_003",
        customer_id: "cus_003",
        plan_name: "Vegetarian",
        meals_per_week: 2,
        delivery_days: ["Monday", "Thursday"],
        status: "active"
      }
    ],
    service_dates_by_customer_id: {
      cus_003: [
        {
          service_date: "2026-05-14",
          day_of_week: "Thursday",
          status: "active",
          kitchen_cutoff_at: "2026-05-12T12:00:00+04:00",
          kitchen_locked: false
        },
        {
          service_date: "2026-05-18",
          day_of_week: "Monday",
          status: "active",
          kitchen_cutoff_at: "2026-05-16T12:00:00+04:00",
          kitchen_locked: false
        }
      ]
    },
    payment_followups: [],
    kitchen_export_deltas: []
  },
  {
    seed_id: "identity_uncertain",
    eval_reference_date: EVAL_REFERENCE_DATE,
    customers: [
      {
        customer_id: "cus_004",
        name: "Maya Haddad",
        phone: "+971500000099",
        timezone: "Asia/Dubai",
        identity_confidence: "uncertain",
        state_version: 1,
        plan_id: "plan_004",
        allergies: ["peanuts"],
        customizations: {
          spice_level: "mild",
          dislikes: ["cilantro"],
          protein_preferences: ["chicken"]
        },
        payment_status: "current",
        payment_last_checked_at: "2026-05-11T09:00:00+04:00"
      },
      {
        customer_id: "cus_005",
        name: "Maya Hadad",
        phone: "+971500000099",
        timezone: "Asia/Dubai",
        identity_confidence: "uncertain",
        state_version: 2,
        plan_id: "plan_005",
        allergies: [],
        customizations: {
          spice_level: "spicy",
          dislikes: ["olives"],
          protein_preferences: ["beef"]
        },
        payment_status: "past_due",
        payment_last_checked_at: "2026-05-11T09:05:00+04:00"
      }
    ],
    plans: [
      {
        plan_id: "plan_004",
        customer_id: "cus_004",
        plan_name: "High Protein",
        meals_per_week: 3,
        delivery_days: ["Monday", "Wednesday", "Friday"],
        status: "active"
      },
      {
        plan_id: "plan_005",
        customer_id: "cus_005",
        plan_name: "Balanced",
        meals_per_week: 2,
        delivery_days: ["Tuesday", "Thursday"],
        status: "active"
      }
    ],
    service_dates_by_customer_id: {
      cus_004: mayaServiceDates,
      cus_005: [
        {
          service_date: "2026-05-12",
          day_of_week: "Tuesday",
          status: "locked",
          kitchen_cutoff_at: "2026-05-10T12:00:00+04:00",
          kitchen_locked: true
        },
        {
          service_date: "2026-05-14",
          day_of_week: "Thursday",
          status: "active",
          kitchen_cutoff_at: "2026-05-12T12:00:00+04:00",
          kitchen_locked: false
        }
      ]
    },
    payment_followups: [],
    kitchen_export_deltas: []
  }
];

export const rawSeedScenarios = [
  createBrowserDemoScenario(scenarioSeeds),
  ...scenarioSeeds
];

function createBrowserDemoScenario(scenarios: SeedScenario[]): SeedScenario {
  return {
    seed_id: "browser_demo",
    eval_reference_date: EVAL_REFERENCE_DATE,
    customers: scenarios.flatMap((scenario) => scenario.customers),
    plans: scenarios.flatMap((scenario) => scenario.plans),
    service_dates_by_customer_id: Object.assign(
      {},
      ...scenarios.map((scenario) => scenario.service_dates_by_customer_id)
    ),
    payment_followups: scenarios.flatMap((scenario) => scenario.payment_followups),
    kitchen_export_deltas: scenarios.flatMap((scenario) => scenario.kitchen_export_deltas)
  };
}
