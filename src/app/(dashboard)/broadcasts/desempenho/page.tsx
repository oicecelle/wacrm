'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { endOfMonth, startOfMonth, subDays, subMonths, format } from 'date-fns';
import { Loader2, MessageCircle, CalendarCheck, Send, Trophy, ExternalLink, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fetchAllRows } from '@/lib/supabase/fetch-all';
import {
  computePerformance,
  bestTemplate,
  MIN_SAMPLE_FOR_BEST,
  type PerfAppointment,
  type PerfRecipient,
  type TemplatePerf,
  type RecipientResult,
} from '@/lib/broadcasts/performance';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type PeriodKey = 'this_month' | 'last_month' | '30d' | '90d';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'this_month', label: 'Este mês' },
  { key: 'last_month', label: 'Mês passado' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: '90d', label: 'Últimos 90 dias' },
];

const WINDOWS = [3, 7, 14, 30];

function periodRange(key: PeriodKey, now = new Date()): { from: Date; to: Date } {
  switch (key) {
    case 'this_month':
      return { from: startOfMonth(now), to: now };
    case 'last_month': {
      const prev = subMonths(now, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case '30d':
      return { from: subDays(now, 30), to: now };
    case '90d':
      return { from: subDays(now, 90), to: now };
  }
}

const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.1 ? 1 : 0)}%`;

function Delta({ now, before }: { now: number; before: number | null }) {
  if (before === null) return <span className="text-xs text-muted-foreground">—</span>;
  const diff = (now - before) * 100;
  if (Math.abs(diff) < 0.5) return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />igual</span>;
  const up = diff > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${up ? 'text-emerald-500' : 'text-red-400'}`}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(diff).toFixed(0)} pp
    </span>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Send; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

interface RawRecipient {
  id: string;
  broadcast_id: string;
  contact_id: string | null;
  sent_at: string | null;
  replied_at: string | null;
  broadcasts: { name: string | null; template_name: string | null } | { name: string | null; template_name: string | null }[] | null;
  contact: { id: string; name: string | null; phone: string | null } | { id: string; name: string | null; phone: string | null }[] | null;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default function BroadcastPerformancePage() {
  const { profile } = useAuth();
  const accountId = profile?.account_id;

  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [windowDays, setWindowDays] = useState(7);
  const [template, setTemplate] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<PerfRecipient[]>([]);
  const [appointments, setAppointments] = useState<PerfAppointment[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  // período atual + período anterior de mesmo tamanho (para o "vs. antes")
  const { cur, prev, fetchFrom, fetchTo } = useMemo(() => {
    const cur = periodRange(period);
    const span = cur.to.getTime() - cur.from.getTime();
    const prev = { from: new Date(cur.from.getTime() - span - 1), to: new Date(cur.from.getTime() - 1) };
    return {
      cur,
      prev,
      fetchFrom: new Date(prev.from.getTime() - windowDays * 86_400_000),
      fetchTo: cur.to,
    };
  }, [period, windowDays]);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const recRows = await fetchAllRows<RawRecipient>(
        (from, to) =>
          supabase
            .from('broadcast_recipients')
            .select(
              'id, broadcast_id, contact_id, sent_at, replied_at, broadcasts!inner(name, template_name, account_id), contact:contacts(id, name, phone)',
              { count: 'exact' },
            )
            .eq('broadcasts.account_id', accountId)
            .not('sent_at', 'is', null)
            .gte('sent_at', fetchFrom.toISOString())
            .lte('sent_at', fetchTo.toISOString())
            .order('sent_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{ data: RawRecipient[] | null; error: { message: string } | null; count?: number | null }>,
      );

      const apptEnd = new Date(fetchTo.getTime() + windowDays * 86_400_000);
      const apptRows = await fetchAllRows<{
        id: string;
        created_at: string;
        start_time: string | null;
        status: string | null;
        type: string | null;
        patient: { phone: string | null; whatsapp: string | null } | { phone: string | null; whatsapp: string | null }[] | null;
      }>(
        (from, to) =>
          supabase
            .from('appointments')
            .select('id, created_at, start_time, status, type, patient:patients(phone, whatsapp)', { count: 'exact' })
            .eq('clinic_id', accountId)
            .gte('created_at', fetchFrom.toISOString())
            .lte('created_at', apptEnd.toISOString())
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{ data: never[] | null; error: { message: string } | null; count?: number | null }>,
      );

      setRecipients(
        recRows
          .filter((r) => r.sent_at)
          .map((r) => {
            const b = one(r.broadcasts);
            const c = one(r.contact);
            return {
              id: r.id,
              broadcast_id: r.broadcast_id,
              broadcast_name: b?.name ?? '',
              template_name: b?.template_name ?? '',
              contact_id: r.contact_id,
              contact_name: c?.name ?? null,
              contact_phone: c?.phone ?? null,
              sent_at: r.sent_at as string,
              replied_at: r.replied_at,
            };
          }),
      );
      setAppointments(
        apptRows.map((a) => {
          const p = one(a.patient);
          return { id: a.id, created_at: a.created_at, start_time: a.start_time, status: a.status, type: a.type, phones: [p?.phone, p?.whatsapp] };
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os dados.');
    } finally {
      setLoading(false);
    }
  }, [accountId, fetchFrom, fetchTo, windowDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(
    () => computePerformance(recipients, appointments, { from: cur.from, to: cur.to, windowDays }),
    [recipients, appointments, cur, windowDays],
  );
  const previous = useMemo(
    () => computePerformance(recipients, appointments, { from: prev.from, to: prev.to, windowDays }),
    [recipients, appointments, prev, windowDays],
  );
  const prevByTemplate = useMemo(() => new Map(previous.rows.map((r) => [r.template, r])), [previous]);

  const templateNames = useMemo(() => current.rows.map((r) => r.template).sort((a, b) => a.localeCompare(b, 'pt-BR')), [current]);
  const rows = useMemo(() => (template === 'all' ? current.rows : current.rows.filter((r) => r.template === template)), [current, template]);

  const totals = useMemo(() => {
    const t = { sent: 0, replied: 0, scheduled: 0 };
    rows.forEach((r) => {
      t.sent += r.sent;
      t.replied += r.replied;
      t.scheduled += r.scheduled;
    });
    return t;
  }, [rows]);
  const best = useMemo(() => bestTemplate(rows), [rows]);
  const selectedRow = rows.find((r) => r.template === selected) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Desempenho dos disparos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare os modelos: quanto foi enviado, quem respondeu e quem agendou depois do disparo.
          </p>
        </div>
        <Link href="/broadcasts" className="text-sm text-primary hover:underline">
          Voltar para Disparos
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Período
          <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Modelo
          <select value={template} onChange={(e) => setTemplate(e.target.value)} className="h-9 min-w-48 rounded-md border border-border bg-background px-2 text-sm text-foreground">
            <option value="all">Todos os modelos</option>
            {templateNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Contar resposta e agendamento até
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
            {WINDOWS.map((d) => (
              <option key={d} value={d}>{d} dias após o envio</option>
            ))}
          </select>
        </label>
        <p className="ml-auto max-w-sm text-xs text-muted-foreground">
          Período: {format(cur.from, 'dd/MM')} a {format(cur.to, 'dd/MM')}. Agendamento = criado depois do disparo, para o mesmo telefone; se a pessoa recebeu mais de um disparo, vale o último.
        </p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : error ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2">
          <p className="text-sm text-red-400">{error}</p>
          <Button variant="outline" onClick={() => void load()}>Tentar de novo</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Send} label="Mensagens enviadas" value={totals.sent.toLocaleString('pt-BR')} hint={`${rows.reduce((n, r) => n + r.broadcasts, 0)} disparos`} />
            <Kpi icon={MessageCircle} label="Responderam" value={totals.replied.toLocaleString('pt-BR')} hint={`Taxa de resposta ${pct(totals.sent ? totals.replied / totals.sent : 0)}`} />
            <Kpi icon={CalendarCheck} label="Agendaram" value={totals.scheduled.toLocaleString('pt-BR')} hint={`Taxa de agendamento ${pct(totals.sent ? totals.scheduled / totals.sent : 0)}`} />
            <Kpi icon={Trophy} label="Melhor modelo" value={best ? best.template : '—'} hint={best ? `${pct(best.scheduleRate)} agendaram · ${pct(best.replyRate)} responderam` : `Precisa de ${MIN_SAMPLE_FOR_BEST}+ envios`} />
          </div>

          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Disparos</TableHead>
                  <TableHead className="text-right">Enviadas</TableHead>
                  <TableHead className="text-right">Responderam</TableHead>
                  <TableHead className="text-right">Taxa de resposta</TableHead>
                  <TableHead className="text-right">vs. período anterior</TableHead>
                  <TableHead className="text-right">Agendaram</TableHead>
                  <TableHead className="text-right">Taxa de agendamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum disparo enviado nesse período.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const before = prevByTemplate.get(r.template);
                  return (
                    <TableRow key={r.template} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(r.template)}>
                      <TableCell className="font-medium">
                        {r.template}
                        {best?.template === r.template && <Badge className="ml-2" variant="secondary">melhor</Badge>}
                        {r.sent < MIN_SAMPLE_FOR_BEST && <span className="ml-2 text-xs text-muted-foreground">poucos envios</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.broadcasts}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.sent}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.replied}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(r.replyRate)}</TableCell>
                      <TableCell className="text-right"><Delta now={r.replyRate} before={before && before.sent >= MIN_SAMPLE_FOR_BEST ? before.replyRate : null} /></TableCell>
                      <TableCell className="text-right tabular-nums">{r.scheduled}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(r.scheduleRate)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Clique em um modelo para ver as conversas de quem respondeu e se a pessoa agendou.
          </p>
        </>
      )}

      <ConversationsDialog key={selected ?? 'none'} row={selectedRow} accountId={accountId ?? undefined} onClose={() => setSelected(null)} />
    </div>
  );
}

type Tab = 'replied' | 'scheduled' | 'all';

function ConversationsDialog({ row, accountId, onClose }: { row: TemplatePerf | null; accountId?: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('replied');
  const [convByContact, setConvByContact] = useState<Record<string, string>>({});

  const list = useMemo(() => {
    if (!row) return [] as RecipientResult[];
    const filtered = row.results.filter((r) => (tab === 'replied' ? r.replied : tab === 'scheduled' ? !!r.appointment : true));
    return [...filtered].sort((a, b) => Date.parse(b.recipient.sent_at) - Date.parse(a.recipient.sent_at)).slice(0, 300);
  }, [row, tab]);

  // acha a conversa de cada contato só quando a lista é aberta
  useEffect(() => {
    if (!row || !accountId) return;
    const ids = Array.from(new Set(list.map((r) => r.recipient.contact_id).filter((x): x is string => !!x))).filter((id) => !(id in convByContact));
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const found: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await supabase
          .from('conversations')
          .select('id, contact_id, last_message_at')
          .eq('account_id', accountId)
          .in('contact_id', ids.slice(i, i + 150))
          .order('last_message_at', { ascending: false });
        (data ?? []).forEach((c: { id: string; contact_id: string }) => {
          if (!found[c.contact_id]) found[c.contact_id] = c.id;
        });
      }
      if (!cancelled) setConvByContact((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
  }, [list, row, accountId, convByContact]);

  const counts = row ? { replied: row.replied, scheduled: row.scheduled, all: row.sent } : { replied: 0, scheduled: 0, all: 0 };
  const tabs: { key: Tab; label: string }[] = [
    { key: 'replied', label: `Responderam (${counts.replied})` },
    { key: 'scheduled', label: `Agendaram (${counts.scheduled})` },
    { key: 'all', label: `Todas as enviadas (${counts.all})` },
  ];

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{row?.template}</DialogTitle>
          <DialogDescription>Abra a conversa para ver se a pessoa fechou ou não.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Button key={t.key} size="sm" variant={tab === t.key ? 'default' : 'outline'} onClick={() => setTab(t.key)}>
              {t.label}
            </Button>
          ))}
        </div>
        <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contato</TableHead>
                <TableHead>Disparo</TableHead>
                <TableHead>Enviada</TableHead>
                <TableHead>Respondeu</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhuma conversa nesta lista.</TableCell>
                </TableRow>
              )}
              {list.map(({ recipient: r, replied, appointment }) => {
                const convId = r.contact_id ? convByContact[r.contact_id] : undefined;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.contact_name || r.contact_phone || 'Contato'}</div>
                      {r.contact_name && <div className="text-xs text-muted-foreground">{r.contact_phone}</div>}
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-xs text-muted-foreground">{r.broadcast_name}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{format(new Date(r.sent_at), 'dd/MM HH:mm')}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{replied && r.replied_at ? format(new Date(r.replied_at), 'dd/MM HH:mm') : '—'}</TableCell>
                    <TableCell>
                      {appointment ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          Agendou{appointment.start_time ? ` · ${format(new Date(appointment.start_time), 'dd/MM')}` : ''}
                        </Badge>
                      ) : replied ? (
                        <Badge variant="secondary">Respondeu, sem agendamento</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem resposta</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {convId ? (
                        <Link href={`/inbox?c=${convId}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          Abrir <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {row && (tab === 'all' ? row.sent : tab === 'replied' ? row.replied : row.scheduled) > 300 && (
          <p className="text-xs text-muted-foreground">Mostrando as 300 mais recentes.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
