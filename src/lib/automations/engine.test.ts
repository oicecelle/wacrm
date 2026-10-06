import { describe, it, expect, beforeEach, vi } from "vitest";

// Shared mock state for the service-role client. Lives in a hoisted block
// so the vi.mock factory below can close over it.
const h = vi.hoisted(() => ({
  state: {
    owned: null as { id: string } | null,
    ownedCustomField: null as { id: string } | null,
    automations: [] as Record<string, unknown>[],
    steps: [] as Record<string, unknown>[],
    fromCalls: [] as string[],
    updateCalls: [] as { table: string; filters: [string, string, unknown][] }[],
    upsertCalls: [] as { table: string; payload: unknown }[],
    insertCalls: [] as { table: string; payload: unknown }[],
    rpcCalls: [] as string[],
    rpcData: null as unknown,
  },
}));

vi.mock("./admin-client", () => {
  const { state } = h;

  function resolve(ops: {
    table: string;
    type: string;
    payload?: unknown;
    filters: [string, string, unknown][];
  }) {
    const { table, type } = ops;
    if (table === "contacts") {
      if (type === "update") {
        state.updateCalls.push({ table, filters: ops.filters });
        return { data: null, error: null };
      }
      // ownership guard / condition read
      return { data: state.owned, error: null };
    }
    if (table === "custom_fields") {
      // account-scoped ownership lookup for a custom field definition
      return { data: state.ownedCustomField, error: null };
    }
    if (table === "contact_custom_values") {
      if (type === "upsert") {
        state.upsertCalls.push({ table, payload: ops.payload });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }
    if (table === "automations") return { data: state.automations, error: null };
    if (table === "automation_logs") {
      if (type === "insert") return { data: { id: "log1" }, error: null };
      if (type === "update") return { data: null, error: null };
      return { data: { steps_executed: [], status: "success" }, error: null };
    }
    if (table === "automation_steps") return { data: state.steps, error: null };
    return { data: null, error: null };
  }

  function builder(table: string) {
    const ops = {
      table,
      type: "select",
      payload: undefined as unknown,
      filters: [] as [string, string, unknown][],
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (p: unknown) => (
        (ops.type = "insert"),
        (ops.payload = p),
        state.insertCalls.push({ table, payload: p }),
        b
      ),
      update: (p: unknown) => ((ops.type = "update"), (ops.payload = p), b),
      delete: () => ((ops.type = "delete"), b),
      upsert: (p: unknown) => ((ops.type = "upsert"), (ops.payload = p), b),
      eq: (k: string, v: unknown) => (ops.filters.push(["eq", k, v]), b),
      gte: () => b,
      is: () => b,
      order: () => b,
      limit: () => b,
      single: () => Promise.resolve(resolve(ops)),
      maybeSingle: () => Promise.resolve(resolve(ops)),
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(resolve(ops)).then(onF, onR),
    };
    return b;
  }

  return {
    supabaseAdmin: () => ({
      from: (t: string) => {
        state.fromCalls.push(t);
        return builder(t);
      },
      rpc: (name: string) => {
        state.rpcCalls.push(name);
        return Promise.resolve({ data: state.rpcData, error: null });
      },
    }),
  };
});

const labelAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp/label-actions", () => ({ setContactWhatsappLabel: labelAction }));

vi.mock("./meta-send", () => ({
  engineSendText: vi.fn(async () => ({ whatsapp_message_id: "m1" })),
  engineSendTemplate: vi.fn(async () => ({ whatsapp_message_id: "m1" })),
}));

import { engineSendText } from "./meta-send";
import { runAutomationsForTrigger, isWithinWindow, minutesInTimeZone, dayOfWeekInTimeZone, waitMs, msUntilWindowOpens } from "./engine";

const ACCOUNT = "acct-1";

beforeEach(() => {
  h.state.owned = null;
  h.state.ownedCustomField = null;
  h.state.automations = [];
  h.state.steps = [];
  h.state.fromCalls = [];
  h.state.updateCalls = [];
  h.state.upsertCalls = [];
  h.state.insertCalls = [];
  h.state.rpcCalls = [];
  h.state.rpcData = null;
  vi.mocked(engineSendText).mockClear();
});

describe("runAutomationsForTrigger — tenant isolation", () => {
  it("refuses to dispatch when the contact is not in the account (GHSA-63cv-2c49-m5v3)", async () => {
    // Ownership lookup returns nothing — the contact belongs to another tenant.
    h.state.owned = null;
    // If the guard failed, this automation would run an update_contact_field step.
    h.state.automations = [automationWithUpdateStep()];
    h.state.steps = [updateStep()];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "victim-contact-uuid",
      context: { message_text: "manual trigger" },
    });

    // Bailed at the guard: never fetched automations, never wrote a contact.
    expect(h.state.fromCalls).toContain("contacts");
    expect(h.state.fromCalls).not.toContain("automations");
    expect(h.state.updateCalls).toHaveLength(0);
  });

  it("proceeds past the guard when the contact belongs to the account", async () => {
    h.state.owned = { id: "c1" };
    h.state.automations = []; // no matching automations; just prove we got past the guard

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: {},
    });

    expect(h.state.fromCalls).toContain("automations");
  });

  it("scopes the update_contact_field write to the automation's account", async () => {
    h.state.owned = { id: "c1" };
    h.state.automations = [automationWithUpdateStep()];
    h.state.steps = [updateStep()];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: {},
    });

    expect(h.state.updateCalls).toHaveLength(1);
    const filters = h.state.updateCalls[0].filters;
    expect(filters).toContainEqual(["eq", "id", "c1"]);
    expect(filters).toContainEqual(["eq", "account_id", ACCOUNT]);
  });
});

describe("update_contact_field — custom fields", () => {
  it("upserts contact_custom_values when the field is account-owned", async () => {
    h.state.owned = { id: "c1" };
    h.state.ownedCustomField = { id: "cf1" };
    h.state.automations = [automationWithUpdateStep()];
    h.state.steps = [customStep("custom:cf1", "Premium")];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: {},
    });

    // No direct contacts column write for a custom field.
    expect(h.state.updateCalls).toHaveLength(0);
    expect(h.state.upsertCalls).toHaveLength(1);
    expect(h.state.upsertCalls[0].payload).toEqual({
      contact_id: "c1",
      custom_field_id: "cf1",
      value: "Premium",
    });
  });

  it("interpolates {{ vars.* }} into the custom value", async () => {
    h.state.owned = { id: "c1" };
    h.state.ownedCustomField = { id: "cf1" };
    h.state.automations = [automationWithUpdateStep()];
    h.state.steps = [customStep("custom:cf1", "{{ vars.source }}")];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: { vars: { source: "WhatsApp Ad" } },
    });

    expect(h.state.upsertCalls).toHaveLength(1);
    expect(
      (h.state.upsertCalls[0].payload as { value: string }).value,
    ).toBe("WhatsApp Ad");
  });

  it("refuses to write a custom field from another account", async () => {
    h.state.owned = { id: "c1" };
    h.state.ownedCustomField = null; // account-scoped lookup finds nothing
    h.state.automations = [automationWithUpdateStep()];
    h.state.steps = [customStep("custom:foreign-cf", "x")];

    await runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: {},
    });

    expect(h.state.upsertCalls).toHaveLength(0);
    expect(h.state.updateCalls).toHaveLength(0);
  });
});

function automationWithUpdateStep() {
  return {
    id: "a1",
    account_id: ACCOUNT,
    user_id: "u1",
    trigger_type: "new_message_received",
    trigger_config: {},
    is_active: true,
  };
}

function updateStep() {
  return {
    id: "s1",
    automation_id: "a1",
    step_type: "update_contact_field",
    position: 0,
    parent_step_id: null,
    step_config: { field: "company", value: "pwned-by-automation" },
  };
}

function customStep(field: string, value: string) {
  return {
    id: "s1",
    automation_id: "a1",
    step_type: "update_contact_field",
    position: 0,
    parent_step_id: null,
    step_config: { field, value },
  };
}

describe("isWithinWindow / minutesInTimeZone (bug: server timezone vs Brasília)", () => {
  it("reads the hour in America/Sao_Paulo regardless of what the Date object's UTC hour is", () => {
    // 2026-10-01T00:19:27Z = 2026-09-30T21:19:27 em Brasília (UTC-3) —
    // exatamente a mensagem real que expôs o bug: o servidor via
    // getHours() leria "0", não "21".
    const d = new Date("2026-10-01T00:19:27Z");
    expect(minutesInTimeZone(d, "America/Sao_Paulo")).toBe(21 * 60 + 19);
  });

  it("matches a window using Brasília time, not the Date object's own UTC hour", () => {
    const withinWindow = new Date("2026-10-01T00:19:27Z"); // 21:19 BRT
    const outsideWindow = new Date("2026-10-01T00:21:13Z"); // 21:21 BRT
    expect(isWithinWindow("21:15-21:20", withinWindow)).toBe(true);
    expect(isWithinWindow("21:15-21:20", outsideWindow)).toBe(false);
  });

  it("still handles an overnight window (e.g. 22:00-06:00) correctly in Brasília time", () => {
    const lateNight = new Date("2026-10-01T04:00:00Z"); // 01:00 BRT — inside 22:00-06:00
    const midday = new Date("2026-10-01T15:00:00Z"); // 12:00 BRT — outside
    expect(isWithinWindow("22:00-06:00", lateNight)).toBe(true);
    expect(isWithinWindow("22:00-06:00", midday)).toBe(false);
  });
});

describe("dayOfWeekInTimeZone (condição de dia da semana)", () => {
  it("reads the weekday in America/Sao_Paulo, not the Date object's own UTC day", () => {
    // 2026-10-01T02:30:00Z = 2026-09-30T23:30:00 em Brasília — ainda
    // quarta-feira (3) em Brasília, mesmo já sendo quinta em UTC.
    const d = new Date("2026-10-01T02:30:00Z");
    expect(dayOfWeekInTimeZone(d, "America/Sao_Paulo")).toBe(3); // Wed
  });

  it("matches Date#getDay()'s convention (0=domingo..6=sábado) for a clean local date", () => {
    // 2026-09-28 é uma segunda-feira.
    const d = new Date("2026-09-28T15:00:00Z"); // 12:00 BRT, mesmo dia em ambos os fusos
    expect(dayOfWeekInTimeZone(d, "America/Sao_Paulo")).toBe(1); // Mon
  });
});

describe("evaluateCondition — time_of_day com filtro de dias (via isWithinWindow + days)", () => {
  it("days vazio ou ausente continua valendo todo santo dia (comportamento anterior)", () => {
    const sunday = new Date("2026-09-27T15:00:00Z"); // domingo, 12:00 BRT
    expect(isWithinWindow("10:00-14:00", sunday)).toBe(true);
  });
});

describe("waitMs — nova unidade 'segundos'", () => {
  it("espera em segundos de verdade, não arredonda pra minuto", () => {
    expect(waitMs({ amount: 60, unit: "seconds" })).toBe(60_000);
    expect(waitMs({ amount: 90, unit: "seconds" })).toBe(90_000);
  });
  it("continua funcionando pras unidades antigas", () => {
    expect(waitMs({ amount: 1, unit: "minutes" })).toBe(60_000);
    expect(waitMs({ amount: 2, unit: "hours" })).toBe(2 * 3_600_000);
  });
});

describe("msUntilWindowOpens — com filtro de dias (fila seg-sáb)", () => {
  it("abre na hora se já está dentro da janela e do dia permitido", () => {
    const mon = new Date("2026-09-28T15:00:00Z"); // segunda, 12:00 BRT
    expect(msUntilWindowOpens("10:00-14:00", mon, [1, 2, 3, 4, 5, 6])).toBe(0);
  });

  it("empurra pro próximo dia permitido quando hoje não é um deles (ex: domingo)", () => {
    // domingo (0) não está em seg-sáb — deve esperar até segunda 10:00.
    const sunday = new Date("2026-09-27T15:00:00Z"); // domingo, 12:00 BRT
    const ms = msUntilWindowOpens("10:00-14:00", sunday, [1, 2, 3, 4, 5, 6]);
    const openedAt = new Date(sunday.getTime() + ms);
    expect(dayOfWeekInTimeZone(openedAt, "America/Sao_Paulo")).toBe(1); // segunda
    expect(minutesInTimeZone(openedAt, "America/Sao_Paulo")).toBe(10 * 60);
  });

  it("sem days informado, continua valendo todo santo dia (comportamento anterior)", () => {
    const outsideSunday = new Date("2026-09-27T20:00:00Z"); // domingo, 17:00 BRT — fora de 10-14h
    expect(msUntilWindowOpens("10:00-14:00", outsideSunday)).toBeGreaterThan(0); // fora do horário, mas qualquer dia serve
    const insideSunday = new Date("2026-09-27T15:00:00Z"); // domingo, 12:00 BRT — dentro de 10-14h
    expect(msUntilWindowOpens("10:00-14:00", insideSunday)).toBe(0);
  });
});


describe("send-interval pacing in the automations engine", () => {
  const pacedAutomation = () => ({ ...automationWithUpdateStep(), min_interval_seconds: 120 });
  const sendStep = () => ({
    id: "send1",
    automation_id: "a1",
    step_type: "send_message",
    position: 0,
    parent_step_id: null,
    step_config: { text: "oi" },
  });
  const trigger = (vars?: Record<string, unknown>) =>
    runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: { message_text: "hi", conversation_id: "conv1", ...(vars ? { vars } : {}) },
    });

  beforeEach(() => {
    h.state.owned = { id: "c1" };
    h.state.automations = [pacedAutomation()];
    h.state.steps = [sendStep()];
  });

  it("sends right away when the reserved slot is now", async () => {
    h.state.rpcData = new Date().toISOString();
    await trigger();
    expect(h.state.rpcCalls).toContain("reserve_automation_send_slot");
    expect(engineSendText).toHaveBeenCalledTimes(1);
    expect(h.state.insertCalls.filter((c) => c.table === "automation_pending_executions")).toHaveLength(0);
  });

  it("defers a far-off slot to the queue, WITHOUT sending, and tags the step as owning its slot", async () => {
    const slot = new Date(Date.now() + 90_000).toISOString();
    h.state.rpcData = slot;
    await trigger();
    expect(engineSendText).not.toHaveBeenCalled();
    const queued = h.state.insertCalls.filter((c) => c.table === "automation_pending_executions");
    expect(queued).toHaveLength(1);
    const row = queued[0].payload as { run_at: string; next_step_position: number; context: { vars: Record<string, unknown> } };
    expect(row.run_at).toBe(slot);
    expect(row.next_step_position).toBe(0); // resumes AT the send, not after it
    expect(row.context.vars.__paced_step_id).toBe("send1");
  });

  it(
    "REGRESSION: a run resumed from the queue sends without reserving a second slot " +
      "(before, it re-reserved, re-deferred, and with an interval longer than the cron " +
      "lag it would never send at all)",
    async () => {
      // Even if a reservation WOULD push it out, the step owns its slot.
      h.state.rpcData = new Date(Date.now() + 90_000).toISOString();
      await trigger({ __paced_step_id: "send1" });
      expect(h.state.rpcCalls).not.toContain("reserve_automation_send_slot");
      expect(engineSendText).toHaveBeenCalledTimes(1);
      expect(h.state.insertCalls.filter((c) => c.table === "automation_pending_executions")).toHaveLength(0);
    },
  );

  it("does no pacing at all when the automation has no interval configured", async () => {
    h.state.automations = [automationWithUpdateStep()];
    await trigger();
    expect(h.state.rpcCalls).not.toContain("reserve_automation_send_slot");
    expect(engineSendText).toHaveBeenCalledTimes(1);
  });
});


describe("WhatsApp label steps", () => {
  const labelStep = (type: "add_whatsapp_label" | "remove_whatsapp_label", wa_label_id = "10") => ({
    id: "lbl1",
    automation_id: "a1",
    step_type: type,
    position: 0,
    parent_step_id: null,
    step_config: { wa_label_id },
  });
  const sendStep = {
    id: "send2",
    automation_id: "a1",
    step_type: "send_message",
    position: 1,
    parent_step_id: null,
    step_config: { text: "depois da etiqueta" },
  };
  const trigger = () =>
    runAutomationsForTrigger({
      accountId: ACCOUNT,
      triggerType: "new_message_received",
      contactId: "c1",
      context: { message_text: "hi", conversation_id: "conv1" },
    });

  beforeEach(() => {
    labelAction.mockReset();
    h.state.owned = { id: "c1" };
    h.state.automations = [automationWithUpdateStep()];
  });

  it("add: calls the label service for THIS account and contact, then carries on", async () => {
    labelAction.mockResolvedValue({ ok: true });
    h.state.steps = [labelStep("add_whatsapp_label", "10"), sendStep];
    await trigger();
    expect(labelAction).toHaveBeenCalledWith(expect.anything(), ACCOUNT, "c1", "10", "add");
    expect(engineSendText).toHaveBeenCalledTimes(1);
  });

  it("remove maps to the 'remove' operation", async () => {
    labelAction.mockResolvedValue({ ok: true });
    h.state.steps = [labelStep("remove_whatsapp_label", "20")];
    await trigger();
    expect(labelAction).toHaveBeenCalledWith(expect.anything(), ACCOUNT, "c1", "20", "remove");
  });

  it("REGRESSION: when WhatsApp refuses, the step FAILS and later steps do not run (no false success)", async () => {
    labelAction.mockResolvedValue({ ok: false, error: "label not found" });
    h.state.steps = [labelStep("add_whatsapp_label", "999"), sendStep];
    await trigger();
    expect(labelAction).toHaveBeenCalledTimes(1);
    expect(engineSendText).not.toHaveBeenCalled();
  });

  it("a step with no label chosen fails without calling WhatsApp", async () => {
    h.state.steps = [labelStep("add_whatsapp_label", ""), sendStep];
    await trigger();
    expect(labelAction).not.toHaveBeenCalled();
    expect(engineSendText).not.toHaveBeenCalled();
  });
});
