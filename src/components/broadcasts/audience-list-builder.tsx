'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Search, Plus, X, Upload, ClipboardPaste, Trash2 } from 'lucide-react';
import type { ManualContact } from '@/hooks/use-broadcast-sending';

interface AudienceListBuilderProps {
  contacts: ManualContact[];
  onChange: (contacts: ManualContact[]) => void;
  /** Variable names declared on the selected template, e.g. ['nome', 'servico']. */
  templateVariables: string[];
}

type SourceTab = 'search' | 'manual' | 'paste' | 'excel';

const BASE_FIELD_OPTIONS = [
  { value: '__ignore', label: 'Ignorar coluna' },
  { value: '__phone', label: 'Telefone' },
  { value: '__name', label: 'Nome' },
];

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function guessMapping(header: string, templateVariables: string[]): string {
  const h = normalize(header);
  if (['telefone', 'phone', 'celular', 'whatsapp', 'numero', 'número'].some((k) => h.includes(k)))
    return '__phone';
  if (['nome', 'name', 'first name', 'primeiro nome'].some((k) => h === k || h.includes(k)))
    return '__name';
  const match = templateVariables.find((v) => normalize(v) === h);
  if (match) return `var:${match}`;
  return '__ignore';
}

/** Splits pasted text into rows/columns. Tries tab first (Excel/Sheets
 *  copy-paste default), falls back to comma, then to 2+ spaces. */
function splitPastedText(text: string): string[][] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : /\s{2,}/;
  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
}

/** A header row names columns ("telefone", "nome"...); a data row
 *  carries actual values. If any cell in the first row already looks
 *  like a phone number (8+ digits once punctuation is stripped),
 *  it's data, not a header — treating it as one silently dropped the
 *  first real contact whenever a list was pasted with no header line
 *  at all (just bare numbers, one per row). */
function firstRowLooksLikeHeader(row: string[]): boolean {
  return !row.some((cell) => cell.replace(/\D/g, '').length >= 8);
}

export function AudienceListBuilder({
  contacts,
  onChange,
  templateVariables,
}: AudienceListBuilderProps) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<SourceTab>('search');

  // ── Search existing contacts ──────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<
    { id: string; name: string | null; phone: string | null }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  async function runSearch() {
    if (!searchTerm.trim() || !profile?.account_id) return;
    setSearching(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .eq('account_id', profile.account_id)
        .or(`name.ilike.%${searchTerm.trim()}%,phone.ilike.%${searchTerm.trim()}%`)
        .limit(25);
      setSearchResults(data ?? []);
    } finally {
      setSearching(false);
    }
  }

  function addSelectedFromSearch() {
    const toAdd = searchResults
      .filter((r) => checkedIds.has(r.id) && r.phone)
      .map((r) => ({ phone: r.phone as string, name: r.name ?? undefined, variables: {} }));
    mergeContacts(toAdd);
    setCheckedIds(new Set());
  }

  // ── Manual single-row add ───────────────────────────────────────────
  const emptyManualRow = () => ({
    phone: '',
    name: '',
    variables: Object.fromEntries(templateVariables.map((v) => [v, ''])),
  });
  const [manualRow, setManualRow] = useState(emptyManualRow);

  function addManualRow() {
    if (!manualRow.phone.trim()) return;
    mergeContacts([
      {
        phone: manualRow.phone.trim(),
        name: manualRow.name.trim() || undefined,
        variables: Object.fromEntries(
          Object.entries(manualRow.variables).filter(([, v]) => v.trim() !== ''),
        ),
      },
    ]);
    setManualRow(emptyManualRow());
  }

  // ── Shared: paste + Excel both resolve to raw rows + column mapping ─
  const [rawRows, setRawRows] = useState<string[][] | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function beginMapping(rows: string[][], assumeHeader: boolean) {
    if (rows.length === 0) return;
    const headers = assumeHeader ? rows[0] : rows[0].map((_, i) => `Coluna ${i + 1}`);
    const dataRows = assumeHeader ? rows.slice(1) : rows;
    setRawHeaders(headers);
    setRawRows(dataRows);
    setHasHeaderRow(assumeHeader);
    setColumnMap(headers.map((h) => guessMapping(h, templateVariables)));
  }

  function processPaste() {
    const rows = splitPastedText(pasteText);
    beginMapping(rows, firstRowLooksLikeHeader(rows[0] ?? []));
  }

  function handleExcelFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const wb = XLSX.read(data, { type: 'binary' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
      const stringRows = rows
        .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : []))
        .filter((r) => r.some((c) => c !== ''));
      beginMapping(stringRows, firstRowLooksLikeHeader(stringRows[0] ?? []));
    };
    reader.readAsBinaryString(file);
  }

  function confirmMapping() {
    if (!rawRows) return;
    const phoneCol = columnMap.indexOf('__phone');
    if (phoneCol === -1) return; // caller disables the button in this case

    const nameCol = columnMap.indexOf('__name');
    const varCols = columnMap
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.startsWith('var:'));

    const imported: ManualContact[] = rawRows
      .map((row): ManualContact | null => {
        const phone = row[phoneCol]?.trim();
        if (!phone) return null;
        const variables: Record<string, string> = {};
        for (const { m, i } of varCols) {
          const key = m.replace('var:', '');
          if (row[i]?.trim()) variables[key] = row[i].trim();
        }
        return {
          phone,
          name: nameCol >= 0 ? row[nameCol]?.trim() || undefined : undefined,
          variables,
        };
      })
      .filter((c): c is ManualContact => c !== null);

    mergeContacts(imported);
    setRawRows(null);
    setRawHeaders([]);
    setColumnMap([]);
    setPasteText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function cancelMapping() {
    setRawRows(null);
    setRawHeaders([]);
    setColumnMap([]);
  }

  // ── Shared list mutation ────────────────────────────────────────────
  function mergeContacts(toAdd: ManualContact[]) {
    const byPhone = new Map(contacts.map((c) => [c.phone, c]));
    for (const c of toAdd) {
      const existing = byPhone.get(c.phone);
      byPhone.set(c.phone, {
        phone: c.phone,
        name: c.name ?? existing?.name,
        variables: { ...existing?.variables, ...c.variables },
      });
    }
    onChange(Array.from(byPhone.values()));
  }

  function removeContact(phone: string) {
    onChange(contacts.filter((c) => c.phone !== phone));
  }

  const variableFieldOptions = templateVariables.map((v) => ({
    value: `var:${v}`,
    label: `Variável: ${v}`,
  }));
  const allFieldOptions = [...BASE_FIELD_OPTIONS, ...variableFieldOptions];

  return (
    <div className="space-y-4">
      {/* Source tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/40 p-1">
        {([
          { key: 'search', label: 'Buscar existentes', icon: Search },
          { key: 'manual', label: 'Adicionar manualmente', icon: Plus },
          { key: 'paste', label: 'Colar lista', icon: ClipboardPaste },
          { key: 'excel', label: 'Importar Excel', icon: Upload },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              setTab(key);
              cancelMapping();
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Search existing */}
      {tab === 'search' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <div className="flex gap-2">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder="Buscar por nome ou número…"
            />
            <Button onClick={runSearch} disabled={searching} variant="outline">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {searchResults.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.has(r.id)}
                      onChange={(e) => {
                        const next = new Set(checkedIds);
                        if (e.target.checked) {
                          next.add(r.id);
                        } else {
                          next.delete(r.id);
                        }
                        setCheckedIds(next);
                      }}
                      disabled={!r.phone}
                    />
                    <span className="text-sm text-foreground">{r.name || '(sem nome)'}</span>
                    <span className="text-xs text-muted-foreground">{r.phone || 'sem telefone'}</span>
                  </label>
                ))}
              </div>
              <Button onClick={addSelectedFromSearch} disabled={checkedIds.size === 0} size="sm">
                Adicionar {checkedIds.size > 0 ? `(${checkedIds.size})` : ''} à lista
              </Button>
            </>
          )}
        </div>
      )}

      {/* Manual add */}
      {tab === 'manual' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              placeholder="Telefone (obrigatório)"
              value={manualRow.phone}
              onChange={(e) => setManualRow({ ...manualRow, phone: e.target.value })}
            />
            <Input
              placeholder="Nome"
              value={manualRow.name}
              onChange={(e) => setManualRow({ ...manualRow, name: e.target.value })}
            />
            {templateVariables.map((v) => (
              <Input
                key={v}
                placeholder={v}
                value={manualRow.variables[v] ?? ''}
                onChange={(e) =>
                  setManualRow({
                    ...manualRow,
                    variables: { ...manualRow.variables, [v]: e.target.value },
                  })
                }
              />
            ))}
          </div>
          <Button onClick={addManualRow} disabled={!manualRow.phone.trim()} size="sm">
            <Plus className="h-3.5 w-3.5" />
            Adicionar à lista
          </Button>
        </div>
      )}

      {/* Paste list */}
      {tab === 'paste' && !rawRows && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-xs text-muted-foreground">
            Cole os dados copiados de uma planilha (uma linha por contato). A primeira linha deve
            ter os nomes das colunas.
          </p>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={'telefone\tnome\tservico\n5511999999999\tMaria\tAvaliação'}
          />
          <Button onClick={processPaste} disabled={!pasteText.trim()} size="sm">
            Processar
          </Button>
        </div>
      )}

      {/* Excel import */}
      {tab === 'excel' && !rawRows && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-xs text-muted-foreground">
            Envie um arquivo .xlsx ou .csv. A primeira linha deve ter os nomes das colunas.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleExcelFile(file);
            }}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
          />
        </div>
      )}

      {/* Column mapping — shared by paste + Excel */}
      {rawRows && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-sm font-medium text-foreground">
            Confirme o que cada coluna representa ({rawRows.length} linha
            {rawRows.length === 1 ? '' : 's'} detectada{rawRows.length === 1 ? '' : 's'})
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rawHeaders.map((header, i) => (
              <div key={i} className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {hasHeaderRow ? header : `Coluna ${i + 1}`}{' '}
                  <span className="normal-case text-muted-foreground/70">
                    (ex: {rawRows[0]?.[i] || '—'})
                  </span>
                </label>
                <select
                  value={columnMap[i] ?? '__ignore'}
                  onChange={(e) => {
                    const next = [...columnMap];
                    next[i] = e.target.value;
                    setColumnMap(next);
                  }}
                  className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-xs text-foreground outline-none focus:border-primary"
                >
                  {allFieldOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {!columnMap.includes('__phone') && (
            <p className="text-xs text-red-400">Selecione qual coluna é o telefone.</p>
          )}
          <div className="flex gap-2">
            <Button onClick={confirmMapping} disabled={!columnMap.includes('__phone')} size="sm">
              Confirmar e adicionar ({rawRows.length})
            </Button>
            <Button onClick={cancelMapping} variant="outline" size="sm">
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Current list */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            {contacts.length} contato{contacts.length === 1 ? '' : 's'} na lista
          </p>
          {contacts.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
            >
              <Trash2 className="h-3 w-3" />
              Limpar tudo
            </button>
          )}
        </div>
        {contacts.length > 0 && (
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {contacts.map((c) => (
              <div
                key={c.phone}
                className="flex items-center justify-between rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="font-medium text-foreground">{c.name || '(sem nome)'}</span>
                  <span className="text-muted-foreground">{c.phone}</span>
                  {c.variables && Object.keys(c.variables).length > 0 && (
                    <span className="truncate text-muted-foreground/70">
                      {Object.entries(c.variables)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' · ')}
                    </span>
                  )}
                </div>
                <button onClick={() => removeContact(c.phone)} className="shrink-0 text-muted-foreground hover:text-red-400">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
