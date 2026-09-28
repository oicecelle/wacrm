import { describe, expect, it } from "vitest";
import {
  checkSlotAgainstSchedule,
  defaultWeekSchedule,
  describeSlotCheck,
  parseWeekSchedule,
  WEEKDAYS,
  type WeekSchedule,
} from "./professional-schedule";

// 2026-09-28 is a Monday; 2026-09-27 is a Sunday.
const mon = (h: number, m: number) => new Date(2026, 8, 28, h, m);
const sun = (h: number, m: number) => new Date(2026, 8, 27, h, m);

describe("defaultWeekSchedule", () => {
  it("is Mon–Fri active with a lunch break, weekend off", () => {
    const s = defaultWeekSchedule();
    expect(s.monday.active).toBe(true);
    expect(s.friday.active).toBe(true);
    expect(s.saturday.active).toBe(false);
    expect(s.sunday.active).toBe(false);
    expect(s.monday.lunchStart).toBe("12:00");
    expect(s.saturday.lunchStart).toBeNull();
  });
  it("has all 7 weekdays", () => {
    expect(Object.keys(defaultWeekSchedule()).sort()).toEqual([...WEEKDAYS].sort());
  });
});

describe("parseWeekSchedule", () => {
  it("falls back entirely for null/non-object input", () => {
    expect(parseWeekSchedule(null)).toEqual(defaultWeekSchedule());
    expect(parseWeekSchedule(undefined)).toEqual(defaultWeekSchedule());
    expect(parseWeekSchedule("nonsense")).toEqual(defaultWeekSchedule());
  });
  it("reads a well-formed schedule as-is", () => {
    const raw = { monday: { active: true, start: "09:00", end: "17:00", lunchStart: "12:30", lunchEnd: "13:30" } };
    expect(parseWeekSchedule(raw).monday).toEqual({ active: true, start: "09:00", end: "17:00", lunchStart: "12:30", lunchEnd: "13:30" });
  });
  it("fills a missing day with its default instead of leaving it undefined", () => {
    const result = parseWeekSchedule({ monday: { active: true, start: "09:00", end: "17:00", lunchStart: null, lunchEnd: null } });
    expect(result.tuesday).toEqual(defaultWeekSchedule().tuesday);
  });
  it("discards an invalid time and falls back for that field", () => {
    const result = parseWeekSchedule({ monday: { active: true, start: "25:99", end: "17:00", lunchStart: null, lunchEnd: null } });
    expect(result.monday.start).toBe(defaultWeekSchedule().monday.start);
    expect(result.monday.end).toBe("17:00");
  });
  it("drops a half-set lunch pair rather than guessing", () => {
    const result = parseWeekSchedule({ monday: { active: true, start: "09:00", end: "17:00", lunchStart: "12:00", lunchEnd: null } });
    expect(result.monday.lunchStart).toBeNull();
    expect(result.monday.lunchEnd).toBeNull();
  });
});

describe("checkSlotAgainstSchedule", () => {
  const schedule: WeekSchedule = defaultWeekSchedule(); // Mon–Fri 08–18, lunch 12–13

  it("accepts a normal slot inside working hours", () => {
    expect(checkSlotAgainstSchedule(schedule, mon(9, 0), mon(10, 0))).toEqual({ ok: true, reasons: [] });
  });

  it("flags a day off and does not also report hours/lunch on top of it", () => {
    expect(checkSlotAgainstSchedule(schedule, sun(10, 0), sun(11, 0))).toEqual({ ok: false, reasons: ["day_off"] });
  });

  it("flags before opening and after closing", () => {
    expect(checkSlotAgainstSchedule(schedule, mon(7, 0), mon(7, 30)).reasons).toEqual(["before_hours"]);
    expect(checkSlotAgainstSchedule(schedule, mon(18, 30), mon(19, 0)).reasons).toEqual(["after_hours"]);
  });

  it("flags a slot straddling both edges at once (and lunch, since it spans that too)", () => {
    expect(checkSlotAgainstSchedule(schedule, mon(7, 30), mon(18, 30)).reasons).toEqual(["before_hours", "after_hours", "lunch_break"]);
  });

  it("flags a slot that starts, ends, or fully spans the lunch break", () => {
    expect(checkSlotAgainstSchedule(schedule, mon(11, 30), mon(12, 30)).reasons).toEqual(["lunch_break"]);
    expect(checkSlotAgainstSchedule(schedule, mon(12, 30), mon(13, 30)).reasons).toEqual(["lunch_break"]);
    expect(checkSlotAgainstSchedule(schedule, mon(11, 0), mon(14, 0)).reasons).toEqual(["lunch_break"]);
  });

  it("does not flag a slot that ends exactly when lunch starts, or starts exactly when it ends", () => {
    expect(checkSlotAgainstSchedule(schedule, mon(11, 0), mon(12, 0)).ok).toBe(true);
    expect(checkSlotAgainstSchedule(schedule, mon(13, 0), mon(14, 0)).ok).toBe(true);
  });

  it("skips the lunch check entirely when no lunch break is configured", () => {
    const noLunch: WeekSchedule = { ...schedule, monday: { ...schedule.monday, lunchStart: null, lunchEnd: null } };
    expect(checkSlotAgainstSchedule(noLunch, mon(12, 0), mon(13, 0))).toEqual({ ok: true, reasons: [] });
  });
});

describe("describeSlotCheck", () => {
  it("joins every reason into one readable message", () => {
    const check = checkSlotAgainstSchedule(defaultWeekSchedule(), mon(7, 0), mon(7, 30));
    expect(describeSlotCheck(check)).toBe("horário antes do início do expediente");
    const check2 = checkSlotAgainstSchedule(defaultWeekSchedule(), mon(7, 0), mon(19, 0));
    expect(describeSlotCheck(check2)).toBe("horário antes do início do expediente; horário depois do fim do expediente; conflita com o horário de almoço");
  });
  it("is empty for an ok slot", () => {
    expect(describeSlotCheck({ ok: true, reasons: [] })).toBe("");
  });
});
