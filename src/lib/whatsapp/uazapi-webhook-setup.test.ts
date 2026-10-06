import { afterEach, describe, expect, it, vi } from "vitest";
import { eventsFromWebhookConfig, setUazapiWebhook } from "./uazapi-api";

afterEach(() => vi.unstubAllGlobals());

/** Fake Uazapi server whose stored events depend on the format it understands. */
function fakeServer(mode: "new" | "legacy") {
  let stored: unknown = [];
  const posts: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (_url: string, init: { method: string; body?: string }) => {
    if (init.method === "POST") {
      const body = JSON.parse(init.body as string);
      posts.push(body);
      // "legacy" servers keep only a string; an array is accepted and silently dropped.
      stored = mode === "new" ? [{ events: body.events }] : [{ events: typeof body.events === "string" ? body.events : "" }];
      return { ok: true, status: 200, json: async () => stored } as Response;
    }
    return { ok: true, status: 200, json: async () => stored } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { posts, fetchMock };
}

describe("eventsFromWebhookConfig", () => {
  it("reads arrays, comma strings and a single object", () => {
    expect(eventsFromWebhookConfig([{ events: ["messages", "labels"] }])).toEqual(["messages", "labels"]);
    expect(eventsFromWebhookConfig([{ events: "messages, labels" }])).toEqual(["messages", "labels"]);
    expect(eventsFromWebhookConfig({ events: ["messages"] })).toEqual(["messages"]);
  });
  it("returns nothing for empty or malformed config", () => {
    expect(eventsFromWebhookConfig([{ events: [] }])).toEqual([]);
    expect(eventsFromWebhookConfig([{ events: "" }])).toEqual([]);
    expect(eventsFromWebhookConfig(null)).toEqual([]);
    expect(eventsFromWebhookConfig("x")).toEqual([]);
  });
});

describe("setUazapiWebhook", () => {
  it("on a current server, registers once with ARRAYS and every wanted event", async () => {
    const { posts } = fakeServer("new");
    expect(await setUazapiWebhook("https://srv", "tok", "https://app/hook?account_id=a")).toBe(true);
    expect(posts).toHaveLength(1);
    expect(Array.isArray(posts[0].events)).toBe(true);
    expect(posts[0].events).toEqual(
      expect.arrayContaining(["messages", "messages_update", "connection", "labels", "chat_labels", "history", "contacts", "presence", "chats", "sender"]),
    );
    expect(posts[0].excludeMessages).toEqual(["isGroupYes"]);
  });

  it("never subscribes to calls, groups, stories or channels", async () => {
    const { posts } = fakeServer("new");
    await setUazapiWebhook("https://srv", "tok", "https://app/hook");
    for (const e of ["call", "groups", "status_posts", "newsletter_messages", "All"]) {
      expect(posts[0].events).not.toContain(e);
    }
  });

  it("REGRESSION: on a legacy server that drops arrays, falls back to the string format and ends up subscribed", async () => {
    const { posts } = fakeServer("legacy");
    expect(await setUazapiWebhook("https://srv", "tok", "https://app/hook")).toBe(true);
    expect(posts).toHaveLength(2);
    expect(Array.isArray(posts[0].events)).toBe(true);
    expect(typeof posts[1].events).toBe("string");
    expect(String(posts[1].events)).toContain("messages");
  });

  it("returns false when the server never keeps `messages`", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: { method: string }) => ({
        ok: true,
        status: 200,
        json: async () => (init.method === "GET" ? [{ events: [] }] : [{}]),
      })),
    );
    expect(await setUazapiWebhook("https://srv", "tok", "https://app/hook")).toBe(false);
  });

  it("trusts a successful save when the config can't be read back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: { method: string }) =>
        init.method === "GET" ? ({ ok: false, status: 500, json: async () => ({}) } as Response) : ({ ok: true, status: 200, json: async () => ({}) } as Response),
      ),
    );
    expect(await setUazapiWebhook("https://srv", "tok", "https://app/hook")).toBe(true);
  });

  it("returns false when every save fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response));
    expect(await setUazapiWebhook("https://srv", "tok", "https://app/hook")).toBe(false);
  });
});
