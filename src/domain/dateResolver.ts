import { z } from "zod";
import { getCustomerState, type CustomerState } from "./db";
import { EVAL_REFERENCE_DATE } from "./seed";
import {
  DateStringSchema,
  DayOfWeekSchema,
  type DateString,
  type DayOfWeek,
  type ServiceDate
} from "./schema";

const DAY_NAMES = DayOfWeekSchema.options;
const SERVICE_DATE_STATUS_VALUES = ["active", "paused", "locked", "skipped"] as const;
const NON_ACTIONABLE_REASONS = ["ambiguous_date", "not_scheduled_delivery_day", "no_service_date_record", "kitchen_locked"] as const;

export const ResolveServiceDatesInputSchema = z.object({
  customer_id: z.string().min(1),
  phrase: z.string().min(1),
  requested_days: z.array(DayOfWeekSchema).optional(),
  reference_date: DateStringSchema.default(EVAL_REFERENCE_DATE)
});

export const ResolvedServiceDateSchema = z.object({
  requested_label: z.string().min(1),
  calendar_date: DateStringSchema,
  service_date: DateStringSchema.optional(),
  day_of_week: DayOfWeekSchema,
  is_scheduled_delivery_day: z.boolean(),
  status: z.enum(SERVICE_DATE_STATUS_VALUES).optional(),
  actionable: z.boolean(),
  non_actionable_reason: z.enum(NON_ACTIONABLE_REASONS).optional()
});

export const ResolveServiceDatesOutputSchema = z.object({
  customer_id: z.string().min(1),
  timezone: z.string().min(1),
  reference_date: DateStringSchema,
  phrase: z.string().min(1),
  resolved_dates: z.array(ResolvedServiceDateSchema),
  actionable_service_dates: z.array(DateStringSchema),
  ambiguous: z.boolean(),
  clarification_question: z.string().min(1).optional()
});

export type ResolveServiceDatesInput = z.input<typeof ResolveServiceDatesInputSchema>;
export type ResolvedServiceDate = z.infer<typeof ResolvedServiceDateSchema>;
export type ResolveServiceDatesOutput = z.infer<typeof ResolveServiceDatesOutputSchema>;

type ResolutionPlan =
  | { kind: "ambiguous"; question: string }
  | { kind: "dated_days"; dates: RequestedCalendarDate[] }
  | { kind: "service_days"; days: DayOfWeek[] };

type RequestedCalendarDate = {
  requested_label: string;
  calendar_date: DateString;
  day_of_week: DayOfWeek;
};

export function resolveServiceDates(input: ResolveServiceDatesInput): ResolveServiceDatesOutput {
  const parsedInput = ResolveServiceDatesInputSchema.parse(input);
  const state = getCustomerState(parsedInput.customer_id);

  if (!state) {
    throw new Error(`Cannot resolve dates for unknown customer: ${parsedInput.customer_id}`);
  }

  return resolveServiceDatesForState(parsedInput, state);
}

export function resolveServiceDatesForState(
  input: ResolveServiceDatesInput,
  state: CustomerState
): ResolveServiceDatesOutput {
  const parsedInput = ResolveServiceDatesInputSchema.parse(input);
  const plan = createResolutionPlan(parsedInput.phrase, parsedInput);
  const baseOutput = {
    customer_id: state.customer.customer_id,
    timezone: state.customer.timezone,
    reference_date: parsedInput.reference_date,
    phrase: parsedInput.phrase
  };

  if (state.customer.customer_id !== parsedInput.customer_id) {
    throw new Error("Resolver input customer_id does not match provided state.");
  }

  if (plan.kind === "ambiguous") {
    return ResolveServiceDatesOutputSchema.parse({
      ...baseOutput,
      resolved_dates: [],
      actionable_service_dates: [],
      ambiguous: true,
      clarification_question: plan.question
    });
  }

  const resolvedDates =
    plan.kind === "dated_days"
      ? plan.dates.map((date) => resolveCalendarDate(date, state))
      : plan.days.map((day) => resolveServiceDay(day, parsedInput.reference_date, state));

  return ResolveServiceDatesOutputSchema.parse({
    ...baseOutput,
    resolved_dates: resolvedDates,
    actionable_service_dates: resolvedDates.flatMap((date) =>
      date.actionable && date.service_date ? [date.service_date] : []
    ),
    ambiguous: false
  });
}

function createResolutionPlan(
  phrase: string,
  input: z.infer<typeof ResolveServiceDatesInputSchema>
): ResolutionPlan {
  const normalizedPhrase = normalizePhrase(phrase);
  const requestedDays = input.requested_days ?? extractWeekdays(normalizedPhrase);

  if (isAmbiguousPhrase(normalizedPhrase)) {
    return {
      kind: "ambiguous",
      question: "Which exact service date should I use?"
    };
  }

  if (normalizedPhrase.includes("tomorrow")) {
    const calendarDate = addDays(input.reference_date, 1);
    const dayOfWeek = getDayOfWeek(calendarDate);

    return {
      kind: "dated_days",
      dates: [
        {
          requested_label: "tomorrow",
          calendar_date: calendarDate,
          day_of_week: dayOfWeek
        }
      ]
    };
  }

  if (normalizedPhrase.includes("next week")) {
    const days = requestedDays.length > 0 ? requestedDays : DAY_NAMES;
    const nextWeekStart = startOfNextWeek(input.reference_date);

    return {
      kind: "dated_days",
      dates: days.map((day) => {
        const calendarDate = addDays(nextWeekStart, dayIndex(day));

        return {
          requested_label: day,
          calendar_date: calendarDate,
          day_of_week: day
        };
      })
    };
  }

  if (normalizedPhrase.includes("this weekend")) {
    const weekendDays =
      requestedDays.length > 0 ? requestedDays : (["Saturday", "Sunday"] as DayOfWeek[]);
    const weekendStart = nextDayOnOrAfter(input.reference_date, "Saturday", false);

    return {
      kind: "dated_days",
      dates: weekendDays.map((day) => ({
        requested_label: day,
        calendar_date:
          day === "Sunday" ? addDays(weekendStart, 1) : nextDayOnOrAfter(input.reference_date, day, false),
        day_of_week: day
      }))
    };
  }

  if (requestedDays.length > 0) {
    return {
      kind: "service_days",
      days: requestedDays
    };
  }

  return {
    kind: "ambiguous",
    question: "Which delivery day or service date should I check?"
  };
}

function isAmbiguousPhrase(normalizedPhrase: string): boolean {
  if (/\b(sometime|some time|around|soon|later|one day|some day)\b/.test(normalizedPhrase)) {
    return true;
  }

  return DAY_NAMES.some(
    (day) =>
      normalizedPhrase.includes(`next ${day.toLowerCase()}`) &&
      !normalizedPhrase.includes("next week")
  );
}

function resolveCalendarDate(
  requested: RequestedCalendarDate,
  state: CustomerState
): ResolvedServiceDate {
  const serviceDate = state.service_dates.find(
    (candidate) => candidate.service_date === requested.calendar_date
  );
  const isScheduled = state.plan.delivery_days.includes(requested.day_of_week);

  if (!isScheduled) {
    return {
      ...requested,
      is_scheduled_delivery_day: false,
      actionable: false,
      non_actionable_reason: "not_scheduled_delivery_day"
    };
  }

  if (!serviceDate) {
    return {
      ...requested,
      is_scheduled_delivery_day: true,
      actionable: false,
      non_actionable_reason: "no_service_date_record"
    };
  }

  return createActionableDate(requested, serviceDate);
}

function resolveServiceDay(
  day: DayOfWeek,
  referenceDate: DateString,
  state: CustomerState
): ResolvedServiceDate {
  const isScheduled = state.plan.delivery_days.includes(day);
  const serviceDate = findNextServiceDate(day, referenceDate, state.service_dates);
  const calendarDate = serviceDate?.service_date ?? nextDayOnOrAfter(referenceDate, day, true);
  const requested = {
    requested_label: day,
    calendar_date: calendarDate,
    day_of_week: day
  };

  if (!isScheduled) {
    return {
      ...requested,
      is_scheduled_delivery_day: false,
      actionable: false,
      non_actionable_reason: "not_scheduled_delivery_day"
    };
  }

  if (!serviceDate) {
    return {
      ...requested,
      is_scheduled_delivery_day: true,
      actionable: false,
      non_actionable_reason: "no_service_date_record"
    };
  }

  return createActionableDate(requested, serviceDate);
}

function createActionableDate(
  requested: RequestedCalendarDate,
  serviceDate: ServiceDate
): ResolvedServiceDate {
  const locked = serviceDate.status === "locked" || serviceDate.kitchen_locked;

  return {
    ...requested,
    service_date: serviceDate.service_date,
    is_scheduled_delivery_day: true,
    status: serviceDate.status,
    actionable: !locked,
    ...(locked ? { non_actionable_reason: "kitchen_locked" as const } : {})
  };
}

function findNextServiceDate(
  day: DayOfWeek,
  referenceDate: DateString,
  serviceDates: ServiceDate[]
): ServiceDate | undefined {
  return [...serviceDates]
    .filter((serviceDate) => serviceDate.day_of_week === day)
    .filter((serviceDate) => serviceDate.service_date >= referenceDate)
    .sort((left, right) => left.service_date.localeCompare(right.service_date))[0];
}

function extractWeekdays(normalizedPhrase: string): DayOfWeek[] {
  return DAY_NAMES.filter((day) =>
    new RegExp(`\\b${day.toLowerCase()}\\b`).test(normalizedPhrase)
  );
}

function normalizePhrase(phrase: string): string {
  return phrase.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function startOfNextWeek(referenceDate: DateString): DateString {
  return addDays(referenceDate, 7 - dayIndex(getDayOfWeek(referenceDate)));
}

function nextDayOnOrAfter(
  referenceDate: DateString,
  day: DayOfWeek,
  includeReferenceDate: boolean
): DateString {
  const currentIndex = dayIndex(getDayOfWeek(referenceDate));
  const targetIndex = dayIndex(day);
  const offset = (targetIndex - currentIndex + 7) % 7;
  const adjustedOffset = offset === 0 && !includeReferenceDate ? 7 : offset;

  return addDays(referenceDate, adjustedOffset);
}

function addDays(date: DateString, days: number): DateString {
  const parsedDate = parseDate(date);

  parsedDate.setUTCDate(parsedDate.getUTCDate() + days);

  return formatDate(parsedDate);
}

function getDayOfWeek(date: DateString): DayOfWeek {
  const day = parseDate(date).getUTCDay();
  const sundayFirst = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

  return sundayFirst[day];
}

function dayIndex(day: DayOfWeek): number {
  return DAY_NAMES.indexOf(day);
}

function parseDate(date: DateString): Date {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): DateString {
  return DateStringSchema.parse(date.toISOString().slice(0, 10));
}
