import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_TTL_MS,
  clearAppointmentDraft,
  readAppointmentDraft,
  writeAppointmentDraft,
  type AppointmentDraftFields,
} from "./appointment-draft";

function stubSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

const fields: AppointmentDraftFields = {
  patientId: "p1",
  selectedPatientInfo: { id: "p1", name: "Ana", phone: "83999990000" },
  professionalId: "u1",
  procedureName: "Limpeza de pele",
  procedureId: "proc1",
  roomId: "",
  startTime: "2026-10-06T10:00",
  endTime: "2026-10-06T11:00",
  status: "provisional",
  notes: "primeira vez",
  apptType: "consulta",
  appointmentTag: "",
  appointmentTagColor: "#3b82f6",
  isOnline: false,
  guestEmails: [],
  sendWa: true,
};

describe("appointment draft", () => {
  beforeEach(() => {
    stubSessionStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("round-trips what was typed", () => {
    writeAppointmentDraft("clinic1", "new|2026-10-06", fields);
    expect(readAppointmentDraft("clinic1", "new|2026-10-06")).toEqual(fields);
  });

  it("does not restore into a DIFFERENT booking (another slot/patient)", () => {
    writeAppointmentDraft("clinic1", "new|2026-10-06", fields);
    expect(readAppointmentDraft("clinic1", "new|2026-10-07")).toBeNull();
  });

  it("is scoped per clinic", () => {
    writeAppointmentDraft("clinic1", "k", fields);
    expect(readAppointmentDraft("clinic2", "k")).toBeNull();
  });

  it("expires after 12 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T08:00:00Z"));
    writeAppointmentDraft("clinic1", "k", fields);
    vi.setSystemTime(new Date(Date.now() + DRAFT_TTL_MS + 1000));
    expect(readAppointmentDraft("clinic1", "k")).toBeNull();
  });

  it("clear removes it", () => {
    writeAppointmentDraft("clinic1", "k", fields);
    clearAppointmentDraft("clinic1");
    expect(readAppointmentDraft("clinic1", "k")).toBeNull();
  });

  it("treats corrupted storage as 'no draft' instead of throwing", () => {
    sessionStorage.setItem("appt-draft:clinic1", "{not json");
    expect(readAppointmentDraft("clinic1", "k")).toBeNull();
  });

  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => writeAppointmentDraft("c", "k", fields)).not.toThrow();
    expect(readAppointmentDraft("c", "k")).toBeNull();
    expect(() => clearAppointmentDraft("c")).not.toThrow();
  });
});
