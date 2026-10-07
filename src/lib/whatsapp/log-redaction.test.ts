import { describe, expect, it } from "vitest";
import { MAX_LOGGED_STRING, redactWebhookPayloadForLog, redactedLogLine } from "./log-redaction";

describe("redactWebhookPayloadForLog", () => {
  it("never keeps the instance token — at the top level or nested", () => {
    const out = redactWebhookPayloadForLog({
      EventType: "messages",
      token: "SECRET-TOKEN",
      owner: "5511999999999",
      nested: { deeper: { Token: "ALSO-SECRET", ok: 1 } },
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain("SECRET");
    expect(out.EventType).toBe("messages");
    expect(out.owner).toBe("5511999999999");
    expect((out.nested as { deeper: Record<string, unknown> }).deeper).toEqual({ ok: 1 });
  });

  it("REGRESSION: the text people wrote is not stored, but its presence and length are", () => {
    const out = redactWebhookPayloadForLog({
      message: { messageid: "3EB0ABC", text: "estou com dor depois do procedimento", fromMe: false, messageType: "conversation" },
    }) as { message: Record<string, unknown> };
    expect(JSON.stringify(out)).not.toContain("dor depois");
    expect(out.message.text).toBe("[texto omitido: 36 caracteres]");
    // structure and ids survive — that is what the log is FOR
    expect(out.message).toMatchObject({ messageid: "3EB0ABC", fromMe: false, messageType: "conversation" });
  });

  it("catches text keys whatever their case, and inside arrays and nested objects", () => {
    const out = redactWebhookPayloadForLog({
      messages: [{ Text: "segredo 1", content: { caption: "segredo 2", mime: "image/jpeg" } }],
      chat: { wa_lastMessageText: "segredo 3" },
    });
    const s = JSON.stringify(out);
    expect(s).not.toContain("segredo");
    expect(s).toContain("image/jpeg");
  });

  it("keeps empty text fields as they are (an empty string says something about the shape)", () => {
    expect(redactWebhookPayloadForLog({ text: "" })).toEqual({ text: "" });
  });

  it("shortens blobs such as base64 thumbnails instead of storing them", () => {
    const blob = "A".repeat(50_000);
    const out = redactWebhookPayloadForLog({ message: { thumbnail: blob, id: "x" } }) as { message: { thumbnail: string; id: string } };
    expect(out.message.thumbnail.length).toBeLessThan(MAX_LOGGED_STRING);
    expect(out.message.thumbnail).toContain("50000 caracteres");
    expect(out.message.id).toBe("x");
  });

  it("does not mutate its input (the webhook still needs the real payload)", () => {
    const body = { token: "T", message: { text: "oi" } };
    redactWebhookPayloadForLog(body);
    expect(body).toEqual({ token: "T", message: { text: "oi" } });
  });

  it("leaves numbers, booleans, null and arrays of ids alone", () => {
    expect(redactWebhookPayloadForLog({ n: 1, b: true, z: null, ids: ["a", "b"], ts: 1700000000000 })).toEqual({
      n: 1,
      b: true,
      z: null,
      ids: ["a", "b"],
      ts: 1700000000000,
    });
  });

  it("survives non-objects and absurdly deep nesting", () => {
    expect(redactWebhookPayloadForLog(null)).toBeNull();
    expect(redactWebhookPayloadForLog("x")).toBe("x");
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 40; i++) deep = { child: deep };
    expect(() => JSON.stringify(redactWebhookPayloadForLog(deep))).not.toThrow();
  });
});

describe("redactedLogLine", () => {
  it("is a bounded string with no token", () => {
    const line = redactedLogLine({ token: "SECRET", message: { text: "olá" }, pad: "x".repeat(5000) }, 200);
    expect(line.length).toBeLessThanOrEqual(200);
    expect(line).not.toContain("SECRET");
    expect(line).not.toContain("olá");
  });
  it("never throws on a circular payload", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => redactedLogLine(a)).not.toThrow();
  });
});
