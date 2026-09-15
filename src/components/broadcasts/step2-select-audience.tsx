'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CustomField, Tag, MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { AudienceListBuilder } from './audience-list-builder';
import type { ManualContact } from '@/hooks/use-broadcast-sending';
import {
  Users,
  Tags,
  Filter,
  Upload,
  Loader2,
  ArrowRight,
  ArrowLeft,
  X,
  Sparkles,
} from 'lucide-react';

type AudienceType = 'all' | 'tags' | 'custom_field' | 'filters' | 'csv';
type CustomFieldOperator = 'is' | 'is_not' | 'contains';

interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: ManualContact[];
  excludeTagIds?: string[];
  filters?: {
    contact_type?: 'all' | 'lead' | 'client';
    gender?: 'all' | 'male' | 'female' | 'other';
    temperature?: 'all' | 'hot' | 'warm' | 'cold';
    interest?: string;
    source?: string;
    minScore?: number;
  };
}

interface Step2Props {
  audience: AudienceConfig;
  onUpdate: (audience: AudienceConfig) => void;
  /** Used to surface the template's declared variable names in the
   *  manual-add / paste / Excel-import column mapping. */
  template?: MessageTemplate | null;
  onNext: () => void;
  onBack: () => void;
}

const audienceOptions: {
  type: AudienceType;
  label: string;
  description: string;
  icon: any;
}[] = [
  {
    type: 'all',
    label: 'All Contacts',
    description: 'Send to every contact in your database',
    icon: Users,
  },
  {
    type: 'tags',
    label: 'Filter by Tags',
    description: 'Target contacts with specific tags',
    icon: Tags,
  },
  {
    type: 'custom_field',
    label: 'Custom Field',
    description: 'Filter by a custom field value',
    icon: Filter,
  },
  {
    type: 'filters',
    label: 'Advanced Segmentation',
    description: 'Filter by Stage, Temperature, Interest or Score',
    icon: Sparkles,
  },
  {
    type: 'csv',
    label: 'Lista personalizada',
    description: 'Buscar, adicionar manualmente, colar ou importar contatos',
    icon: Upload,
  },
];

const OPERATOR_OPTIONS: { value: CustomFieldOperator; label: string }[] = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
];

export function Step2SelectAudience({
  audience,
  onUpdate,
  template,
  onNext,
  onBack,
}: Step2Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  // Tags are used both by the primary "Filter by Tags" audience type
  // AND by the exclude-list below — so always load once on mount.
  useEffect(() => {
    async function fetchTags() {
      setLoadingTags(true);
      try {
        const supabase = createClient();
        const { data } = await supabase.from('tags').select('*').order('name');
        setTags(data ?? []);
      } finally {
        setLoadingTags(false);
      }
    }
    fetchTags();
  }, []);

  // Lazy-load custom fields only when that audience type is active.
  useEffect(() => {
    if (audience.type !== 'custom_field') return;
    async function fetchFields() {
      setLoadingFields(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('custom_fields')
          .select('*')
          .order('field_name');
        setCustomFields(data ?? []);
      } finally {
        setLoadingFields(false);
      }
    }
    fetchFields();
  }, [audience.type]);

  const fetchEstimatedCount = useCallback(async () => {
    setLoadingCount(true);
    try {
      const supabase = createClient();

      // Base query — produces the superset before exclude is applied.
      let baseIds: Set<string> | null = null; // null means "all contacts"

      if (audience.type === 'all') {
        // Handled below — full-table count adjusted by excludes.
      } else if (
        audience.type === 'tags' &&
        audience.tagIds &&
        audience.tagIds.length > 0
      ) {
        const { data } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.tagIds);
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'custom_field' &&
        audience.customField?.fieldId &&
        audience.customField.value
      ) {
        const { fieldId, operator, value } = audience.customField;
        let q = supabase
          .from('contact_custom_values')
          .select('contact_id')
          .eq('custom_field_id', fieldId);
        if (operator === 'is') q = q.eq('value', value);
        else if (operator === 'is_not') q = q.neq('value', value);
        else q = q.ilike('value', `%${value}%`);
        const { data } = await q;
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (audience.type === 'filters' && audience.filters) {
        const { contact_type, gender, temperature, interest, source, minScore } = audience.filters;
        let query = supabase.from('contacts').select('id');
        
        if (contact_type && contact_type !== 'all') {
          query = query.eq('contact_type', contact_type);
        }
        if (gender && gender !== 'all') {
          query = query.eq('gender', gender);
        }

        const filterByDeals = (temperature && temperature !== 'all') || interest || source || (minScore !== undefined && minScore !== null && minScore !== 0);
        if (filterByDeals) {
          let dealsQuery = supabase.from('deals').select('contact_id');
          if (temperature && temperature !== 'all') {
            dealsQuery = dealsQuery.eq('temperature', temperature);
          }
          if (interest) {
            dealsQuery = dealsQuery.ilike('interest', `%${interest}%`);
          }
          if (source) {
            dealsQuery = dealsQuery.ilike('source', `%${source}%`);
          }
          if (minScore !== undefined && minScore !== null && minScore !== 0) {
            dealsQuery = dealsQuery.gte('score', minScore);
          }
          const { data: matchedDeals } = await dealsQuery;
          const matchedContactIds = [...new Set((matchedDeals ?? []).map((d) => d.contact_id))];
          if (matchedContactIds.length === 0) {
            setEstimatedCount(0);
            return;
          }
          query = query.in('id', matchedContactIds);
        }

        const { data: matchedContacts } = await query;
        baseIds = new Set((matchedContacts ?? []).map((c) => c.id));
      } else if (
        audience.type === 'csv' &&
        audience.csvContacts &&
        audience.csvContacts.length > 0
      ) {
        setEstimatedCount(audience.csvContacts.length);
        return;
      } else {
        // Partially-configured audience — wait for the user to finish.
        setEstimatedCount(null);
        return;
      }

      // Apply exclude tags
      let excludeSet: Set<string> | null = null;
      if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
        const { data: excludeRows } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.excludeTagIds);
        excludeSet = new Set((excludeRows ?? []).map((r) => r.contact_id));
      }

      if (baseIds) {
        const effective = [...baseIds].filter(
          (id) => !excludeSet?.has(id),
        );
        setEstimatedCount(effective.length);
      } else {
        // "All" — fetch the total, then subtract exclude set if any.
        const { count } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true });
        const total = count ?? 0;
        setEstimatedCount(excludeSet ? Math.max(0, total - excludeSet.size) : total);
      }
    } finally {
      setLoadingCount(false);
    }
  }, [
    audience.type,
    audience.tagIds,
    audience.customField,
    audience.filters,
    audience.csvContacts,
    audience.excludeTagIds,
  ]);

  useEffect(() => {
    fetchEstimatedCount();
  }, [fetchEstimatedCount]);

  function toggleTag(tagId: string) {
    const current = audience.tagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, tagIds: updated });
  }

  function toggleExcludeTag(tagId: string) {
    const current = audience.excludeTagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, excludeTagIds: updated });
  }

  function updateCustomField(patch: Partial<CustomFieldFilter>) {
    const prev = audience.customField ?? {
      fieldId: '',
      operator: 'is' as CustomFieldOperator,
      value: '',
    };
    onUpdate({ ...audience, customField: { ...prev, ...patch } });
  }

  function updateFilters(patch: Partial<NonNullable<AudienceConfig['filters']>>) {
    const prev = audience.filters ?? {
      contact_type: 'all',
      gender: 'all',
      temperature: 'all',
      interest: '',
      source: '',
      minScore: 0,
    };
    onUpdate({ ...audience, filters: { ...prev, ...patch } });
  }

  const isValid =
    audience.type === 'all' ||
    (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) ||
    (audience.type === 'custom_field' &&
      !!audience.customField?.fieldId &&
      audience.customField.value.length > 0) ||
    (audience.type === 'filters' && !!audience.filters) ||
    (audience.type === 'csv' &&
      audience.csvContacts &&
      audience.csvContacts.length > 0);

  return (
    <div className="space-y-6 text-left">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Selecionar Público</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha quem receberá as mensagens desta campanha.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {audienceOptions.map((option) => {
          const isSelected = audience.type === option.type;
          const Icon = option.icon;
          return (
            <button
              key={option.type}
              onClick={() =>
                onUpdate({
                  ...audience,
                  type: option.type,
                  // Wipe shape fields from other types to avoid stale
                  // config leaking across selections.
                  tagIds: option.type === 'tags' ? audience.tagIds : undefined,
                  customField:
                    option.type === 'custom_field'
                      ? audience.customField
                      : undefined,
                  filters:
                    option.type === 'filters'
                      ? audience.filters ?? {
                          contact_type: 'all',
                          gender: 'all',
                          temperature: 'all',
                          interest: '',
                          source: '',
                          minScore: 0,
                        }
                      : undefined,
                  csvContacts:
                    option.type === 'csv' ? audience.csvContacts : undefined,
                })
              }
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border bg-card/50 hover:border-border'
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{option.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                  {option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {audience.type === 'tags' && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Select Tags</p>
          {loadingTags ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No tags found. Create tags in Settings.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = audience.tagIds?.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground hover:border-border'
                    }`}
                  >
                    <span
                      className="mr-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {audience.type === 'custom_field' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-sm font-medium text-foreground">Custom Field Filter</p>
          {loadingFields ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : customFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No custom fields defined. Create one in Settings → Custom Fields.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
              <select
                value={audience.customField?.fieldId ?? ''}
                onChange={(e) => updateCustomField({ fieldId: e.target.value })}
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Select field…</option>
                {customFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.field_name}
                  </option>
                ))}
              </select>
              <select
                value={audience.customField?.operator ?? 'is'}
                onChange={(e) =>
                  updateCustomField({
                    operator: e.target.value as CustomFieldOperator,
                  })
                }
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {OPERATOR_OPTIONS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={audience.customField?.value ?? ''}
                onChange={(e) => updateCustomField({ value: e.target.value })}
                placeholder="Value"
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
        </div>
      )}

      {/* Advanced Segmentation Dashboard Form */}
      {audience.type === 'filters' && (
        <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="size-4 text-indigo-500" /> Filtros de Segmentação Avançada
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Contact Type */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Estágio do Paciente</label>
              <select
                value={audience.filters?.contact_type ?? 'all'}
                onChange={(e) => updateFilters({ contact_type: e.target.value as any })}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-xs text-foreground outline-none focus:border-primary"
              >
                <option value="all">Todos (Leads e Clientes)</option>
                <option value="lead">Apenas Leads</option>
                <option value="client">Apenas Clientes</option>
              </select>
            </div>

            {/* Gender */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Gênero</label>
              <select
                value={audience.filters?.gender ?? 'all'}
                onChange={(e) => updateFilters({ gender: e.target.value as any })}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-xs text-foreground outline-none focus:border-primary"
              >
                <option value="all">Todos os Gêneros</option>
                <option value="female">Feminino</option>
                <option value="male">Masculino</option>
                <option value="other">Outros</option>
              </select>
            </div>

            {/* Lead Temperature */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Temperatura do Lead (CRM)</label>
              <select
                value={audience.filters?.temperature ?? 'all'}
                onChange={(e) => updateFilters({ temperature: e.target.value as any })}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-xs text-foreground outline-none focus:border-primary"
              >
                <option value="all">Todas as Temperaturas</option>
                <option value="hot">🔥 Quente (Hot)</option>
                <option value="warm">⚡ Morno (Warm)</option>
                <option value="cold">❄️ Frio (Cold)</option>
              </select>
            </div>

            {/* Min Lead Score */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">
                Score de Engajamento Mínimo ({audience.filters?.minScore ?? 0})
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={audience.filters?.minScore ?? 0}
                onChange={(e) => updateFilters({ minScore: parseInt(e.target.value) })}
                className="w-full h-9 accent-indigo-600"
              />
            </div>

            {/* Interest */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Interesse de Tratamento</label>
              <input
                type="text"
                placeholder="Ex: Botox, Preenchimento"
                value={audience.filters?.interest ?? ''}
                onChange={(e) => updateFilters({ interest: e.target.value })}
                className="h-9 w-full rounded-lg border border-border bg-muted px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>

            {/* Source */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Origem/Canal de Entrada</label>
              <input
                type="text"
                placeholder="Ex: Instagram, Google, Indicação"
                value={audience.filters?.source ?? ''}
                onChange={(e) => updateFilters({ source: e.target.value })}
                className="h-9 w-full rounded-lg border border-border bg-muted px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
          </div>
        </div>
      )}

      {audience.type === 'csv' && (
        <AudienceListBuilder
          contacts={audience.csvContacts ?? []}
          onChange={(csvContacts) => onUpdate({ ...audience, csvContacts })}
          templateVariables={template?.variables ?? []}
        />
      )}

      {/* Exclude list — applies regardless of audience type */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <X className="h-4 w-4 text-red-400" />
          <p className="text-sm font-medium text-foreground">
            Exclude contacts with these tags
          </p>
          <span className="text-xs text-muted-foreground">(optional)</span>
        </div>
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tags available.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isExcluded = audience.excludeTagIds?.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleExcludeTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                    isExcluded
                      ? 'border-red-500/30 bg-red-500/10 text-red-300'
                      : 'border-border bg-muted text-muted-foreground hover:border-border'
                  }`}
                >
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Audience Summary */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <p className="mb-2 text-sm font-medium text-foreground">Resumo do Público Selecionado</p>
        {loadingCount ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Calculando...</span>
          </div>
        ) : estimatedCount !== null ? (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm font-black text-foreground">
              {estimatedCount.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">destinatários estimados</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Selecione uma opção de público para ver a estimativa.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button
          onClick={onNext}
          disabled={!isValid}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Próximo
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
