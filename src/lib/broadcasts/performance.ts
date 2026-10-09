/**
 * Desempenho de disparos por modelo.
 *
 * Regras de atribuição (iguais para todos os modelos, para a comparação ser justa):
 *  - Janela: só vale resposta ou agendamento até `windowDays` dias depois do envio.
 *  - Resposta: o contato respondeu dentro da janela (replied_at - sent_at).
 *  - Agendamento: um agendamento CRIADO depois do envio, dentro da janela,
 *    para um paciente com o mesmo telefone do contato. Se o contato recebeu
 *    mais de um disparo antes de agendar, o crédito vai para o ÚLTIMO
 *    (último toque), e cada agendamento conta uma única vez.
 *
 * Tudo aqui é puro (sem banco) para ser testável.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Chave para comparar telefones escritos de jeitos diferentes:
 * "+55 (21) 99531-9599", "21995319599" e "2195319599" dão a mesma chave
 * (DDD + 8 últimos dígitos; o 9 extra do celular é ignorado).
 */
export function phoneKey(phone: string | null | undefined): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) d = d.slice(0, 2) + d.slice(3); // tira o 9 extra
  if (d.length === 10) return d;
  return d.length >= 8 ? d.slice(-8) : "";
}

export interface PerfRecipient {
  id: string;
  broadcast_id: string;
  broadcast_name: string;
  template_name: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  sent_at: string;
  replied_at: string | null;
}

export interface PerfAppointment {
  id: string;
  created_at: string;
  start_time: string | null;
  status: string | null;
  type: string | null;
  phones: Array<string | null | undefined>;
}

export interface RecipientResult {
  recipient: PerfRecipient;
  replied: boolean;
  appointment: PerfAppointment | null;
}

export interface TemplatePerf {
  template: string;
  broadcasts: number;
  sent: number;
  replied: number;
  replyRate: number;
  scheduled: number;
  scheduleRate: number;
  results: RecipientResult[];
}

export interface PerformanceResult {
  rows: TemplatePerf[];
  totals: { broadcasts: number; sent: number; replied: number; replyRate: number; scheduled: number; scheduleRate: number };
}

const CANCELLED = new Set(["cancelled", "canceled", "cancelado", "no_show"]);

function rate(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

/**
 * @param recipients  destinatários enviados — pode incluir envios ANTES do período
 *                    (servem só para o crédito "último toque").
 * @param from/to     período analisado (só envios dentro dele entram nas contas).
 */
export function computePerformance(
  recipients: PerfRecipient[],
  appointments: PerfAppointment[],
  opts: { from: Date; to: Date; windowDays: number },
): PerformanceResult {
  const windowMs = opts.windowDays * DAY_MS;
  const fromMs = opts.from.getTime();
  const toMs = opts.to.getTime();

  // índice: chave de telefone -> envios (mais recentes primeiro)
  const byKey = new Map<string, PerfRecipient[]>();
  for (const r of recipients) {
    const k = phoneKey(r.contact_phone);
    if (!k) continue;
    const list = byKey.get(k);
    if (list) list.push(r);
    else byKey.set(k, [r]);
  }
  for (const list of byKey.values()) list.sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));

  // crédito de cada agendamento: último envio antes dele, dentro da janela
  const credited = new Map<string, PerfAppointment>(); // recipient.id -> agendamento mais antigo
  for (const appt of appointments) {
    if (appt.status && CANCELLED.has(appt.status.toLowerCase())) continue;
    const created = Date.parse(appt.created_at);
    if (Number.isNaN(created)) continue;
    let best: PerfRecipient | null = null;
    for (const p of appt.phones) {
      const k = phoneKey(p);
      if (!k) continue;
      for (const r of byKey.get(k) ?? []) {
        const sent = Date.parse(r.sent_at);
        if (sent <= created && created - sent <= windowMs) {
          if (!best || sent > Date.parse(best.sent_at)) best = r;
          break; // lista ordenada: o primeiro válido é o mais recente deste telefone
        }
      }
    }
    if (best) {
      const prev = credited.get(best.id);
      if (!prev || Date.parse(appt.created_at) < Date.parse(prev.created_at)) credited.set(best.id, appt);
    }
  }

  const groups = new Map<string, TemplatePerf & { _b: Set<string> }>();
  for (const r of recipients) {
    const sent = Date.parse(r.sent_at);
    if (sent < fromMs || sent > toMs) continue;
    const name = r.template_name || "(sem modelo)";
    let g = groups.get(name);
    if (!g) {
      g = { template: name, broadcasts: 0, sent: 0, replied: 0, replyRate: 0, scheduled: 0, scheduleRate: 0, results: [], _b: new Set() };
      groups.set(name, g);
    }
    const repliedMs = r.replied_at ? Date.parse(r.replied_at) : NaN;
    const replied = !Number.isNaN(repliedMs) && repliedMs >= sent && repliedMs - sent <= windowMs;
    const appointment = credited.get(r.id) ?? null;
    g._b.add(r.broadcast_id);
    g.sent += 1;
    if (replied) g.replied += 1;
    if (appointment) g.scheduled += 1;
    g.results.push({ recipient: r, replied, appointment });
  }

  const rows: TemplatePerf[] = [];
  const totals = { broadcasts: 0, sent: 0, replied: 0, replyRate: 0, scheduled: 0, scheduleRate: 0 };
  const allBroadcasts = new Set<string>();
  for (const g of groups.values()) {
    g.broadcasts = g._b.size;
    g._b.forEach((b) => allBroadcasts.add(b));
    g.replyRate = rate(g.replied, g.sent);
    g.scheduleRate = rate(g.scheduled, g.sent);
    totals.sent += g.sent;
    totals.replied += g.replied;
    totals.scheduled += g.scheduled;
    const { _b, ...row } = g;
    void _b;
    rows.push(row);
  }
  totals.broadcasts = allBroadcasts.size;
  totals.replyRate = rate(totals.replied, totals.sent);
  totals.scheduleRate = rate(totals.scheduled, totals.sent);
  rows.sort((a, b) => b.replyRate - a.replyRate || b.sent - a.sent);
  return { rows, totals };
}

/** Amostra mínima para um modelo poder ser chamado de "melhor". */
export const MIN_SAMPLE_FOR_BEST = 20;

export function bestTemplate(rows: TemplatePerf[]): TemplatePerf | null {
  const eligible = rows.filter((r) => r.sent >= MIN_SAMPLE_FOR_BEST);
  if (!eligible.length) return null;
  return eligible.reduce((a, b) => (b.scheduleRate > a.scheduleRate || (b.scheduleRate === a.scheduleRate && b.replyRate > a.replyRate) ? b : a));
}
