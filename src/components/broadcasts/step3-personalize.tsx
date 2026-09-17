'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Contact, CustomField, MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Eye, Loader2, Pencil, X, Check } from 'lucide-react';
import type { AudienceConfig, ManualContact } from '@/hooks/use-broadcast-sending';

type VariableType = 'static' | 'field' | 'custom_field';

interface VariableMapping {
  type: VariableType;
  value: string;
}

interface Step3Props {
  template: MessageTemplate;
  variables: Record<string, VariableMapping>;
  onUpdate: (variables: Record<string, VariableMapping>) => void;
  audience: AudienceConfig;
  onAudienceUpdate: (audience: AudienceConfig) => void;
  scheduledDate: string;
  onScheduledDateChange: (value: string) => void;
  scheduledTime: string;
  onScheduledTimeChange: (value: string) => void;
  intervalSeconds: number;
  onIntervalSecondsChange: (value: number) => void;
  onNext: () => void;
  onBack: () => void;
}

const contactFields = [
  { value: 'name', label: 'Nome do contato' },
  { value: 'phone', label: 'Número de telefone' },
  { value: 'email', label: 'E-mail' },
  { value: 'company', label: 'Empresa' },
];

const SAMPLE_CONTACT: Contact = {
  id: 'sample',
  user_id: '',
  account_id: '',
  name: 'Maria Silva',
  phone: '+5511999999999',
  email: 'maria@example.com',
  company: 'Clínica Exemplo',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/** Matches both legacy Meta positional {{1}} and named {{nome}} placeholders. */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function extractPlaceholders(bodyText: string): string[] {
  const matches = bodyText.match(PLACEHOLDER_RE);
  if (!matches) return [];
  return [...new Set(matches)];
}

export function Step3Personalize({
  template,
  variables,
  onUpdate,
  audience,
  onAudienceUpdate,
  scheduledDate,
  onScheduledDateChange,
  scheduledTime,
  onScheduledTimeChange,
  intervalSeconds,
  onIntervalSecondsChange,
  onNext,
  onBack,
}: Step3Props) {
  const { profile } = useAuth();
  const accountId = profile?.account_id;
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [firstContact, setFirstContact] = useState<Contact | null>(null);
  const [firstContactCustomValues, setFirstContactCustomValues] = useState<
    Map<string, string>
  >(new Map());
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; variables: Record<string, string> }>({
    name: '',
    variables: {},
  });

  const isManualAudience = audience.type === 'csv';
  const csvContacts = useMemo(() => audience.csvContacts ?? [], [audience.csvContacts]);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [fieldsRes, contactRes] = await Promise.all([
        supabase.from('custom_fields').select('*').eq('account_id', accountId).order('field_name'),
        supabase
          .from('contacts')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      setCustomFields(fieldsRes.data ?? []);
      setLoadingFields(false);

      const contact = contactRes.data ?? null;
      setFirstContact(contact);

      if (contact) {
        const { data: customVals } = await supabase
          .from('contact_custom_values')
          .select('custom_field_id, value')
          .eq('contact_id', contact.id);
        if (!cancelled) {
          const map = new Map<string, string>();
          for (const row of customVals ?? []) {
            map.set(row.custom_field_id, row.value ?? '');
          }
          setFirstContactCustomValues(map);
        }
      }
      setLoadingPreview(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const placeholders = useMemo(
    () => extractPlaceholders(template.body_text),
    [template.body_text],
  );

  function keyOf(placeholder: string) {
    return placeholder.replace(/^\{\{\s*|\s*\}\}$/g, '');
  }

  /**
   * For manual/imported lists, a placeholder is covered once *every*
   * contact in the list has a non-empty value for it OR there's a
   * global fallback mapping — so the campaign-wide mapping still acts
   * as a default for rows that didn't set that field explicitly.
   */
  const unmappedKeys = useMemo(() => {
    const missing: string[] = [];
    for (const placeholder of placeholders) {
      const key = keyOf(placeholder);
      const hasGlobalMapping = !!variables[key]?.value?.trim();
      if (hasGlobalMapping) continue;

      if (isManualAudience) {
        const allRowsHaveIt =
          csvContacts.length > 0 &&
          csvContacts.every((c) => c.variables?.[key]?.trim());
        if (!allRowsHaveIt) missing.push(placeholder);
      } else {
        missing.push(placeholder);
      }
    }
    return missing;
  }, [placeholders, variables, isManualAudience, csvContacts]);

  function updateVariable(key: string, patch: Partial<VariableMapping>) {
    const current = variables[key] ?? { type: 'static' as VariableType, value: '' };
    onUpdate({
      ...variables,
      [key]: { ...current, ...patch },
    });
  }

  const previewText = useMemo(() => {
    const contact = firstContact ?? SAMPLE_CONTACT;
    const customValues = firstContact ? firstContactCustomValues : new Map<string, string>();
    // Manual lists: preview the first row in the list if one exists,
    // since that's more representative than a random DB contact.
    const manualRow = isManualAudience ? csvContacts[0] : undefined;

    let text = template.body_text;
    for (const placeholder of placeholders) {
      const key = keyOf(placeholder);
      const mapping = variables[key];
      let replacement = placeholder;

      if (manualRow?.variables?.[key]) {
        replacement = manualRow.variables[key];
      } else if (mapping) {
        if (mapping.type === 'static' && mapping.value) {
          replacement = mapping.value;
        } else if (mapping.type === 'field' && mapping.value) {
          const fieldMap: Record<string, string | undefined> = {
            name: manualRow?.name ?? contact.name,
            phone: manualRow?.phone ?? contact.phone,
            email: contact.email,
            company: contact.company,
          };
          replacement = fieldMap[mapping.value] ?? placeholder;
        } else if (mapping.type === 'custom_field' && mapping.value) {
          replacement = customValues.get(mapping.value) || placeholder;
        }
      }
      text = text.split(placeholder).join(replacement);
    }
    return text;
  }, [
    template.body_text,
    variables,
    placeholders,
    firstContact,
    firstContactCustomValues,
    isManualAudience,
    csvContacts,
  ]);

  const previewLabel = isManualAudience && csvContacts[0]
    ? csvContacts[0].name || csvContacts[0].phone
    : firstContact
      ? firstContact.name || firstContact.phone
      : 'dado de exemplo';

  function startEdit(contact: ManualContact) {
    setEditingPhone(contact.phone);
    setEditDraft({
      name: contact.name ?? '',
      variables: { ...contact.variables },
    });
  }

  function saveEdit(phone: string) {
    onAudienceUpdate({
      ...audience,
      csvContacts: csvContacts.map((c) =>
        c.phone === phone
          ? { ...c, name: editDraft.name.trim() || undefined, variables: editDraft.variables }
          : c,
      ),
    });
    setEditingPhone(null);
  }

  function removeContact(phone: string) {
    onAudienceUpdate({
      ...audience,
      csvContacts: csvContacts.filter((c) => c.phone !== phone),
    });
  }

  const variableKeys = placeholders.map(keyOf);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Personalizar mensagem</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Defina de onde vem o valor de cada variável do modelo.
        </p>
      </div>

      {placeholders.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">Este modelo não tem variáveis.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {isManualAudience
              ? 'Valor padrão — usado apenas para contatos da lista que não preencheram este campo individualmente.'
              : 'De onde cada variável deve puxar o valor para cada contato.'}
          </p>
          {placeholders.map((placeholder) => {
            const key = keyOf(placeholder);
            const mapping = variables[key] ?? { type: 'static', value: '' };

            return (
              <div key={placeholder} className="rounded-xl border border-border bg-card/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-medium text-primary">
                    {placeholder}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Tipo
                    </label>
                    <Select
                      value={mapping.type}
                      onValueChange={(val) => updateVariable(key, { type: val as VariableType, value: '' })}
                    >
                      <SelectTrigger className="w-full border-border bg-muted text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border bg-popover">
                        <SelectItem value="static">Valor fixo</SelectItem>
                        <SelectItem value="field">Campo do contato</SelectItem>
                        <SelectItem value="custom_field">Campo personalizado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {mapping.type === 'static' ? 'Valor' : 'Campo'}
                    </label>
                    {mapping.type === 'static' ? (
                      <Input
                        value={mapping.value}
                        onChange={(e) => updateVariable(key, { value: e.target.value })}
                        placeholder="Digite um valor..."
                        className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                      />
                    ) : mapping.type === 'field' ? (
                      <Select
                        value={mapping.value || undefined}
                        onValueChange={(val) => updateVariable(key, { value: val || '' })}
                      >
                        <SelectTrigger className="w-full border-border bg-muted text-foreground">
                          <SelectValue placeholder="Selecionar campo..." />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          {contactFields.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={mapping.value || undefined}
                        onValueChange={(val) => updateVariable(key, { value: val || '' })}
                      >
                        <SelectTrigger className="w-full border-border bg-muted text-foreground">
                          <SelectValue
                            placeholder={
                              loadingFields
                                ? 'Carregando…'
                                : customFields.length === 0
                                  ? 'Nenhum campo personalizado'
                                  : 'Selecionar campo…'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          {customFields.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.field_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-contact review — only for manually-built lists, where each
          row can carry its own values worth double-checking one by one. */}
      {isManualAudience && csvContacts.length > 0 && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="mb-3 text-sm font-medium text-foreground">
            Revisar cada contato ({csvContacts.length})
          </p>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {csvContacts.map((contact) => {
              const isEditing = editingPhone === contact.phone;
              return (
                <div key={contact.phone} className="rounded-lg border border-border bg-muted/30 p-2.5">
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        placeholder="Nome"
                        className="h-8 text-xs"
                      />
                      {variableKeys.map((k) => (
                        <div key={k} className="flex items-center gap-2">
                          <Label className="w-24 shrink-0 text-[11px] text-muted-foreground">{k}</Label>
                          <Input
                            value={editDraft.variables[k] ?? ''}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                variables: { ...editDraft.variables, [k]: e.target.value },
                              })
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                      ))}
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => saveEdit(contact.phone)}>
                          <Check className="h-3 w-3" /> Salvar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditingPhone(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 text-xs">
                        <span className="font-medium text-foreground">
                          {contact.name || '(sem nome)'}
                        </span>{' '}
                        <span className="text-muted-foreground">{contact.phone}</span>
                        {contact.variables && Object.keys(contact.variables).length > 0 && (
                          <span className="ml-2 text-muted-foreground/70">
                            {Object.entries(contact.variables)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' · ')}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => startEdit(contact)}
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeContact(contact.phone)}
                          className="rounded p-1 text-muted-foreground hover:text-red-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Preview */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Prévia</p>
          <span className="text-xs text-muted-foreground">({previewLabel})</span>
          {loadingPreview && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        </div>
        <div className="rounded-lg bg-[#0e1a12] p-3">
          <div className="ml-auto max-w-[85%] rounded-lg bg-primary/30 px-3 py-2 shadow-sm">
            <p className="whitespace-pre-wrap text-sm text-primary">{previewText}</p>
          </div>
        </div>
      </div>

      {/* Scheduling */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Agendamento</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Data</Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => onScheduledDateChange(e.target.value)}
              className="border-border bg-muted text-foreground"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Horário</Label>
            <Input
              type="time"
              value={scheduledTime}
              onChange={(e) => onScheduledTimeChange(e.target.value)}
              className="border-border bg-muted text-foreground"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              Intervalo entre envios (segundos)
            </Label>
            <Input
              type="number"
              min={1}
              value={intervalSeconds}
              onChange={(e) => onIntervalSecondsChange(Math.max(1, parseInt(e.target.value) || 1))}
              className="border-border bg-muted text-foreground"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Deixe data e horário em branco para enviar assim que possível.
        </p>
      </div>

      {unmappedKeys.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Defina um valor padrão para cada variável antes de continuar — ainda faltando{' '}
          <span className="font-mono font-semibold">{unmappedKeys.join(', ')}</span>.
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="outline" onClick={onBack} className="border-border text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button
          onClick={onNext}
          disabled={unmappedKeys.length > 0}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Próximo
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
