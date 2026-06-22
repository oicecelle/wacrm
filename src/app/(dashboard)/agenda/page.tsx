"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { AppointmentModal } from "@/components/ui/appointment-modal";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SparklesIcon,
  ClockIcon,
  Loader2Icon,
  FilterXIcon,
  CakeIcon,
  ClipboardList,
} from "lucide-react";

interface Appointment {
  id: string;
  patient_id: string;
  professional_id: string | null;
  room_id: string | null;
  type: string | null;
  title: string | null;
  status: string;
  notes: string | null;
  start_time: string;
  end_time: string;
  patients: {
    name: string;
  } | null;
}

interface FilterOption {
  id: string;
  name: string;
}

export default function AgendaPage() {
  const supabase = createClient();
  const { accountId } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Main Calendar State
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    return today;
  });

  // Month Picker Picker State
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth()); // 0-11

  // Filters State
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterProfessional, setFilterProfessional] = useState("Todos");
  const [filterPatient, setFilterPatient] = useState("Todos");
  const [filterProcedure, setFilterProcedure] = useState("Todos");
  const [filterRoom, setFilterRoom] = useState("Todos");

  // Options State
  const [patients, setPatients] = useState<FilterOption[]>([]);
  const [staff, setStaff] = useState<FilterOption[]>([]);
  const [procedures, setProcedures] = useState<FilterOption[]>([]);
  const [rooms, setRooms] = useState<FilterOption[]>([]);

  // Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<string | undefined>(undefined);

  // Get week date list starting Sunday to Saturday
  const getWeekDates = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // adjust to Sunday
    const startOfWeek = new Date(d.setDate(diff));

    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(dayDate.getDate() + i);
      dates.push(dayDate);
    }
    return dates;
  };

  const weekDates = getWeekDates(selectedDate);

  // Fetch data
  const fetchFilterOptions = useCallback(async () => {
    if (!accountId) return;
    const clinicId = accountId;

    try {
      // 1. Fetch Patients
      const { data: pts } = await supabase
        .from("patients")
        .select("id, name")
        .eq("clinic_id", clinicId)
        .order("name");
      setPatients(pts || []);

      // 2. Fetch Staff (clinic_users) - Map to id (matching clinic_users.id constraint)
      const { data: st } = await supabase
        .from("clinic_users")
        .select("id, name")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .order("name");
      setStaff((st || []).map((s) => ({ id: s.id, name: s.name })));

      // 3. Fetch Procedures
      const { data: procs } = await supabase
        .from("procedures")
        .select("id, name")
        .eq("clinic_id", clinicId)
        .eq("ativo", true)
        .order("name");
      setProcedures(procs || []);

      // 4. Fetch Rooms
      const { data: rms } = await supabase
        .from("rooms")
        .select("id, name")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .order("name");
      setRooms(rms || []);
    } catch (err) {
      console.error("Error loading calendar filters:", err);
    }
  }, [accountId, supabase]);

  const fetchAppointments = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);

    try {
      const startOfWeekIso = new Date(new Date(weekDates[0]).setHours(0, 0, 0, 0)).toISOString();
      const endOfWeekIso = new Date(new Date(weekDates[6]).setHours(23, 59, 59, 999)).toISOString();

      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id,
          patient_id,
          professional_id,
          room_id,
          type,
          title,
          status,
          notes,
          start_time,
          end_time,
          patients (
            name
          )
        `)
        .eq("clinic_id", accountId)
        .gte("start_time", startOfWeekIso)
        .lte("start_time", endOfWeekIso)
        .order("start_time", { ascending: true });

      if (error) throw error;
      setAppointments((data || []) as any[]);
    } catch (err) {
      console.error("Error fetching appointments:", err);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase, weekDates]);

  const [birthdays, setBirthdays] = useState<Record<string, string[]>>({});

  const fetchBirthdays = useCallback(async () => {
    if (!accountId) return;
    try {
      const { data } = await supabase
        .from("patients")
        .select("name, birthday")
        .eq("clinic_id", accountId)
        .not("birthday", "is", null);

      if (data) {
        const bdays: Record<string, string[]> = {};
        data.forEach((p) => {
          if (p.birthday) {
            const parts = p.birthday.split("-");
            if (parts.length === 3) {
              const key = `${parts[1]}-${parts[2]}`; // MM-DD
              if (!bdays[key]) bdays[key] = [];
              bdays[key].push(p.name);
            }
          }
        });
        setBirthdays(bdays);
      }
    } catch (e) {
      console.error(e);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  useEffect(() => {
    fetchAppointments();
    fetchBirthdays();
  }, [fetchAppointments, fetchBirthdays]);

  // Mini Month Picker Math
  const handlePickerPrevMonth = () => {
    if (pickerMonth === 0) {
      setPickerMonth(11);
      setPickerYear((y) => y - 1);
    } else {
      setPickerMonth((m) => m - 1);
    }
  };

  const handlePickerNextMonth = () => {
    if (pickerMonth === 11) {
      setPickerMonth(0);
      setPickerYear((y) => y + 1);
    } else {
      setPickerMonth((m) => m + 1);
    }
  };

  const getMiniCalendarGrid = () => {
    const firstDay = new Date(pickerYear, pickerMonth, 1);
    const startDayIdx = firstDay.getDay(); // 0 is Sunday
    const gridStartDate = new Date(firstDay);
    gridStartDate.setDate(gridStartDate.getDate() - startDayIdx);

    const dates: Date[] = [];
    const current = new Date(gridStartDate);
    for (let i = 0; i < 42; i++) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const miniCalendarCells = getMiniCalendarGrid();

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const weekdayInitials = ["D", "S", "T", "Q", "Q", "S", "S"];

  // Format week range text (ex: "14 - 20 de jun. de 2026")
  const formatWeekRange = (dates: Date[]) => {
    if (dates.length < 7) return "";
    const first = dates[0];
    const last = dates[6];

    const firstDay = first.getDate();
    const lastDay = last.getDate();

    const shortMonths = [
      "jan.", "fev.", "mar.", "abr.", "mai.", "jun.",
      "jul.", "ago.", "set.", "out.", "nov.", "dez."
    ];

    const firstMonthStr = shortMonths[first.getMonth()];
    const lastMonthStr = shortMonths[last.getMonth()];
    const year = last.getFullYear();

    if (first.getMonth() === last.getMonth()) {
      return `${firstDay} - ${lastDay} de ${lastMonthStr} de ${year}`;
    } else {
      return `${firstDay} de ${firstMonthStr} - ${lastDay} de ${lastMonthStr} de ${year}`;
    }
  };

  // Navigations of main calendar
  const handlePrevWeek = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 7);
    setSelectedDate(d);
    // sync mini picker month
    setPickerYear(d.getFullYear());
    setPickerMonth(d.getMonth());
  };

  const handleNextWeek = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 7);
    setSelectedDate(d);
    // sync mini picker month
    setPickerYear(d.getFullYear());
    setPickerMonth(d.getMonth());
  };

  const handleGoToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setPickerYear(today.getFullYear());
    setPickerMonth(today.getMonth());
  };

  const handleClearFilters = () => {
    setFilterStatus("Todos");
    setFilterProfessional("Todos");
    setFilterPatient("Todos");
    setFilterProcedure("Todos");
    setFilterRoom("Todos");
  };

  // Client side filtering
  const filteredAppointments = appointments.filter((appt) => {
    if (filterStatus !== "Todos" && appt.status !== filterStatus) return false;
    if (filterProfessional !== "Todos" && appt.professional_id !== filterProfessional) return false;
    if (filterPatient !== "Todos" && appt.patient_id !== filterPatient) return false;
    if (filterRoom !== "Todos" && appt.room_id !== filterRoom) return false;
    if (filterProcedure !== "Todos" && appt.type !== filterProcedure) return false;
    return true;
  });

  // Add & edit appointment trigger
  const handleAddAppointment = (dayStr: string) => {
    setSelectedApptId(null);
    setModalDefaultDate(dayStr);
    setModalOpen(true);
  };

  const handleEditAppointment = (apptId: string) => {
    setSelectedApptId(apptId);
    setModalDefaultDate(undefined);
    setModalOpen(true);
  };

  const triggerCopilot = () => {
    window.dispatchEvent(new Event("open-copilot"));
  };

  // Generate 24 time intervals of 30 minutes from 08:00 to 19:30
  const timeSlots: string[] = [];
  for (let h = 8; h < 20; h++) {
    timeSlots.push(`${String(h).padStart(2, "0")}:00`);
    timeSlots.push(`${String(h).padStart(2, "0")}:30`);
  }

  // Card status classes map
  const getCardStatusStyles = (status: string) => {
    switch (status) {
      case "confirmed":
        return {
          border: "border-l-4 border-l-emerald-500 border-neutral-200/80",
          bg: "bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100/90",
          dot: "bg-emerald-500",
        };
      case "attended":
        return {
          border: "border-l-4 border-l-slate-400 border-neutral-200/80",
          bg: "bg-slate-50/90 text-slate-800 hover:bg-slate-100/90",
          dot: "bg-slate-400",
        };
      case "cancelled":
        return {
          border: "border-l-4 border-l-rose-500 border-neutral-200/80 line-through text-rose-700/80",
          bg: "bg-rose-50/70 text-rose-800 hover:bg-rose-100/70",
          dot: "bg-rose-500",
        };
      case "no_show":
        return {
          border: "border-l-4 border-l-amber-500 border-neutral-200/80",
          bg: "bg-amber-50/80 text-amber-900 hover:bg-amber-100/90",
          dot: "bg-amber-500",
        };
      case "provisional":
      default:
        return {
          border: "border-l-4 border-l-blue-500 border-neutral-200/80",
          bg: "bg-blue-50/80 text-blue-900 hover:bg-blue-100/90",
          dot: "bg-blue-500",
        };
    }
  };

  return (
    <div className="space-y-6">
      <style>{`
        .bg-hatched {
          background-image: repeating-linear-gradient(
            135deg,
            rgba(226, 232, 240, 0.45) 0px,
            rgba(226, 232, 240, 0.45) 8px,
            transparent 8px,
            transparent 16px
          );
        }
      `}</style>

      {/* Double Column Split Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Sidebar: Mini Calendar and Dropdown Filters */}
        <aside className="w-full lg:w-[260px] shrink-0 space-y-5 flex flex-col">
          {/* Mini Month Picker */}
          <div className="bg-white border border-neutral-200/70 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-neutral-800 capitalize">
                {monthNames[pickerMonth].toLowerCase()} de {pickerYear}
              </span>
              <div className="flex gap-0.5">
                <button
                  onClick={handlePickerPrevMonth}
                  className="p-1 hover:bg-neutral-100 rounded text-neutral-600 transition-colors"
                >
                  <ChevronLeftIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handlePickerNextMonth}
                  className="p-1 hover:bg-neutral-100 rounded text-neutral-600 transition-colors"
                >
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Weekday Initials Grid */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[10px] font-bold text-neutral-400">
              {weekdayInitials.map((initial, i) => (
                <div key={i}>{initial}</div>
              ))}
            </div>

            {/* Mini Calendar cells */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {miniCalendarCells.map((cellDate, cellIdx) => {
                const isSelected = cellDate.toDateString() === selectedDate.toDateString();
                const isToday = cellDate.toDateString() === new Date().toDateString();
                const isCurrentMonth = cellDate.getMonth() === pickerMonth;

                return (
                  <button
                    key={cellIdx}
                    onClick={() => {
                      setSelectedDate(cellDate);
                      setPickerMonth(cellDate.getMonth());
                      setPickerYear(cellDate.getFullYear());
                    }}
                    className={`h-7 w-7 rounded-full flex items-center justify-center transition-all ${
                      isSelected
                        ? "bg-blue-600 text-white font-bold shadow-xs"
                        : isToday
                        ? "border border-blue-600 text-blue-600 font-semibold"
                        : isCurrentMonth
                        ? "text-neutral-700 hover:bg-neutral-100"
                        : "text-neutral-300 dark:text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    {cellDate.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collapsible Dropdown Filters */}
          <div className="bg-white border border-neutral-200/70 rounded-2xl p-4 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-neutral-100">
              <span className="text-xs font-extrabold text-neutral-800 tracking-wider uppercase">Filtros</span>
              <button
                onClick={handleClearFilters}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-0.5"
                title="Limpar todos os filtros"
              >
                <FilterXIcon className="h-3 w-3" />
                Limpar filtros
              </button>
            </div>

            {/* Status Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="Todos">Todos os Status</option>
                <option value="provisional">Pendente (Provisório)</option>
                <option value="confirmed">Confirmado</option>
                <option value="attended">Realizado</option>
                <option value="cancelled">Cancelado</option>
                <option value="no_show">Não compareceu</option>
              </select>
            </div>

            {/* Professional Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Profissional</label>
              <select
                value={filterProfessional}
                onChange={(e) => setFilterProfessional(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="Todos">Todos os Profissionais</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Patient Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Paciente</label>
              <select
                value={filterPatient}
                onChange={(e) => setFilterPatient(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="Todos">Todos os Pacientes</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Procedure Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Procedimento</label>
              <select
                value={filterProcedure}
                onChange={(e) => setFilterProcedure(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="Todos">Todos os Procedimentos</option>
                {procedures.map((pr) => (
                  <option key={pr.id} value={pr.name}>
                    {pr.name}
                  </option>
                ))}
                {procedures.length === 0 && (
                  <>
                    <option value="Drenagem Linfática">Drenagem Linfática</option>
                    <option value="Botox">Botox</option>
                    <option value="Limpeza de Pele">Limpeza de Pele</option>
                    <option value="Preenchimento Labial">Preenchimento Labial</option>
                    <option value="Miracle Touch">Miracle Touch</option>
                  </>
                )}
              </select>
            </div>

            {/* Room Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Sala de atendimento</label>
              <select
                value={filterRoom}
                onChange={(e) => setFilterRoom(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="Todos">Todas as Salas</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
                {rooms.length === 0 && (
                  <>
                    <option value="Sala 1">Sala 1</option>
                    <option value="Sala 2">Sala 2</option>
                    <option value="Sala VIP">Sala VIP</option>
                  </>
                )}
              </select>
            </div>
          </div>
        </aside>

        {/* Right Main Panel: Calendar Weekly Grid */}
        <main className="flex-1 bg-white border border-neutral-200/70 rounded-2xl shadow-xs overflow-hidden flex flex-col">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-neutral-100 bg-[#fbfcfb]/50">
            {/* Week Nav controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGoToday}
                className="h-8 text-neutral-700 font-semibold"
              >
                Hoje
              </Button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handlePrevWeek}
                  className="h-8 w-8 rounded-lg border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 active:scale-95 transition-all text-neutral-600"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <span className="text-sm font-bold text-neutral-800">
                  {formatWeekRange(weekDates)}
                </span>
                <button
                  onClick={handleNextWeek}
                  className="h-8 w-8 rounded-lg border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 active:scale-95 transition-all text-neutral-600"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Quick Copilot button & view selector */}
            <div className="flex items-center gap-2">
              <button
                onClick={triggerCopilot}
                className="h-8 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium hover:opacity-90 active:scale-95 transition-all text-xs px-3.5 rounded-lg flex items-center gap-1.5 shadow-sm shadow-blue-500/10"
              >
                <SparklesIcon className="h-3.5 w-3.5 animate-pulse text-blue-200" />
                Pedir ao Copiloto
              </button>

              <Button
                variant="outline"
                size="sm"
                className="h-8 text-neutral-700 font-semibold flex items-center gap-1.5 bg-white border-neutral-200"
                onClick={() => alert("Lista de espera carregando...")}
              >
                <ClipboardList className="h-4 w-4 text-neutral-500" />
                Lista de espera
              </Button>

              <select
                disabled
                className="h-8 rounded-lg border border-neutral-200 bg-white px-3 text-xs text-neutral-800 focus:outline-none opacity-90 cursor-not-allowed font-medium"
              >
                <option>Semana</option>
              </select>
            </div>
          </div>

          {/* Grid column headers (Weekdays row) */}
          <div className="grid grid-cols-7 border-b border-neutral-200 text-center bg-[#fafbfc]/30 divide-x divide-neutral-100">
            {weekDates.map((dayDate, i) => {
              const isToday = dayDate.toDateString() === new Date().toDateString();
              const dayName = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][dayDate.getDay()];
              const dayNum = dayDate.getDate();

              const monthDayKey = `${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(dayDate.getDate()).padStart(2, "0")}`;
              const dayBirthdays = birthdays[monthDayKey] || [];
              const hasBirthday = dayBirthdays.length > 0;

              return (
                <div key={i} className="py-2.5 flex flex-col items-center justify-center gap-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isToday ? (
                      <span className="bg-blue-600 text-white text-xs font-black h-6 w-6 rounded-full flex items-center justify-center shadow-xs">
                        {dayNum}
                      </span>
                    ) : (
                      <span className="text-neutral-800 text-xs font-bold">{dayNum}</span>
                    )}
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? "text-blue-600" : "text-neutral-400"}`}>
                      {dayName}
                    </span>
                    {hasBirthday && (
                      <span title={`Aniversariante(s) do dia:\n${dayBirthdays.join("\n")}`} className="shrink-0">
                        <CakeIcon 
                          className="h-3.5 w-3.5 text-pink-500 animate-bounce cursor-help" 
                        />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Loading state indicator */}
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] gap-2 text-neutral-400">
              <Loader2Icon className="h-8 w-8 animate-spin text-blue-600" />
              <span className="text-xs">Buscando consultas agendadas...</span>
            </div>
          ) : (
            /* Main Hour/Days weekly view */
            <div className="flex-1 flex overflow-y-auto relative h-[800px] border-b border-neutral-200 scrollbar-thin">
              {/* Vertical hours column (Left y-axis) */}
              <div className="w-14 shrink-0 bg-[#fafafa]/50 border-r border-neutral-200/80 relative z-10 pointer-events-none select-none">
                {timeSlots.map((slot, idx) => (
                  <div
                     key={slot}
                     className="absolute right-0 left-0 text-[9px] text-neutral-400 font-mono text-center pr-1.5 border-b border-neutral-100/30"
                     style={{
                       height: "50px",
                       top: `${idx * 50}px`,
                       lineHeight: "22px",
                     }}
                  >
                    {slot.endsWith(":00") && <span>{slot}</span>}
                  </div>
                ))}
              </div>

              {/* Main week columns container */}
              <div className="flex-1 grid grid-cols-7 relative h-[1000px] divide-x divide-neutral-100">
                {/* Horizontal grid rows */}
                <div className="absolute inset-0 pointer-events-none flex flex-col z-0">
                  {timeSlots.map((slot, idx) => (
                    <div
                      key={idx}
                      className="border-b border-neutral-100/70 w-full"
                      style={{ height: "50px" }}
                    />
                  ))}
                </div>

                {/* Day Columns */}
                {weekDates.map((dayDate, dayIdx) => {
                  const dayOfWeek = dayDate.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday

                  // Query appointments for this day
                  const dayAppts = filteredAppointments.filter((appt) => {
                    const startLocal = new Date(appt.start_time);
                    return startLocal.toDateString() === dayDate.toDateString();
                  });

                  return (
                    <div
                      key={dayIdx}
                      className="relative h-full select-none cursor-pointer hover:bg-neutral-50/20"
                      onClick={() => {
                        const dayStr = dayDate.toISOString().slice(0, 10);
                        handleAddAppointment(dayStr);
                      }}
                    >
                      {/* Hatching for closed hours */}
                      {isWeekend ? (
                        <div className="absolute inset-0 bg-hatched opacity-60 pointer-events-none z-0" />
                      ) : (
                        <>
                          {/* 08:00 to 08:30 (Morning non-working hour - 1 slot) */}
                          <div className="absolute top-0 left-0 right-0 h-[50px] bg-hatched opacity-60 pointer-events-none z-0 border-b border-dashed border-neutral-200/50" />
                          {/* 18:30 to 20:00 (Evening non-working hours - starts after slot index 21, which is 18:30) */}
                          <div className="absolute top-[1050px] bottom-0 left-0 right-0 bg-hatched opacity-60 pointer-events-none z-0 border-t border-dashed border-neutral-200/50" />
                        </>
                      )}

                      {/* Render absolute cards inside this day column */}
                      {dayAppts.map((appt) => {
                        const start = new Date(appt.start_time);
                        const end = new Date(appt.end_time);

                        const startHours = start.getHours();
                        const startMins = start.getMinutes();
                        const endHours = end.getHours();
                        const endMins = end.getMinutes();

                        const startTotalMinutes = startHours * 60 + startMins;
                        const endTotalMinutes = endHours * 60 + endMins;

                        // Grid starts at 08:00 (480 minutes) and ends at 20:00 (1200 minutes)
                        const gridStart = 480;

                        // Calculate relative offsets
                        const topMinutes = Math.max(0, startTotalMinutes - gridStart);
                        const durationMinutes = Math.max(20, endTotalMinutes - startTotalMinutes);

                        // 1 hour (60 minutes) = 100px. So 1 minute = 1.6667px.
                        const pxPerMin = 1.6667;
                        const topPx = topMinutes * pxPerMin;
                        const heightPx = Math.min(1000 - topPx, durationMinutes * pxPerMin);

                        const styles = getCardStatusStyles(appt.status);
                        const formattedTime = `${String(startHours).padStart(2, "0")}:${String(startMins).padStart(2, "0")} - ${String(endHours).padStart(2, "0")}:${String(endMins).padStart(2, "0")}`;

                        return (
                          <div
                            key={appt.id}
                            style={{
                              top: `${topPx}px`,
                              height: `${heightPx}px`,
                            }}
                            onClick={(e) => {
                              e.stopPropagation(); // Avoid triggering parent add appointment
                              handleEditAppointment(appt.id);
                            }}
                            className={`absolute left-1 right-1 rounded-xl shadow-xs transition-all duration-200 text-left border p-2 z-10 select-none cursor-pointer hover:shadow-md hover:scale-[1.01] overflow-hidden flex flex-col justify-between ${styles.border} ${styles.bg}`}
                          >
                            <div className="space-y-0.5">
                              {/* Patient name & dot */}
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} />
                                <span className="text-[11px] font-extrabold truncate flex-1 leading-tight">
                                  {appt.patients?.name || "Sem Nome"}
                                </span>
                              </div>
                              {/* Procedure / Title */}
                              <p className="text-[9px] text-neutral-600 truncate font-semibold leading-tight pr-1">
                                {appt.type || appt.title || "Consulta"}
                              </p>
                            </div>
                            {/* Time range */}
                            <div className="text-[8px] opacity-75 font-semibold mt-1 flex items-center gap-1">
                              <ClockIcon className="h-2.5 w-2.5 text-neutral-500" />
                              {formattedTime}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Floating Action Buttons bottom-right */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
        {/* Sparkles Assistant FAB */}
        <button
          onClick={triggerCopilot}
          className="h-12 w-12 rounded-full bg-gradient-to-tr from-blue-500 via-pink-500 to-indigo-500 text-white flex items-center justify-center shadow-lg hover:shadow-pink-500/20 hover:scale-105 active:scale-95 transition-all animate-bounce"
          title="Pedir ajuda ao Assistente AI"
        >
          <SparklesIcon className="h-5 w-5 text-white" />
        </button>

        {/* Plus Appointment FAB */}
        <button
          onClick={() => {
            const dateStr = selectedDate.toISOString().slice(0, 10);
            handleAddAppointment(dateStr);
          }}
          className="h-12 w-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg hover:shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all"
          title="Novo Agendamento"
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      </div>

      {/* Appointment Modal Form */}
      <AppointmentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        appointmentId={selectedApptId}
        defaultDate={modalDefaultDate}
        onSave={fetchAppointments}
      />
    </div>
  );
}
