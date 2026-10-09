import { describe, it, expect } from "vitest";
import { computePerformance, phoneKey, bestTemplate, parseManualOutcome, type PerfRecipient, type PerfAppointment } from "./performance";

const rec = (id: string, tpl: string, phone: string, sent: string, replied: string | null = null, b = "b1"): PerfRecipient => ({
  id, broadcast_id: b, broadcast_name: b, template_name: tpl, contact_id: id, contact_name: id, contact_phone: phone, sent_at: sent, replied_at: replied,
});
const appt = (id: string, created: string, phones: string[], status = "confirmed"): PerfAppointment => ({
  id, created_at: created, start_time: null, status, type: null, phones,
});
const range = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-31T23:59:59Z"), windowDays: 7 };

describe("phoneKey", () => {
  it("iguala formatos diferentes do mesmo número", () => {
    const k = phoneKey("+55 (21) 99531-9599");
    expect(k).toBe("2195319599");
    expect(phoneKey("21995319599")).toBe(k);
    expect(phoneKey("2195319599")).toBe(k);
    expect(phoneKey("5521995319599")).toBe(k);
  });
  it("vazio ou curto demais não gera chave", () => {
    expect(phoneKey("")).toBe("");
    expect(phoneKey(null)).toBe("");
    expect(phoneKey("123")).toBe("");
  });
});

describe("computePerformance", () => {
  it("conta enviados, respostas e taxa por modelo", () => {
    const r = computePerformance(
      [
        rec("1", "A", "21990000001", "2026-10-02T10:00:00Z", "2026-10-02T11:00:00Z"),
        rec("2", "A", "21990000002", "2026-10-02T10:00:00Z"),
        rec("3", "B", "21990000003", "2026-10-03T10:00:00Z", "2026-10-03T10:05:00Z"),
      ],
      [],
      range,
    );
    const a = r.rows.find((x) => x.template === "A")!;
    expect(a.sent).toBe(2);
    expect(a.replied).toBe(1);
    expect(a.replyRate).toBe(0.5);
    expect(r.totals.sent).toBe(3);
    expect(r.totals.replied).toBe(2);
  });

  it("resposta fora da janela não conta", () => {
    const r = computePerformance([rec("1", "A", "21990000001", "2026-10-02T10:00:00Z", "2026-10-20T10:00:00Z")], [], range);
    expect(r.rows[0].replied).toBe(0);
  });

  it("ignora envios fora do período", () => {
    const r = computePerformance([rec("1", "A", "21990000001", "2026-09-02T10:00:00Z")], [], range);
    expect(r.rows).toHaveLength(0);
  });

  it("agendamento criado depois do envio, dentro da janela, conta para o modelo", () => {
    const r = computePerformance(
      [rec("1", "A", "21990000001", "2026-10-02T10:00:00Z", "2026-10-02T11:00:00Z")],
      [appt("p1", "2026-10-03T10:00:00Z", ["(21) 99000-0001"])],
      range,
    );
    expect(r.rows[0].scheduled).toBe(1);
    expect(r.rows[0].results[0].appointment?.id).toBe("p1");
  });

  it("agendamento antes do envio ou fora da janela não conta", () => {
    const r = computePerformance(
      [rec("1", "A", "21990000001", "2026-10-02T10:00:00Z")],
      [appt("antes", "2026-10-01T10:00:00Z", ["21990000001"]), appt("longe", "2026-10-20T10:00:00Z", ["21990000001"])],
      range,
    );
    expect(r.rows[0].scheduled).toBe(0);
  });

  it("agendamento cancelado não conta", () => {
    const r = computePerformance(
      [rec("1", "A", "21990000001", "2026-10-02T10:00:00Z")],
      [appt("p1", "2026-10-03T10:00:00Z", ["21990000001"], "cancelled")],
      range,
    );
    expect(r.rows[0].scheduled).toBe(0);
  });

  it("com dois disparos antes do agendamento, o crédito é do último", () => {
    const r = computePerformance(
      [rec("1", "A", "21990000001", "2026-10-02T10:00:00Z"), rec("2", "B", "21990000001", "2026-10-04T10:00:00Z", null, "b2")],
      [appt("p1", "2026-10-05T10:00:00Z", ["21990000001"])],
      range,
    );
    expect(r.rows.find((x) => x.template === "A")!.scheduled).toBe(0);
    expect(r.rows.find((x) => x.template === "B")!.scheduled).toBe(1);
  });

  it("disparo anterior ao período ainda pode receber o crédito (e some da conta do período)", () => {
    const r = computePerformance(
      [rec("old", "Velho", "21990000001", "2026-09-30T10:00:00Z"), rec("new", "Novo", "21990000002", "2026-10-02T10:00:00Z")],
      [appt("p1", "2026-10-02T09:00:00Z", ["21990000001"])],
      range,
    );
    expect(r.rows.map((x) => x.template)).toEqual(["Novo"]);
    expect(r.totals.scheduled).toBe(0);
  });

  it("conta disparos distintos por modelo", () => {
    const r = computePerformance(
      [rec("1", "A", "21990000001", "2026-10-02T10:00:00Z", null, "b1"), rec("2", "A", "21990000002", "2026-10-02T10:00:00Z", null, "b1"), rec("3", "A", "21990000003", "2026-10-09T10:00:00Z", null, "b2")],
      [],
      range,
    );
    expect(r.rows[0].broadcasts).toBe(2);
  });
});

describe("bestTemplate", () => {
  it("só considera modelos com amostra mínima", () => {
    const mk = (template: string, sent: number, replied: number, scheduled: number) => ({
      template, broadcasts: 1, sent, replied, replyRate: replied / sent, scheduled, scheduleRate: scheduled / sent, results: [],
    });
    expect(bestTemplate([mk("pequeno", 3, 3, 3), mk("grande", 100, 30, 5)])?.template).toBe("grande");
    expect(bestTemplate([mk("pequeno", 3, 3, 3)])).toBeNull();
  });
});

describe("marcação manual do resultado", () => {
  const withManual = (r: PerfRecipient, manual: PerfRecipient["manual_outcome"]): PerfRecipient => ({ ...r, manual_outcome: manual });

  it("'agendou' conta como agendamento mesmo sem agendamento no sistema e fora da janela", () => {
    const r = computePerformance(
      [withManual(rec("1", "A", "21990000001", "2026-10-02T10:00:00Z"), "agendou")],
      [],
      range,
    );
    const a = r.rows[0];
    expect(a.scheduled).toBe(1);
    expect(a.results[0].scheduled).toBe(true);
    expect(a.results[0].scheduledBy).toBe("manual");
    expect(r.totals.scheduled).toBe(1);
  });

  it("'agendou' não inventa resposta: respondeu continua como estava", () => {
    const r = computePerformance([withManual(rec("1", "A", "21990000001", "2026-10-02T10:00:00Z"), "agendou")], [], range);
    expect(r.rows[0].replied).toBe(0);
    expect(r.rows[0].results[0].replied).toBe(false);
  });

  it("'respondeu' desfaz um agendamento detectado e conta a resposta fora da janela", () => {
    const r = computePerformance(
      [withManual(rec("1", "A", "21990000001", "2026-10-02T10:00:00Z", "2026-10-20T10:00:00Z"), "respondeu")],
      [appt("a1", "2026-10-03T10:00:00Z", ["21990000001"])],
      range,
    );
    const a = r.rows[0];
    expect(a.replied).toBe(1);
    expect(a.scheduled).toBe(0);
    expect(a.results[0].appointment).toBeNull();
  });

  it("'sem_resposta' zera resposta e agendamento detectados", () => {
    const r = computePerformance(
      [withManual(rec("1", "A", "21990000001", "2026-10-02T10:00:00Z", "2026-10-02T11:00:00Z"), "sem_resposta")],
      [appt("a1", "2026-10-03T10:00:00Z", ["21990000001"])],
      range,
    );
    expect(r.rows[0].replied).toBe(0);
    expect(r.rows[0].scheduled).toBe(0);
  });

  it("sem marcação manual, a detecção automática segue valendo", () => {
    const r = computePerformance(
      [rec("1", "A", "21990000001", "2026-10-02T10:00:00Z")],
      [appt("a1", "2026-10-03T10:00:00Z", ["21990000001"])],
      range,
    );
    expect(r.rows[0].scheduled).toBe(1);
    expect(r.rows[0].results[0].scheduledBy).toBe("auto");
  });
});

describe("parseManualOutcome", () => {
  it("aceita só os valores conhecidos", () => {
    expect(parseManualOutcome("agendou")).toBe("agendou");
    expect(parseManualOutcome("respondeu")).toBe("respondeu");
    expect(parseManualOutcome("sem_resposta")).toBe("sem_resposta");
    expect(parseManualOutcome("qualquer")).toBeNull();
    expect(parseManualOutcome(null)).toBeNull();
  });
});
