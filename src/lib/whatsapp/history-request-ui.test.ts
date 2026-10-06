import { describe, expect, it } from "vitest";
import { describeHistoryRequest, type HistoryRequestRow } from "./history-request-ui";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const row = (over: Partial<HistoryRequestRow> = {}): HistoryRequestRow => ({
  id: "r1",
  state: "pending",
  received_messages: null,
  has_more: null,
  history_access: null,
  error: null,
  requested_at: ago(10_000),
  completed_at: null,
  ...over,
});

describe("describeHistoryRequest", () => {
  it("no request yet: the button is available and nothing is said", () => {
    expect(describeHistoryRequest(null, NOW)).toMatchObject({ phase: "idle", canRequest: true, text: "" });
  });

  it("waiting: no second click, and no promise of when it finishes", () => {
    const v = describeHistoryRequest(row(), NOW);
    expect(v).toMatchObject({ phase: "waiting", canRequest: false });
    expect(v.text).toContain("Mantenha o WhatsApp aberto");
  });

  it("REGRESSION: a request nobody answered stops showing 'waiting' after a few minutes", () => {
    const v = describeHistoryRequest(row({ requested_at: ago(6 * 60_000) }), NOW);
    expect(v.phase).toBe("problem");
    expect(v.canRequest).toBe(true);
    expect(v.text).toContain("não respondeu");
  });

  it("reports how many arrived, singular and plural", () => {
    expect(describeHistoryRequest(row({ state: "completed", received_messages: 1, has_more: true, completed_at: ago(1000) }), NOW).text).toBe("1 mensagem anterior carregada.");
    expect(describeHistoryRequest(row({ state: "completed", received_messages: 50, has_more: true, completed_at: ago(1000) }), NOW).text).toBe("50 mensagens anteriores carregadas.");
  });

  it("only has_more:false proves the start of the conversation — and then the button goes away", () => {
    const v = describeHistoryRequest(row({ state: "completed", received_messages: 12, has_more: false, completed_at: ago(1000) }), NOW);
    expect(v).toMatchObject({ reachedStart: true, canRequest: false });
    expect(v.text).toContain("início da conversa");
  });

  it("has_more unknown (null) does NOT claim the start was reached", () => {
    expect(describeHistoryRequest(row({ state: "completed", received_messages: 12, has_more: null, completed_at: ago(1000) }), NOW)).toMatchObject({ reachedStart: false, canRequest: true });
  });

  it("the start of the conversation stays reached, even long after", () => {
    const v = describeHistoryRequest(row({ state: "completed", received_messages: 0, has_more: false, completed_at: ago(3 * 3600_000) }), NOW);
    expect(v).toMatchObject({ reachedStart: true, canRequest: false });
  });

  it("nothing arrived and the phone refused access: says so, can retry", () => {
    const v = describeHistoryRequest(row({ state: "completed", received_messages: 0, history_access: "unavailable", completed_at: ago(1000) }), NOW);
    expect(v).toMatchObject({ phase: "problem", canRequest: true });
    expect(v.text).toContain("não liberou");
  });

  it("nothing arrived, no reason given: neutral wording", () => {
    expect(describeHistoryRequest(row({ state: "completed", received_messages: 0, completed_at: ago(1000) }), NOW).text).toContain("não enviou");
  });

  it("timeouts and failures tell the user what to do", () => {
    expect(describeHistoryRequest(row({ state: "timeout", completed_at: ago(1000) }), NOW).text).toContain("Abra o WhatsApp no celular");
    expect(describeHistoryRequest(row({ state: "failed", error: "connection closed", completed_at: ago(1000) }), NOW).text).toContain("connection closed");
  });

  it("an old result goes quiet so the thread isn't cluttered forever", () => {
    expect(describeHistoryRequest(row({ state: "timeout", completed_at: ago(2 * 3600_000) }), NOW)).toMatchObject({ phase: "idle", canRequest: true });
    expect(describeHistoryRequest(row({ state: "completed", received_messages: 30, has_more: true, completed_at: ago(2 * 3600_000) }), NOW).phase).toBe("idle");
  });
});
