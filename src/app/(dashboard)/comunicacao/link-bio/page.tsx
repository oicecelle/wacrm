'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  Image as ImageIcon,
  Images,
  Star,
  Link2,
  FileText,
  GripVertical,
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────── */
type BlockType = 'card' | 'banner' | 'banner_carousel' | 'testimonials' | 'external_link';

interface Block {
  id: string;
  type: BlockType;
  // card
  title?: string;
  subtitle?: string;
  action_kind?: 'form' | 'link';
  form_id?: string;
  url?: string;
  // banner
  image_url?: string;
  link_url?: string;
  // banner_carousel
  images?: { image_url: string; link_url?: string }[];
  // testimonials
  testimonials_title?: string;
  // external_link
  label?: string;
}

interface FormField {
  id: string;
  label: string;
  type: 'text' | 'dropdown' | 'textarea';
  options?: string[];
  required?: boolean;
}

interface BioForm {
  id: string;
  name: string;
  fields: FormField[];
  whatsapp_message_template: string;
  isNew?: boolean;
}

const BLOCK_LABELS: Record<BlockType, { label: string; icon: typeof LayoutGrid }> = {
  card: { label: 'Card', icon: LayoutGrid },
  banner: { label: 'Banner', icon: ImageIcon },
  banner_carousel: { label: 'Carrossel de banners', icon: Images },
  testimonials: { label: 'Depoimentos', icon: Star },
  external_link: { label: 'Link externo', icon: Link2 },
};

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ─── Page ───────────────────────────────────────────────── */
export default function LinkBioPage() {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageId, setPageId] = useState<string | null>(null);

  const [slug, setSlug] = useState('');
  const [slugCheck, setSlugCheck] = useState<{ checking: boolean; available: boolean | null; reason?: string }>({
    checking: false,
    available: null,
  });
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [themeColor, setThemeColor] = useState('#2563eb');
  const [isPublished, setIsPublished] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [forms, setForms] = useState<BioForm[]>([]);

  /* ─── Load ─── */
  useEffect(() => {
    if (!accountId) return;
    const load = async () => {
      setLoading(true);
      const [{ data: page }, { data: clinicRow }, { data: formRows }] = await Promise.all([
        supabase.from('bio_pages').select('*').eq('account_id', accountId).maybeSingle(),
        supabase.from('clinics').select('slug, name').eq('id', accountId).maybeSingle(),
        supabase.from('bio_forms').select('*').eq('account_id', accountId).order('created_at'),
      ]);

      if (page) {
        setPageId(page.id);
        setTitle(page.title || clinicRow?.name || '');
        setSubtitle(page.subtitle || '');
        setAvatarUrl(page.avatar_url || '');
        setThemeColor(page.theme_color || '#2563eb');
        setIsPublished(page.is_published);
        setBlocks(page.blocks || []);
      } else {
        setTitle(clinicRow?.name || '');
      }
      setSlug(page?.slug || clinicRow?.slug || '');
      setForms((formRows || []).map((f) => ({ ...f, fields: f.fields || [] })));
      setLoading(false);
    };
    load();
  }, [accountId, supabase]);

  /* ─── Slug availability (debounced) ─── */
  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugCheck({ checking: false, available: null });
      return;
    }
    setSlugCheck({ checking: true, available: null });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/bio-page/check-slug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        });
        const data = await res.json();
        setSlugCheck({ checking: false, available: !!data.available, reason: data.reason });
      } catch {
        setSlugCheck({ checking: false, available: null });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [slug]);

  /* ─── Block management ─── */
  const addBlock = (type: BlockType) => {
    const base: Block = { id: newId(), type };
    if (type === 'card') Object.assign(base, { title: '', subtitle: '', action_kind: 'link', url: '' });
    if (type === 'banner') Object.assign(base, { image_url: '', link_url: '' });
    if (type === 'banner_carousel') Object.assign(base, { images: [] });
    if (type === 'testimonials') Object.assign(base, { testimonials_title: 'O que dizem nossos pacientes' });
    if (type === 'external_link') Object.assign(base, { label: '', url: '' });
    setBlocks((prev) => [...prev, base]);
  };

  const updateBlock = (id: string, patch: Partial<Block>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const removeBlock = (id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id));

  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      const newIdx = idx + dir;
      if (idx < 0 || newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };

  /* ─── Forms management ─── */
  const addForm = () => {
    setForms((prev) => [
      ...prev,
      { id: newId(), name: 'Novo formulário', fields: [], whatsapp_message_template: '', isNew: true },
    ]);
  };

  const updateForm = (id: string, patch: Partial<BioForm>) => {
    setForms((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeFormField = (formId: string, fieldId: string) => {
    setForms((prev) =>
      prev.map((f) => (f.id === formId ? { ...f, fields: f.fields.filter((fl) => fl.id !== fieldId) } : f)),
    );
  };

  const addFormField = (formId: string) => {
    setForms((prev) =>
      prev.map((f) =>
        f.id === formId
          ? { ...f, fields: [...f.fields, { id: newId(), label: '', type: 'text', required: true }] }
          : f,
      ),
    );
  };

  const updateFormField = (formId: string, fieldId: string, patch: Partial<FormField>) => {
    setForms((prev) =>
      prev.map((f) =>
        f.id === formId
          ? { ...f, fields: f.fields.map((fl) => (fl.id === fieldId ? { ...fl, ...patch } : fl)) }
          : f,
      ),
    );
  };

  const removeForm = async (form: BioForm) => {
    if (!confirm(`Remover o formulário "${form.name}"? Cards que apontam pra ele vão parar de funcionar.`)) return;
    if (!form.isNew) {
      await supabase.from('bio_forms').delete().eq('id', form.id);
    }
    setForms((prev) => prev.filter((f) => f.id !== form.id));
  };

  /* ─── Save ─── */
  const handleSave = useCallback(async () => {
    if (!accountId) return;
    if (slug && slugCheck.available === false) {
      toast.error(slugCheck.reason || 'Esse endereço não está disponível.');
      return;
    }
    setSaving(true);
    try {
      // Slug lives on clinics (shared with /portal/{slug} login) — keep
      // both in sync rather than introducing a second source of truth.
      if (slug) {
        await supabase.from('clinics').update({ slug }).eq('id', accountId);
      }

      const { data: savedPage, error: pageErr } = await supabase
        .from('bio_pages')
        .upsert(
          {
            account_id: accountId,
            slug: slug || null,
            title: title.trim(),
            subtitle: subtitle.trim() || null,
            avatar_url: avatarUrl.trim() || null,
            theme_color: themeColor,
            blocks,
            is_published: isPublished,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id' },
        )
        .select('id')
        .single();
      if (pageErr) throw pageErr;
      setPageId(savedPage.id);

      // Forms: upsert each (new ones get a fresh id from the DB — but
      // since ids here are client-generated and unique already, upsert
      // by id works either way).
      for (const form of forms) {
        const { isNew, ...formData } = form;
        void isNew;
        const { error: formErr } = await supabase.from('bio_forms').upsert({
          id: form.id,
          account_id: accountId,
          name: formData.name.trim() || 'Formulário sem nome',
          fields: formData.fields,
          whatsapp_message_template: formData.whatsapp_message_template,
        });
        if (formErr) throw formErr;
      }
      setForms((prev) => prev.map((f) => ({ ...f, isNew: false })));

      toast.success('Link na bio salvo com sucesso!');
    } catch (err) {
      console.error('Error saving bio page:', err);
      toast.error('Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  }, [accountId, slug, slugCheck, title, subtitle, avatarUrl, themeColor, isPublished, blocks, forms, supabase]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20 text-left">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-900">Link na Bio</h1>
          <p className="text-sm text-neutral-500">
            Monte a página pública da sua clínica — cards, banners, depoimentos e formulários.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {pageId && slug && (
              <a
                href={`https://leadpluz.com/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ver página
              </a>
            )}
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </div>
          {pageId && slug && !isPublished && (
            <p className="text-[10px] font-bold text-amber-600">
              Ainda não publicada — marque &quot;Página publicada&quot; e salve pra ficar visível.
            </p>
          )}
        </div>
      </div>

      {/* Slug + publish */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4 shadow-xs">
        <div>
          <label className="mb-1 block text-xs font-bold text-neutral-600 uppercase tracking-wide">
            Endereço da sua página
          </label>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-neutral-400">leadpluz.com/</span>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="clinica-abc"
              className="flex-1"
            />
            {slugCheck.checking && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-400" />}
            {!slugCheck.checking && slugCheck.available === true && (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            )}
            {!slugCheck.checking && slugCheck.available === false && (
              <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
            )}
          </div>
          {!slugCheck.checking && slugCheck.available === false && (
            <p className="mt-1 text-xs font-semibold text-rose-500">{slugCheck.reason}</p>
          )}
          {!slugCheck.checking && slugCheck.available === true && (
            <p className="mt-1 text-xs font-semibold text-emerald-600">Disponível!</p>
          )}
          <p className="mt-1 text-[10px] text-neutral-400">
            Esse mesmo endereço também é usado pro login do Portal do Paciente.
          </p>
        </div>

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          <span className="text-sm font-bold text-neutral-800">Página publicada</span>
          <span className="text-xs text-neutral-400">(desmarcado, ninguém consegue acessar)</span>
        </label>
      </div>

      {/* Appearance */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4 shadow-xs">
        <h2 className="text-xs font-black uppercase tracking-wide text-neutral-500">Aparência</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-neutral-600">Título</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome da clínica" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-neutral-600">Subtítulo</label>
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Ex: Estética avançada" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-neutral-600">URL da foto/logo</label>
            <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-neutral-600">Cor principal</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-md border border-neutral-200"
              />
              <Input value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="flex-1" />
            </div>
          </div>
        </div>
      </div>

      {/* Blocks */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wide text-neutral-500">Conteúdo da página</h2>
          <div className="relative">
            <select
              onChange={(e) => {
                if (e.target.value) addBlock(e.target.value as BlockType);
                e.target.value = '';
              }}
              defaultValue=""
              className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-bold text-blue-600"
            >
              <option value="" disabled>
                + Adicionar bloco
              </option>
              {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => (
                <option key={t} value={t}>
                  {BLOCK_LABELS[t].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {blocks.length === 0 && (
          <p className="py-8 text-center text-xs font-semibold text-neutral-400">
            Nenhum bloco ainda. Adicione um card, banner ou depoimentos acima.
          </p>
        )}

        <div className="space-y-3">
          {blocks.map((block, idx) => (
            <BlockEditor
              key={block.id}
              block={block}
              forms={forms}
              isFirst={idx === 0}
              isLast={idx === blocks.length - 1}
              onChange={(patch) => updateBlock(block.id, patch)}
              onRemove={() => removeBlock(block.id)}
              onMoveUp={() => moveBlock(block.id, -1)}
              onMoveDown={() => moveBlock(block.id, 1)}
            />
          ))}
        </div>
      </div>

      {/* Forms manager */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wide text-neutral-500">Formulários</h2>
          <button
            onClick={addForm}
            className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo formulário
          </button>
        </div>
        <p className="text-xs text-neutral-400">
          Um card do tipo &quot;Card&quot; pode abrir um desses formulários. As respostas viram uma mensagem pronta
          no WhatsApp — use <code className="rounded bg-neutral-100 px-1">{'{{id_do_campo}}'}</code> no texto da
          mensagem pra inserir cada resposta.
        </p>
        {forms.length === 0 && (
          <p className="py-6 text-center text-xs font-semibold text-neutral-400">Nenhum formulário criado ainda.</p>
        )}
        <div className="space-y-3">
          {forms.map((form) => (
            <FormEditor
              key={form.id}
              form={form}
              onChange={(patch) => updateForm(form.id, patch)}
              onRemove={() => removeForm(form)}
              onAddField={() => addFormField(form.id)}
              onRemoveField={(fieldId) => removeFormField(form.id, fieldId)}
              onUpdateField={(fieldId, patch) => updateFormField(form.id, fieldId, patch)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Block editor ───────────────────────────────────────── */
function BlockEditor({
  block,
  forms,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  block: Block;
  forms: BioForm[];
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<Block>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const meta = BLOCK_LABELS[block.type];
  const Icon = meta.icon;

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-neutral-300" />
        <Icon className="h-4 w-4 text-blue-600" />
        <span className="text-xs font-black text-neutral-700">{meta.label}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={onMoveUp} disabled={isFirst} className="text-neutral-400 hover:text-neutral-700 disabled:opacity-30">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="text-neutral-400 hover:text-neutral-700 disabled:opacity-30">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button onClick={onRemove} className="text-rose-400 hover:text-rose-600">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {block.type === 'card' && (
        <div className="space-y-2">
          <Input placeholder="Título (ex: Agendar consulta)" value={block.title || ''} onChange={(e) => onChange({ title: e.target.value })} />
          <Input placeholder="Subtítulo (opcional)" value={block.subtitle || ''} onChange={(e) => onChange({ subtitle: e.target.value })} />
          <div className="flex gap-2">
            <select
              value={block.action_kind || 'link'}
              onChange={(e) => onChange({ action_kind: e.target.value as 'form' | 'link' })}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs"
            >
              <option value="link">Abre um link</option>
              <option value="form">Abre um formulário</option>
            </select>
            {block.action_kind === 'form' ? (
              <select
                value={block.form_id || ''}
                onChange={(e) => onChange({ form_id: e.target.value })}
                className="flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs"
              >
                <option value="">Selecione o formulário...</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                placeholder="https://..."
                value={block.url || ''}
                onChange={(e) => onChange({ url: e.target.value })}
                className="flex-1"
              />
            )}
          </div>
        </div>
      )}

      {block.type === 'banner' && (
        <div className="space-y-2">
          <Input placeholder="URL da imagem" value={block.image_url || ''} onChange={(e) => onChange({ image_url: e.target.value })} />
          <Input placeholder="Link ao clicar (opcional)" value={block.link_url || ''} onChange={(e) => onChange({ link_url: e.target.value })} />
        </div>
      )}

      {block.type === 'banner_carousel' && (
        <div className="space-y-2">
          {(block.images || []).map((img, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder="URL da imagem"
                value={img.image_url}
                onChange={(e) => {
                  const imgs = [...(block.images || [])];
                  imgs[i] = { ...imgs[i], image_url: e.target.value };
                  onChange({ images: imgs });
                }}
                className="flex-1"
              />
              <Input
                placeholder="Link (opcional)"
                value={img.link_url || ''}
                onChange={(e) => {
                  const imgs = [...(block.images || [])];
                  imgs[i] = { ...imgs[i], link_url: e.target.value };
                  onChange({ images: imgs });
                }}
                className="flex-1"
              />
              <button
                onClick={() => onChange({ images: (block.images || []).filter((_, idx) => idx !== i) })}
                className="text-rose-400 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() => onChange({ images: [...(block.images || []), { image_url: '', link_url: '' }] })}
            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar imagem
          </button>
        </div>
      )}

      {block.type === 'testimonials' && (
        <div className="space-y-2">
          <Input
            placeholder="Título da seção"
            value={block.testimonials_title || ''}
            onChange={(e) => onChange({ testimonials_title: e.target.value })}
          />
          <p className="text-[10px] text-neutral-400">
            Mostra os depoimentos aprovados da sua clínica, rotativos automaticamente.
          </p>
        </div>
      )}

      {block.type === 'external_link' && (
        <div className="space-y-2">
          <Input placeholder="Texto do link (ex: Instagram)" value={block.label || ''} onChange={(e) => onChange({ label: e.target.value })} />
          <Input placeholder="https://..." value={block.url || ''} onChange={(e) => onChange({ url: e.target.value })} />
        </div>
      )}
    </div>
  );
}

/* ─── Form editor ─────────────────────────────────────────── */
function FormEditor({
  form,
  onChange,
  onRemove,
  onAddField,
  onRemoveField,
  onUpdateField,
}: {
  form: BioForm;
  onChange: (patch: Partial<BioForm>) => void;
  onRemove: () => void;
  onAddField: () => void;
  onRemoveField: (fieldId: string) => void;
  onUpdateField: (fieldId: string, patch: Partial<FormField>) => void;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-blue-600" />
        <Input
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="h-8 flex-1 border-0 bg-transparent text-sm font-bold shadow-none focus-visible:ring-0"
        />
        <button onClick={onRemove} className="text-rose-400 hover:text-rose-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {form.fields.map((field) => (
          <div key={field.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 border border-neutral-100">
            <Input
              placeholder="Pergunta (ex: Nome)"
              value={field.label}
              onChange={(e) => onUpdateField(field.id, { label: e.target.value })}
              className="h-8 flex-1 min-w-[140px] text-xs"
            />
            <select
              value={field.type}
              onChange={(e) => onUpdateField(field.id, { type: e.target.value as FormField['type'] })}
              className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs"
            >
              <option value="text">Texto curto</option>
              <option value="textarea">Texto longo</option>
              <option value="dropdown">Lista (dropdown)</option>
            </select>
            {field.type === 'dropdown' && (
              <Input
                placeholder="Opções separadas por vírgula"
                value={(field.options || []).join(', ')}
                onChange={(e) =>
                  onUpdateField(field.id, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
                }
                className="h-8 flex-1 min-w-[160px] text-xs"
              />
            )}
            <span className="text-[9px] font-mono text-neutral-400">{'{{' + field.id + '}}'}</span>
            <button onClick={() => onRemoveField(field.id)} className="text-rose-400 hover:text-rose-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button onClick={onAddField} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800">
          <Plus className="h-3.5 w-3.5" /> Adicionar pergunta
        </button>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-500">Mensagem que vai pro WhatsApp</label>
        <textarea
          value={form.whatsapp_message_template}
          onChange={(e) => onChange({ whatsapp_message_template: e.target.value })}
          rows={3}
          placeholder="Ex: Olá! Meu nome é {{campo_nome}} e tenho interesse em {{campo_interesse}}."
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-mono resize-none"
        />
      </div>
    </div>
  );
}
