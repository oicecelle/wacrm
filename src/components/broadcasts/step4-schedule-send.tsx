'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { MessageTemplate } from '@/types';
import type { AudienceConfig } from '@/hooks/use-broadcast-sending';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { suggestedTagName } from '@/lib/broadcasts/tag-on-send';
import { ArrowLeft, Send, Loader2, Users, Save, Tag } from 'lucide-react';


interface Step4Props {
  name: string;
  onNameChange: (name: string) => void;
  template: MessageTemplate;
  audience: AudienceConfig;
  onAudienceChange: (audience: AudienceConfig) => void;
  /** ISO string from step 3, or undefined for "send as soon as possible". */
  scheduledAtIso?: string;
  onSend: () => void;
  onSaveDraft?: () => void;
  onBack: () => void;
  isProcessing: boolean;
  progress: number;
}

export function Step4ScheduleSend({
  name,
  onNameChange,
  template,
  audience,
  onAudienceChange,
  scheduledAtIso,
  onSend,
  onSaveDraft,
  onBack,
  isProcessing,
  progress,
}: Step4Props) {
  const { profile } = useAuth();
  const accountId = profile?.account_id;
  const [showConfirm, setShowConfirm] = useState(false);
  const [estimatedReach, setEstimatedReach] = useState<number>(0);
  const [loadingReach, setLoadingReach] = useState(true);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!accountId) return;
    createClient()
      .from('tags')
      .select('id, name')
      .eq('account_id', accountId)
      .order('name')
      .then(({ data }) => setTags((data ?? []) as { id: string; name: string }[]));
  }, [accountId]);

  const tagOnSend = audience.tagOnSend ?? { enabled: false };
  // 'new' = criar uma tag nova com o nome digitado; senão o id de uma tag existente.
  const tagChoice = tagOnSend.tagId ?? 'new';
  function setTagOnSend(next: NonNullable<AudienceConfig['tagOnSend']>) {
    onAudienceChange({ ...audience, tagOnSend: next });
  }

  useEffect(() => {
    if (!accountId) return;
    async function calculateReach() {
      setLoadingReach(true);
      try {
        const supabase = createClient();

        if (audience.type === 'all') {
          const { count } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .eq('account_id', accountId);
          setEstimatedReach(count ?? 0);
        } else if (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) {
          const { data: contactTags } = await supabase
            .from('contact_tags')
            .select('contact_id, contacts!inner(account_id)')
            .eq('contacts.account_id', accountId)
            .in('tag_id', audience.tagIds);

          const uniqueIds = new Set((contactTags ?? []).map((ct) => ct.contact_id));
          setEstimatedReach(uniqueIds.size);
        } else if (audience.type === 'csv' && audience.csvContacts) {
          setEstimatedReach(audience.csvContacts.length);
        } else {
          setEstimatedReach(0);
        }
      } finally {
        setLoadingReach(false);
      }
    }

    calculateReach();
  }, [audience, accountId]);

  const audienceLabel =
    audience.type === 'all'
      ? 'Todos os contatos'
      : audience.type === 'tags'
        ? `Tags (${audience.tagIds?.length ?? 0} selecionada${(audience.tagIds?.length ?? 0) === 1 ? '' : 's'})`
        : audience.type === 'csv'
          ? 'Lista personalizada'
          : 'Personalizado';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Revisar & Enviar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dê um nome ao disparo, revise os detalhes e envie.
        </p>
      </div>

      {/* Nome do Disparo */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Nome do Disparo</label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="ex: Divulgação Promoção de Verão"
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Summary Card */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Resumo</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Modelo</p>
            <p className="text-foreground">{template.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Audiência</p>
            <p className="text-foreground">{audienceLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Alcance Estimado</p>
            <div className="flex items-center gap-1.5">
              {loadingReach ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : (
                <>
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <p className="font-medium text-foreground">{estimatedReach.toLocaleString()}</p>
                </>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Idioma</p>
            <p className="text-foreground">{template.language ?? 'pt_BR'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Envio programado para</p>
            <p className="text-foreground">
              {scheduledAtIso
                ? new Date(scheduledAtIso).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })
                : 'Assim que possível'}
            </p>
          </div>
        </div>
      </div>

      {/* Marcar quem receber */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Tag className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Marcar quem receber este disparo</p>
              <p className="text-xs text-muted-foreground">
                Cada contato que receber a mensagem ganha uma tag. Assim você filtra depois quem recebeu esta campanha.
              </p>
            </div>
          </div>
          <Switch
            checked={tagOnSend.enabled}
            onCheckedChange={(checked) =>
              setTagOnSend({
                ...tagOnSend,
                enabled: checked,
                newTagName: tagOnSend.newTagName ?? suggestedTagName(name, template.name),
              })
            }
            aria-label="Marcar quem receber este disparo"
          />
        </div>
        {tagOnSend.enabled && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={tagChoice}
              onChange={(e) =>
                setTagOnSend({ ...tagOnSend, tagId: e.target.value === 'new' ? undefined : e.target.value })
              }
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            >
              <option value="new">Criar uma tag nova</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {tagChoice === 'new' && (
              <Input
                value={tagOnSend.newTagName ?? ''}
                onChange={(e) => setTagOnSend({ ...tagOnSend, newTagName: e.target.value })}
                placeholder="Nome da tag"
                className="border-border bg-muted text-foreground"
              />
            )}
          </div>
        )}
      </div>

      {/* Processing overlay */}
      {isProcessing && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">Enviando disparo...</p>
            </div>
            <span className="text-xs font-medium text-primary">{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isProcessing}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <div className="flex items-center gap-2">
          {onSaveDraft && (
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={!name.trim() || isProcessing}
              className="border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Salvar rascunho
            </Button>
          )}

          <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogTrigger
            render={
              <Button
                disabled={!name.trim() || isProcessing}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              />
            }
          >
            <Send className="h-4 w-4" />
            Enviar disparo
          </DialogTrigger>
          <DialogContent className="border-border bg-popover sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">Confirmar Disparo</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Você está prestes a enviar esse disparo para{' '}
                <span className="font-medium text-popover-foreground">{estimatedReach.toLocaleString()}</span>{' '}
                contatos usando o modelo{' '}
                <span className="font-medium text-popover-foreground">{template.name}</span>
                {scheduledAtIso ? (
                  <>
                    , programado para{' '}
                    <span className="font-medium text-popover-foreground">
                      {new Date(scheduledAtIso).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </>
                ) : (
                  ', assim que possível'
                )}
                . Essa ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                className="border-border text-muted-foreground"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setShowConfirm(false);
                  onSend();
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Send className="h-4 w-4" />
                Confirmar e enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </div>
  );
}
