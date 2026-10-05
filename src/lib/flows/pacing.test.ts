import { describe, expect, it, vi } from "vitest";

vi.mock("./admin-client", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("./meta-send", () => ({}));

import { applyFlowPacing, type PacingState } from "./engine";
import type { FlowRunRow } from "./types";

const run = { id: "run1", flow_id: "flow1" } as FlowRunRow;
const fresh = (): PacingState => ({ interval: undefined, budgetMs: 12_000 });

interface Calls {
  rpc: string[];
  parks: Record<string, unknown>[];
  events: { event_type: string; payload: Record<string, unknown> }[];
}

function fakeDb(opts: {
  interval?: number | null;
  slot?: string | null;
  rpcError?: boolean;
  parkRows?: number;
}) {
  const calls: Calls = { rpc: [], parks: [], events: [] };
  const db = {
    from(table: string) {
      if (table === "flows") {
        const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: { min_interval_seconds: opts.interval ?? null }, error: null }) };
        return b;
      }
      if (table === "flow_runs") {
        let payload: Record<string, unknown> = {};
        const b = {
          update: (p: Record<string, unknown>) => ((payload = p), b),
          eq: () => b,
          select: async () => {
            calls.parks.push(payload);
            const n = opts.parkRows ?? 1;
            return { data: Array.from({ length: n }, (_, i) => ({ id: i })), error: null };
          },
        };
        return b;
      }
      if (table === "flow_run_events") {
        return {
          insert: async (row: { event_type: string; payload: Record<string, unknown> }) => {
            calls.events.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (name: string) => {
      calls.rpc.push(name);
      return opts.rpcError ? { data: null, error: { message: "boom" } } : { data: opts.slot ?? null, error: null };
    },
  };
  return { db: db as never, calls };
}

describe("applyFlowPacing", () => {
  it("does nothing, and never touches the reservation function, when the flow has no interval", async () => {
    const { db, calls } = fakeDb({ interval: null });
    expect(await applyFlowPacing(db, run, "n1", fresh())).toBe(false);
    expect(calls.rpc).toHaveLength(0);
  });

  it("lets a send through when its slot is now", async () => {
    const { db, calls } = fakeDb({ interval: 10, slot: new Date().toISOString() });
    expect(await applyFlowPacing(db, run, "n1", fresh())).toBe(false);
    expect(calls.rpc).toEqual(["reserve_flow_send_slot"]);
    expect(calls.parks).toHaveLength(0);
  });

  it("waits a short gap inline, logs it, and spends the inline budget", async () => {
    const { db, calls } = fakeDb({ interval: 10, slot: new Date(Date.now() + 700).toISOString() });
    const state = fresh();
    const t0 = Date.now();
    expect(await applyFlowPacing(db, run, "n1", state)).toBe(false);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(600);
    expect(state.budgetMs).toBeLessThan(12_000);
    expect(calls.events.map((e) => e.payload.mode)).toEqual(["inline"]);
    expect(calls.parks).toHaveLength(0);
  });

  it("parks the run on the node with resume_at when the slot is far away", async () => {
    const slot = new Date(Date.now() + 90_000).toISOString();
    const { db, calls } = fakeDb({ interval: 10, slot });
    expect(await applyFlowPacing(db, run, "n7", fresh())).toBe(true);
    expect(calls.parks).toHaveLength(1);
    expect(calls.parks[0]).toMatchObject({ current_node_key: "n7", resume_at: slot });
    expect(calls.events.map((e) => e.payload.mode)).toEqual(["deferred"]);
  });

  it("stops the advance without sending if the run ended while it was being parked", async () => {
    const { db, calls } = fakeDb({ interval: 10, slot: new Date(Date.now() + 90_000).toISOString(), parkRows: 0 });
    expect(await applyFlowPacing(db, run, "n1", fresh())).toBe(true);
    expect(calls.events).toHaveLength(0);
  });

  it("fails open when the reservation errors — a stalled run is worse than an early message", async () => {
    const { db } = fakeDb({ interval: 10, rpcError: true });
    expect(await applyFlowPacing(db, run, "n1", fresh())).toBe(false);
  });

  it("loads the flow's interval once and reuses it for later sends in the same advance", async () => {
    const { db } = fakeDb({ interval: 10, slot: new Date().toISOString() });
    const state = fresh();
    await applyFlowPacing(db, run, "n1", state);
    expect(state.interval).toBe(10);
  });
});
