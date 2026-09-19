"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { AppointmentModal } from "@/components/ui/appointment-modal";
import { AppointmentDetailModal } from "@/components/agenda/appointment-detail-modal";
import { QuoteModal } from "@/components/quotes/quote-modal";
import { WaitlistDrawer } from "@/components/ui/waitlist-drawer";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
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
  AlertTriangle,
  ChevronDown,
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
  tag?: string | null;
  tag_color?: string | null;
  patients: {
    name: string;
    phone: string;
    avatar_url?: string | null;
  } | null;
}

const WhatsAppIcon = () => (
  <svg className="h-3.5 w-3.5 fill-emerald-600" viewBox="0 0 24 24">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.062 5.248 5.308 0 11.773 0c3.133.001 6.078 1.22 8.29 3.433 2.213 2.212 3.431 5.158 3.43 8.29-.005 6.525-5.25 11.772-11.714 11.772-2.004-.001-3.973-.513-5.72-1.488L0 24zm6.49-14.73c-.22-.49-.452-.5-.66-.508-.17-.008-.364-.008-.558-.008-.194 0-.51.072-.777.362s-1.02 1.002-1.02 2.441c0 1.439 1.047 2.829 1.192 3.029.146.199 2.06 3.146 4.99 4.414.697.302 1.242.483 1.666.618.701.223 1.34.191 1.845.116.562-.084 1.727-.706 1.97-1.389.243-.682.243-1.266.17-1.389-.073-.123-.267-.199-.558-.344-.29-.145-1.727-.852-1.993-.949-.267-.097-.46-.145-.66.145-.199.29-.777.949-.95 1.149-.175.2-.35.223-.64.079-.29-.145-1.226-.453-2.336-1.442-.864-.77-1.447-1.72-1.617-2.01-.17-.29-.018-.448.127-.592.13-.13.29-.34.436-.509.145-.17.194-.29.29-.483.097-.19.048-.362-.024-.509-.073-.146-.66-1.593-.905-2.185z" />
  </svg>
);

interface FilterOption {
  id: string;
  name: string;
  valor?: number;
  avatar_url?: string | null;
  color?: string | null;
}

export default function AgendaPage() {
  const supabase = useMemo(() => createClient(), []);
  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case "confirmed": return "#10b981";
      case "attended": return "#3b82f6";
      case "cancelled": return "#ef4444";
      case "no_show": return "#f97316";
      default: return "#f59e0b";
    }
  }, []);
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
  const [modalDefaultType, setModalDefaultType] = useState<"consulta" | "evento" | "bloqueio">("consulta");
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);

  // Waitlist States
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [modalDefaultPatientId, setModalDefaultPatientId] = useState("");
  const [modalDefaultPatientName, setModalDefaultPatientName] = useState("");
  const [modalDefaultPatientPhone, setModalDefaultPatientPhone] = useState("");
  const [modalDefaultProfessionalId, setModalDefaultProfessionalId] = useState("");
  const [modalDefaultProcedureName, setModalDefaultProcedureName] = useState("");

  // Detail Modal (Prontuário / Evolução / Financeiro / Pacotes)
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailApptId, setDetailApptId] = useState<string | null>(null);

  // Quote Modal states
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [quoteContact, setQuoteContact] = useState<{ id: string; name: string; phone: string } | null>(null);

  // Popover States
  const [popoverAppt, setPopoverAppt] = useState<Appointment | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [calendarView, setCalendarView] = useState<"dia" | "semana" | "mes">("semana");

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

  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const weekDates = getWeekDates(selectedDate);
  const displayedDates = useMemo(() => {
    if (calendarView === "dia") {
      return [selectedDate];
    }
    return weekDates;
  }, [calendarView, selectedDate, weekDates]);

  // Helpers for Popover and formatting
  const formatPopoverDate = (startStr: string, endStr: string) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    
    const options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    };
    const formattedDate = start.toLocaleDateString("pt-BR", options);
    
    const startHours = String(start.getHours()).padStart(2, "0");
    const startMins = String(start.getMinutes()).padStart(2, "0");
    const endHours = String(end.getHours()).padStart(2, "0");
    const endMins = String(end.getMinutes()).padStart(2, "0");
    
    return `${formattedDate} • ${startHours}:${startMins} - ${endHours}:${endMins}`;
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getWaLink = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    const finalPhone = cleaned.length <= 11 ? `55${cleaned}` : cleaned;
    return `https://wa.me/${finalPhone}`;
  };

  const handleApptMouseEnter = (appt: Appointment, e: React.MouseEvent<HTMLDivElement>) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // Only recompute position if switching to a different appointment
    if (popoverAppt?.id === appt.id) return;

    const rect = e.currentTarget.getBoundingClientRect();
    let left = rect.right + 12;
    let top = rect.top;
    
    const popoverWidth = 320;
    if (left + popoverWidth > window.innerWidth) {
      left = rect.left - popoverWidth - 12;
    }
    if (left < 0) left = 16;
    
    const popoverHeight = 340;
    if (top + popoverHeight > window.innerHeight) {
      top = window.innerHeight - popoverHeight - 16;
    }
    if (top < 0) top = 16;
    
    setPopoverAppt(appt);
    setPopoverPosition({ top, left });
  };

  const handleApptMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setPopoverAppt(null);
      setPopoverPosition(null);
    }, 600);
  };

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
        .select("id, name, user_id")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .order("name");

      const staffUserIds = (st || []).map((s) => s.user_id).filter(Boolean);
      const staffAvatarsMap: Record<string, string> = {};
      if (staffUserIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, avatar_url")
          .in("user_id", staffUserIds);
        (profs || []).forEach((p) => {
          if (p.avatar_url && p.user_id) {
            staffAvatarsMap[p.user_id] = p.avatar_url;
          }
        });
      }

      setStaff((st || []).map((s) => ({ 
        id: s.id, 
        name: s.name,
        avatar_url: s.user_id ? (staffAvatarsMap[s.user_id] || null) : null
      })));

      // 3. Fetch Procedures (with valor and color)
      const { data: procs } = await supabase
        .from("procedures")
        .select("id, name, valor, color")
        .eq("clinic_id", clinicId)
        .eq("ativo", true)
        .order("name");
      setProcedures((procs || []).map(p => ({ id: p.id, name: p.name, valor: p.valor, color: p.color })));

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

  // State for mini calendar expansion
  const [isMiniCalendarExpanded, setIsMiniCalendarExpanded] = useState(false);

  // Sync pickerMonth and pickerYear when selectedDate changes to load month data automatically
  useEffect(() => {
    setPickerMonth(selectedDate.getMonth());
    setPickerYear(selectedDate.getFullYear());
  }, [selectedDate]);

  const fetchAppointments = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);

    try {
      // Calculate visible cells range of pickerMonth for mini-calendar dots
      const startPickerMonth = new Date(pickerYear, pickerMonth, 1);
      const dayOfWeek = startPickerMonth.getDay();
      const firstCellDate = new Date(startPickerMonth);
      firstCellDate.setDate(startPickerMonth.getDate() - dayOfWeek);
      
      const lastCellDate = new Date(firstCellDate);
      lastCellDate.setDate(firstCellDate.getDate() + 41); // 42 cells total (6 weeks)

      const startIso = new Date(firstCellDate.setHours(0, 0, 0, 0)).toISOString();
      const endIso = new Date(lastCellDate.setHours(23, 59, 59, 999)).toISOString();

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
          tag,
          tag_color,
          patients (
            name,
            phone
          )
        `)
        .eq("clinic_id", accountId)
        .gte("start_time", startIso)
        .lte("start_time", endIso)
        .order("start_time", { ascending: true });

      if (error) throw error;
      setAppointments((data || []) as any[]);
    } catch (err) {
      console.error("Error fetching appointments:", err);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase, pickerMonth, pickerYear]);

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

  useEffect(() => {
    const handleCreateAppt = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { contactId, contactName, contactPhone } = customEvent.detail;
      setSelectedApptId(null);
      setModalDefaultPatientId(contactId);
      setModalDefaultPatientName(contactName);
      setModalDefaultPatientPhone(contactPhone);
      setModalDefaultDate(new Date().toISOString().split("T")[0]);
      setModalDefaultType("consulta");
      setModalOpen(true);
    };

    window.addEventListener("create-appointment", handleCreateAppt);
    return () => {
      window.removeEventListener("create-appointment", handleCreateAppt);
    };
  }, []);

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

  // Get appointments for the visible range of displayedDates (week/day) for sidebar statistics
  const visiblePeriodAppointments = useMemo(() => {
    return appointments.filter((appt) => {
      const startLocal = new Date(appt.start_time);
      return displayedDates.some((d) => d.toDateString() === startLocal.toDateString());
    });
  }, [appointments, displayedDates]);

  // Client side filtering
  const filteredAppointments = appointments.filter((appt) => {
    if (filterStatus !== "Todos") {
      if (filterStatus === "cancelled") {
        if (appt.status !== "cancelled" && appt.status !== "no_show") return false;
      } else {
        if (appt.status !== filterStatus) return false;
      }
    }
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
    setModalDefaultPatientId("");
    setModalDefaultPatientName("");
    setModalDefaultPatientPhone("");
    setModalDefaultProfessionalId("");
    setModalDefaultProcedureName("");
    setModalOpen(true);
  };

  const handleEditAppointment = (apptId: string) => {
    setSelectedApptId(apptId);
    setModalDefaultDate(undefined);
    setModalDefaultPatientId("");
    setModalDefaultPatientName("");
    setModalDefaultPatientPhone("");
    setModalDefaultProfessionalId("");
    setModalDefaultProcedureName("");
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

  // Card status classes map (bolinha sempre verde para confirmado)
  const getCardStatusStyles = (status: string, type?: string | null) => {
    let dotColor = "#f59e0b"; // Default Amber (provisional/pendente)
    switch (status) {
      case "confirmed":
        dotColor = "#10b981"; // VERDE para confirmado!
        break;
      case "attended":
        dotColor = "#3b82f6"; // Azul para realizado
        break;
      case "cancelled":
        dotColor = "#ef4444"; // Vermelho para cancelado
        break;
      case "no_show":
        dotColor = "#f97316"; // Laranja para falta
        break;
      default:
        dotColor = "#f59e0b"; // Amarelo/Laranja para provisorio
    }

    let bgBaseColor = dotColor;
    if (type === "bloqueio" || status === "bloqueio") {
      bgBaseColor = "#6b7280";
    } else if (type === "evento" || status === "evento") {
      bgBaseColor = "#8b5cf6";
    } else if (type) {
      const apptProc = procedures.find((p) => p.name === type);
      if (apptProc?.color) {
        bgBaseColor = apptProc.color;
      }
    }

    const isCancelled = status === "cancelled" || status === "no_show";

    return {
      borderClass: "border-l-4",
      bgStyle: {
        backgroundColor: `color-mix(in srgb, ${bgBaseColor} 12%, #ffffff)`,
        color: `color-mix(in srgb, ${bgBaseColor} 85%, #1f2937)`,
        textDecoration: isCancelled ? "line-through" : "none",
        borderLeftColor: dotColor,
        borderColor: `color-mix(in srgb, ${bgBaseColor} 25%, #e5e7eb)`
      },
      dotStyle: {
        backgroundColor: dotColor // Sempre verde quando confirmed!
      },
      dotColor
    };
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

      {/* Mobile-only view layout */}
      <div className="lg:hidden space-y-4">
        {/* Mini Calendar (Month selector + cells) */}
        <div className="bg-white border border-neutral-200/70 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-neutral-800 capitalize">
              {monthNames[pickerMonth]} {pickerYear}
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

          <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[10px] font-bold text-neutral-400">
            {weekdayInitials.map((initial, i) => (
              <div key={i}>{initial}</div>
            ))}
          </div>

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

        {/* Selected date display */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-black text-neutral-500 uppercase tracking-wider">
            Consultas de {selectedDate.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </div>

        {/* Appointments List for selectedDate */}
        <div className="space-y-2.5">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-neutral-400">
              <Loader2Icon className="h-5 w-5 animate-spin text-blue-600 mr-2" />
              <span className="text-xs">Buscando agendamentos...</span>
            </div>
          ) : (() => {
            const dayAppts = filteredAppointments.filter((appt) => {
              const startLocal = new Date(appt.start_time);
              return startLocal.toDateString() === selectedDate.toDateString();
            });

            if (dayAppts.length === 0) {
              return (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-8 text-center text-neutral-400 shadow-xs">
                  <p className="text-xs font-bold">Nenhum agendamento para este dia.</p>
                </div>
              );
            }

            return dayAppts.map((appt) => {
              const start = new Date(appt.start_time);
              const end = new Date(appt.end_time);
              const timeStr = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")} - ${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
              const dayStr = start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
              const styles = getCardStatusStyles(appt.status, appt.type);

              return (
                <div
                  key={appt.id}
                  onClick={() => handleEditAppointment(appt.id)}
                  onMouseEnter={(e) => handleApptMouseEnter(appt, e)}
                  onMouseLeave={handleApptMouseLeave}
                  style={styles.bgStyle}
                  className="rounded-2xl border p-4 shadow-xs transition-all cursor-pointer flex items-center justify-between gap-4 border-l-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Patient avatar */}
                    <div 
                      style={{ color: styles.dotColor, backgroundColor: `color-mix(in srgb, ${styles.dotColor} 12%, transparent)`, borderColor: `color-mix(in srgb, ${styles.dotColor} 25%, transparent)` }}
                      className="h-10 w-10 rounded-full border flex items-center justify-center text-xs font-black shrink-0 overflow-hidden"
                    >
                      {appt.patients?.avatar_url ? (
                        <img src={appt.patients.avatar_url} alt={appt.patients.name} className="size-full object-cover" />
                      ) : (
                        getInitials(appt.patients?.name || "Sem Nome")
                      )}
                    </div>
                    
                    <div className="min-w-0 text-left space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-extrabold truncate">
                          {appt.patients?.name || "Sem Nome"}
                        </p>
                        <span 
                          className="text-[8px] px-1.5 py-0.2 rounded-md font-black uppercase tracking-wider shrink-0"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${getStatusColor(appt.status)} 12%, transparent)`,
                            color: getStatusColor(appt.status),
                            border: `1px solid color-mix(in srgb, ${getStatusColor(appt.status)} 25%, transparent)`
                          }}
                        >
                          {(() => {
                            switch (appt.status) {
                              case "confirmed": return "Confirmado";
                              case "attended": return "Realizado";
                              case "cancelled": return "Cancelado";
                              case "no_show": return "Falta";
                              default: return "Pendente";
                            }
                          })()}
                        </span>
                        {appt.tag && (
                          <span 
                            className="text-[7.5px] px-1.5 py-0.2 rounded-md font-black uppercase tracking-wider shrink-0 text-white"
                            style={{ backgroundColor: appt.tag_color || "#3b82f6" }}
                          >
                            {appt.tag}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] opacity-80 font-semibold truncate">
                        {appt.type || appt.title || "Consulta"}
                      </p>
                      <p className="text-[9px] opacity-60 font-medium">
                        {dayStr} • {timeStr}
                      </p>
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Double Column Split Layout - Desktop Only */}
      <div className="hidden lg:flex flex-row gap-6">
        {/* Left Sidebar: Mini Calendar and Dropdown Filters */}
        <aside className="w-full lg:w-[260px] shrink-0 space-y-5 flex flex-col">
          {/* Mini Month Picker */}
          <div className="bg-white border border-neutral-200/70 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setIsMiniCalendarExpanded(!isMiniCalendarExpanded)}
                className="flex items-center gap-1.5 text-sm font-bold text-neutral-800 hover:text-blue-600 transition-colors capitalize"
                title={isMiniCalendarExpanded ? "Recolher para semana" : "Expandir para mês"}
              >
                <span>{monthNames[pickerMonth]} {pickerYear}</span>
                <span className="text-[9px] font-extrabold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-md hover:bg-blue-50 hover:text-blue-600 transition-colors uppercase tracking-wider">
                  {isMiniCalendarExpanded ? "Mês" : "Semana"}
                </span>
              </button>
              <div className="flex items-center gap-0.5">
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
              {(isMiniCalendarExpanded ? miniCalendarCells : weekDates).map((cellDate, cellIdx) => {
                const isSelected = cellDate.toDateString() === selectedDate.toDateString();
                const isToday = cellDate.toDateString() === new Date().toDateString();
                const isCurrentMonth = cellDate.getMonth() === pickerMonth;

                // Check if date has appointments to display indicator dot
                const hasAppt = appointments.some((appt) => {
                  const startLocal = new Date(appt.start_time);
                  return startLocal.toDateString() === cellDate.toDateString();
                });

                return (
                  <button
                    key={cellIdx}
                    onClick={() => {
                      setSelectedDate(cellDate);
                      setPickerMonth(cellDate.getMonth());
                      setPickerYear(cellDate.getFullYear());
                    }}
                    className={`h-8 w-8 rounded-full flex flex-col items-center justify-center relative transition-all ${
                      isSelected
                        ? "bg-blue-600 text-white font-bold shadow-xs"
                        : isToday
                        ? "border border-blue-600 text-blue-600 font-semibold"
                        : isCurrentMonth
                        ? "text-neutral-700 hover:bg-neutral-100"
                        : "text-neutral-300 dark:text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    <span className="text-[10px]">{cellDate.getDate()}</span>
                    {hasAppt && (
                      <span className={`absolute bottom-1 h-1 w-1 rounded-full ${
                        isSelected ? "bg-white" : "bg-blue-600"
                      }`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status Statistics Filters */}
          <div className="bg-white border border-neutral-200/70 rounded-2xl p-4 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-neutral-100">
              <span className="text-xs font-extrabold text-neutral-800 tracking-wider uppercase">Filtros por Status</span>
              {filterStatus !== "Todos" && (
                <button
                  onClick={() => setFilterStatus("Todos")}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider"
                >
                  Limpar
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {/* Total Item */}
              <button
                type="button"
                onClick={() => setFilterStatus("Todos")}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all text-left",
                  filterStatus === "Todos"
                    ? "bg-blue-50/70 border-blue-200 text-blue-800 font-bold"
                    : "bg-white border-neutral-100 hover:border-neutral-200 text-neutral-600"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  <span>Todos os agendamentos</span>
                </div>
                <span className="text-[10px] bg-neutral-100 px-2 py-0.5 rounded-md text-neutral-600 font-extrabold">
                  {visiblePeriodAppointments.length}
                </span>
              </button>

              {/* Confirmed Item */}
              <button
                type="button"
                onClick={() => setFilterStatus("confirmed")}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all text-left",
                  filterStatus === "confirmed"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800 font-bold"
                    : "bg-white border-neutral-100 hover:border-neutral-200 text-neutral-600"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                  <span>Confirmados</span>
                </div>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100/50 px-2 py-0.5 rounded-md font-extrabold">
                  {visiblePeriodAppointments.filter(a => a.status === 'confirmed').length}
                </span>
              </button>

              {/* Pending (Provisional) Item */}
              <button
                type="button"
                onClick={() => setFilterStatus("provisional")}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all text-left",
                  filterStatus === "provisional"
                    ? "bg-amber-50 border-amber-200 text-amber-800 font-bold"
                    : "bg-white border-neutral-100 hover:border-neutral-200 text-neutral-600"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span>Pendentes</span>
                </div>
                <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100/50 px-2 py-0.5 rounded-md font-extrabold">
                  {visiblePeriodAppointments.filter(a => a.status === 'provisional').length}
                </span>
              </button>

              {/* Attended (Realizados) Item */}
              <button
                type="button"
                onClick={() => setFilterStatus("attended")}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all text-left",
                  filterStatus === "attended"
                    ? "bg-purple-50 border-purple-200 text-purple-800 font-bold"
                    : "bg-white border-neutral-100 hover:border-neutral-200 text-neutral-600"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-600" />
                  <span>Realizados</span>
                </div>
                <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100/50 px-2 py-0.5 rounded-md font-extrabold">
                  {visiblePeriodAppointments.filter(a => a.status === 'attended').length}
                </span>
              </button>

              {/* Cancelled / Faltou Item */}
              <button
                type="button"
                onClick={() => setFilterStatus("cancelled")}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all text-left",
                  filterStatus === "cancelled"
                    ? "bg-rose-50 border-rose-200 text-rose-800 font-bold"
                    : "bg-white border-neutral-100 hover:border-neutral-200 text-neutral-600"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
                  <span>Cancelados / Faltas</span>
                </div>
                <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-100/50 px-2 py-0.5 rounded-md font-extrabold">
                  {visiblePeriodAppointments.filter(a => a.status === 'cancelled' || a.status === 'no_show').length}
                </span>
              </button>
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
                className="h-8 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium hover:opacity-90 active:scale-95 transition-all text-xs px-3.5 rounded-lg flex items-center gap-1.5 shadow-sm shadow-blue-500/10"
              >
                <SparklesIcon className="h-3.5 w-3.5 animate-pulse text-blue-100" />
                Pedir à LIA
              </button>

              <Button
                variant="outline"
                size="sm"
                className="h-8 text-neutral-700 font-semibold flex items-center gap-1.5 bg-white border-neutral-200"
                onClick={() => setWaitlistOpen(true)}
              >
                <ClipboardList className="h-4 w-4 text-neutral-500" />
                Lista de espera
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger className="h-8 rounded-xl border border-neutral-200 bg-white px-3 text-xs text-neutral-800 focus:outline-none font-semibold cursor-pointer shadow-xs flex items-center gap-1.5">
                  {calendarView === "dia" ? "📅 Dia" : calendarView === "semana" ? "📆 Semana" : "🗓️ Mês"}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl border border-neutral-200 bg-white shadow-md p-1 min-w-[110px]">
                  <DropdownMenuItem
                    onClick={() => setCalendarView("dia")}
                    className="text-xs font-semibold rounded-lg px-2 py-1.5 cursor-pointer text-neutral-800 focus:bg-neutral-50 hover:bg-neutral-100"
                  >
                    📅 Dia
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setCalendarView("semana")}
                    className="text-xs font-semibold rounded-lg px-2 py-1.5 cursor-pointer text-neutral-800 focus:bg-neutral-50 hover:bg-neutral-100"
                  >
                    📆 Semana
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setCalendarView("mes")}
                    className="text-xs font-semibold rounded-lg px-2 py-1.5 cursor-pointer text-neutral-800 focus:bg-neutral-50 hover:bg-neutral-100"
                  >
                    🗓️ Mês
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Grid column headers (Weekdays row) */}
          <div className={cn("grid border-b border-neutral-200 text-center bg-[#fafbfc]/30 divide-x divide-neutral-100",
            calendarView === "dia" ? "grid-cols-1" : "grid-cols-7"
          )}>
            {displayedDates.map((dayDate, i) => {
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
              {/* Main week columns container */}
              <div className={cn("flex-1 grid relative h-[1000px] divide-x divide-neutral-100",
                calendarView === "dia" ? "grid-cols-1" : "grid-cols-7"
              )}>
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

                {/* Red Current Time Line - Spans 100% across the whole weekly grid */}
                {(() => {
                  const currentTotalMins = now.getHours() * 60 + now.getMinutes();
                  const currentTimeTopPx = (currentTotalMins - 480) * 1.6667; // 480 is 08:00
                  if (currentTimeTopPx >= 0 && currentTimeTopPx <= 1000) {
                    return (
                      <div
                        className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                        style={{ top: `${currentTimeTopPx}px` }}
                      >
                        <div className="h-3 w-3 rounded-full bg-red-500 -ml-1.5 shadow-md border-2 border-white" />
                        <div className="h-[2px] bg-red-500 flex-1 shadow-xs" />
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Day Columns */}
                {displayedDates.map((dayDate, dayIdx) => {
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

                        const styles = getCardStatusStyles(appt.status, appt.type);
                        const formattedTime = `${String(startHours).padStart(2, "0")}:${String(startMins).padStart(2, "0")} - ${String(endHours).padStart(2, "0")}:${String(endMins).padStart(2, "0")}`;

                        return (
                          <div
                            key={appt.id}
                            style={{
                              top: `${topPx}px`,
                              height: `${heightPx}px`,
                              ...styles.bgStyle
                            }}
                            onMouseEnter={(e) => {
                              handleApptMouseEnter(appt, e);
                            }}
                            onMouseLeave={handleApptMouseLeave}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditAppointment(appt.id);
                            }}
                            className="absolute left-1 right-1 rounded-2xl shadow-sm transition-all duration-200 text-left border p-2.5 z-10 select-none cursor-pointer hover:shadow-md hover:scale-[1.01] overflow-hidden flex flex-col justify-between"
                          >
                            <div className="space-y-0.5 min-w-0">
                              {/* Line 1: Status Dot & Patient Name */}
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span style={styles.dotStyle} className="h-2 w-2 shrink-0 rounded-full shadow-2xs" />
                                <span className="text-[11px] font-bold text-neutral-800 truncate flex-1 leading-tight">
                                  {appt.patients?.name || "Sem Nome"}
                                </span>
                                {appt.status === "provisional" && (
                                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                                )}
                              </div>

                              {/* Line 2: Procedure / Service Name */}
                              <p className="text-[10px] font-extrabold uppercase tracking-wide opacity-80 truncate text-neutral-700 leading-tight">
                                {appt.type || appt.title || "Consulta"}
                              </p>

                              {/* Custom Tag Badge if present */}
                              {appt.tag && (
                                <div className="mt-0.5">
                                  <span 
                                    className="text-[7px] px-1.5 py-0.2 rounded-md font-black uppercase tracking-wider text-white shadow-3xs"
                                    style={{ backgroundColor: appt.tag_color || "#3b82f6" }}
                                  >
                                    {appt.tag}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Line 3: Time range */}
                            <div className="text-[9px] font-semibold opacity-75 text-neutral-600 flex items-center gap-1 mt-1">
                              <ClockIcon className="h-2.5 w-2.5 opacity-60" />
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
      <div className="fixed bottom-6 right-6 flex flex-col items-center gap-3 z-50">
        {/* Popover Menu above the FAB */}
        {isFabMenuOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsFabMenuOpen(false)} />
            <div className="absolute bottom-[calc(100%+12px)] right-0 bg-white border border-neutral-200 shadow-2xl rounded-2xl p-2 z-50 w-52 flex flex-col gap-1 text-left animate-in fade-in slide-in-from-bottom-5 duration-150">
              <button
                type="button"
                onClick={() => {
                  setModalDefaultType("consulta");
                  const dateStr = selectedDate.toISOString().slice(0, 10);
                  handleAddAppointment(dateStr);
                  setIsFabMenuOpen(false);
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                <PlusIcon className="h-4 w-4 text-blue-600" />
                <span>Marcar Consulta (Lead)</span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setModalDefaultType("evento");
                  const dateStr = selectedDate.toISOString().slice(0, 10);
                  handleAddAppointment(dateStr);
                  setIsFabMenuOpen(false);
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                <SparklesIcon className="h-4 w-4 text-indigo-500" />
                <span>Criar Evento</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalDefaultType("bloqueio");
                  const dateStr = selectedDate.toISOString().slice(0, 10);
                  handleAddAppointment(dateStr);
                  setIsFabMenuOpen(false);
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                <ClockIcon className="h-4 w-4 text-amber-500" />
                <span>Bloqueio de Agenda</span>
              </button>
            </div>
          </>
        )}

        {/* Plus FAB Button */}
        <button
          onClick={() => setIsFabMenuOpen(!isFabMenuOpen)}
          className={`h-12 w-12 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg hover:shadow-blue-500/30 active:scale-95 transition-all duration-200 ${isFabMenuOpen ? 'rotate-45 bg-neutral-800' : ''}`}
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
        defaultType={modalDefaultType}
        defaultPatientId={modalDefaultPatientId}
        defaultPatientName={modalDefaultPatientName}
        defaultPatientPhone={modalDefaultPatientPhone}
        defaultProfessionalId={modalDefaultProfessionalId}
        defaultProcedureName={modalDefaultProcedureName}
        onSave={fetchAppointments}
      />

      {/* Waitlist Drawer overlay */}
      <WaitlistDrawer
        open={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        onSchedule={(ptId, profId, procName, ptName, ptPhone) => {
          setSelectedApptId(null);
          setModalDefaultDate(new Date().toISOString().split("T")[0]); // Default to today
          setModalDefaultType("consulta");
          setModalDefaultPatientId(ptId);
          setModalDefaultPatientName(ptName || "");
          setModalDefaultPatientPhone(ptPhone || "");
          setModalDefaultProfessionalId(profId);
          setModalDefaultProcedureName(procName);
          setModalOpen(true);
        }}
      />

      {/* Appointment Details Popover */}
      {popoverAppt && popoverPosition && (
        <div 
          style={{ 
            position: 'fixed', 
            top: `${popoverPosition.top}px`, 
            left: `${popoverPosition.left}px`,
          }}
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
              }
            }}
            onMouseLeave={handleApptMouseLeave}
            className="z-50 w-[310px] bg-white border border-neutral-200 shadow-2xl rounded-2xl p-4 text-left space-y-4 animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Header: status and "Agendamento" */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span style={getCardStatusStyles(popoverAppt.status, popoverAppt.type).dotStyle} className="h-2.5 w-2.5 rounded-full" />
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">
                  Agendamento • {(() => {
                    switch (popoverAppt.status) {
                      case "confirmed": return "Confirmado";
                      case "attended": return "Realizado";
                      case "cancelled": return "Cancelado";
                      case "no_show": return "Não compareceu";
                      default: return "Pendente";
                    }
                  })()}
                </span>
              </div>
              <button 
                onClick={() => {
                  setPopoverAppt(null);
                  setPopoverPosition(null);
                }}
                className="text-neutral-400 hover:text-neutral-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Date & Time */}
            <div className="text-xs font-bold text-neutral-800">
              {formatPopoverDate(popoverAppt.start_time, popoverAppt.end_time)}
            </div>

            <div className="border-t border-neutral-100" />

            {/* Professional & Patient Rows */}
            <div className="space-y-3">
              {/* Professional */}
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-neutral-100 border border-neutral-200 overflow-hidden text-neutral-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {(() => {
                    const prof = staff.find((s) => s.id === popoverAppt.professional_id);
                    return prof?.avatar_url ? (
                      <img 
                        src={prof.avatar_url} 
                        alt={prof.name} 
                        className="size-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      getInitials(prof?.name || "NT")
                    );
                  })()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Profissional</p>
                  <p className="text-xs font-bold text-neutral-700 truncate">
                    {staff.find((s) => s.id === popoverAppt.professional_id)?.name || "Não atribuído"}
                  </p>
                </div>
              </div>

              {/* Patient */}
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-blue-100 border border-blue-200 overflow-hidden text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {popoverAppt.patients?.avatar_url ? (
                    <img 
                      src={popoverAppt.patients.avatar_url} 
                      alt={popoverAppt.patients.name} 
                      className="size-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    getInitials(popoverAppt.patients?.name || "Sem Nome")
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Paciente</p>
                  <p className="text-xs font-bold text-neutral-700 truncate">
                    {popoverAppt.patients?.name || "Sem Nome"}
                  </p>
                  {popoverAppt.patients?.phone && (
                    <a 
                      href={`https://wa.me/${popoverAppt.patients.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] font-mono text-primary hover:underline block mt-0.5"
                    >
                      {popoverAppt.patients.phone}
                    </a>
                  )}
                </div>
                {popoverAppt.patients?.phone && (
                  <a
                    href={getWaLink(popoverAppt.patients.phone)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/50 rounded-lg text-emerald-600 transition-colors flex items-center justify-center shrink-0"
                    title="Conversar no WhatsApp"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <WhatsAppIcon />
                  </a>
                )}
              </div>
            </div>

            <div className="border-t border-neutral-100" />

            {/* Procedure name & Price */}
            <div className="flex items-center justify-between text-xs">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Procedimento</p>
                <p className="font-bold text-neutral-700 truncate">
                  1x {popoverAppt.type || popoverAppt.title || "Consulta"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Valor</p>
                <p className="font-extrabold text-blue-700">
                  {(() => {
                    const proc = procedures.find(p => p.name === popoverAppt.type);
                    return proc?.valor ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(proc.valor) : "R$ 0,00";
                  })()}
                </p>
              </div>
            </div>

            <div className="border-t border-neutral-100" />

            {/* Footers */}
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const id = popoverAppt.id;
                  setPopoverAppt(null);
                  setPopoverPosition(null);
                  handleEditAppointment(id);
                }}
                className="flex-1 text-xs font-bold h-8 rounded-lg"
              >
                Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (popoverAppt.patients) {
                    setQuoteContact({
                      id: popoverAppt.patient_id,
                      name: popoverAppt.patients.name,
                      phone: popoverAppt.patients.phone,
                    });
                    setQuoteModalOpen(true);
                  } else {
                    toast.error("Paciente não identificado para este agendamento.");
                  }
                  setPopoverAppt(null);
                  setPopoverPosition(null);
                }}
                className="flex-1 text-xs font-bold h-8 rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                Orçamento
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const id = popoverAppt.id;
                  setPopoverAppt(null);
                  setPopoverPosition(null);
                  setDetailApptId(id);
                  setDetailModalOpen(true);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-8 rounded-lg"
              >
                Detalhes
              </Button>
            </div>
          </div>
        )}

      {/* Appointment Detail Modal (Prontuário, Evolução, Financeiro, Pacotes) */}
      <AppointmentDetailModal
        open={detailModalOpen}
        appointmentId={detailApptId}
        onClose={() => setDetailModalOpen(false)}
        onUpdated={fetchAppointments}
      />

      {/* Quote Modal */}
      <QuoteModal
        open={quoteModalOpen}
        onClose={() => setQuoteModalOpen(false)}
        contactId={quoteContact?.id}
        contactName={quoteContact?.name}
        contactPhone={quoteContact?.phone}
      />
    </div>
  );
}
