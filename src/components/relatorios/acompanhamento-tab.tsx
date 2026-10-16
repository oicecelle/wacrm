"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Row {
  dealId: string;
  contactId: string;
  name: string;
  phone: string;
  createdAt: string;
  source: string | null;
  stage: string | null;
  statusId: string | null;
  tagIds: string[];
  convId: string | null;
}

interface ContactDb {
  name: string | null;
  phone: string | null;
}

interface DealDb {
  id: string;
  contact_id: string;
  created_at: string;
  source: string | null;
  crm_stage: string | null;
  crm_status_id: string | null;
  contact: ContactDb | ContactDb[] | null;
}

const PAGE = 1000;

// O Supabase devolve no máximo 1000 linhas por consulta; pagina até acabar.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Data local (não UTC) no formato AAAA-MM-DD, que é o que o campo de data usa.
const dayStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function AcompanhamentoTab({ accountId }: { accountId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [statuses, setStatuses] = useState<{ id: string; nome: string }[]>([]);

  // Começa sem filtro nenhum: lista completa de leads.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tagF, setTagF] = useState("all");
  const [sourceF, setSourceF] = useState("all");
  const [stageF, setStageF] = useState("all");
  const [statusF, setStatusF] = useState("all");

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [deals, ctags, convs, tagList, statusList] = await Promise.all([
          fetchAll<DealDb>((a, b) =>
            supabase
              .from("deals")
              .select("id, contact_id, created_at, source, crm_stage, crm_status_id, contact:contacts(name, phone)")
              .eq("account_id", accountId)
              .order("created_at", { ascending: false })
              .range(a, b),
          ),
          fetchAll<{ contact_id: string; tag_id: string }>((a, b) =>
            supabase.from("contact_tags").select("contact_id, tag_id, tags!inner(account_id)").eq("tags.account_id", accountId).range(a, b),
          ),
          fetchAll<{ id: string; contact_id: string }>((a, b) =>
            supabase.from("conversations").select("id, contact_id, last_message_at").eq("account_id", accountId).order("last_message_at", { ascending: false }).range(a, b),
          ),
          supabase.from("tags").select("id, name").eq("account_id", accountId).order("name"),
          supabase.from("crm_status").select("id, nome").eq("clinic_id", accountId).order("ordem"),
        ]);
        if (cancelled) return;

        const tagsByContact = new Map<string, string[]>();
        for (const ct of ctags) {
          const list = tagsByContact.get(ct.contact_id);
          if (list) list.push(ct.tag_id);
          else tagsByContact.set(ct.contact_id, [ct.tag_id]);
        }
        const convByContact = new Map<string, string>();
        for (const c of convs) if (!convByContact.has(c.contact_id)) convByContact.set(c.contact_id, c.id); // mais recente primeiro

        setRows(
          deals.map((d) => {
            const ct = Array.isArray(d.contact) ? d.contact[0] : d.contact;
            return {
            dealId: d.id,
            contactId: d.contact_id,
            name: ct?.name || ct?.phone || "Sem nome",
            phone: ct?.phone || "",
            createdAt: d.created_at,
            source: d.source,
            stage: d.crm_stage,
            statusId: d.crm_status_id,
            tagIds: tagsByContact.get(d.contact_id) ?? [],
            convId: convByContact.get(d.contact_id) ?? null,
            };
          }),
        );
        setTags((tagList.data as { id: string; name: string }[] | null) ?? []);
        setStatuses((statusList.data as { id: string; nome: string }[] | null) ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Não foi possível carregar os dados.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, accountId]);

  const agendadoId = statuses.find((s) => s.nome.toLowerCase().startsWith("agendad"))?.id ?? null;

  const sources = useMemo(() => Array.from(new Set(rows.map((r) => r.source).filter(Boolean))) as string[], [rows]);
  const stages = useMemo(() => Array.from(new Set(rows.map((r) => r.stage).filter(Boolean))) as string[], [rows]);

  const filtered = useMemo(() => {
    // `from` e `to` são datas locais; inclui o dia final inteiro.
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
    return rows.filter((r) => {
      const t = Date.parse(r.createdAt);
      if (t < fromMs || t > toMs) return false;
      if (tagF !== "all" && !r.tagIds.includes(tagF)) return false;
      if (sourceF !== "all" && r.source !== sourceF) return false;
      if (stageF !== "all" && r.stage !== stageF) return false;
      if (statusF !== "all" && r.statusId !== statusF) return false;
      return true;
    });
  }, [rows, from, to, tagF, sourceF, stageF, statusF]);

  const total = filtered.length;
  const sinal = filtered.filter((r) => r.stage === "Sinal Solicitado").length;
  const agendou = agendadoId ? filtered.filter((r) => r.statusId === agendadoId).length : 0;
  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "0%");
  const statusName = (id: string | null) => statuses.find((s) => s.id === id)?.nome ?? "—";

  const hasFilter = from || to || tagF !== "all" || sourceF !== "all" || stageF !== "all" || statusF !== "all";
  const clear = () => {
    setFrom("");
    setTo("");
    setTagF("all");
    setSourceF("all");
    setStageF("all");
    setStatusF("all");
  };
  const preset = (days: number | null) => {
    if (days === null) {
      setFrom("");
      setTo("");
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() - days);
    setFrom(dayStr(d));
    setTo(dayStr(new Date()));
  };

  const sel = "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs focus:outline-none";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 bg-card border border-border rounded-xl p-4 items-end">
        <label className="text-xs font-semibold space-y-1">
          <span>De</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} />
        </label>
        <label className="text-xs font-semibold space-y-1">
          <span>Até</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} />
        </label>
        <label className="text-xs font-semibold space-y-1">
          <span>Etiqueta</span>
          <select value={tagF} onChange={(e) => setTagF(e.target.value)} className={sel}>
            <option value="all">Todas</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold space-y-1">
          <span>Origem</span>
          <select value={sourceF} onChange={(e) => setSourceF(e.target.value)} className={sel}>
            <option value="all">Todas</option>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold space-y-1">
          <span>Estágio</span>
          <select value={stageF} onChange={(e) => setStageF(e.target.value)} className={sel}>
            <option value="all">Todas</option>
            {stages.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold space-y-1">
          <span>Status</span>
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={sel}>
            <option value="all">Todos</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 -mt-3 text-xs">
        <span className="font-semibold text-muted-foreground">Período:</span>
        {([["Tudo", null], ["Hoje", 0], ["7 dias", 7], ["30 dias", 30]] as const).map(([label, days]) => (
          <button key={label} onClick={() => preset(days)} className="rounded-full border border-border px-3 py-1 font-semibold hover:bg-muted cursor-pointer">
            {label}
          </button>
        ))}
        {hasFilter && (
          <button onClick={clear} className="font-bold text-muted-foreground hover:text-primary hover:underline px-2 cursor-pointer">
            Limpar filtros
          </button>
        )}
      </div>

      {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2Icon className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground font-semibold">Leads</p>
              <p className="text-3xl font-bold">{total}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground font-semibold">Sinais solicitados</p>
              <p className="text-3xl font-bold">{sinal}</p>
              <p className="text-xs text-muted-foreground">{pct(sinal)} dos leads</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground font-semibold">Agendados</p>
              <p className="text-3xl font-bold">{agendou}</p>
              <p className="text-xs text-muted-foreground">
                {agendadoId ? `${pct(agendou)} dos leads` : 'Não há status "Agendado" cadastrado'}
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-xs font-bold">
              {total} {total === 1 ? "lead" : "leads"} · período pela data em que o lead entrou no Funil
            </div>
            {total === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Nenhum contato com esses filtros.</p>
            ) : (
              <ul className="divide-y divide-border max-h-[560px] overflow-y-auto">
                {filtered.map((r) => (
                  <li key={r.dealId} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{r.name}</p>
                      <p className="text-muted-foreground truncate">
                        {new Date(r.createdAt).toLocaleDateString("pt-BR")} · {r.source ?? "sem origem"} · {r.stage ?? "sem etapa"} · {statusName(r.statusId)}
                      </p>
                    </div>
                    {r.convId && (
                      <Link href={`/inbox?c=${r.convId}`} className="shrink-0 font-bold text-primary hover:underline">
                        Abrir
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
