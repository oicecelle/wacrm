'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  CalendarClock,
  Clock,
  CheckCircle,
  FileText,
  DollarSign,
  Package,
  Calendar,
  AlertCircle,
  Loader2,
  Trash,
  Check,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

export default function PatientPortalDashboardPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [portalSettings, setPortalSettings] = useState<any | null>(null);
  const [patient, setPatient] = useState<any | null>(null);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'inicio' | 'appointments' | 'financeiro' | 'docs'>('inicio');

  // Booking states
  const [bookingDate, setBookingDate] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [selectedProfId, setSelectedProfId] = useState<string>('');
  const [booking, setBooking] = useState(false);

  // Fetch data helper
  const fetchData = async () => {
    const token = localStorage.getItem(`portal_token_${slug}`);
    if (!token) return;

    try {
      const res = await fetch('/api/portal/appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'get-history' }),
      });

      const data = await res.json();
      if (res.ok) {
        setAppointments(data.appointments || []);
        setTimeline(data.timeline || []);
        setPortalSettings(data.settings || {});
      } else {
        toast.error(data.error || 'Erro ao carregar dados');
      }
    } catch (err) {
      console.error('Error fetching patient data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const localPatient = localStorage.getItem(`portal_patient_${slug}`);
    if (localPatient) {
      setPatient(JSON.parse(localPatient));
    }
    fetchData();
  }, [slug]);

  // Load slots when date changes
  const loadSlots = async (dateStr: string) => {
    if (!dateStr) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    setSelectedProfId('');
    
    const token = localStorage.getItem(`portal_token_${slug}`);
    try {
      const res = await fetch('/api/portal/appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'get-slots',
          date: dateStr,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSlots(data.slots || []);
      } else {
        toast.error(data.error || 'Erro ao carregar horários livres');
      }
    } catch (err) {
      console.error('Error fetching slots:', err);
      toast.error('Erro de rede ao carregar horários');
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedSlot || !selectedProfId) {
      toast.error('Selecione um horário e profissional');
      return;
    }

    setBooking(true);
    const token = localStorage.getItem(`portal_token_${slug}`);
    try {
      const res = await fetch('/api/portal/appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'book',
          slot: selectedSlot.isoString,
          professionalId: selectedProfId,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Agendamento pré-solicitado com sucesso!');
        setBookingDate('');
        setSlots([]);
        setSelectedSlot(null);
        setSelectedProfId('');
        fetchData(); // reload history
        setActiveTab('appointments');
      } else {
        toast.error(data.error || 'Falha ao realizar agendamento');
      }
    } catch (err) {
      console.error('Error booking:', err);
      toast.error('Erro de rede ao salvar agendamento');
    } finally {
      setBooking(false);
    }
  };

  const handleCancelAppointment = async (apptId: string) => {
    if (!confirm('Deseja realmente cancelar este agendamento?')) return;

    const token = localStorage.getItem(`portal_token_${slug}`);
    try {
      const res = await fetch('/api/portal/appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'cancel',
          appointmentId: apptId,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Agendamento cancelado com sucesso.');
        fetchData(); // reload history
      } else {
        toast.error(data.error || 'Falha ao cancelar consulta');
      }
    } catch (err) {
      console.error('Error cancelling appt:', err);
      toast.error('Erro de rede ao cancelar');
    }
  };

  // Group appointments into next and past
  const { nextAppt, pastAppts } = useMemo(() => {
    const now = new Date();
    const active = appointments.filter(a => a.status !== 'cancelled');
    
    const future = active.filter(a => new Date(a.start_time).getTime() > now.getTime());
    const past = appointments.filter(a => new Date(a.start_time).getTime() <= now.getTime() || a.status === 'cancelled');

    // Sort future ascending (soonest first), past descending (recent first)
    future.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    past.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

    return {
      nextAppt: future[0] || null,
      pastAppts: past,
      futureAppts: future,
    };
  }, [appointments]);

  // Derived timeline feeds
  const docTimeline = useMemo(() => {
    return timeline.filter(t => t.event_type.includes('document') || t.event_type.includes('signed'));
  }, [timeline]);

  const financeTimeline = useMemo(() => {
    return timeline.filter(t => t.event_type.includes('payment') || t.event_type.includes('quote') || t.event_type.includes('note'));
  }, [timeline]);

  const APPT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    provisional: { label: 'Pré-agendado', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    confirmed: { label: 'Confirmado', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    attended: { label: 'Compareceu', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    cancelled: { label: 'Cancelado', color: 'bg-red-50 text-red-700 border-red-200' },
    no_show: { label: 'Falta', color: 'bg-neutral-50 text-neutral-500 border-neutral-200' },
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs Navigation */}
      <div className="flex border-b overflow-x-auto gap-2 pb-1">
        {(['inicio', 'appointments', 'financeiro', 'docs'] as const).map(tab => {
          const isActive = activeTab === tab;
          const labels = {
            inicio: 'Início',
            appointments: 'Consultas / Agenda',
            financeiro: 'Financeiro',
            docs: 'Documentos',
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                isActive 
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* TAB: INÍCIO (SUMMARY) */}
      {activeTab === 'inicio' && (
        <div className="space-y-6 text-left">
          {/* Welcome Message Card */}
          <div className="p-5 rounded-2xl bg-neutral-50 border border-neutral-100 space-y-1">
            <h2 className="text-base font-black text-neutral-800">
              Olá, {patient?.name}!
            </h2>
            <p className="text-xs text-neutral-500 leading-relaxed">
              {portalSettings?.welcome_subtitle || 'Bem-vindo ao seu painel. Veja abaixo o resumo dos seus atendimentos.'}
            </p>
          </div>

          {/* Quick Overview Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Next appointment Card */}
            <div className="border p-5 rounded-2xl bg-white space-y-3 shadow-xs">
              <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                Próxima Consulta
              </h3>
              {nextAppt ? (
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-black text-neutral-800">
                      {new Date(nextAppt.start_time).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Horário: {new Date(nextAppt.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}h
                    </p>
                    {nextAppt.professional?.name && (
                      <p className="text-xs text-neutral-500">
                        Profissional: {nextAppt.professional.name}
                      </p>
                    )}
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    APPT_STATUS_CONFIG[nextAppt.status]?.color || ''
                  }`}>
                    {APPT_STATUS_CONFIG[nextAppt.status]?.label || nextAppt.status}
                  </span>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-neutral-500">Nenhum agendamento futuro marcado.</p>
                  {portalSettings?.enabled_scheduling && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab('appointments')}
                      className="mt-3 border-blue-200 text-blue-600 hover:bg-blue-50 font-bold rounded-xl text-xs"
                    >
                      Agendar Consulta Online
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Sessions Packages Card */}
            <div className="border p-5 rounded-2xl bg-white space-y-3 shadow-xs">
              <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                <Package className="h-4 w-4 text-blue-600" />
                Meus Pacotes de Tratamento
              </h3>
              <div className="space-y-2">
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Consulte os créditos de sessões e procedimentos contratados ativos.
                </p>
                <div className="flex gap-2">
                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-1.5 rounded-xl text-xs font-bold">
                    Tratamento Ativo
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: APPOINTMENTS & SCHEDULING */}
      {activeTab === 'appointments' && (
        <div className="space-y-6 text-left">
          {/* Scheduling Engine */}
          {portalSettings?.enabled_scheduling && (
            <div className="border p-5 rounded-2xl bg-white space-y-4 shadow-xs">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-neutral-800 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  Agendar Novo Horário
                </h3>
                <p className="text-xs text-neutral-400">
                  Selecione uma data para consultar os horários livres e marcar sua consulta online.
                </p>
              </div>

              {/* Date Input */}
              <div className="max-w-xs flex gap-2">
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={bookingDate}
                  onChange={(e) => {
                    setBookingDate(e.target.value);
                    loadSlots(e.target.value);
                  }}
                  className="w-full bg-neutral-50 border border-neutral-200 text-xs text-neutral-700 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Slots rendering */}
              {loadingSlots ? (
                <div className="flex items-center gap-2 text-xs text-neutral-500 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  Buscando horários disponíveis na agenda...
                </div>
              ) : bookingDate && slots.length === 0 ? (
                <div className="text-xs text-neutral-500 py-3 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-neutral-400" />
                  Nenhum horário livre encontrado nesta data.
                </div>
              ) : bookingDate && (
                <div className="space-y-4 pt-2">
                  <label className="text-xs font-bold text-neutral-700 block">Horários Disponíveis:</label>
                  <div className="flex flex-wrap gap-2">
                    {slots.map(slot => (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={!slot.available || booking}
                        onClick={() => {
                          setSelectedSlot(slot);
                          setSelectedProfId(slot.professionals[0]?.id || '');
                        }}
                        className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${
                          !slot.available
                            ? 'opacity-40 bg-neutral-50 border-neutral-100 text-neutral-400 cursor-not-allowed'
                            : selectedSlot?.time === slot.time
                            ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                            : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>

                  {/* Professional select if mapped slot */}
                  {selectedSlot && (
                    <div className="space-y-3 p-4 bg-neutral-50 rounded-2xl border border-neutral-100 max-w-md animate-fade-in">
                      <div className="space-y-1">
                        <label className="text-xs font-black text-neutral-700 block">Escolha o Profissional:</label>
                        <select
                          value={selectedProfId}
                          onChange={(e) => setSelectedProfId(e.target.value)}
                          className="w-full bg-white border border-neutral-200 text-xs text-neutral-700 rounded-lg p-2 focus:outline-none"
                        >
                          {selectedSlot.professionals.map((prof: any) => (
                            <option key={prof.id} value={prof.id}>
                              {prof.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedSlot(null)}
                          className="text-xs font-bold border-neutral-200 rounded-xl"
                        >
                          Limpar
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleBookAppointment}
                          disabled={booking}
                          className="bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold rounded-xl flex items-center gap-1"
                        >
                          {booking && <Loader2 className="h-3 w-3 animate-spin" />}
                          Confirmar Consulta
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* History List */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-neutral-400 uppercase tracking-wider">Histórico de Consultas</h3>
            {appointments.length === 0 ? (
              <p className="text-xs text-neutral-500">Nenhuma consulta cadastrada no histórico.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {appointments.map(appt => {
                  const status = APPT_STATUS_CONFIG[appt.status] || { label: appt.status, color: '' };
                  const isFuture = new Date(appt.start_time).getTime() > Date.now();
                  
                  return (
                    <div key={appt.id} className="border p-4 rounded-2xl bg-white shadow-xs space-y-2 relative">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="text-xs font-black text-neutral-800">
                            {new Date(appt.start_time).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                          <p className="text-[10px] text-neutral-400 mt-0.5">
                            Horário: {new Date(appt.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}h
                          </p>
                        </div>
                        <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${status.color}`}>
                          {status.label}
                        </span>
                      </div>

                      {appt.professional?.name && (
                        <p className="text-[11px] text-neutral-500">
                          Profissional: <strong className="text-neutral-700 font-bold">{appt.professional.name}</strong>
                        </p>
                      )}

                      {appt.notes && (
                        <p className="text-[10px] text-neutral-400 italic mt-1 leading-relaxed">
                          Obs: {appt.notes}
                        </p>
                      )}

                      {/* Cancel action */}
                      {isFuture && appt.status !== 'cancelled' && portalSettings?.enabled_cancellation && (
                        <div className="pt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleCancelAppointment(appt.id)}
                            className="text-[10px] font-bold text-red-500 hover:text-red-700 hover:underline flex items-center gap-1"
                          >
                            <Trash className="h-3 w-3" />
                            Cancelar Consulta
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: FINANCEIRO (PAYMENTS & TIMELINE) */}
      {activeTab === 'financeiro' && (
        <div className="space-y-4 text-left">
          <h3 className="text-xs font-black text-neutral-400 uppercase tracking-wider">Histórico de Cobranças e Recibos</h3>
          {financeTimeline.length === 0 ? (
            <p className="text-xs text-neutral-500">Nenhuma movimentação financeira registrada no portal.</p>
          ) : (
            <div className="space-y-3">
              {financeTimeline.map(item => (
                <div key={item.id} className="border p-4 rounded-2xl bg-white shadow-xs flex items-center justify-between gap-3">
                  <div className="flex gap-2.5 items-center">
                    <div className="h-8 w-8 bg-blue-500/10 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-neutral-800">{item.title}</p>
                      {item.description && (
                        <p className="text-[10px] text-neutral-400 mt-0.5">{item.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-neutral-400 font-medium block">
                      {new Date(item.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: DOCUMENTOS (SIGNATURE HISTORY) */}
      {activeTab === 'docs' && (
        <div className="space-y-4 text-left">
          <h3 className="text-xs font-black text-neutral-400 uppercase tracking-wider">Termos e Contratos para Assinatura</h3>
          {docTimeline.length === 0 ? (
            <p className="text-xs text-neutral-500">Nenhum termo ou documento localizado.</p>
          ) : (
            <div className="space-y-3">
              {docTimeline.map(item => (
                <div key={item.id} className="border p-4 rounded-2xl bg-white shadow-xs flex items-center justify-between gap-3">
                  <div className="flex gap-2.5 items-center">
                    <div className="h-8 w-8 bg-blue-500/10 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-neutral-800">{item.title}</p>
                      {item.payload?.status && (
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-neutral-100 text-[8px] font-bold text-neutral-600 mt-1 uppercase">
                          Status: {item.payload.status === 'signed' ? 'Assinado' : 'Pendente'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-neutral-400 font-medium block">
                      {new Date(item.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
