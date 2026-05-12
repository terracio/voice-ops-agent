import type { LookupCustomerInput } from "./readToolSchemas";

export function normalizeCustomerId(value?: string): string | undefined {
  return value?.trim().toLowerCase();
}

export function normalizeLookupInput(args: LookupCustomerInput): LookupCustomerInput {
  return {
    ...args,
    customer_id: normalizeCustomerId(args.customer_id)
  };
}
