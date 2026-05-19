import { ResolveServiceDatesOutputSchema } from "../../domain/dateResolver";
import type { ToolResult } from "../../domain/schema";
import type { ToolExecutionContext } from "../../tools";

export function applyTrustedDateResolutionFromToolResult(options: {
  context: ToolExecutionContext;
  result: ToolResult<unknown>;
  toolName: string;
}): void {
  if (options.toolName !== "resolve_service_dates" || !options.result.ok) {
    return;
  }
  const parsed = ResolveServiceDatesOutputSchema.safeParse(options.result.data);
  if (!parsed.success) return;
  options.context.trusted_date_resolutions = [
    ...(options.context.trusted_date_resolutions ?? []),
    parsed.data
  ];
}
