export function costStatusLabel(status: string): string {
  if (status === "available") return "Local estimate";
  if (status === "partial") return "Partial local estimate";
  return "Cost unavailable";
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function operationLabel(operation: unknown): string {
  const item = recordValue(operation);
  const type = stringValue(item?.type);
  if (!type) return "Change pending";
  return titleCase(type.replace(/_/g, " "));
}

export function displayUnknown(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "-";
  return JSON.stringify(value);
}

export function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function recordValue(
  value: unknown,
  key?: string
): Record<string, unknown> | undefined {
  const next = key && typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : value;
  return typeof next === "object" && next !== null && !Array.isArray(next)
    ? next as Record<string, unknown>
    : undefined;
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
