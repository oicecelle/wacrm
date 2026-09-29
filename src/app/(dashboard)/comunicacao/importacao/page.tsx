'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Package,
  Sparkles,
  Stethoscope,
  Upload,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';

import { ENTITY_LIST, ENTITIES, buildTemplateCsv, missingRequirement } from '@/lib/import/entities';
import { detectMapping } from '@/lib/import/detect';
import { loadSpreadsheet, MAX_ROWS, type LoadedWorkbook } from '@/lib/import/parse-file';
import { buildErrorCsv, buildRows, summarize } from '@/lib/import/validate';
import { collectSamples, requestAiMapping } from '@/lib/import/ai-mapping';
import {
  importAppointments,
  importContacts,
  importProcedures,
  importProducts,
  importTransactions,
} from '@/lib/import/importers';
import type {
  ColumnMapping,
  EntityKey,
  ImportResult,
  MappingSource,
  ParsedRow,
  ParsedSheet,
} from '@/lib/import/types';

const ENTITY_ICONS: Record<EntityKey, React.ElementType> = {
  contacts: Users,
  procedures: Stethoscope,
  products: Package,
  appointments: CalendarDays,
  transactions: Wallet,
};

const ENTITY_LINKS: Record<EntityKey, { href: string; label: string }> = {
  contacts: { href: '/contacts', label: 'Ver Contatos' },
  procedures: { href: '/servicos', label: 'Ver Serviços' },
  products: { href: '/estoque', label: 'Ver Estoque' },
  appointments: { href: '/agenda', label: 'Ver Agenda' },
  transactions: { href: '/financeiro', label: 'Ver Financeiro' },
};

const QUERY_TO_ENTITY: Record<string, EntityKey> = {
  contatos: 'contacts',
  pacientes: 'contacts',
  procedimentos: 'procedures',
  servicos: 'procedures',
  produtos: 'products',
  estoque: 'products',
  agendamentos: 'appointments',
  agenda: 'appointments',
  financeiro: 'transactions',
};

const SOURCE_BADGE: Record<MappingSource, { label: string; cls: string }> = {
  auto: { label: 'Reconhecida', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  content: { label: 'Pelo conteúdo', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  ai: { label: 'Sugestão da IA', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  manual: { label: 'Escolhida por você', cls: 'bg-neutral-100 text-neutral-700 border-neutral-200' },
  suggestion: { label: 'Confirme', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const STEPS = ['Tipo de dado', 'Enviar planilha', 'Mapear colunas', 'Revisar', 'Resultado'];

function downloadFile(name: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MigrationPage() {
  const { accountId, user, canEditSettings, canSendMessages } = useAuth();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [entityKey, setEntityKey] = useState<EntityKey | null>(null);

  const [loadingFile, setLoadingFile] = useState(false);
  const [workbook, setWorkbook] = useState<LoadedWorkbook | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [columns, setColumns] = useState<ColumnMapping[]>([]);

  const [aiBusy, setAiBusy] = useState(false);
  const [includeSamples, setIncludeSamples] = useState(false);
  const [showDictionary, setShowDictionary] = useState(false);

  const [contactType, setContactType] = useState<'client' | 'lead'>('client');
  const [createMissingPatients, setCreateMissingPatients] = useState(true);

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);

  const entity = entityKey ? ENTITIES[entityKey] : null;

  // Pre-select a type from ?tipo=... (used by links from other screens).
  useEffect(() => {
    const tipo = new URLSearchParams(window.location.search).get('tipo');
    const key = tipo ? QUERY_TO_ENTITY[tipo.toLowerCase()] : undefined;
    if (key) {
      setEntityKey(key);
      setStep(2);
    }
  }, []);

  const canImport = useCallback(
    (key: EntityKey) => (key === 'contacts' ? canSendMessages || canEditSettings : canEditSettings),
    [canEditSettings, canSendMessages],
  );

  const reset = () => {
    setStep(1);
    setEntityKey(null);
    setWorkbook(null);
    setSheetName('');
    setSheet(null);
    setColumns([]);
    setParsedRows([]);
    setResult(null);
    setProgress({ done: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearFile = () => {
    setWorkbook(null);
    setSheetName('');
    setSheet(null);
    setColumns([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const applySheet = useCallback((wb: LoadedWorkbook, name: string, key: EntityKey) => {
    const parsed = wb.getSheet(name);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      toast.error('Não encontrei um cabeçalho e linhas de dados nessa planilha.');
      setSheet(null);
      setColumns([]);
      return false;
    }
    if (parsed.rows.length > MAX_ROWS) {
      toast.error(
        `A planilha tem ${parsed.rows.length.toLocaleString('pt-BR')} linhas; o limite é ${MAX_ROWS.toLocaleString('pt-BR')} por importação. Divida em partes.`,
      );
      setSheet(null);
      setColumns([]);
      return false;
    }
    setSheetName(name);
    setSheet(parsed);
    setColumns(detectMapping(ENTITIES[key], parsed.headers, parsed.rows));
    return true;
  }, []);

  const handleFile = async (file: File | null) => {
    if (!file || !entityKey) return;
    setLoadingFile(true);
    try {
      const wb = await loadSpreadsheet(file);
      setWorkbook(wb);
      if (applySheet(wb, wb.sheetNames[0], entityKey)) setStep(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao ler a planilha.');
    } finally {
      setLoadingFile(false);
    }
  };

  const setColumnField = (colIdx: number, fieldKey: string | null) => {
    setColumns((prev) =>
      prev.map((c, i) => {
        if (i === colIdx) return { fieldKey, source: 'manual', score: 100 };
        // a field can live in only one column: taking it moves it
        if (fieldKey && c.fieldKey === fieldKey) return { fieldKey: null, source: 'manual', score: 0 };
        return c;
      }),
    );
  };

  const redetect = () => {
    if (!sheet || !entityKey) return;
    setColumns(detectMapping(ENTITIES[entityKey], sheet.headers, sheet.rows));
  };

  const runAi = async () => {
    if (!sheet || !entityKey) return;
    setAiBusy(true);
    try {
      const samples = includeSamples ? collectSamples(sheet.rows, sheet.headers.length) : null;
      const suggestion = await requestAiMapping(entityKey, sheet.headers, samples);
      let applied = 0;
      setColumns((prev) => {
        // The AI only fills what's still open: never overrides a
        // confident automatic match or something you chose by hand.
        const taken = new Set(
          prev
            .filter((c) => c.fieldKey && (c.source === 'auto' || c.source === 'manual' || c.source === 'content'))
            .map((c) => c.fieldKey as string),
        );
        return prev.map((c, i) => {
          const s = suggestion[i];
          const open = !c.fieldKey || c.source === 'suggestion';
          if (open && s && !taken.has(s)) {
            taken.add(s);
            applied++;
            return { fieldKey: s, source: 'ai' as const, score: 70 };
          }
          return c;
        });
      });
      toast.success(
        applied > 0 ? `A IA sugeriu ${applied} coluna(s). Confira antes de continuar.` : 'A IA não encontrou nenhuma correspondência nova.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível consultar a IA.');
    } finally {
      setAiBusy(false);
    }
  };

  const mappedKeys = useMemo(
    () => new Set(columns.map((c) => c.fieldKey).filter((k): k is string => !!k)),
    [columns],
  );
  const requirementMessage = entity ? missingRequirement(entity, mappedKeys) : null;
  const recognizedCount = columns.filter((c) => c.fieldKey).length;
  const samplesByColumn = useMemo(
    () => (sheet ? collectSamples(sheet.rows, sheet.headers.length) : []),
    [sheet],
  );

  const goReview = () => {
    if (!entity || !sheet) return;
    setParsedRows(buildRows(entity, columns.map((c) => c.fieldKey), sheet.rows));
    setStep(4);
  };

  const summary = useMemo(() => summarize(parsedRows), [parsedRows]);
  const validRows = useMemo(() => parsedRows.filter((r) => r.errors.length === 0), [parsedRows]);
  const invalidRows = useMemo(() => parsedRows.filter((r) => r.errors.length > 0), [parsedRows]);

  const runImport = async () => {
    if (!entityKey || !accountId || !user) {
      toast.error('Sessão inválida. Recarregue a página.');
      return;
    }
    if (validRows.length === 0) return;
    setImporting(true);
    setProgress({ done: 0, total: validRows.length });
    try {
      const ctx = {
        supabase,
        accountId,
        userId: user.id,
        canCreateTags: canEditSettings,
        onProgress: (done: number, total: number) => setProgress({ done, total }),
      };
      let res: ImportResult;
      switch (entityKey) {
        case 'contacts':
          res = await importContacts(ctx, validRows, { contactType });
          break;
        case 'procedures':
          res = await importProcedures(ctx, validRows);
          break;
        case 'products':
          res = await importProducts(ctx, validRows);
          break;
        case 'appointments':
          res = await importAppointments(ctx, validRows, { createMissingPatients });
          break;
        case 'transactions':
          res = await importTransactions(ctx, validRows);
          break;
      }
      setResult(res);
      setStep(5);
    } catch (err) {
      console.error('Import failed:', err);
      toast.error(err instanceof Error ? `Erro na importação: ${err.message}` : 'Erro na importação.');
    } finally {
      setImporting(false);
    }
  };

  const previewFields = useMemo(() => {
    if (!entity) return [];
    return entity.fields.filter((f) => mappedKeys.has(f.key)).slice(0, 6);
  }, [entity, mappedKeys]);

  const renderPreviewValue = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'number') return v.toLocaleString('pt-BR');
    return String(v);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Assistente de Migração</h1>
          <p className="text-sm text-muted-foreground">
            Traga seus dados de outro sistema ou de planilhas (Excel ou CSV): pacientes, procedimentos, estoque, agenda e financeiro.
          </p>
        </div>
        {step > 1 && step < 5 && (
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={importing}
            className="shrink-0 rounded-xl border-border text-xs font-bold text-red-600 hover:border-red-200 hover:bg-red-50"
          >
            Recomeçar
          </Button>
        )}
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-5 gap-2 rounded-2xl border border-neutral-100/50 bg-neutral-50 p-2.5">
        {STEPS.map((label, i) => {
          const num = i + 1;
          const current = step === num;
          const done = step > num;
          return (
            <div
              key={label}
              className={`flex items-center gap-2 rounded-xl p-2 transition-all ${
                current
                  ? 'border border-border/60 bg-card font-black text-primary shadow-xs'
                  : done
                    ? 'font-bold text-emerald-600'
                    : 'font-medium text-muted-foreground'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  current ? 'bg-primary text-primary-foreground' : done ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-600'
                }`}
              >
                {done ? '✓' : num}
              </span>
              <span className="hidden truncate text-[11px] sm:inline">{label}</span>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-3xl border border-neutral-100 bg-card shadow-xs">
        {/* ═════════ STEP 1 — type ═════════ */}
        {step === 1 && (
          <div className="space-y-5 p-6">
            <div className="space-y-1">
              <h2 className="text-base font-black text-foreground">O que você quer importar?</h2>
              <p className="text-xs text-muted-foreground">
                Cada tipo é importado separadamente. Ordem recomendada:{' '}
                <strong>procedimentos → produtos → pacientes → agendamentos → financeiro</strong> — assim agendamentos e lançamentos já encontram o procedimento e o paciente certos.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {ENTITY_LIST.map((e) => {
                const Icon = ENTITY_ICONS[e.key];
                const allowed = canImport(e.key);
                return (
                  <button
                    key={e.key}
                    type="button"
                    disabled={!allowed}
                    onClick={() => {
                      setEntityKey(e.key);
                      setStep(2);
                    }}
                    className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                      allowed ? 'border-border hover:border-primary/60 hover:bg-primary-soft' : 'cursor-not-allowed border-border opacity-50'
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-foreground">{e.label}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{e.description}</p>
                      {!allowed && <p className="mt-1 text-[10px] font-semibold text-amber-600">Requer permissão de administrador</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ═════════ STEP 2 — file ═════════ */}
        {step === 2 && entity && (
          <div className="space-y-5 p-6">
            <div className="space-y-1">
              <h2 className="text-base font-black text-foreground">Enviar planilha de {entity.label.toLowerCase()}</h2>
              <p className="text-xs text-muted-foreground">
                Aceita Excel (.xlsx, .xls) e CSV (com vírgula ou ponto e vírgula). A primeira linha deve ser o cabeçalho. Até {MAX_ROWS.toLocaleString('pt-BR')} linhas por vez.
              </p>
            </div>

            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-10 text-center transition-colors hover:border-primary/60 hover:bg-primary-soft ${
                loadingFile ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              {loadingFile ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-primary" />}
              <span className="text-sm font-bold text-foreground">{loadingFile ? 'Lendo a planilha...' : 'Clique para escolher o arquivo'}</span>
              <span className="text-xs text-muted-foreground">.xlsx · .xls · .csv</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls,.xlsm,.ods,text/csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-xl text-xs font-bold"
                onClick={() => downloadFile(`modelo-${entity.key}.csv`, buildTemplateCsv(entity))}
              >
                <Download className="h-3.5 w-3.5" /> Baixar modelo (.csv)
              </Button>
              <button
                type="button"
                onClick={() => setShowDictionary((v) => !v)}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <BookOpen className="h-3.5 w-3.5" /> Nomes de coluna que eu reconheço
                {showDictionary ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            </div>

            {showDictionary && (
              <div className="space-y-2 rounded-2xl border border-border bg-neutral-50/60 p-4">
                <p className="text-xs text-muted-foreground">
                  Não precisa usar exatamente esses nomes: ignoro acentos, maiúsculas e a ordem das palavras (&quot;Data de Nascimento&quot; = &quot;nascimento (data)&quot;), em português ou inglês. Se a coluna tiver outro nome, você escolhe o campo manualmente no próximo passo.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {entity.fields.map((f) => (
                    <div key={f.key} className="rounded-xl border border-border bg-card p-3">
                      <p className="text-xs font-black text-foreground">
                        {f.label} {f.required && <span className="text-red-500">*</span>}
                      </p>
                      {f.help && <p className="text-[10px] text-muted-foreground">{f.help}</p>}
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        {f.synonyms.slice(0, 14).join(' · ')}
                        {f.synonyms.length > 14 ? ' …' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearFile();
                  setStep(1);
                  setEntityKey(null);
                }}
                className="text-xs font-bold"
              >
                Voltar
              </Button>
            </div>
          </div>
        )}

        {/* ═════════ STEP 3 — mapping ═════════ */}
        {step === 3 && entity && sheet && (
          <div className="space-y-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="flex items-center gap-2 text-base font-black text-foreground">
                  <FileSpreadsheet className="h-4 w-4 text-primary" /> Confira o que é cada coluna
                </h2>
                <p className="text-xs text-muted-foreground">
                  {workbook?.fileName} · {sheet.rows.length.toLocaleString('pt-BR')} linha(s) · reconheci <strong>{recognizedCount}</strong> de {sheet.headers.length} colunas. Colunas sem campo são ignoradas.
                </p>
              </div>
              {workbook && workbook.sheetNames.length > 1 && (
                <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                  Aba:
                  <select
                    value={sheetName}
                    onChange={(e) => entityKey && workbook && applySheet(workbook, e.target.value, entityKey)}
                    className="rounded-lg border border-input bg-background px-2 py-1 text-xs"
                  >
                    {workbook.sheetNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {/* AI assist */}
            <div className="space-y-2 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={runAi} disabled={aiBusy} className="gap-1.5 rounded-xl bg-violet-600 text-xs font-bold hover:bg-violet-700">
                  {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Sugerir com IA
                </Button>
                <Button size="sm" variant="outline" onClick={redetect} disabled={aiBusy} className="rounded-xl text-xs font-bold">
                  Refazer detecção automática
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-violet-900/80">
                A detecção automática acima funciona sem IA. A IA é opcional e só ajuda nas colunas que sobraram — nunca muda o que já foi reconhecido nem o que você escolheu. Por padrão envia apenas os <strong>nomes das colunas</strong>; nada é gravado por ela.
              </p>
              <label className="flex items-start gap-2 text-[11px] text-violet-900/80">
                <input type="checkbox" checked={includeSamples} onChange={(e) => setIncludeSamples(e.target.checked)} className="mt-0.5 h-3.5 w-3.5" />
                <span>Enviar também 3 exemplos de cada coluna (melhora a precisão, mas envia dados reais da planilha à IA).</span>
              </label>
            </div>

            {/* Column mapping table */}
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-muted-foreground">Coluna da planilha</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-muted-foreground">Exemplos</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-muted-foreground">Vai para o campo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sheet.headers.map((h, i) => {
                    const col = columns[i];
                    const examples = samplesByColumn[i] ?? [];
                    const badge = col?.fieldKey ? SOURCE_BADGE[col.source] : null;
                    return (
                      <tr key={i} className={col?.fieldKey ? '' : 'bg-neutral-50/40'}>
                        <td className="px-3 py-2 align-top">
                          <p className="text-xs font-bold text-foreground">{h}</p>
                        </td>
                        <td className="max-w-[220px] px-3 py-2 align-top">
                          <p className="truncate text-[11px] text-muted-foreground">{examples.length ? examples.join('  ·  ') : '(vazia)'}</p>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={col?.fieldKey ?? ''}
                              onChange={(e) => setColumnField(i, e.target.value || null)}
                              className="min-w-[180px] rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                            >
                              <option value="">— Ignorar esta coluna —</option>
                              {entity.fields.map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.label}
                                  {f.required ? ' *' : ''}
                                  {mappedKeys.has(f.key) && col?.fieldKey !== f.key ? ' (em uso — vai mover)' : ''}
                                </option>
                              ))}
                            </select>
                            {badge && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Entity options */}
            {entity.key === 'contacts' && (
              <div className="space-y-2 rounded-2xl border border-border p-4">
                <p className="text-xs font-black text-foreground">Como tratar essas pessoas?</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={contactType === 'client'} onChange={() => setContactType('client')} /> Pacientes / clientes
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={contactType === 'lead'} onChange={() => setContactType('lead')} /> Leads (ainda não atendidos)
                  </label>
                </div>
              </div>
            )}
            {entity.key === 'appointments' && (
              <label className="flex items-start gap-2 rounded-2xl border border-border p-4 text-xs">
                <input type="checkbox" checked={createMissingPatients} onChange={(e) => setCreateMissingPatients(e.target.checked)} className="mt-0.5" />
                <span>
                  <strong className="text-foreground">Criar automaticamente os pacientes que ainda não existem</strong>
                  <span className="block text-muted-foreground">
                    Precisa do telefone na planilha. Sem isso, o agendamento só é importado se o paciente já estiver cadastrado.
                  </span>
                </span>
              </label>
            )}

            {requirementMessage && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {requirementMessage}
              </div>
            )}

            <div className="flex justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearFile();
                  setStep(2);
                }}
                className="text-xs font-bold"
              >
                Trocar arquivo
              </Button>
              <Button onClick={goReview} disabled={!!requirementMessage} className="gap-1.5 rounded-xl text-xs font-bold">
                Revisar dados <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ═════════ STEP 4 — review ═════════ */}
        {step === 4 && entity && sheet && (
          <div className="space-y-5 p-6">
            <div className="space-y-1">
              <h2 className="text-base font-black text-foreground">Revise antes de importar</h2>
              <p className="text-xs text-muted-foreground">Nada foi gravado ainda. Só as linhas válidas serão importadas.</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-border p-4">
                <p className="text-xl font-black text-foreground">{summary.total.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-semibold text-muted-foreground">Linhas na planilha</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                <p className="text-xl font-black text-emerald-700">{summary.valid.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-semibold text-emerald-800/70">Válidas</p>
              </div>
              <div className={`rounded-2xl border p-4 ${summary.invalid ? 'border-red-200 bg-red-50/50' : 'border-border'}`}>
                <p className={`text-xl font-black ${summary.invalid ? 'text-red-700' : 'text-foreground'}`}>{summary.invalid.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-semibold text-muted-foreground">Com erro (não entram)</p>
              </div>
              <div className={`rounded-2xl border p-4 ${summary.withWarnings ? 'border-amber-200 bg-amber-50/50' : 'border-border'}`}>
                <p className={`text-xl font-black ${summary.withWarnings ? 'text-amber-700' : 'text-foreground'}`}>{summary.withWarnings.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-semibold text-muted-foreground">Com avisos</p>
              </div>
            </div>

            {entity.key === 'appointments' && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Agendamentos futuros entram direto na agenda. Se os lembretes automáticos estiverem ativos, os pacientes podem receber mensagens sobre eles.</span>
              </div>
            )}
            {entity.key === 'contacts' && (
              <div className="rounded-xl border border-border bg-neutral-50 p-3 text-xs text-muted-foreground">
                Contatos cujo telefone já está cadastrado são mantidos como estão (não são alterados nem duplicados).
              </div>
            )}
            {entity.key === 'products' && (
              <div className="rounded-xl border border-border bg-neutral-50 p-3 text-xs text-muted-foreground">
                A quantidade vira o saldo inicial do estoque. Se houver validade ou lote, é criado um lote (aparece nos avisos de vencimento).
              </div>
            )}
            {entity.key === 'transactions' && (
              <div className="rounded-xl border border-border bg-neutral-50 p-3 text-xs text-muted-foreground">
                Taxas de forma de pagamento não são aplicadas a lançamentos importados — o histórico entra pelo valor informado.
              </div>
            )}

            {validRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-black text-foreground">Prévia das primeiras linhas válidas</p>
                <div className="overflow-x-auto rounded-2xl border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-muted-foreground">Linha</th>
                        {previewFields.map((f) => (
                          <th key={f.key} className="px-3 py-2 text-left text-[10px] font-bold uppercase text-muted-foreground">
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {validRows.slice(0, 8).map((r) => (
                        <tr key={r.rowNumber}>
                          <td className="px-3 py-2 text-muted-foreground">{r.rowNumber}</td>
                          {previewFields.map((f) => (
                            <td key={f.key} className="max-w-[180px] truncate px-3 py-2 text-foreground">
                              {renderPreviewValue(r.values[f.key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {invalidRows.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black text-red-800">
                    Linhas com erro ({invalidRows.length.toLocaleString('pt-BR')}) — não serão importadas
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-xl text-[11px] font-bold"
                    onClick={() => downloadFile('linhas-com-erro.csv', buildErrorCsv(sheet.headers, parsedRows))}
                  >
                    <Download className="h-3.5 w-3.5" /> Baixar só as com erro
                  </Button>
                </div>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-[11px] text-red-900">
                  {invalidRows.slice(0, 40).map((r) => (
                    <li key={r.rowNumber}>
                      <strong>Linha {r.rowNumber}:</strong> {r.errors.join(' · ')}
                    </li>
                  ))}
                  {invalidRows.length > 40 && <li className="italic">… e mais {invalidRows.length - 40}. Baixe o arquivo pra ver todas.</li>}
                </ul>
                <p className="text-[11px] text-red-900/70">
                  Dica: corrija as linhas no arquivo baixado e importe só ele — o que já entrou não duplica.
                </p>
              </div>
            )}

            {importing && (
              <div className="space-y-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Importando {progress.done.toLocaleString('pt-BR')} de {progress.total.toLocaleString('pt-BR')}... não feche esta página.
                </p>
              </div>
            )}

            <div className="flex justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={() => setStep(3)} disabled={importing} className="text-xs font-bold">
                Voltar ao mapeamento
              </Button>
              <Button onClick={runImport} disabled={importing || validRows.length === 0} className="gap-1.5 rounded-xl text-xs font-bold">
                {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                Importar {validRows.length.toLocaleString('pt-BR')} linha(s)
              </Button>
            </div>
          </div>
        )}

        {/* ═════════ STEP 5 — result ═════════ */}
        {step === 5 && result && entityKey && (
          <div className="space-y-5 p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              <h2 className="text-base font-black text-foreground">Importação concluída</h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                <p className="text-xl font-black text-emerald-700">{result.created.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-semibold text-emerald-800/70">Criados</p>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <p className="text-xl font-black text-foreground">{result.skipped.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-semibold text-muted-foreground">Ignorados (já existiam / repetidos)</p>
              </div>
              <div className={`rounded-2xl border p-4 ${result.failed ? 'border-red-200 bg-red-50/50' : 'border-border'}`}>
                <p className={`text-xl font-black ${result.failed ? 'text-red-700' : 'text-foreground'}`}>{result.failed.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-semibold text-muted-foreground">Falharam</p>
              </div>
            </div>

            {invalidRows.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {invalidRows.length.toLocaleString('pt-BR')} linha(s) da planilha nem chegaram a ser importadas por erro de formato.
              </p>
            )}

            {result.notes.length > 0 && (
              <ul className="space-y-1.5 rounded-2xl border border-border bg-neutral-50/60 p-4 text-xs text-foreground">
                {result.notes.map((n, i) => (
                  <li key={i} className="leading-relaxed">
                    • {n}
                  </li>
                ))}
              </ul>
            )}

            {result.details.length > 0 && (
              <div className="space-y-1.5 rounded-2xl border border-red-200 bg-red-50/40 p-4">
                <p className="text-xs font-black text-red-800">Linhas que falharam ao gravar</p>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-[11px] text-red-900">
                  {result.details.slice(0, 40).map((d, i) => (
                    <li key={i}>
                      <strong>Linha {d.rowNumber}:</strong> {d.message}
                    </li>
                  ))}
                  {result.details.length > 40 && <li className="italic">… e mais {result.details.length - 40}.</li>}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={reset} className="rounded-xl text-xs font-bold">
                Importar outro arquivo
              </Button>
              <Link href={ENTITY_LINKS[entityKey].href}>
                <Button size="sm" className="gap-1.5 rounded-xl text-xs font-bold">
                  {ENTITY_LINKS[entityKey].label} <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
