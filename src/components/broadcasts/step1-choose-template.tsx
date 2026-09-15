'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, FileText, ArrowRight, Plus } from 'lucide-react';
import { toast } from 'sonner';

const categoryColors: Record<string, string> = {
  Marketing: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Utility: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Authentication: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

// Common named placeholders offered as one-click inserts. Clinics can
// still type any custom {{variavel}} name directly in the body.
const SUGGESTED_VARIABLES: { key: string; label: string }[] = [
  { key: 'nome', label: 'Nome' },
  { key: 'sobrenome', label: 'Sobrenome' },
  { key: 'data', label: 'Data' },
  { key: 'horario', label: 'Horário' },
  { key: 'servico', label: 'Serviço' },
  { key: 'profissional', label: 'Profissional' },
  { key: 'endereco', label: 'Endereço' },
];

function extractNamedVariables(bodyText: string): string[] {
  const matches = bodyText.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
  const names = new Set<string>();
  for (const m of matches) names.add(m[1]);
  return Array.from(names);
}

interface Step1Props {
  selectedTemplate: MessageTemplate | null;
  onSelect: (template: MessageTemplate) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step1ChooseTemplate({ selectedTemplate, onSelect, onNext, onBack }: Step1Props) {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerType, setProviderType] = useState<'meta' | 'uazapi' | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBody, setNewBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function fetchTemplates() {
    try {
      setLoading(true);
      const supabase = createClient();

      // Which provider this account's WhatsApp instance uses decides
      // whether templates still need Meta's "Approved" status. Uazapi
      // instances send plain text through an unofficial API — there's
      // no approval pipeline, so every saved template is usable.
      const { data: config } = await supabase
        .from('whatsapp_config')
        .select('provider_type')
        .maybeSingle();
      const provider = (config?.provider_type as 'meta' | 'uazapi' | undefined) ?? 'uazapi';
      setProviderType(provider);

      let query = supabase
        .from('message_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (provider === 'meta') {
        query = query.eq('status', 'APPROVED');
      } else {
        // Still hide anything explicitly rejected/disabled if this
        // account has leftover rows from a previous Meta setup.
        query = query.not('status', 'in', '(REJECTED,DISABLED)');
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setTemplates(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar modelos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTemplates();
  }, []);

  function insertVariable(key: string) {
    setNewBody((prev) => `${prev}{{${key}}}`);
  }

  async function handleCreateTemplate() {
    if (!newName.trim() || !newBody.trim()) {
      toast.error('Preencha o nome e o corpo da mensagem.');
      return;
    }
    if (!profile?.account_id) {
      toast.error('Conta não identificada.');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão expirada.');

      const variables = extractNamedVariables(newBody);

      const { data, error: insertError } = await supabase
        .from('message_templates')
        .insert({
          user_id: user.id,
          account_id: profile.account_id,
          name: newName.trim(),
          category: 'Marketing',
          language: 'pt_BR',
          body_text: newBody.trim(),
          variables,
          // Uazapi templates skip Meta's review pipeline entirely —
          // they're usable the moment they're saved.
          status: 'APPROVED',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success('Modelo criado.');
      setCreateOpen(false);
      setNewName('');
      setNewBody('');
      await fetchTemplates();
      if (data) onSelect(data as MessageTemplate);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao criar modelo');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Escolha um modelo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {providerType === 'meta'
              ? 'Selecione um modelo aprovado para o seu disparo.'
              : 'Selecione um modelo existente ou crie um novo para o disparo.'}
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          variant="outline"
          className="shrink-0 border-border text-foreground"
        >
          <Plus className="h-4 w-4" />
          Criar modelo
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-border bg-card/50">
          <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum modelo disponível ainda.</p>
          <Button onClick={() => setCreateOpen(true)} variant="link" className="mt-1 text-primary">
            Criar o primeiro modelo
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const isSelected = selectedTemplate?.id === template.id;
            const catColor = categoryColors[template.category] ?? categoryColors.Utility;

            return (
              <button
                key={template.id}
                onClick={() => onSelect(template)}
                className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border bg-card/50 hover:border-border hover:bg-card'
                }`}
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-medium text-foreground">{template.name}</h3>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${catColor}`}
                  >
                    {template.category}
                  </span>
                </div>
                <p className="line-clamp-3 text-xs text-muted-foreground">{template.body_text}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{template.language ?? 'pt_BR'}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="outline" onClick={onBack} className="border-border text-muted-foreground">
          Voltar
        </Button>
        <Button
          onClick={onNext}
          disabled={!selectedTemplate}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Próximo
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar modelo</DialogTitle>
            <DialogDescription>
              Escreva a mensagem e clique nas variáveis abaixo para inseri-las onde precisar.
              Cada variável vira um campo a preencher por contato na etapa de personalizar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="template-name">Nome do modelo</Label>
              <Input
                id="template-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Lembrete de consulta"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Variáveis</Label>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="rounded-full border border-border bg-card/50 px-2.5 py-1 text-xs text-foreground hover:bg-card"
                  >
                    + {v.label}
                  </button>
                ))}
                <CustomVariableButton onInsert={insertVariable} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-body">Corpo da mensagem</Label>
              <Textarea
                id="template-body"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={6}
                placeholder="Olá {{nome}}, seu horário em {{data}} às {{horario}} está confirmado."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTemplate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar modelo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Small inline control for adding a variable name not in the suggested list. */
function CustomVariableButton({ onInsert }: { onInsert: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        + Personalizada
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
        placeholder="nome_da_variavel"
        className="h-7 w-36 text-xs"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            onInsert(value.trim());
            setValue('');
            setOpen(false);
          }
        }}
      />
      <Button
        type="button"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => {
          if (value.trim()) {
            onInsert(value.trim());
            setValue('');
            setOpen(false);
          }
        }}
      >
        OK
      </Button>
    </div>
  );
}
