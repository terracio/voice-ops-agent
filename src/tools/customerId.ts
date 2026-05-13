import type { LookupCustomerInput } from "./readToolSchemas";

export function normalizeCustomerId(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;

  const compact = normalized.replace(/\s+/g, "");
  const spokenId = compact.match(/^cus[-_]?(\d+)$/);
  if (spokenId) {
    return `cus_${spokenId[1]}`;
  }

  return compact;
}

export function normalizeLookupInput(args: LookupCustomerInput): LookupCustomerInput {
  return {
    ...args,
    customer_id: normalizeCustomerId(args.customer_id)
  };
}
