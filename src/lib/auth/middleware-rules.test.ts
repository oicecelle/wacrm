import { describe, expect, it } from "vitest";
import { shouldBlockUnauthenticatedApi } from "./middleware-rules";

const base = { hasUser: false, authCheckTimedOut: false };

describe("shouldBlockUnauthenticatedApi", () => {
  it("blocks a genuinely unauthenticated call to a protected WhatsApp API route", () => {
    expect(shouldBlockUnauthenticatedApi({ ...base, pathname: "/api/whatsapp/labels/sync" })).toBe(true);
    expect(shouldBlockUnauthenticatedApi({ ...base, pathname: "/api/whatsapp/send" })).toBe(true);
  });

  it("REGRESSION: an auth check that merely TIMED OUT is 'unknown', not 'logged out' — must not 401", () => {
    expect(
      shouldBlockUnauthenticatedApi({ ...base, authCheckTimedOut: true, pathname: "/api/whatsapp/labels/sync" }),
    ).toBe(false);
  });

  it("lets a signed-in user through", () => {
    expect(shouldBlockUnauthenticatedApi({ hasUser: true, authCheckTimedOut: false, pathname: "/api/whatsapp/send" })).toBe(false);
  });

  it("never blocks the webhooks (they authenticate themselves, called by outside servers)", () => {
    for (const p of ["/api/whatsapp/uazapi-webhook", "/api/whatsapp/webhook", "/api/whatsapp/ticto-webhook"]) {
      expect(shouldBlockUnauthenticatedApi({ ...base, pathname: p })).toBe(false);
    }
  });

  it("does not apply outside /api/whatsapp/", () => {
    expect(shouldBlockUnauthenticatedApi({ ...base, pathname: "/api/automations" })).toBe(false);
    expect(shouldBlockUnauthenticatedApi({ ...base, pathname: "/inbox" })).toBe(false);
  });
});
