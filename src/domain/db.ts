import { createAuditLog, type AuditEvent, type AuditEventDraft, type AuditLog } from "../audit";
import { DEFAULT_SEED_SCENARIO_ID, getSeedScenario } from "./seed";
import {
  ChangeSetSchema,
  ConfirmationSchema,
  CustomerSchema,
  KitchenExportDeltaSchema,
  PaymentFollowupSchema,
  PlanSchema,
  ServiceDateSchema,
  type ChangeSet,
  type Confirmation,
  type Customer,
  type KitchenExportDelta,
  type PaymentFollowup,
  type Plan,
  type ServiceDate
} from "./schema";

export type CustomerSearchInput = {
  customer_id?: string;
  name?: string;
  phone?: string;
};

export type CustomerState = {
  customer: Customer;
  plan: Plan;
  service_dates: ServiceDate[];
};

type DbState = {
  customersById: Map<string, Customer>;
  plansById: Map<string, Plan>;
  serviceDatesByCustomerId: Map<string, ServiceDate[]>;
  changeSetsById: Map<string, ChangeSet>;
  confirmationsById: Map<string, Confirmation>;
  paymentFollowupsById: Map<string, PaymentFollowup>;
  paymentFollowupIdsByIdempotencyKey: Map<string, string>;
  kitchenDeltasById: Map<string, KitchenExportDelta>;
  kitchenDeltaIdsByIdempotencyKey: Map<string, string>;
  auditLog: AuditLog;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createEmptyState(): DbState {
  return {
    customersById: new Map(),
    plansById: new Map(),
    serviceDatesByCustomerId: new Map(),
    changeSetsById: new Map(),
    confirmationsById: new Map(),
    paymentFollowupsById: new Map(),
    paymentFollowupIdsByIdempotencyKey: new Map(),
    kitchenDeltasById: new Map(),
    kitchenDeltaIdsByIdempotencyKey: new Map(),
    auditLog: createAuditLog()
  };
}

let dbState = createEmptyState();

export function resetDb(seedId: string = DEFAULT_SEED_SCENARIO_ID): void {
  const seed = getSeedScenario(seedId);

  if (!seed) {
    throw new Error(`Unknown seed scenario: ${seedId}`);
  }

  const nextState = createEmptyState();

  for (const customer of seed.customers) {
    const parsedCustomer = CustomerSchema.parse(customer);
    nextState.customersById.set(parsedCustomer.customer_id, clone(parsedCustomer));
  }

  for (const plan of seed.plans) {
    const parsedPlan = PlanSchema.parse(plan);
    nextState.plansById.set(parsedPlan.plan_id, clone(parsedPlan));
  }

  for (const [customerId, serviceDates] of Object.entries(seed.service_dates_by_customer_id)) {
    nextState.serviceDatesByCustomerId.set(
      customerId,
      serviceDates.map((serviceDate) => clone(ServiceDateSchema.parse(serviceDate)))
    );
  }

  for (const followup of seed.payment_followups) {
    storePaymentFollowup(nextState, followup);
  }

  for (const delta of seed.kitchen_export_deltas) {
    storeKitchenExportDelta(nextState, delta);
  }

  dbState = nextState;
}

export function findCustomers(input: CustomerSearchInput = {}): Customer[] {
  const nameNeedle = input.name?.trim().toLowerCase();

  return [...dbState.customersById.values()]
    .filter((customer) => {
      if (input.customer_id && customer.customer_id !== input.customer_id) {
        return false;
      }

      if (input.phone && customer.phone !== input.phone) {
        return false;
      }

      if (nameNeedle && !customer.name.toLowerCase().includes(nameNeedle)) {
        return false;
      }

      return true;
    })
    .map((customer) => clone(customer));
}

export function getCustomer(customerId: string): Customer | undefined {
  const customer = dbState.customersById.get(customerId);

  return customer ? clone(customer) : undefined;
}

export function getCustomerState(customerId: string): CustomerState | undefined {
  const customer = dbState.customersById.get(customerId);

  if (!customer) {
    return undefined;
  }

  const plan = dbState.plansById.get(customer.plan_id);

  if (!plan) {
    throw new Error(`Missing plan for customer: ${customerId}`);
  }

  return {
    customer: clone(customer),
    plan: clone(plan),
    service_dates: (dbState.serviceDatesByCustomerId.get(customerId) ?? []).map((serviceDate) =>
      clone(serviceDate)
    )
  };
}

export function updateCustomerState(customerId: string, nextState: CustomerState): CustomerState {
  const parsedState = parseCustomerState(nextState);

  if (parsedState.customer.customer_id !== customerId) {
    throw new Error("Customer state id does not match update target.");
  }

  if (parsedState.plan.customer_id !== customerId) {
    throw new Error("Plan customer id does not match update target.");
  }

  if (parsedState.customer.plan_id !== parsedState.plan.plan_id) {
    throw new Error("Customer plan id does not match updated plan.");
  }

  dbState.customersById.set(customerId, clone(parsedState.customer));
  dbState.plansById.set(parsedState.plan.plan_id, clone(parsedState.plan));
  dbState.serviceDatesByCustomerId.set(customerId, parsedState.service_dates.map(clone));

  return getCustomerState(customerId) as CustomerState;
}

export function saveChangeSet(changeSet: ChangeSet): ChangeSet {
  const parsedChangeSet = ChangeSetSchema.parse(changeSet);

  dbState.changeSetsById.set(parsedChangeSet.change_set_id, clone(parsedChangeSet));

  return clone(parsedChangeSet);
}

export function getChangeSet(changeSetId: string): ChangeSet | undefined {
  const changeSet = dbState.changeSetsById.get(changeSetId);

  return changeSet ? clone(changeSet) : undefined;
}

export function saveConfirmation(confirmation: Confirmation): Confirmation {
  const parsedConfirmation = ConfirmationSchema.parse(confirmation);

  dbState.confirmationsById.set(parsedConfirmation.confirmation_id, clone(parsedConfirmation));

  return clone(parsedConfirmation);
}

export function getConfirmation(confirmationId: string): Confirmation | undefined {
  const confirmation = dbState.confirmationsById.get(confirmationId);

  return confirmation ? clone(confirmation) : undefined;
}

export function savePaymentFollowup(followup: PaymentFollowup): PaymentFollowup {
  return storePaymentFollowup(dbState, followup);
}

export function getPaymentFollowup(followupId: string): PaymentFollowup | undefined {
  const followup = dbState.paymentFollowupsById.get(followupId);

  return followup ? clone(followup) : undefined;
}

export function listPaymentFollowups(customerId?: string): PaymentFollowup[] {
  return [...dbState.paymentFollowupsById.values()]
    .filter((followup) => !customerId || followup.customer_id === customerId)
    .map((followup) => clone(followup));
}

export function saveKitchenExportDelta(delta: KitchenExportDelta): KitchenExportDelta {
  return storeKitchenExportDelta(dbState, delta);
}

export function getKitchenExportDelta(deltaId: string): KitchenExportDelta | undefined {
  const delta = dbState.kitchenDeltasById.get(deltaId);

  return delta ? clone(delta) : undefined;
}

export function listKitchenExportDeltas(customerId?: string): KitchenExportDelta[] {
  return [...dbState.kitchenDeltasById.values()]
    .filter((delta) => !customerId || delta.customer_id === customerId)
    .map((delta) => clone(delta));
}

export function appendAuditEvent(draft: AuditEventDraft): AuditEvent {
  return dbState.auditLog.append(draft);
}

export function listAuditEvents(): AuditEvent[] {
  return dbState.auditLog.listEvents();
}

export function getAuditEventsByRunId(runId: string): AuditEvent[] {
  return dbState.auditLog.getEventsByRunId(runId);
}

export function getAuditEventsByChangeSetId(changeSetId: string): AuditEvent[] {
  return dbState.auditLog.getEventsByChangeSetId(changeSetId);
}

export function getAuditEventsByRunAndChangeSetId(
  runId: string,
  changeSetId: string
): AuditEvent[] {
  return dbState.auditLog.getEventsByRunAndChangeSetId(runId, changeSetId);
}

function parseCustomerState(state: CustomerState): CustomerState {
  return {
    customer: CustomerSchema.parse(state.customer),
    plan: PlanSchema.parse(state.plan),
    service_dates: state.service_dates.map((serviceDate) => ServiceDateSchema.parse(serviceDate))
  };
}

function storePaymentFollowup(state: DbState, followup: PaymentFollowup): PaymentFollowup {
  const parsedFollowup = PaymentFollowupSchema.parse(followup);
  const existingId = state.paymentFollowupIdsByIdempotencyKey.get(parsedFollowup.idempotency_key);

  if (existingId) {
    return clone(state.paymentFollowupsById.get(existingId) as PaymentFollowup);
  }

  const previous = state.paymentFollowupsById.get(parsedFollowup.followup_id);

  if (previous) {
    state.paymentFollowupIdsByIdempotencyKey.delete(previous.idempotency_key);
  }

  state.paymentFollowupsById.set(parsedFollowup.followup_id, clone(parsedFollowup));
  state.paymentFollowupIdsByIdempotencyKey.set(
    parsedFollowup.idempotency_key,
    parsedFollowup.followup_id
  );

  return clone(parsedFollowup);
}

function storeKitchenExportDelta(state: DbState, delta: KitchenExportDelta): KitchenExportDelta {
  const parsedDelta = KitchenExportDeltaSchema.parse(delta);
  const existingId = state.kitchenDeltaIdsByIdempotencyKey.get(parsedDelta.idempotency_key);

  if (existingId) {
    return clone(state.kitchenDeltasById.get(existingId) as KitchenExportDelta);
  }

  const previous = state.kitchenDeltasById.get(parsedDelta.delta_id);

  if (previous) {
    state.kitchenDeltaIdsByIdempotencyKey.delete(previous.idempotency_key);
  }

  state.kitchenDeltasById.set(parsedDelta.delta_id, clone(parsedDelta));
  state.kitchenDeltaIdsByIdempotencyKey.set(
    parsedDelta.idempotency_key,
    parsedDelta.delta_id
  );

  return clone(parsedDelta);
}

resetDb();
