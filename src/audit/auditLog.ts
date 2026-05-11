import {
  AuditEvent,
  AuditEventDraft,
  AuditEventDraftSchema,
  createAuditEvent
} from "./auditTypes";

export type AuditClock = () => string;
export type AuditEventIdFactory = () => string;

export type AuditLogOptions = {
  initialEvents?: AuditEvent[];
  now?: AuditClock;
  createEventId?: AuditEventIdFactory;
};

export type AuditLog = {
  append: (draft: AuditEventDraft) => AuditEvent;
  appendMany: (drafts: AuditEventDraft[]) => AuditEvent[];
  listEvents: () => AuditEvent[];
  forRun: (run_id: string) => RunScopedAuditLog;
  getEventsByRunId: (run_id: string) => AuditEvent[];
  getEventsByChangeSetId: (change_set_id: string) => AuditEvent[];
  getEventsByRunAndChangeSetId: (
    run_id: string,
    change_set_id: string
  ) => AuditEvent[];
};

export type RunScopedAuditEventDraft = AuditEventDraft extends infer TDraft
  ? TDraft extends AuditEventDraft
    ? Omit<TDraft, "run_id">
    : never
  : never;

export type RunScopedAuditLog = {
  append: (draft: RunScopedAuditEventDraft) => AuditEvent;
  listEvents: () => AuditEvent[];
  getEventsByChangeSetId: (change_set_id: string) => AuditEvent[];
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);

    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
  }

  return value;
}

function cloneAuditEvent(event: AuditEvent): AuditEvent {
  return deepFreeze(structuredClone(event));
}

export function createAuditLog(options: AuditLogOptions = {}): AuditLog {
  let nextSequence = options.initialEvents?.length ?? 0;
  const events = (options.initialEvents ?? []).map((event) =>
    cloneAuditEvent(event)
  );
  const now = options.now ?? (() => new Date().toISOString());
  const createEventId =
    options.createEventId ?? (() => `audit_${String(++nextSequence)}`);

  const append = (draft: AuditEventDraft) => {
    const parsedDraft = AuditEventDraftSchema.parse(draft);
    const event = createAuditEvent(parsedDraft, {
      event_id: createEventId(),
      timestamp: now()
    });
    const storedEvent = cloneAuditEvent(event);

    events.push(storedEvent);
    return cloneAuditEvent(storedEvent);
  };

  return {
    append,

    appendMany(drafts) {
      return drafts.map((draft) => append(draft));
    },

    listEvents() {
      return events.map((event) => cloneAuditEvent(event));
    },

    forRun(run_id) {
      return createRunScopedAuditLog(this, run_id);
    },

    getEventsByRunId(run_id) {
      return events
        .filter((event) => event.run_id === run_id)
        .map((event) => cloneAuditEvent(event));
    },

    getEventsByChangeSetId(change_set_id) {
      return events
        .filter((event) => event.change_set_id === change_set_id)
        .map((event) => cloneAuditEvent(event));
    },

    getEventsByRunAndChangeSetId(run_id, change_set_id) {
      return events.filter(
        (event) =>
          event.run_id === run_id && event.change_set_id === change_set_id
      ).map((event) => cloneAuditEvent(event));
    }
  };
}

export function createRunScopedAuditLog(
  auditLog: AuditLog,
  run_id: string
): RunScopedAuditLog {
  return {
    append(draft) {
      return auditLog.append({ ...draft, run_id } as AuditEventDraft);
    },

    listEvents() {
      return auditLog.getEventsByRunId(run_id);
    },

    getEventsByChangeSetId(change_set_id) {
      return auditLog.getEventsByRunAndChangeSetId(run_id, change_set_id);
    }
  };
}
