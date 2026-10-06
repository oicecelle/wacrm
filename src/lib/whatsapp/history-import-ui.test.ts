import { describe, expect, it } from "vitest";
import { HISTORY_PENDING_GIVE_UP_MS, describeHistoryImport } from "./history-import-ui";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("describeHistoryImport", () => {
  it("says nothing for a connection that predates this feature (state NULL)", () => {
    expect(describeHistoryImport(null, null, false, NOW)).toBeNull();
    expect(describeHistoryImport(undefined, undefined, true, NOW)).toBeNull();
  });
  it("tells someone waiting that it's pending, then importing", () => {
    expect(describeHistoryImport("pending", ago(30_000), false, NOW)).toContain("Aguardando");
    expect(describeHistoryImport("importing", ago(30_000), true, NOW)).toContain("Importando");
  });
  it("REGRESSION: doesn't wait forever — after 10 minutes pending, points to the per-conversation button", () => {
    const msg = describeHistoryImport("pending", ago(HISTORY_PENDING_GIVE_UP_MS + 1000), false, NOW)!;
    expect(msg).toContain("ainda não enviou");
    expect(msg).toContain("Carregar mensagens anteriores");
  });
  it("announces 'done' only to someone who watched it happen", () => {
    expect(describeHistoryImport("done", ago(1000), true, NOW)).toContain("importado");
    expect(describeHistoryImport("done", ago(1000), false, NOW)).toBeNull();
  });
});
