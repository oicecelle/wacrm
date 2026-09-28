/**
 * Per-professional working hours, days off and lunch break — stored
 * in clinic_users.schedules (jsonb), a column that already existed in
 * the database but nothing read or wrote it yet.
 *
 * Kept as pure, testable logic separate from any UI: the same checks
 * back both the Equipe editor and the Agenda's "fora do horário"
 * warning, so the two can never disagree about what counts as within
 * a professional's hours.
 */

export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  sunday: "Domingo",
  monday: "Segunda",
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
};

export interface DaySchedule {
  /** Whether the professional attends at all on this weekday. */
  active: boolean;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  /** Both set together or both null — a half-set lunch break is treated as none. */
  lunchStart: string | null;
  lunchEnd: string | null;
}

export type WeekSchedule = Record<Weekday, DaySchedule>;

export function defaultDaySchedule(active: boolean): DaySchedule {
  return { active, start: "08:00", end: "18:00", lunchStart: active ? "12:00" : null, lunchEnd: active ? "13:00" : null };
}

/** Mon–Fri 08:00–18:00 with a 12:00–13:00 lunch; weekend off. Used
 *  both as the Equipe editor's starting point for someone with no
 *  schedule saved yet, and as the fallback the Agenda check uses for
 *  the same case (so a professional who never opened the editor still
 *  gets a sensible warning instead of none at all). */
export function defaultWeekSchedule(): WeekSchedule {
  return WEEKDAYS.reduce((acc, day) => {
    acc[day] = defaultDaySchedule(day !== "sunday" && day !== "saturday");
    return acc;
  }, {} as WeekSchedule);
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidTime(v: unknown): v is string {
  return typeof v === "string" && HHMM_RE.test(v);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function sanitizeDay(raw: unknown, fallback: DaySchedule): DaySchedule {
  if (!raw || typeof raw !== "object") return fallback;
  const d = raw as Record<string, unknown>;
  const start = isValidTime(d.start) ? d.start : fallback.start;
  const end = isValidTime(d.end) ? d.end : fallback.end;
  const lunchStart = isValidTime(d.lunchStart) ? d.lunchStart : null;
  const lunchEnd = isValidTime(d.lunchEnd) ? d.lunchEnd : null;
  return {
    active: typeof d.active === "boolean" ? d.active : fallback.active,
    start,
    end,
    // A half-set pair (only one of the two valid) is discarded rather
    // than guessed — better no lunch flagged than a wrong one.
    lunchStart: lunchStart && lunchEnd ? lunchStart : null,
    lunchEnd: lunchStart && lunchEnd ? lunchEnd : null,
  };
}

/** Reads clinic_users.schedules (jsonb, possibly null/malformed —
 *  it's user-editable-shaped data, never trust it blindly) into a
 *  complete, valid WeekSchedule, filling any missing/bad day with the
 *  default for that weekday. */
export function parseWeekSchedule(raw: unknown): WeekSchedule {
  const fallback = defaultWeekSchedule();
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  return WEEKDAYS.reduce((acc, day) => {
    acc[day] = sanitizeDay(r[day], fallback[day]);
    return acc;
  }, {} as WeekSchedule);
}

export interface SlotCheck {
  ok: boolean;
  /** Why it's flagged — empty when ok. More than one can apply (e.g.
   *  a day off AND outside hours), all are reported so the warning
   *  the person sees doesn't need a second check to find the rest. */
  reasons: ("day_off" | "before_hours" | "after_hours" | "lunch_break")[];
}

/**
 * Checks one appointment's start–end against a professional's
 * schedule for the weekday it falls on. Only the START weekday is
 * used for the day-off/hours checks (an appointment that runs past
 * midnight is the rare exception, not worth a cross-day rule here);
 * the lunch overlap check still compares against real start/end
 * instants, so a booking that straddles lunch is still caught even
 * within a single day.
 */
export function checkSlotAgainstSchedule(schedule: WeekSchedule, start: Date, end: Date): SlotCheck {
  const day = WEEKDAYS[start.getDay()];
  const daySchedule = schedule[day];
  const reasons: SlotCheck["reasons"] = [];

  if (!daySchedule.active) {
    reasons.push("day_off");
    return { ok: false, reasons }; // hours/lunch don't matter on a day off
  }

  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const workStart = toMinutes(daySchedule.start);
  const workEnd = toMinutes(daySchedule.end);

  if (startMin < workStart) reasons.push("before_hours");
  if (endMin > workEnd) reasons.push("after_hours");

  if (daySchedule.lunchStart && daySchedule.lunchEnd) {
    const lunchStart = toMinutes(daySchedule.lunchStart);
    const lunchEnd = toMinutes(daySchedule.lunchEnd);
    // Real interval overlap, not just "starts during lunch" — a booking
    // that starts before and ends after lunch still collides with it.
    if (startMin < lunchEnd && endMin > lunchStart) reasons.push("lunch_break");
  }

  return { ok: reasons.length === 0, reasons };
}

export const SLOT_REASON_LABELS: Record<SlotCheck["reasons"][number], string> = {
  day_off: "esse profissional não atende neste dia",
  before_hours: "horário antes do início do expediente",
  after_hours: "horário depois do fim do expediente",
  lunch_break: "conflita com o horário de almoço",
};

export function describeSlotCheck(check: SlotCheck): string {
  return check.reasons.map((r) => SLOT_REASON_LABELS[r]).join("; ");
}
