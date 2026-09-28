import { describe, expect, it } from "vitest";
import { buildEventPayload, extractMeetLink, GOOGLE_IMPORT_PLACEHOLDER_NAME, isImportedGoogleBlock } from "./google-calendar";

const base = {
  type: "Consulta de retorno",
  notes: "Trazer exames",
  start_time: "2026-09-30T14:00:00.000Z",
  end_time: "2026-09-30T15:00:00.000Z",
  patient_name: "Maria Silva",
  patient_phone: "5521999998888",
};

describe("buildEventPayload", () => {
  it("builds the core event fields", () => {
    const body = buildEventPayload(base);
    expect(body.summary).toBe("Consulta de retorno - Maria Silva");
    expect(body.start).toEqual({ dateTime: base.start_time });
    expect(body.end).toEqual({ dateTime: base.end_time });
    expect(String(body.description)).toContain("Telefone: 5521999998888");
    expect(String(body.description)).toContain("Trazer exames");
  });

  it("does not send attendees unless asked (so an update never wipes guests added by hand in Google)", () => {
    expect(buildEventPayload({ ...base, guest_emails: ["a@x.com"] })).not.toHaveProperty("attendees");
    expect(buildEventPayload({ ...base }, { forUpdate: true })).not.toHaveProperty("attendees");
  });

  it("sends a cleaned attendee list when asked", () => {
    const body = buildEventPayload({ ...base, guest_emails: ["A@X.com", "a@x.com", "bad", "b@y.com"] }, { includeAttendees: true });
    expect(body.attendees).toEqual([{ email: "a@x.com" }, { email: "b@y.com" }]);
  });

  it("sends an EMPTY attendee list when guests were all removed (that is how Google clears them)", () => {
    expect(buildEventPayload({ ...base, guest_emails: [] }, { includeAttendees: true }).attendees).toEqual([]);
  });

  it("requests a Google Meet room only when asked", () => {
    expect(buildEventPayload(base)).not.toHaveProperty("conferenceData");
    const body = buildEventPayload(base, { createMeet: true, requestId: "req-1" });
    expect(body.conferenceData).toEqual({
      createRequest: { requestId: "req-1", conferenceSolutionKey: { type: "hangoutsMeet" } },
    });
  });

  it("generates a request id when none is given", () => {
    const body = buildEventPayload(base, { createMeet: true }) as { conferenceData: { createRequest: { requestId: string } } };
    expect(body.conferenceData.createRequest.requestId.length).toBeGreaterThan(5);
  });

  it("can ask to remove an existing Meet", () => {
    expect(buildEventPayload(base, { removeMeet: true }).conferenceData).toBeNull();
  });

  it("marks cancelled/provisional appointments in the title only on updates", () => {
    expect(buildEventPayload({ ...base, status: "cancelled" }).summary).toBe("Consulta de retorno - Maria Silva");
    expect(buildEventPayload({ ...base, status: "cancelled" }, { forUpdate: true }).summary).toBe("Consulta de retorno - Maria Silva (DESMARCADO)");
    expect(buildEventPayload({ ...base, status: "confirmed" }, { forUpdate: true }).summary).toBe("Consulta de retorno - Maria Silva");
  });

  it("falls back to friendly defaults", () => {
    const body = buildEventPayload({ start_time: base.start_time, end_time: base.end_time });
    expect(body.summary).toBe("Consulta - Sem Nome");
  });
});

describe("extractMeetLink", () => {
  it("prefers hangoutLink", () => {
    expect(extractMeetLink({ hangoutLink: "https://meet.google.com/abc-defg-hij" })).toBe("https://meet.google.com/abc-defg-hij");
  });
  it("falls back to the video entry point", () => {
    expect(
      extractMeetLink({
        conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:+1" }, { entryPointType: "video", uri: "https://meet.google.com/x" }] },
      }),
    ).toBe("https://meet.google.com/x");
  });
  it("returns null when there is no conference", () => {
    expect(extractMeetLink({})).toBeNull();
    expect(extractMeetLink(null)).toBeNull();
  });
});

describe("isImportedGoogleBlock", () => {
  it("recognises the placeholder patient that imported Google events hang off", () => {
    expect(isImportedGoogleBlock(GOOGLE_IMPORT_PLACEHOLDER_NAME)).toBe(true);
  });
  it("never treats a real patient, a missing name or a look-alike as imported", () => {
    expect(isImportedGoogleBlock("Maria Silva")).toBe(false);
    expect(isImportedGoogleBlock("Bloqueio")).toBe(false);
    expect(isImportedGoogleBlock(null)).toBe(false);
    expect(isImportedGoogleBlock(undefined)).toBe(false);
  });
});
