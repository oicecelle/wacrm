'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag, ContactNote, CustomField, ContactCustomValue, Deal } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Phone,
  Mail,
  Building2,
  Copy,
  Check,
  Loader2,
  Plus,
  Trash2,
  Save,
  X,
  DollarSign,
  CalendarIcon,
  FileTextIcon,
  TrendingUpIcon,
  Sparkles,
  Hourglass,
  MessageSquare,
  Clock,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { ProntuarioTab } from '@/components/contacts/prontuario-tab';
import { EvolucaoTab } from '@/components/contacts/evolucao-tab';

interface ContactDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string | null;
  onUpdated: () => void;
}

export function ContactDetailView({
  open,
  onOpenChange,
  contactId,
  onUpdated,
}: ContactDetailViewProps) {
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Details tab
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  // Tags tab
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [contactTagIds, setContactTagIds] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);

  // Notes tab
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Custom fields tab
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [savingCustom, setSavingCustom] = useState(false);
  const [loadingCustom, setLoadingCustom] = useState(false);

  // Deals tab
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);

  // Timeline tab
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // AI Summary
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingAISummary, setLoadingAISummary] = useState(false);

  // Financeiro tab
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Form para registrar nova transação
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [txDesc, setTxDesc] = useState('');
  const [txCategory, setTxCategory] = useState('Procedimento');
  const [txMethod, setTxMethod] = useState('pix');
  const [txType, setTxType] = useState<'receita' | 'despesa'>('receita');
  const [txValue, setTxValue] = useState('');
  const [txStatus, setTxStatus] = useState('paid');
  const [txDate, setTxDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [savingTransaction, setSavingTransaction] = useState(false);

  const fetchContact = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);

    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (data) {
      setContact(data);
      setEditName(data.name ?? '');
      setEditPhone(data.phone);
      setEditEmail(data.email ?? '');
      setEditCompany(data.company ?? '');
    }
    setLoading(false);
  }, [contactId, supabase]);

  const fetchTags = useCallback(async () => {
    if (!contactId) return;

    const [tagsRes, contactTagsRes] = await Promise.all([
      supabase.from('tags').select('*').order('name'),
      supabase.from('contact_tags').select('tag_id').eq('contact_id', contactId),
    ]);

    if (tagsRes.data) setAllTags(tagsRes.data);
    if (contactTagsRes.data) {
      setContactTagIds(contactTagsRes.data.map((ct) => ct.tag_id));
    }
  }, [contactId, supabase]);

  const fetchNotes = useCallback(async () => {
    if (!contactId) return;
    setLoadingNotes(true);

    const { data } = await supabase
      .from('contact_notes')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    if (data) setNotes(data);
    setLoadingNotes(false);
  }, [contactId, supabase]);

  const fetchCustomFields = useCallback(async () => {
    if (!contactId) return;
    setLoadingCustom(true);

    const [fieldsRes, valuesRes] = await Promise.all([
      supabase.from('custom_fields').select('*').order('field_name'),
      supabase
        .from('contact_custom_values')
        .select('*')
        .eq('contact_id', contactId),
    ]);

    if (fieldsRes.data) setCustomFields(fieldsRes.data);
    if (valuesRes.data) {
      const map: Record<string, string> = {};
      valuesRes.data.forEach((v) => {
        map[v.custom_field_id] = v.value ?? '';
      });
      setCustomValues(map);
    }
    setLoadingCustom(false);
  }, [contactId, supabase]);

  const fetchDeals = useCallback(async () => {
    if (!contactId) return;
    setLoadingDeals(true);
    const { data } = await supabase
      .from('deals')
      .select('*, stage:pipeline_stages(*)')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    setDeals((data ?? []) as Deal[]);
    setLoadingDeals(false);
  }, [contactId, supabase]);

  const fetchTimeline = useCallback(async () => {
    if (!contactId) return;
    setLoadingTimeline(true);
    const { data } = await supabase
      .from('contact_timeline')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    if (data) setTimelineEvents(data);
    setLoadingTimeline(false);
  }, [contactId, supabase]);

  const fetchTransactions = useCallback(async () => {
    if (!contactId) return;
    setLoadingTransactions(true);
    const { data } = await supabase
      .from('financial_transactions')
      .select('*')
      .eq('patient_id', contactId)
      .order('date', { ascending: false });
    if (data) setTransactions(data);
    setLoadingTransactions(false);
  }, [contactId, supabase]);

  const handleIARequest = async () => {
    if (!contactId) return;
    setLoadingAISummary(true);
    try {
      // 1. Fetch conversations for this contact
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .single();

      let formattedMsgs: { sender: string; text: string }[] = [];
      if (conv) {
        const { data: msgs } = await supabase
          .from('messages')
          .select('sender_type, content_text')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });

        if (msgs) {
          formattedMsgs = msgs.map((m) => ({
            sender: m.sender_type === 'lead' || m.sender_type === 'patient' ? 'patient' : 'clinic',
            text: m.content_text || '',
          }));
        }
      }

      // 2. Call generateAISummary action
      const { generateAISummary } = await import('@/app/actions/ai-actions');
      const summary = await generateAISummary(formattedMsgs);
      setAiSummary(summary);
      toast.success('Resumo gerado pela LIA!');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao gerar análise da IA: ' + err.message);
    } finally {
      setLoadingAISummary(false);
    }
  };

  const handleSaveTransaction = async () => {
    if (!contactId || !accountId || !txDesc.trim() || !txValue.trim()) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }
    setSavingTransaction(true);
    try {
      const { error } = await supabase.from('financial_transactions').insert({
        clinic_id: accountId,
        patient_id: contactId,
        description: txDesc.trim(),
        category: txCategory,
        method: txMethod,
        type: txType,
        value: parseFloat(txValue),
        status: txStatus,
        date: txDate,
        source: 'manual',
      });
      if (error) throw error;
      toast.success('Transação registrada com sucesso!');
      setTxDesc('');
      setTxValue('');
      setTxStatus('paid');
      setShowTransactionForm(false);
      await fetchTransactions();
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao salvar transação: ' + e.message);
    } finally {
      setSavingTransaction(false);
    }
  };

  useEffect(() => {
    if (open && contactId) {
      fetchContact();
      fetchTags();
      fetchNotes();
      fetchCustomFields();
      fetchDeals();
      fetchTimeline();
      fetchTransactions();
      setAiSummary(null);
    }
  }, [open, contactId, fetchContact, fetchTags, fetchNotes, fetchCustomFields, fetchDeals, fetchTimeline, fetchTransactions]);

  async function copyPhone() {
    if (!contact) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  }

  async function saveDetails() {
    if (!contactId || !editPhone.trim()) {
      toast.error('Phone number is required');
      return;
    }

    setSavingDetails(true);
    const { error } = await supabase
      .from('contacts')
      .update({
        name: editName.trim() || null,
        phone: editPhone.trim(),
        email: editEmail.trim() || null,
        company: editCompany.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);

    if (error) {
      toast.error('Failed to update contact');
    } else {
      toast.success('Contact updated');
      fetchContact();
      onUpdated();
    }
    setSavingDetails(false);
  }

  async function toggleTag(tagId: string) {
    if (!contactId) return;
    setSavingTags(true);

    const isSelected = contactTagIds.includes(tagId);

    if (isSelected) {
      const { error } = await supabase
        .from('contact_tags')
        .delete()
        .eq('contact_id', contactId)
        .eq('tag_id', tagId);
      if (!error) {
        setContactTagIds((prev) => prev.filter((id) => id !== tagId));
        onUpdated();
      }
    } else {
      const { error } = await supabase
        .from('contact_tags')
        .insert({ contact_id: contactId, tag_id: tagId });
      if (!error) {
        setContactTagIds((prev) => [...prev, tagId]);
        onUpdated();
      }
    }
    setSavingTags(false);
  }

  async function addNote() {
    if (!contactId || !newNote.trim()) return;
    setSavingNote(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user || !accountId) {
      toast.error('Not authenticated');
      setSavingNote(false);
      return;
    }

    const { error } = await supabase.from('contact_notes').insert({
      contact_id: contactId,
      account_id: accountId,
      user_id: user.id,
      note_text: newNote.trim(),
    });

    if (error) {
      toast.error('Failed to add note');
    } else {
      setNewNote('');
      fetchNotes();
      toast.success('Note added');
    }
    setSavingNote(false);
  }

  async function deleteNote(noteId: string) {
    const { error } = await supabase
      .from('contact_notes')
      .delete()
      .eq('id', noteId);

    if (error) {
      toast.error('Failed to delete note');
    } else {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success('Note deleted');
    }
  }

  async function saveCustomFields() {
    if (!contactId) return;
    setSavingCustom(true);

    try {
      // Delete existing values and re-insert
      await supabase
        .from('contact_custom_values')
        .delete()
        .eq('contact_id', contactId);

      const rows = Object.entries(customValues)
        .filter(([, val]) => val.trim())
        .map(([fieldId, val]) => ({
          contact_id: contactId,
          custom_field_id: fieldId,
          value: val.trim(),
        }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('contact_custom_values')
          .insert(rows);
        if (error) throw error;
      }

      toast.success('Custom fields saved');
    } catch {
      toast.error('Failed to save custom fields');
    }
    setSavingCustom(false);
  }

  function getInitials(name?: string | null) {
    if (!name) return '?';
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  // Calculos financeiros resumidos
  const totalPaid = transactions
    .filter((t) => t.type === 'receita' && t.status === 'paid')
    .reduce((sum, t) => sum + Number(t.value), 0);

  const totalPending = transactions
    .filter((t) => t.type === 'receita' && t.status === 'pending')
    .reduce((sum, t) => sum + Number(t.value), 0);

  const totalOverdue = transactions
    .filter((t) => t.type === 'receita' && t.status === 'overdue')
    .reduce((sum, t) => sum + Number(t.value), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl h-[88vh] bg-popover border border-neutral-200 shadow-2xl text-popover-foreground w-full p-0 overflow-hidden flex flex-col rounded-2xl z-50"
      >
        {loading || !contact ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <DialogHeader className="p-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <Avatar className="size-12 bg-muted border border-border">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {getInitials(contact.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-popover-foreground truncate">
                    {contact.name || 'Sem Nome'}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground text-xs mt-0.5">
                    Detalhes do paciente / lead
                  </DialogDescription>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <button
                      onClick={copyPhone}
                      className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                    >
                      <Phone className="size-3" />
                      {contact.phone}
                      {copiedPhone ? (
                        <Check className="size-3 text-primary" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                    {contact.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="size-3" />
                        {contact.email}
                      </span>
                    )}
                    {contact.company && (
                      <span className="flex items-center gap-1">
                        <Building2 className="size-3" />
                        {contact.company}
                      </span>
                    )}
                  </div>

                  {/* Ações Rápidas no Cabeçalho */}
                  <div className="flex flex-wrap items-center gap-2 mt-3.5">
                    <a
                      href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 h-7 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] text-emerald-600 hover:bg-emerald-500/10 px-2.5 text-[10px] font-black uppercase transition-all shrink-0 cursor-pointer"
                    >
                      <MessageSquare className="size-3" />
                      WhatsApp
                    </a>
                    <button
                      onClick={() => {
                        const ev = new CustomEvent('create-appointment', {
                          detail: {
                            contactId: contact.id,
                            contactName: contact.name,
                            contactPhone: contact.phone,
                          },
                        });
                        window.dispatchEvent(ev);
                        onOpenChange(false);
                      }}
                      className="inline-flex items-center gap-1 h-7 rounded-lg border border-blue-500/20 bg-blue-500/[0.03] text-blue-600 hover:bg-blue-500/10 px-2.5 text-[10px] font-black uppercase transition-all shrink-0 cursor-pointer"
                    >
                      <CalendarIcon className="size-3" />
                      Agendar
                    </button>
                    <button
                      disabled={loadingAISummary}
                      onClick={handleIARequest}
                      className="inline-flex items-center gap-1 h-7 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.03] text-indigo-600 hover:bg-indigo-500/10 px-2.5 text-[10px] font-black uppercase transition-all shrink-0 cursor-pointer"
                    >
                      {loadingAISummary ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Sparkles className="size-3 text-indigo-500" />
                      )}
                      Análise IA
                    </button>
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Tabs */}
            <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
              <TabsList className="bg-muted/50 border-b border-border mx-4 mt-3 flex-wrap h-auto gap-0.5">
                <TabsTrigger
                  value="details"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs"
                >
                  Dados
                </TabsTrigger>
                <TabsTrigger
                  value="timeline"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs"
                >
                  Linha do Tempo
                </TabsTrigger>
                <TabsTrigger
                  value="tags"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs"
                >
                  Tags
                </TabsTrigger>
                <TabsTrigger
                  value="notes"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs"
                >
                  Anotações
                </TabsTrigger>
                <TabsTrigger
                  value="prontuario"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs"
                >
                  🩺 Prontuário
                </TabsTrigger>
                <TabsTrigger
                  value="evolucao"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs"
                >
                  📈 Evolução
                </TabsTrigger>
                <TabsTrigger
                  value="financeiro"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs"
                >
                  💵 Financeiro
                </TabsTrigger>
                <TabsTrigger
                  value="custom"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs"
                >
                  Campos
                </TabsTrigger>
                <TabsTrigger
                  value="deals"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs"
                >
                  CRM
                </TabsTrigger>
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details" className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Name</Label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">
                        Phone <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Email</Label>
                      <Input
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Company</Label>
                      <Input
                        value={editCompany}
                        onChange={(e) => setEditCompany(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <Button
                      onClick={saveDetails}
                      disabled={savingDetails}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                      size="sm"
                    >
                      {savingDetails ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      Salvar Alterações
                    </Button>
                  </div>

                  {/* LIA Copilot Summary Insights Box */}
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.01] p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="size-4 text-indigo-500 fill-indigo-500/10" />
                        <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-400">LIA Copilot Summary</h4>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loadingAISummary}
                        onClick={handleIARequest}
                        className="h-6 text-[10px] font-bold border-indigo-500/30 text-indigo-600 hover:bg-indigo-500/10 cursor-pointer rounded-lg px-2"
                      >
                        {loadingAISummary ? <Loader2 className="size-3 animate-spin" /> : 'Analisar Conversa'}
                      </Button>
                    </div>
                    {aiSummary ? (
                      <div className="space-y-2">
                        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (!accountId) return;
                            const { data: { session } } = await supabase.auth.getSession();
                            const user = session?.user;
                            if (!user) return;
                            const { error } = await supabase.from('contact_notes').insert({
                              contact_id: contactId,
                              account_id: accountId,
                              user_id: user.id,
                              note_text: `[LIA INSIGHTS SUMMARY]:\n${aiSummary}`,
                            });
                            if (!error) {
                              fetchNotes();
                              toast.success('Resumo salvo nas anotações!');
                            }
                          }}
                          className="h-6 text-[9px] text-indigo-600 hover:text-indigo-700 hover:underline px-0 cursor-pointer font-extrabold"
                        >
                          Salvar nas anotações do contato
                        </Button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        A LIA pode ler e processar o histórico de mensagens deste paciente para extrair interesses, objeções e planejar os próximos passos de forma instantânea.
                      </p>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Timeline Tab */}
              <TabsContent value="timeline" className="flex-1 flex flex-col min-h-0 px-4 py-3">
                {loadingTimeline ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                ) : timelineEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Hourglass className="size-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm font-semibold text-foreground">Nenhum evento registrado</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      A linha do tempo do paciente é gerada automaticamente com base nas interações com a clínica.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="flex-1 pr-2">
                    <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border/60">
                      {timelineEvents.map((evt) => {
                        const getEventConfig = (type: string) => {
                          switch (type) {
                            case 'message':
                              return { icon: MessageSquare, color: "bg-emerald-500 text-white ring-emerald-500/20" };
                            case 'appointment':
                              return { icon: CalendarIcon, color: "bg-blue-500 text-white ring-blue-500/20" };
                            case 'appointment_cancelled':
                              return { icon: X, color: "bg-red-500 text-white ring-red-500/20" };
                            case 'appointment_rescheduled':
                              return { icon: CalendarIcon, color: "bg-amber-500 text-white ring-amber-500/20" };
                            case 'document_sent':
                              return { icon: FileTextIcon, color: "bg-indigo-500 text-white ring-indigo-500/20" };
                            case 'document_signed':
                              return { icon: Check, color: "bg-violet-500 text-white ring-violet-500/20" };
                            case 'payment':
                              return { icon: DollarSign, color: "bg-green-600 text-white ring-green-600/20" };
                            case 'quote_sent':
                            case 'quote_accepted':
                              return { icon: DollarSign, color: "bg-cyan-500 text-white ring-cyan-500/20" };
                            case 'status_change':
                            case 'deal_stage_change':
                              return { icon: TrendingUpIcon, color: "bg-sky-500 text-white ring-sky-500/20" };
                            case 'note':
                              return { icon: FileTextIcon, color: "bg-neutral-500 text-white ring-neutral-500/20" };
                            default:
                              return { icon: Clock, color: "bg-neutral-500 text-white ring-neutral-500/20" };
                          }
                        };

                        const config = getEventConfig(evt.event_type);
                        const Icon = config.icon;

                        return (
                          <div key={evt.id} className="relative group">
                            {/* Timeline marker */}
                            <span className={`absolute -left-[21px] top-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4 ${config.color}`}>
                              <Icon className="size-3" />
                            </span>

                            <div className="rounded-xl border border-neutral-100 dark:border-neutral-800/60 bg-neutral-50/20 dark:bg-neutral-900/10 p-3.5 transition-all group-hover:border-neutral-200 dark:group-hover:border-neutral-700">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <h4 className="text-xs font-bold text-foreground">{evt.title}</h4>
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  {new Date(evt.created_at).toLocaleString('pt-BR', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              {evt.description && (
                                <p className="text-xs text-muted-foreground leading-relaxed">{evt.description}</p>
                              )}
                              {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                                <div className="mt-2 text-[10px] bg-neutral-100/50 dark:bg-neutral-900/40 p-2 rounded-lg text-muted-foreground max-h-24 overflow-y-auto">
                                  <pre className="font-mono text-[9px] whitespace-pre-wrap">{JSON.stringify(evt.metadata, null, 2)}</pre>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>

              {/* Tags Tab */}
              <TabsContent value="tags" className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Click a tag to add or remove it from this contact.
                  </p>
                  {allTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No tags available. Create tags in Settings.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {allTags.map((tag) => {
                        const selected = contactTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleTag(tag.id)}
                            disabled={savingTags}
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                              selected
                                ? 'ring-2 ring-primary ring-offset-1 ring-offset-border'
                                : 'opacity-50 hover:opacity-80'
                            }`}
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                            }}
                          >
                            {selected && <Check className="size-3 mr-1" />}
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="flex-1 flex flex-col min-h-0 px-4 py-3">
                <div className="space-y-2 mb-3">
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Write a note..."
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground min-h-[60px] text-sm resize-none"
                  />
                  <Button
                    onClick={addNote}
                    disabled={!newNote.trim() || savingNote}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    size="sm"
                  >
                    {savingNote ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    Add Note
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {loadingNotes ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No notes yet.
                    </p>
                  ) : (
                    notes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-lg bg-muted/50 border border-border/50 p-3 group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap flex-1">
                            {note.note_text}
                          </p>
                          <button
                            onClick={() => deleteNote(note.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all cursor-pointer shrink-0"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {new Date(note.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              {/* Prontuário Tab */}
              <TabsContent value="prontuario" className="flex-1 overflow-y-auto px-4 py-4">
                <ProntuarioTab patientId={contactId!} />
              </TabsContent>

              {/* Evolução Tab */}
              <TabsContent value="evolucao" className="flex-1 overflow-y-auto px-4 py-4">
                <EvolucaoTab patientId={contactId!} />
              </TabsContent>

              {/* Financeiro Tab */}
              <TabsContent value="financeiro" className="flex-1 flex flex-col min-h-0 px-4 py-3">
                {/* Financial overview stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-xl border border-border bg-card p-3 shadow-sm text-center">
                    <p className="text-[9px] text-muted-foreground font-black uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                      <CheckCircle className="size-3 text-emerald-500" /> Pago
                    </p>
                    <p className="text-sm font-black text-emerald-600">
                      {formatCurrency(totalPaid, defaultCurrency)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 shadow-sm text-center">
                    <p className="text-[9px] text-muted-foreground font-black uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                      <Clock className="size-3 text-amber-500" /> Pendente
                    </p>
                    <p className="text-sm font-black text-amber-600">
                      {formatCurrency(totalPending, defaultCurrency)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 shadow-sm text-center">
                    <p className="text-[9px] text-muted-foreground font-black uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                      <AlertCircle className="size-3 text-red-500" /> Atrasado
                    </p>
                    <p className="text-sm font-black text-red-600">
                      {formatCurrency(totalOverdue, defaultCurrency)}
                    </p>
                  </div>
                </div>

                {/* Registrar nova transação action */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                      Histórico Financeiro
                    </h3>
                    <button
                      onClick={() => setShowTransactionForm(!showTransactionForm)}
                      className="inline-flex items-center gap-1 h-7 rounded-lg border border-border bg-card hover:bg-muted/40 px-2.5 text-[10px] font-bold transition-all cursor-pointer"
                    >
                      <Plus className="size-3" />
                      {showTransactionForm ? 'Cancelar' : 'Nova Transação'}
                    </button>
                  </div>

                  {showTransactionForm && (
                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.02] p-4 space-y-3">
                      <p className="text-[10px] text-indigo-700 dark:text-indigo-400 font-black uppercase tracking-wider">
                        💵 Registrar Novo Recebimento / Despesa
                      </p>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-neutral-500 text-[10px] font-bold uppercase">Tipo</Label>
                          <select
                            value={txType}
                            onChange={(e) => setTxType(e.target.value as 'receita' | 'despesa')}
                            className="w-full rounded-lg bg-background border border-border px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="receita">Receita (Entrada)</option>
                            <option value="despesa">Despesa (Saída)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-neutral-500 text-[10px] font-bold uppercase">Valor</Label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0,00"
                            value={txValue}
                            onChange={(e) => setTxValue(e.target.value)}
                            className="w-full rounded-lg bg-background border border-border px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-neutral-500 text-[10px] font-bold uppercase">Descrição</Label>
                        <input
                          type="text"
                          placeholder="Ex: Botox - 50U Testa"
                          value={txDesc}
                          onChange={(e) => setTxDesc(e.target.value)}
                          className="w-full rounded-lg bg-background border border-border px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-neutral-500 text-[10px] font-bold uppercase">Categoria</Label>
                          <select
                            value={txCategory}
                            onChange={(e) => setTxCategory(e.target.value)}
                            className="w-full rounded-lg bg-background border border-border px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="Procedimento">Procedimento</option>
                            <option value="Consulta">Consulta</option>
                            <option value="Retoque">Retoque</option>
                            <option value="Pacote">Pacote</option>
                            <option value="Outro">Outro</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-neutral-500 text-[10px] font-bold uppercase">Método</Label>
                          <select
                            value={txMethod}
                            onChange={(e) => setTxMethod(e.target.value)}
                            className="w-full rounded-lg bg-background border border-border px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="pix">Pix</option>
                            <option value="credito">Crédito</option>
                            <option value="debito">Débito</option>
                            <option value="dinheiro">Dinheiro</option>
                            <option value="transferencia">Transferência</option>
                            <option value="boleto">Boleto</option>
                            <option value="outro">Outro</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-neutral-500 text-[10px] font-bold uppercase">Status</Label>
                          <select
                            value={txStatus}
                            onChange={(e) => setTxStatus(e.target.value)}
                            className="w-full rounded-lg bg-background border border-border px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="paid">Confirmado (Pago)</option>
                            <option value="pending">Pendente</option>
                            <option value="overdue">Atrasado</option>
                            <option value="cancelled">Cancelado</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-neutral-500 text-[10px] font-bold uppercase">Data</Label>
                          <input
                            type="date"
                            value={txDate}
                            onChange={(e) => setTxDate(e.target.value)}
                            className="w-full rounded-lg bg-background border border-border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleSaveTransaction}
                        disabled={savingTransaction}
                        className="w-full h-8 rounded-lg text-xs font-black text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                        style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
                      >
                        {savingTransaction && <Loader2 className="size-3.5 animate-spin" />}
                        Salvar Transação
                      </button>
                    </div>
                  )}
                </div>

                {/* List of transactions */}
                <ScrollArea className="flex-1 pr-1">
                  {loadingTransactions ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="size-5 animate-spin text-primary" />
                    </div>
                  ) : transactions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">Nenhuma movimentação financeira registrada.</p>
                  ) : (
                    <div className="space-y-2">
                      {transactions.map((tx) => {
                        const statusColors = {
                          paid: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                          pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                          overdue: 'bg-red-500/10 text-red-600 border-red-500/20',
                          cancelled: 'bg-neutral-100 text-neutral-500 border-neutral-200 dark:border-neutral-800',
                        };
                        const currentStatusColor = statusColors[tx.status as 'paid'|'pending'|'overdue'|'cancelled'] || statusColors.pending;
                        const isRevenue = tx.type === 'receita';

                        return (
                          <div
                            key={tx.id}
                            className="rounded-xl border border-border bg-card p-3 shadow-sm flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground truncate">{tx.description}</p>
                              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                <span className={`inline-flex rounded px-1.5 py-0.5 text-[8px] font-black uppercase border ${currentStatusColor}`}>
                                  {tx.status}
                                </span>
                                <span className="text-[9px] text-muted-foreground font-semibold">
                                  {tx.category} · {tx.method}
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-xs font-extrabold ${isRevenue ? 'text-emerald-600' : 'text-red-500'}`}>
                                {isRevenue ? '+' : '-'} {formatCurrency(tx.value, defaultCurrency)}
                              </p>
                              <span className="text-[9px] text-muted-foreground block mt-1 font-semibold">
                                {new Date(tx.date).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              {/* Custom Fields Tab */}
              <TabsContent value="custom" className="flex-1 overflow-y-auto px-4 py-3">
                {loadingCustom ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : customFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No custom fields defined. Create them in Settings.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {customFields.map((field) => (
                      <div key={field.id} className="space-y-1.5">
                        <Label className="text-muted-foreground text-xs capitalize">
                          {field.field_name}
                        </Label>
                        <Input
                          value={customValues[field.id] ?? ''}
                          onChange={(e) =>
                            setCustomValues((prev) => ({
                              ...prev,
                              [field.id]: e.target.value,
                            }))
                          }
                          placeholder={`Enter ${field.field_name}...`}
                          className="bg-muted border-border text-foreground h-8 text-sm placeholder:text-muted-foreground"
                        />
                      </div>
                    ))}
                    <Button
                      onClick={saveCustomFields}
                      disabled={savingCustom}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                      size="sm"
                    >
                      {savingCustom ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      Save Custom Fields
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Deals Tab */}
              <TabsContent value="deals" className="flex-1 overflow-y-auto px-4 py-3">
                {loadingDeals ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                ) : deals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No deals yet</p>
                ) : (
                  <div className="space-y-2">
                    {deals.map((deal) => (
                      <div
                        key={deal.id}
                        className="rounded-lg border border-border bg-muted/50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {deal.title}
                          </p>
                          {deal.stage && (
                            <span
                              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: `${deal.stage.color}20`,
                                color: deal.stage.color,
                              }}
                            >
                              {deal.stage.name}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <DollarSign className="size-3" />
                            {formatCurrency(
                              deal.value ?? 0,
                              deal.currency || defaultCurrency,
                            )}
                          </span>
                          {deal.status && deal.status !== 'open' && (
                            <span
                              className={
                                deal.status === 'won'
                                  ? 'text-primary'
                                  : 'text-red-400'
                              }
                            >
                              {deal.status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              {/* Prontuário Tab */}
              <TabsContent value="prontuario" className="flex-1 overflow-y-auto px-4 py-4">
                <ProntuarioTab patientId={contactId!} />
              </TabsContent>

              {/* Evolução Tab */}
              <TabsContent value="evolucao" className="flex-1 overflow-y-auto px-4 py-4">
                <EvolucaoTab patientId={contactId!} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
