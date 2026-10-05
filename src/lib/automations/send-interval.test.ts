import { describe, expect, it } from "vitest";
import { parseSendInterval } from "./send-interval";

describe("parseSendInterval", () => {
  it("treats empty-ish values and 0 as no pacing", () => {
    expect(parseSendInterval(null)).toBeNull();
    expect(parseSendInterval(undefined)).toBeNull();
    expect(parseSendInterval("")).toBeNull();
    expect(parseSendInterval(0)).toBeNull();
  });
  it("accepts whole seconds, including numeric strings", () => {
    expect(parseSendInterval(10)).toBe(10);
    expect(parseSendInterval("30")).toBe(30);
    expect(parseSendInterval(86_400)).toBe(86_400);
  });
  it("rejects invalid values instead of storing them", () => {
    expect(parseSendInterval(-1)).toBeUndefined();
    expect(parseSendInterval(1.5)).toBeUndefined();
    expect(parseSendInterval("abc")).toBeUndefined();
    expect(parseSendInterval(86_401)).toBeUndefined();
  });
});
