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
import { Loader2, FileText, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

// Named placeholders only — this manager is for the unofficial
// (Uazapi) sending path, which doesn't go through Meta's template
// review, so there's no positional {{1}}/{{2}} contract to satisfy
// and no approval/category/quality-score fields to show.
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

type PartType = 'text' | 'image' | 'video' | 'document' | 'audio';

interface TemplatePart {
  id: string;
  type: PartType;
  text?: string;
  media_url?: string;
  filename?: string;
}

const PART_LABELS: Record<PartType, string> = {
  text: 'Texto',
  image: 'Imagem',
  video: 'Vídeo',
  document: 'Documento',
  audio: 'Áudio',
};

function newPartId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function SimpleTemplateManager() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [parts, setParts] = useState<TemplatePart[]>([{ id: newPartId(), type: 'text', text: '' }]);
  const [uploadingPartId, setUploadingPartId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function fetchTemplates() {
    if (!profile?.account_id) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('account_id', profile.account_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTemplates(data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao carregar modelos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.account_id]);

  function openCreate() {
    setEditingId(null);
    setName('');
    setParts([{ id: newPartId(), type: 'text', text: '' }]);
    setDialogOpen(true);
  }

  function openEdit(t: MessageTemplate) {
    setEditingId(t.id);
    setName(t.name);
    const existingParts = t.parts as TemplatePart[] | undefined;
    setParts(
      existingParts && existingParts.length > 0
        ? existingParts
        : [{ id: newPartId(), type: 'text', text: t.body_text || '' }],
    );
    setDialogOpen(true);
  }

  function insertVariable(key: string) {
    // Always lands in the first text part — the main message is the
    // usual place for {{nome}}/{{data}}/etc, and picking "the
    // currently focused part" would need tracking focus across a
    // dynamic list for very little practical gain.
    setParts((prev) => {
      const idx = prev.findIndex((p) => p.type === 'text');
      if (idx === -1) return prev;
      const copy = [...prev];
      copy[idx] = { ...copy[idx], text: `${copy[idx].text ?? ''}{{${key}}}` };
      return copy;
    });
  }

  function addPart(type: PartType) {
    setParts((prev) => [
      ...prev,
      type === 'text' ? { id: newPartId(), type, text: '' } : { id: newPartId(), type, media_url: '', filename: '' },
    ]);
  }

  function updatePart(id: string, patch: Partial<TemplatePart>) {
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removePart(id: string) {
    setParts((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  }

  function movePart(id: string, dir: -1 | 1) {
    setParts((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      const newIdx = idx + dir;
      if (idx < 0 || newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  }

  async function handlePartFileUpload(id: string, file: File) {
    setUploadingPartId(id);
    try {
      const { uploadAccountMedia } = await import('@/lib/storage/upload-media');
      const part = parts.find((p) => p.id === id);
      const bucket = 'chat-media';
      const { publicUrl } = await uploadAccountMedia(bucket, file);
      updatePart(id, { media_url: publicUrl, filename: file.name });
      if (part?.type === 'audio' && !file.name.toLowerCase().endsWith('.ogg')) {
        toast.warning(
          'Esse áudio não está em .ogg — vai ser enviado como arquivo comum, não como nota de voz gravada.',
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar arquivo.');
    } finally {
      setUploadingPartId(null);
    }
  }

  async function handleSave() {
    const firstText = parts.find((p) => p.type === 'text')?.text?.trim() ?? '';
    const hasContent = parts.some((p) => (p.type === 'text' ? p.text?.trim() : p.media_url));
    if (!name.trim() || !hasContent) {
      toast.error('Preencha o nome e pelo menos uma parte com conteúdo.');
      return;
    }
    if (!profile?.account_id) {
      toast.error('Conta não identificada.');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const variables = extractNamedVariables(parts.map((p) => p.text ?? '').join(' '));

      if (editingId) {
        const { error } = await supabase
          .from('message_templates')
          .update({ name: name.trim(), body_text: firstText, parts, variables })
          .eq('id', editingId)
          .eq('account_id', profile.account_id);
        if (error) throw error;
        toast.success('Modelo atualizado.');
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('Sessão expirada.');

        const { error } = await supabase.from('message_templates').insert({
          user_id: user.id,
          account_id: profile.account_id,
          name: name.trim(),
          category: 'Marketing',
          language: 'pt_BR',
          body_text: firstText,
          parts,
          variables,
          // No Meta review pipeline on this path — usable immediately.
          status: 'APPROVED',
        });
        if (error) throw error;
        toast.success('Modelo criado.');
      }

      setDialogOpen(false);
      await fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar modelo');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!profile?.account_id) return;
    setDeletingId(id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('message_templates')
        .delete()
        .eq('id', id)
        .eq('account_id', profile.account_id);
      if (error) throw error;
      toast.success('Modelo excluído.');
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao excluir modelo');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Templates de Campanha</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Modelos de mensagem usados nos disparos em massa.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4" />
          Criar modelo
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-border bg-card/50">
          <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum modelo criado ainda.</p>
          <Button onClick={openCreate} variant="link" className="mt-1 text-primary">
            Criar o primeiro modelo
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-foreground">{t.name}</h3>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openEdit(t)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id}
                    className="rounded p-1 text-muted-foreground hover:text-red-400"
                    title="Excluir"
                  >
                    {deletingId === t.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <p className="line-clamp-3 text-xs text-muted-foreground">{t.body_text}</p>
              {t.variables && t.variables.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {t.variables.map((v) => (
                    <span
                      key={v}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar modelo' : 'Criar modelo'}</DialogTitle>
            <DialogDescription>
              Escreva a mensagem e clique nas variáveis abaixo para inseri-las onde precisar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Nome do modelo</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conteúdo do modelo</Label>
                <div className="relative">
                  <select
                    onChange={(e) => {
                      if (e.target.value) addPart(e.target.value as PartType);
                      e.target.value = '';
                    }}
                    defaultValue=""
                    className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-bold text-primary"
                  >
                    <option value="" disabled>
                      + Adicionar parte
                    </option>
                    <option value="text">Texto</option>
                    <option value="image">Imagem</option>
                    <option value="video">Vídeo</option>
                    <option value="document">Documento</option>
                    <option value="audio">Áudio</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Cada parte vira uma mensagem separada, enviada em sequência.
              </p>

              {parts.map((part, idx) => (
                <div key={part.id} className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                      {idx + 1}. {PART_LABELS[part.type]}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => movePart(part.id, -1)}
                        disabled={idx === 0}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => movePart(part.id, 1)}
                        disabled={idx === parts.length - 1}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        ↓
                      </button>
                      {parts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePart(part.id)}
                          className="text-rose-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {part.type === 'text' ? (
                    <Textarea
                      value={part.text ?? ''}
                      onChange={(e) => updatePart(part.id, { text: e.target.value })}
                      rows={4}
                      placeholder="Olá {{nome}}, seu horário em {{data}} às {{horario}} está confirmado."
                    />
                  ) : (
                    <div className="space-y-1.5">
                      {part.media_url ? (
                        <div className="flex items-center justify-between rounded-lg bg-background px-2.5 py-2 text-xs">
                          <span className="truncate font-medium">{part.filename || part.media_url}</span>
                          <button
                            type="button"
                            onClick={() => updatePart(part.id, { media_url: '', filename: '' })}
                            className="shrink-0 text-rose-400 hover:text-rose-600 ml-2"
                          >
                            Remover
                          </button>
                        </div>
                      ) : (
                        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-3 text-xs font-bold text-primary hover:bg-card">
                          {uploadingPartId === part.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          Enviar {PART_LABELS[part.type].toLowerCase()}
                          <input
                            type="file"
                            accept={
                              part.type === 'image' ? 'image/*'
                              : part.type === 'video' ? 'video/*'
                              : part.type === 'audio' ? 'audio/*'
                              : undefined
                            }
                            className="hidden"
                            disabled={uploadingPartId === part.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handlePartFileUpload(part.id, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                      {part.type === 'audio' && (
                        <p className="text-[10px] text-muted-foreground">
                          Só soa como &quot;gravado na hora&quot; (nota de voz) se o arquivo já estiver em
                          formato .ogg. Outros formatos chegam como arquivo de áudio comum.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar modelo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
