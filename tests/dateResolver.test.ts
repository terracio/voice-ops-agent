import { beforeEach, describe, expect, it } from "vitest";
import {
  resolveServiceDates,
  ResolveServiceDatesOutputSchema
} from "../src/domain/dateResolver";
import { resetDb } from "../src/domain/db";
import { EVAL_REFERENCE_DATE } from "../src/domain/seed";

beforeEach(() => {
  resetDb("maya_default");
});

describe("date resolver", () => {
  it("resolves Maya next week Monday, Tuesday, and Wednesday deterministically", () => {
    const result = resolveServiceDates({
      customer_id: "cus_001",
      phrase: "next week",
      requested_days: ["Monday", "Tuesday", "Wednesday"],
      reference_date: EVAL_REFERENCE_DATE
    });

    expect(ResolveServiceDatesOutputSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      customer_id: "cus_001",
      timezone: "Asia/Dubai",
      reference_date: "2026-05-11",
      ambiguous: false,
      actionable_service_dates: ["2026-05-18", "2026-05-20"]
    });
    expect(result.resolved_dates).toEqual([
      {
        requested_label: "Monday",
        calendar_date: "2026-05-18",
        service_date: "2026-05-18",
        day_of_week: "Monday",
        is_scheduled_delivery_day: true,
        status: "active",
        actionable: true
      },
      {
        requested_label: "Tuesday",
        calendar_date: "2026-05-19",
        day_of_week: "Tuesday",
        is_scheduled_delivery_day: false,
        actionable: false,
        non_actionable_reason: "not_scheduled_delivery_day"
      },
      {
        requested_label: "Wednesday",
        calendar_date: "2026-05-20",
        service_date: "2026-05-20",
        day_of_week: "Wednesday",
        is_scheduled_delivery_day: true,
        status: "active",
        actionable: true
      }
    ]);
  });

  it("returns tomorrow as a non-actionable structured result when it is not scheduled", () => {
    const result = resolveServiceDates({
      customer_id: "cus_001",
      phrase: "Skip tomorrow's delivery.",
      reference_date: EVAL_REFERENCE_DATE
    });

    expect(result.ambiguous).toBe(false);
    expect(result.actionable_service_dates).toEqual([]);
    expect(result.resolved_dates).toEqual([
      {
        requested_label: "tomorrow",
        calendar_date: "2026-05-12",
        day_of_week: "Tuesday",
        is_scheduled_delivery_day: false,
        actionable: false,
        non_actionable_reason: "not_scheduled_delivery_day"
      }
    ]);
  });

  it("marks locked kitchen dates as non-actionable", () => {
    resetDb("omar_locked_cutoff");

    const result = resolveServiceDates({
      customer_id: "cus_002",
      phrase: "Pause tomorrow's meal.",
      reference_date: EVAL_REFERENCE_DATE
    });

    expect(result.ambiguous).toBe(false);
    expect(result.actionable_service_dates).toEqual([]);
    expect(result.resolved_dates).toEqual([
      {
        requested_label: "tomorrow",
        calendar_date: "2026-05-12",
        service_date: "2026-05-12",
        day_of_week: "Tuesday",
        is_scheduled_delivery_day: true,
        status: "locked",
        actionable: false,
        non_actionable_reason: "kitchen_locked"
      }
    ]);
  });

  it("returns ambiguity with a clarification question and no write candidates", () => {
    const result = resolveServiceDates({
      customer_id: "cus_001",
      phrase: "Can you pause sometime next week?",
      reference_date: EVAL_REFERENCE_DATE
    });

    expect(result.ambiguous).toBe(true);
    expect(result.clarification_question).toBe("Which exact service date should I use?");
    expect(result.resolved_dates).toEqual([]);
    expect(result.actionable_service_dates).toEqual([]);
  });

  it("does not convert relative next-weekday ambiguity into write candidates", () => {
    const result = resolveServiceDates({
      customer_id: "cus_001",
      phrase: "Can you pause next Monday?",
      reference_date: EVAL_REFERENCE_DATE
    });

    expect(result.ambiguous).toBe(true);
    expect(result.clarification_question).toBe("Which exact service date should I use?");
    expect(result.actionable_service_dates).toEqual([]);
  });

  it("resolves a named weekday to the next service date record", () => {
    const result = resolveServiceDates({
      customer_id: "cus_001",
      phrase: "Please pause Wednesday.",
      reference_date: EVAL_REFERENCE_DATE
    });

    expect(result.ambiguous).toBe(false);
    expect(result.actionable_service_dates).toEqual(["2026-05-20"]);
    expect(result.resolved_dates[0]).toMatchObject({
      requested_label: "Wednesday",
      calendar_date: "2026-05-20",
      service_date: "2026-05-20",
      day_of_week: "Wednesday",
      is_scheduled_delivery_day: true,
      status: "active",
      actionable: true
    });
  });
});
