"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2Icon,
  Trash2Icon,
  SparklesIcon,
  DollarSignIcon,
  BadgeAlertIcon,
  CalendarDaysIcon,
  UserCheckIcon,
  TagIcon,
  CheckCircle2Icon,
  FileTextIcon,
  ClockIcon,
  UserIcon,
  PackageIcon,
  MessageSquareIcon,
  SendIcon,
  TrendingUpIcon,
  SearchIcon,
  UserPlusIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon
} from "lucide-react";
import { generateAIDocument } from "@/app/actions/ai-actions";
import { cn } from "@/lib/utils";
import { QuoteModal } from "@/components/quotes/quote-modal";

interface AppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string | null; // Null if creating a new one
  defaultDate?: string; // ISO date string if creating on a specific day
  defaultType?: "consulta" | "evento" | "bloqueio";
  defaultPatientId?: string;
  defaultProfessionalId?: string;
  defaultProcedureName?: string;
  onSave: () => void;
}

interface PatientOption {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface StaffOption {
  id: string;
  name: string;
}

interface SmartPanelData {
  leadScore: number;
  stage: string;
  tags: string[];
  remainingSessions: number;
  pendingTransactionsTotal: number;
  lastProfessionalName: string;
  lastAppointmentDate: string | null;
}

export function AppointmentModal({
  open,
  onOpenChange,
  appointmentId,
  defaultDate,
  defaultType = "consulta",
  defaultPatientId = "",
  defaultProfessionalId = "",
  defaultProcedureName = "",
  onSave,
}: AppointmentModalProps) {
  const supabase = createClient();
  const { profile, accountId, user } = useAuth();
  const clinicId = accountId;
  const profileName = profile?.full_name || "Sistema";
  const [originalStatus, setOriginalStatus] = useState<string>("");
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);

  // Appointment Type / Mode (Consulta, Evento, Bloqueio)
  const [apptType, setApptType] = useState<"consulta" | "evento" | "bloqueio">("consulta");
  
  // Custom professional select dropdown state
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);

  // Quotes (Orçamentos) states inside Financial tab
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);

  // Search queries
  const [searchQuery, setSearchQuery] = useState("");

  // Form states
  const [patientId, setPatientId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState("provisional");
  const [notes, setNotes] = useState("");
  const [appointmentColor, setAppointmentColor] = useState<string | null>(null);

  const fetchQuotes = useCallback(async () => {
    if (!patientId) return;
    setLoadingQuotes(true);
    try {
      const { data } = await supabase
        .from("quotes")
        .select("*")
        .eq("contact_id", patientId)
        .order("created_at", { ascending: false });
      setQuotes(data || []);
    } catch (err) {
      console.error("Error loading quotes:", err);
    } finally {
      setLoadingQuotes(false);
    }
  }, [patientId, supabase]);
  const [sendWa, setSendWa] = useState(true);

  // Loaders
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tabs navigation
  const [activeTab, setActiveTab] = useState<"details" | "history" | "documents" | "financial" | "prontuario">("details");

  // Sub-details state (fetched when patient is selected)
  const [selectedPatientInfo, setSelectedPatientInfo] = useState<any>(null);
  const [patientAppointments, setPatientAppointments] = useState<any[]>([]);
  const [patientPackages, setPatientPackages] = useState<any[]>([]);
  const [docTemplates, setDocTemplates] = useState<any[]>([]);
  const [patientDocs, setPatientDocs] = useState<any[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [pendingDocsCount, setPendingDocsCount] = useState(0);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Smart Panel states
  const [smartPanelData, setSmartPanelData] = useState<SmartPanelData | null>(null);
  const [loadingSmartPanel, setLoadingSmartPanel] = useState(false);

  // New patient states
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [newPatientEmail, setNewPatientEmail] = useState("");
  const [savingNewPatient, setSavingNewPatient] = useState(false);
  const [newPatientError, setNewPatientError] = useState<string | null>(null);

  // EMR Clinical notes states
  const [clinicalEvolutions, setClinicalEvolutions] = useState<any[]>([]);
  const [newEvolContent, setNewEvolContent] = useState("");
  const [evolSigned, setEvolSigned] = useState(true);
  const [evolShared, setEvolShared] = useState(true);
  const [evolSaving, setEvolSaving] = useState(false);

  // Body Evaluations state
  const [bodyEvaluations, setBodyEvaluations] = useState<any[]>([]);
  const [evalWeight, setEvalWeight] = useState("");
  const [evalHeight, setEvalHeight] = useState("");
  const [evalArmRight, setEvalArmRight] = useState("");
  const [evalArmLeft, setEvalArmLeft] = useState("");
  const [evalAbdomen, setEvalAbdomen] = useState("");
  const [evalWaist, setEvalWaist] = useState("");
  const [evalHip, setEvalHip] = useState("");
  const [evalThighRight, setEvalThighRight] = useState("");
  const [evalThighLeft, setEvalThighLeft] = useState("");
  const [evalCalfRight, setEvalCalfRight] = useState("");
  const [evalCalfLeft, setEvalCalfLeft] = useState("");
  const [evalFatPercentage, setEvalFatPercentage] = useState("");
  const [evalNotes, setEvalNotes] = useState("");
  const [evalDate, setEvalDate] = useState(new Date().toISOString().split("T")[0]);
  const [savingBodyEval, setSavingBodyEval] = useState(false);
  const [selectedChartMetric, setSelectedChartMetric] = useState<"weight" | "fat_percentage" | "waist" | "hip">("weight");

  // Financial transactions state
  const [patientTransactions, setPatientTransactions] = useState<any[]>([]);

  // AI Document Generator States
  const [aiDocProcedure, setAiDocProcedure] = useState("");
  const [aiDocRisks, setAiDocRisks] = useState("");
  const [aiDocCuidados, setAiDocCuidados] = useState("");
  const [aiDocNotes, setAiDocNotes] = useState("");
  const [aiDocType, setAiDocType] = useState("contrato");
  const [aiGeneratingDoc, setAiGeneratingDoc] = useState(false);
  const [aiGeneratedContent, setAiGeneratedContent] = useState("");
  const [isSavingGeneratedDoc, setIsSavingGeneratedDoc] = useState(false);

  // History stats
  const [historyStats, setHistoryStats] = useState({
    total: 0,
    attended: 0,
    cancelled: 0,
    noShow: 0,
    rescheduled: 0,
    lastProf: "Nenhum",
    lastProc: "Nenhum"
  });

  // Load selection options (patients, staff, procedures, rooms)
  useEffect(() => {
    if (!open || !profile) return;

    const loadOptions = async () => {
      try {
        // clinicId is scoped globally in the component

        // Fetch patients (include phone & email for search cards)
        const { data: ptsData } = await supabase
          .from("patients")
          .select("id, name, phone, email")
          .eq("clinic_id", clinicId)
          .order("name");

        // Fetch contacts to fallback/merge
        const { data: ctsData } = await supabase
          .from("contacts")
          .select("id, name, phone, email")
          .eq("account_id", clinicId)
          .order("name");

        const mergedMap = new Map();
        (ptsData || []).forEach(p => mergedMap.set(p.id, p));
        (ctsData || []).forEach(c => {
          if (c.name && !mergedMap.has(c.id)) {
            mergedMap.set(c.id, { id: c.id, name: c.name, phone: c.phone, email: c.email });
          }
        });
        const mergedList = Array.from(mergedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        setPatients(mergedList);

        // Fetch staff (clinic_users)
        const { data: stData } = await supabase
          .from("clinic_users")
          .select("user_id, name")
          .eq("clinic_id", clinicId)
          .eq("is_active", true)
          .order("name");
        setStaff((stData || []).map((s) => ({ id: s.user_id, name: s.name })));

        // Fetch procedures
        const { data: procData } = await supabase
          .from("procedures")
          .select("id, name")
          .eq("clinic_id", clinicId)
          .eq("ativo", true)
          .order("name");
        setProcedures(procData || []);

        // Fetch rooms
        const { data: rmData } = await supabase
          .from("rooms")
          .select("id, name")
          .eq("clinic_id", clinicId)
          .eq("is_active", true)
          .order("name");
        setRooms(rmData || []);
      } catch (err) {
        console.error("Error loading appointment options:", err);
      }
    };

    loadOptions();
  }, [open, profile]);

  // Load appointment details if editing
  useEffect(() => {
    if (!open) return;

    if (!appointmentId) {
      // Pre-fill fields for creation
      setPatientId(defaultPatientId || "");
      setProfessionalId(defaultProfessionalId || user?.id || "");
      setProcedureName(defaultProcedureName || "");
      setRoomId("");
      setStatus("provisional");
      setNotes("");
      setSendWa(true);
      setActiveTab("details");
      setShowNewPatientForm(false);
      setNewPatientName("");
      setNewPatientPhone("");
      setNewPatientEmail("");
      setNewPatientError(null);
      setSearchQuery("");

      const currentType = defaultType || "consulta";
      setApptType(currentType);
      if (currentType === "evento") {
        setProcedureName("Evento");
      } else if (currentType === "bloqueio") {
        setProcedureName("Bloqueio de Agenda");
      }

      if (defaultDate) {
        setStartTime(`${defaultDate}T09:00`);
        setEndTime(`${defaultDate}T10:00`);
      } else {
        const now = new Date();
        now.setMinutes(0, 0, 0);
        const isoString = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setStartTime(isoString);
        
        now.setHours(now.getHours() + 1);
        const endIsoString = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setEndTime(endIsoString);
      }
      return;
    }

    const loadAppointment = async () => {
      setLoading(true);
      setError(null);
      setActiveTab("details");
      try {
        const { data: appt, error: apptErr } = await supabase
          .from("appointments")
          .select("*")
          .eq("id", appointmentId)
          .single();

        if (apptErr) throw apptErr;

        setPatientId(appt.patient_id || "");
        setProfessionalId(appt.professional_id || "");
        setProcedureName(appt.type || "");
        setRoomId(appt.room_id || "");
        
        const startLocal = new Date(new Date(appt.start_time).getTime() - new Date().getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        const endLocal = new Date(new Date(appt.end_time).getTime() - new Date().getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);

        setStartTime(startLocal);
        setEndTime(endLocal);
        setStatus(appt.status || "provisional");
        setNotes(appt.notes || "");
        setAppointmentColor(appt.color || null);
        setSendWa(true);

        const loadedType = appt.type === "Evento" || appt.type === "evento"
          ? "evento"
          : (appt.type === "Bloqueio de Agenda" || appt.type === "bloqueio" ? "bloqueio" : "consulta");
        setApptType(loadedType);
      } catch (err) {
        console.error("Error loading appointment details:", err);
        setError("Erro ao carregar detalhes do agendamento.");
      } finally {
        setLoading(false);
      }
    };

    loadAppointment();
  }, [open, appointmentId, defaultDate, profile, defaultPatientId, defaultProfessionalId, defaultProcedureName]);

  // Fetch all patient related data (EMR notes, history stats, documents, packages, evaluations, transactions)
  useEffect(() => {
    if (!patientId || !open) {
      setSelectedPatientInfo(null);
      setPatientAppointments([]);
      setPatientPackages([]);
      setPatientDocs([]);
      setPendingDocsCount(0);
      setClinicalEvolutions([]);
      setBodyEvaluations([]);
      setPatientTransactions([]);
      setQuotes([]);
      return;
    }

    const loadPatientSubDetails = async () => {
      setLoadingDetails(true);
      try {
        // 1. Patient basic profile
        const { data: patient } = await supabase
          .from("patients")
          .select("*")
          .eq("id", patientId)
          .single();
        setSelectedPatientInfo(patient);

        // Pre-fill procedure if AI docs is empty
        if (procedureName) setAiDocProcedure(procedureName);

        // 2. History of appointments
        const { data: appts } = await supabase
          .from("appointments")
          .select(`
            id,
            start_time,
            end_time,
            status,
            notes,
            type,
            clinic_users (
              name
            )
          `)
          .eq("patient_id", patientId)
          .order("start_time", { ascending: false });
        
        const apptsList = appts || [];
        setPatientAppointments(apptsList);

        // Compute history stats
        const total = apptsList.length;
        const attended = apptsList.filter(a => a.status === "attended").length;
        const cancelled = apptsList.filter(a => a.status === "cancelled").length;
        const noShow = apptsList.filter(a => a.status === "no_show").length;
        const rescheduled = apptsList.filter(a => a.notes?.toLowerCase().includes("reagendado") || false).length;
        const lastAttended = apptsList.find(a => a.status === "attended");
        const lastProf = (Array.isArray(lastAttended?.clinic_users)
          ? lastAttended.clinic_users[0]?.name
          : (lastAttended?.clinic_users as any)?.name) || "Nenhum";
        const lastProc = lastAttended?.type || "Nenhum";

        setHistoryStats({
          total,
          attended,
          cancelled,
          noShow,
          rescheduled,
          lastProf,
          lastProc
        });

        // 3. Packages
        const { data: ptPkgs } = await supabase
          .from("patient_packages")
          .select("*")
          .eq("contact_id", patientId);

        const mergedPkgs = (ptPkgs || []).map((p) => ({
          id: p.id,
          name: p.package_name || "Pacote Geral",
          total: p.sessions_total,
          used: p.sessions_used,
          status: p.status,
          expires: p.expires_at,
        }));
        setPatientPackages(mergedPkgs);

        // 4. Documents & Templates
        const { data: docs } = await supabase
          .from("documents")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false });
        setPatientDocs(docs || []);
        
        const pendingCount = (docs || []).filter((d) => d.status !== "signed").length;
        setPendingDocsCount(pendingCount);

        const { data: templates } = await supabase
          .from("document_templates")
          .select("id, name, type")
          .order("name");
        setDocTemplates(templates || []);

        // 5. EMR Clinical notes (Clinical Evolutions join with clinic users)
        const { data: evolData } = await supabase
          .from("clinical_evolutions")
          .select(`
            id,
            created_at,
            content,
            signed,
            shared,
            clinic_users (
              name
            )
          `)
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false });
        
        setClinicalEvolutions((evolData || []).map(ev => ({
          id: ev.id,
          created_at: ev.created_at,
          content: ev.content,
          signed: ev.signed,
          shared: ev.shared,
          professional_name: (Array.isArray(ev.clinic_users) ? ev.clinic_users[0]?.name : (ev.clinic_users as any)?.name) || "Profissional"
        })));

        // 6. Body Evaluations
        const { data: evalData } = await supabase
          .from("body_evaluations")
          .select("*")
          .eq("patient_id", patientId)
          .order("evaluation_date", { ascending: true });
        setBodyEvaluations(evalData || []);

        // 7. Financial Transactions
        const { data: txList } = await supabase
          .from("financial_transactions")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false });
        setPatientTransactions(txList || []);

        // 8. Quotes (Orçamentos)
        const { data: quotesList } = await supabase
          .from("quotes")
          .select("*")
          .eq("contact_id", patientId)
          .order("created_at", { ascending: false });
        setQuotes(quotesList || []);

      } catch (err) {
        console.error("Error loading patient sub-details:", err);
      } finally {
        setLoadingDetails(false);
      }
    };

    loadPatientSubDetails();
  }, [patientId, open]);

  // Load Smart Panel details when patientId is selected
  useEffect(() => {
    if (!patientId || !open) {
      setSmartPanelData(null);
      return;
    }

    const loadSmartPanelData = async () => {
      setLoadingSmartPanel(true);
      try {
        const { data: patientData } = await supabase
          .from("patients")
          .select("lead_score, stage, tags")
          .eq("id", patientId)
          .single();
          
        const { data: pkgsData } = await supabase
          .from("patient_packages")
          .select("sessions_total, sessions_used")
          .eq("patient_id", patientId)
          .eq("status", "active");
        
        const remainingSessions = (pkgsData || []).reduce((sum, p) => sum + (p.sessions_total - p.sessions_used), 0);
        
        const { data: txData } = await supabase
          .from("financial_transactions")
          .select("value")
          .eq("patient_id", patientId)
          .eq("type", "receita")
          .eq("status", "pending");
          
        const pendingTransactionsTotal = (txData || []).reduce((sum, t) => sum + Number(t.value), 0);
        
        const { data: lastAppt } = await supabase
          .from("appointments")
          .select("start_time, professional_id")
          .eq("patient_id", patientId)
          .eq("status", "attended")
          .order("start_time", { ascending: false })
          .limit(1)
          .maybeSingle();
          
        let lastProfessionalName = "Nenhum";
        let lastAppointmentDate = null;
        
        if (lastAppt) {
          lastAppointmentDate = lastAppt.start_time;
          if (lastAppt.professional_id) {
            const { data: prof } = await supabase
              .from("clinic_users")
              .select("name")
              .eq("id", lastAppt.professional_id)
              .maybeSingle();
            if (prof) {
              lastProfessionalName = prof.name;
            }
          }
        }
        
        setSmartPanelData({
          leadScore: patientData?.lead_score || 0,
          stage: patientData?.stage || "novo",
          tags: patientData?.tags || [],
          remainingSessions,
          pendingTransactionsTotal,
          lastProfessionalName,
          lastAppointmentDate
        });
      } catch (err) {
        console.error("Error loading smart panel info:", err);
      } finally {
        setLoadingSmartPanel(false);
      }
    };
    
    loadSmartPanelData();
  }, [patientId, open]);

  // Save/Update appointment details
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setError(null);

    const startObj = new Date(startTime);
    const endObj = new Date(endTime);

    if (endObj <= startObj) {
      setError("A hora de término deve ser após a hora de início.");
      setSaving(false);
      return;
    }

    try {
      const clinicId = accountId;
      const profileName = profile?.full_name || "Sistema";

      if (appointmentId) {
        // Update appointment
        const { error: updateErr } = await supabase
          .from("appointments")
          .update({
            patient_id: patientId || null,
            professional_id: professionalId || null,
            start_time: startObj.toISOString(),
            end_time: endObj.toISOString(),
            status,
            notes,
            type: procedureName || null,
            room_id: roomId || null,
            color: appointmentColor || null,
          })
          .eq("id", appointmentId);

        if (updateErr) throw updateErr;

        if (patientId) {
          // Log timeline
          const statusMap: Record<string, string> = {
            provisional: "Provisório",
            confirmed: "Confirmado",
            attended: "Realizado",
            cancelled: "Cancelado",
            no_show: "Não compareceu",
          };

          await supabase.from("patient_timeline").insert({
            patient_id: patientId,
            event_type: "appointment",
            title: `Agendamento atualizado para [${statusMap[status] || status}]`,
            payload: {
              updated_by: profileName,
              start_time: startObj.toISOString(),
            },
          });

          // Trigger notifications via API
          const professionalName = staff.find((s) => s.id === professionalId)?.name || "";
          const formattedDate = startObj.toLocaleDateString("pt-BR");
          const formattedTime = startObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

          let eventType = "agendamento_alterado";
          if (status !== originalStatus) {
            if (status === "confirmed") {
              eventType = "agendamento_confirmado";
            } else if (status === "cancelled") {
              eventType = "agendamento_cancelado";
            }
          }

          fetch("/api/whatsapp/trigger", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event_type: eventType,
              appointment_id: appointmentId,
              patient_id: patientId,
              metadata: {
                paciente: selectedPatientInfo?.name || "",
                phone: selectedPatientInfo?.phone || "",
                data: formattedDate,
                hora: formattedTime,
                profissional: professionalName,
                procedimento: procedureName,
              },
            }),
          }).catch((err) => console.error("Error triggering appointment update/status:", err));
        }

        // Trigger Google Calendar sync
        fetch("/api/integrations/google/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            appointmentId: appointmentId,
          }),
        }).catch((err) => console.error("Error syncing Google Calendar update:", err));

      } else {
        // Create appointment
        const { data: newAppt, error: createErr } = await supabase
          .from("appointments")
          .insert({
            clinic_id: clinicId,
            patient_id: patientId || null,
            professional_id: professionalId || null,
            start_time: startObj.toISOString(),
            end_time: endObj.toISOString(),
            status,
            notes,
            type: procedureName || null,
            room_id: roomId || null,
            color: appointmentColor || null,
          })
          .select("id")
          .single();

        if (createErr) throw createErr;

        if (patientId) {
          // Log timeline
          await supabase.from("patient_timeline").insert({
            patient_id: patientId,
            event_type: "appointment",
            title: `Nova consulta agendada para ${startObj.toLocaleDateString("pt-BR")} às ${startObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
            payload: {
              created_by: profileName,
              status,
            },
          });

          // Trigger created notification via API
          if (newAppt?.id) {
            const professionalName = staff.find((s) => s.id === professionalId)?.name || "";
            const formattedDate = startObj.toLocaleDateString("pt-BR");
            const formattedTime = startObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

            fetch("/api/whatsapp/trigger", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event_type: "agendamento_criado",
                appointment_id: newAppt.id,
                patient_id: patientId,
                metadata: {
                  paciente: selectedPatientInfo?.name || "",
                  phone: selectedPatientInfo?.phone || "",
                  data: formattedDate,
                  hora: formattedTime,
                  profissional: professionalName,
                  procedimento: procedureName,
                },
              }),
            }).catch((err) => console.error("Error triggering appointment_created:", err));
          }
        }

        // Trigger Google Calendar sync
        if (newAppt?.id) {
          fetch("/api/integrations/google/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create",
              appointmentId: newAppt.id,
            }),
          }).catch((err) => console.error("Error syncing Google Calendar create:", err));
        }
      }

      // Send WhatsApp message if checked
      if (sendWa && patientId) {
        const statusName = status === "confirmed" ? "Confirmado" : "Pendente";
        await supabase.from("patient_timeline").insert({
          patient_id: patientId,
          event_type: "whatsapp",
          title: "Confirmação de agendamento enviada automaticamente via WhatsApp",
          payload: {
            sent_by: profileName,
            phone: selectedPatientInfo?.phone,
            message: `Olá! Seu agendamento foi realizado para ${startObj.toLocaleDateString("pt-BR")} às ${startObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Status: ${statusName}.`,
          },
        });
      }

      onSave();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error saving appointment:", err);
      setError(err.message || "Erro ao salvar o agendamento.");
    } finally {
      setSaving(false);
    }
  };

  // Delete appointment
  const handleDelete = async () => {
    if (!appointmentId) return;
    if (!confirm("Tem certeza que deseja excluir este agendamento?")) return;

    setDeleting(true);
    setError(null);

    try {
      const { data } = await supabase
        .from("appointments")
        .select("patient_id")
        .eq("id", appointmentId)
        .single();
        
      const { error: deleteErr } = await supabase
        .from("appointments")
        .delete()
        .eq("id", appointmentId);

      if (deleteErr) throw deleteErr;

      if (data?.patient_id && profile) {
        await supabase.from("patient_timeline").insert({
          patient_id: data.patient_id,
          event_type: "appointment",
          title: "Agendamento excluído da agenda",
          payload: {
            deleted_by: profileName,
          },
        });
      }

      onSave();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error deleting appointment:", err);
      setError(err.message || "Erro ao excluir o agendamento.");
    } finally {
      setDeleting(false);
    }
  };

  // Generate & send selected document
  const handleSendSelectedDocuments = async () => {
    if (!patientId || !profile || selectedDocs.length === 0) return;

    setSaving(true);
    try {
      for (const templateId of selectedDocs) {
        const template = docTemplates.find((t) => t.id === templateId);
        if (!template) continue;

        const generatedToken = "doc_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        const { data: newDoc, error: docErr } = await supabase
          .from("documents")
          .insert({
            clinic_id: clinicId,
            patient_id: patientId,
            title: template.name,
            type: template.type || "contrato",
            template_id: template.id,
            status: "pending",
            sent_via: "whatsapp",
            sent_at: new Date().toISOString(),
            public_token: generatedToken,
            content: { text: `Este documento representa o termo de ${template.name}.` }
          })
          .select("*")
          .single();

        if (docErr) throw docErr;

        await supabase.from("patient_timeline").insert({
          patient_id: patientId,
          event_type: "document",
          title: `Documento [${template.name}] enviado via WhatsApp para assinatura`,
          payload: {
            template_id: template.id,
            sent_by: profileName,
            public_token: generatedToken,
          },
        });

        // WhatsApp simulated log
        const portalUrl = `${window.location.origin}/portal/documento/${generatedToken}`;
        await supabase.from("patient_timeline").insert({
          patient_id: patientId,
          event_type: "whatsapp",
          title: `Link de assinatura enviado via WhatsApp`,
          payload: {
            sent_by: profileName,
            phone: selectedPatientInfo?.phone,
            message: `Olá! Por favor, assine digitalmente o documento "${template.name}" acessando: ${portalUrl}`,
          },
        });
      }

      setSelectedDocs([]);
      alert("Documento(s) enviado(s) via WhatsApp com sucesso!");
      
      // Reload documents list
      const { data: docs } = await supabase
        .from("documents")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      setPatientDocs(docs || []);
      setPendingDocsCount((docs || []).filter((d) => d.status !== "signed").length);

    } catch (err: any) {
      console.error("Error sending documents:", err);
      alert("Erro ao enviar documentos: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDocSelect = (id: string) => {
    setSelectedDocs((prev) =>
      prev.includes(id) ? prev.filter((dId) => dId !== id) : [...prev, id]
    );
  };

  // Generate Document with OpenAI
  const handleGenerateAIDoc = async () => {
    if (!aiDocProcedure.trim() || !profile) {
      alert("Por favor, preencha o nome do procedimento.");
      return;
    }
    setAiGeneratingDoc(true);
    setAiGeneratedContent("");
    try {
      const generated = await generateAIDocument(
        aiDocProcedure,
        aiDocRisks,
        aiDocCuidados,
        aiDocNotes,
        aiDocType
      );
      setAiGeneratedContent(generated);
    } catch (err: any) {
      console.error(err);
      alert("Erro ao gerar documento por IA: " + err.message);
    } finally {
      setAiGeneratingDoc(false);
    }
  };

  // Save AI Document
  const handleSaveAIDoc = async () => {
    if (!aiGeneratedContent || !profile || !patientId) return;
    setIsSavingGeneratedDoc(true);
    try {
      const generatedToken = "doc_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const title = `${aiDocType.toUpperCase()} - ${aiDocProcedure}`;

      const { data: newDoc, error: docErr } = await supabase
        .from("documents")
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          title: title,
          type: aiDocType,
          status: "pending",
          sent_via: "whatsapp",
          sent_at: new Date().toISOString(),
          public_token: generatedToken,
          content: { text: aiGeneratedContent }
        })
        .select("*")
        .single();

      if (docErr) throw docErr;

      // Log in timeline
      await supabase.from("patient_timeline").insert({
        patient_id: patientId,
        event_type: "document",
        title: `Documento de IA [${title}] gerado e enviado para assinatura`,
        payload: {
          document_id: newDoc.id,
          sent_by: profileName,
          public_token: generatedToken,
        },
      });

      // Simulated WhatsApp sending
      const portalUrl = `${window.location.origin}/portal/documento/${generatedToken}`;
      await supabase.from("patient_timeline").insert({
        patient_id: patientId,
        event_type: "whatsapp",
        title: `Link de assinatura IA enviado via WhatsApp`,
        payload: {
          sent_by: profileName,
          phone: selectedPatientInfo?.phone,
          message: `Olá! Criamos o seu documento personalizado de "${aiDocProcedure}". Por favor, revise e assine digitalmente aqui: ${portalUrl}`,
        },
      });

      alert("Documento gerado por IA e enviado com sucesso!");
      setAiGeneratedContent("");
      setAiDocProcedure("");
      setAiDocRisks("");
      setAiDocCuidados("");
      setAiDocNotes("");
      
      // Reload documents
      const { data: docs } = await supabase
        .from("documents")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      setPatientDocs(docs || []);
      setPendingDocsCount((docs || []).filter((d) => d.status !== "signed").length);

    } catch (err: any) {
      console.error(err);
      alert("Erro ao salvar documento: " + err.message);
    } finally {
      setIsSavingGeneratedDoc(false);
    }
  };

  // Add EMR clinical evolution note
  const handleAddClinicalEvolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvolContent.trim() || !patientId || !profile) return;

    setEvolSaving(true);
    try {
      const { data: newEv, error: evErr } = await supabase
        .from("clinical_evolutions")
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          professional_id: user?.id,
          content: newEvolContent.trim(),
          signed: evolSigned,
          shared: evolShared,
        })
        .select()
        .single();

      if (evErr) throw evErr;

      // Add to timeline
      await supabase.from("patient_timeline").insert({
        patient_id: patientId,
        event_type: "evolution_added",
        title: evolSigned ? "Nova evolução clínica assinada" : "Evolução adicionada como rascunho",
        payload: {
          professional: profileName,
          signed: evolSigned,
        },
      });

      setNewEvolContent("");
      
      // Reload clinical notes
      const { data: evolData } = await supabase
        .from("clinical_evolutions")
        .select(`
          id,
          created_at,
          content,
          signed,
          shared,
          clinic_users (
            name
          )
        `)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      
      setClinicalEvolutions((evolData || []).map(ev => ({
        id: ev.id,
        created_at: ev.created_at,
        content: ev.content,
        signed: ev.signed,
        shared: ev.shared,
        professional_name: (Array.isArray(ev.clinic_users) ? ev.clinic_users[0]?.name : (ev.clinic_users as any)?.name) || "Profissional"
      })));

    } catch (err: any) {
      console.error(err);
      alert("Erro ao adicionar evolução clínica: " + err.message);
    } finally {
      setEvolSaving(false);
    }
  };

  // Save new Body Evaluation
  const handleSaveBodyEval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !profile) return;

    const w = parseFloat(evalWeight);
    const h = parseFloat(evalHeight);
    const calculatedImc = w && h ? Number((w / (h * h)).toFixed(1)) : null;

    setSavingBodyEval(true);
    try {
      const { error: evalErr } = await supabase
        .from("body_evaluations")
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          evaluation_date: evalDate,
          weight: w || null,
          height: h || null,
          arm_right: parseFloat(evalArmRight) || null,
          arm_left: parseFloat(evalArmLeft) || null,
          abdomen: parseFloat(evalAbdomen) || null,
          waist: parseFloat(evalWaist) || null,
          hip: parseFloat(evalHip) || null,
          thigh_right: parseFloat(evalThighRight) || null,
          thigh_left: parseFloat(evalThighLeft) || null,
          calf_right: parseFloat(evalCalfRight) || null,
          calf_left: parseFloat(evalCalfLeft) || null,
          fat_percentage: parseFloat(evalFatPercentage) || null,
          imc: calculatedImc,
          notes: evalNotes.trim() || null
        });

      if (evalErr) throw evalErr;

      // Add to timeline
      await supabase.from("patient_timeline").insert({
        patient_id: patientId,
        event_type: "body_evaluation",
        title: `Nova avaliação corporal registrada (${evalWeight} kg)`,
        payload: {
          weight: w,
          fat_percentage: parseFloat(evalFatPercentage) || null,
          imc: calculatedImc,
          created_by: profileName,
        },
      });

      // Reset fields
      setEvalWeight("");
      setEvalHeight("");
      setEvalArmRight("");
      setEvalArmLeft("");
      setEvalAbdomen("");
      setEvalWaist("");
      setEvalHip("");
      setEvalThighRight("");
      setEvalThighLeft("");
      setEvalCalfRight("");
      setEvalCalfLeft("");
      setEvalFatPercentage("");
      setEvalNotes("");

      // Reload body evaluations list
      const { data: evalData } = await supabase
        .from("body_evaluations")
        .select("*")
        .eq("patient_id", patientId)
        .order("evaluation_date", { ascending: true });
      setBodyEvaluations(evalData || []);

      alert("Avaliação corporal salva com sucesso!");

    } catch (err: any) {
      console.error(err);
      alert("Erro ao salvar avaliação corporal: " + err.message);
    } finally {
      setSavingBodyEval(false);
    }
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!newPatientName.trim() || !newPatientPhone.trim()) {
      setNewPatientError("Nome e Telefone são campos obrigatórios.");
      return;
    }

    setSavingNewPatient(true);
    setNewPatientError(null);

    try {
      const cleanPhone = newPatientPhone.replace(/\D/g, "");
      
      // Verify existence by phone
      const { data: existing } = await supabase
        .from("patients")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("phone", cleanPhone)
        .maybeSingle();

      if (existing) {
        throw new Error("Já existe um paciente cadastrado com este telefone.");
      }

      // Insert new patient
      const { data: newPatient, error: insertErr } = await supabase
        .from("patients")
        .insert({
          clinic_id: clinicId,
          name: newPatientName.trim(),
          phone: cleanPhone,
          email: newPatientEmail.trim() || null,
          lead_score: 50,
          tags: ["membro-novo"],
          stage: "novo",
        })
        .select("id, name, phone, email")
        .single();

      if (insertErr) throw insertErr;

      // Insert timeline log
      if (newPatient) {
        await supabase.from("patient_timeline").insert({
          patient_id: newPatient.id,
          event_type: "lead_created",
          title: `Paciente cadastrado no CRM via formulário de agendamento`,
          payload: {
            created_by: profileName,
          },
        });
      }

      setPatients((prev) => [...prev, newPatient].sort((a, b) => a.name.localeCompare(b.name)));
      setPatientId(newPatient.id);

      setNewPatientName("");
      setNewPatientPhone("");
      setNewPatientEmail("");
      setShowNewPatientForm(false);

    } catch (err: any) {
      console.error("Error creating new patient:", err);
      setNewPatientError(err.message || "Erro ao cadastrar o paciente.");
    } finally {
      setSavingNewPatient(false);
    }
  };

  const getPatientNameParts = () => {
    if (!selectedPatientInfo?.name) return { firstName: "Novo", lastName: "Paciente" };
    const parts = selectedPatientInfo.name.trim().split(" ");
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" ") || "",
    };
  };

  const { firstName, lastName } = getPatientNameParts();

  // Search filtered patients list
  const filteredPatients = searchQuery.trim() === ""
    ? patients.slice(0, 15) // Limit initial list for clean UI
    : patients.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.phone && p.phone.includes(searchQuery)) ||
        (p.email && p.email.toLowerCase().includes(searchQuery.toLowerCase()))
      );

  // Auto calculate IMC for display
  const wNum = parseFloat(evalWeight);
  const hNum = parseFloat(evalHeight);
  const currentCalculatedImc = wNum && hNum ? (wNum / (hNum * hNum)).toFixed(1) : "";

  // Render SVG interactive line chart
  const renderSvgChart = () => {
    if (bodyEvaluations.length < 2) {
      return (
        <div className="flex flex-col items-center justify-center py-8 bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
          <TrendingUpIcon className="h-6 w-6 text-neutral-400 mb-1" />
          <p className="text-xs text-neutral-500 font-medium">Histórico insuficiente</p>
          <p className="text-[10px] text-neutral-400 text-center px-4">Cadastre pelo menos 2 avaliações corporais para visualizar o gráfico de evolução.</p>
        </div>
      );
    }

    const width = 500;
    const height = 180;
    const paddingX = 40;
    const paddingY = 25;

    const points = bodyEvaluations.map(e => {
      let val = 0;
      if (selectedChartMetric === "weight") val = Number(e.weight) || 0;
      else if (selectedChartMetric === "fat_percentage") val = Number(e.fat_percentage) || 0;
      else if (selectedChartMetric === "waist") val = Number(e.waist) || 0;
      else if (selectedChartMetric === "hip") val = Number(e.hip) || 0;
      return {
        date: new Date(e.evaluation_date),
        val: val
      };
    });

    const vals = points.map(p => p.val);
    const minVal = Math.min(...vals) * 0.95;
    const maxVal = Math.max(...vals) * 1.05;
    const valRange = maxVal - minVal || 1;

    const minDate = points[0].date.getTime();
    const maxDate = points[points.length - 1].date.getTime();
    const dateRange = maxDate - minDate || 1;

    const svgPoints = points.map(p => {
      const x = paddingX + ((p.date.getTime() - minDate) / dateRange) * (width - 2 * paddingX);
      const y = height - paddingY - ((p.val - minVal) / valRange) * (height - 2 * paddingY);
      return { x, y, val: p.val, label: p.date.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }) };
    });

    const linePath = svgPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return (
      <div className="space-y-3 text-left">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Métrica do Gráfico de Progresso</label>
          <select
            value={selectedChartMetric}
            onChange={(e) => setSelectedChartMetric(e.target.value as any)}
            className="text-xs rounded-lg border border-neutral-200 bg-white px-2 py-1 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="weight">Peso (kg)</option>
            <option value="fat_percentage">Gordura (%)</option>
            <option value="waist">Cintura (cm)</option>
            <option value="hip">Quadril (cm)</option>
          </select>
        </div>

        <div className="bg-white border border-neutral-100 rounded-xl p-3 shadow-inner overflow-visible">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
            {/* Grid lines */}
            <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#f3f4f6" strokeDasharray="3" />
            <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="#f3f4f6" strokeDasharray="3" />
            <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#e5e7eb" />

            {/* Line Path */}
            <path d={linePath} fill="none" stroke="#9333ea" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

            {/* Data Points */}
            {svgPoints.map((p, idx) => (
              <g key={idx} className="group cursor-pointer">
                <circle cx={p.x} cy={p.y} r="5" fill="#a855f7" stroke="#ffffff" strokeWidth="2" className="transition-all hover:scale-125" />
                <text x={p.x} y={p.y - 12} textAnchor="middle" className="text-[10px] font-black fill-blue-800 opacity-0 group-hover:opacity-100 transition-opacity duration-250 bg-white px-1 py-0.5 rounded shadow">
                  {p.val}
                </text>
                <text x={p.x} y={height - 8} textAnchor="middle" className="text-[8px] fill-neutral-400 font-semibold">
                  {p.label}
                </text>
              </g>
            ))}

            {/* Y Axis Labels */}
            <text x={5} y={paddingY + 4} className="text-[8px] fill-neutral-400 font-black">{maxVal.toFixed(1)}</text>
            <text x={5} y={height - paddingY + 4} className="text-[8px] fill-neutral-400 font-black">{minVal.toFixed(1)}</text>
          </svg>
        </div>
      </div>
    );
  };

  const getInitials = (nameStr: string) => {
    const parts = nameStr.trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
    }
    return nameStr.slice(0, 2).toUpperCase();
  };

  const renderStaffSelector = () => {
    const selectedStaffObj = staff.find((s) => s.id === professionalId);
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsStaffDropdownOpen(!isStaffDropdownOpen)}
          className="w-full flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-10"
          disabled={saving}
        >
          {selectedStaffObj ? (
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-[10px] font-black text-blue-700 uppercase shrink-0">
                {getInitials(selectedStaffObj.name)}
              </div>
              <span className="font-semibold text-neutral-800 text-xs">{selectedStaffObj.name}</span>
            </div>
          ) : (
            <span className="text-neutral-400 font-semibold text-xs">Selecione o profissional...</span>
          )}
          <ChevronDownIcon className="h-4 w-4 text-neutral-400" />
        </button>

        {isStaffDropdownOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsStaffDropdownOpen(false)} />
            <div className="absolute top-full left-0 right-0 mt-1.5 z-50 max-h-52 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl divide-y divide-neutral-50">
              {staff.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setProfessionalId(s.id);
                    setIsStaffDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold hover:bg-neutral-50 transition-colors",
                    professionalId === s.id && "bg-blue-50/50 text-blue-600"
                  )}
                >
                  <div className="h-6 w-6 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-[10px] font-black text-blue-700 uppercase shrink-0">
                    {getInitials(s.name)}
                  </div>
                  <span className="flex-1 truncate">{s.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "bg-white text-neutral-800 transition-all duration-300 overflow-hidden flex flex-col p-0",
        (apptType === "evento" || apptType === "bloqueio") 
          ? "sm:max-w-md p-6 rounded-2xl"
          : (patientId ? "sm:max-w-5xl h-[90vh] rounded-2xl shadow-2xl border border-neutral-100" : "sm:max-w-md p-6 rounded-2xl")
      )}>
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-20 min-h-[300px]">
            <Loader2Icon className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (appointmentId && (apptType === "evento" || apptType === "bloqueio")) ? (
          /* Simplified modal layout for blocks and events */
          <div className="space-y-4 text-left">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-neutral-900">
                {apptType === "evento" ? "Criar Novo Evento" : "Criar Bloqueio de Agenda"}
              </DialogTitle>
              <DialogDescription className="text-sm text-neutral-500">
                Preencha os detalhes do horário reservado na agenda.
              </DialogDescription>
            </DialogHeader>

            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <form id="appt-modal-form" onSubmit={handleSave} className="space-y-4 text-left pt-2">
              {/* Title */}
              <div className="space-y-1">
                <Label htmlFor="evt-title" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">
                  {apptType === "evento" ? "Título do Evento *" : "Motivo do Bloqueio *"}
                </Label>
                <Input
                  id="evt-title"
                  type="text"
                  required
                  value={procedureName}
                  onChange={(e) => setProcedureName(e.target.value)}
                  placeholder={apptType === "evento" ? "Ex: Reunião Geral de Equipe" : "Ex: Horário de Almoço"}
                  className="rounded-xl border-neutral-200 h-10 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs"
                />
              </div>

              {/* Professional Custom Selector */}
              <div className="space-y-1">
                <Label className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Profissional *</Label>
                {renderStaffSelector()}
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="evt-start" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Início *</Label>
                  <Input
                    id="evt-start"
                    type="datetime-local"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="rounded-xl border-neutral-200 h-10 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="evt-end" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Término *</Label>
                  <Input
                    id="evt-end"
                    type="datetime-local"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="rounded-xl border-neutral-200 h-10 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label htmlFor="evt-notes" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Observações</Label>
                <Textarea
                  id="evt-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas ou observações sobre este período..."
                  className="rounded-xl border-neutral-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs"
                  rows={3}
                />
              </div>

              {/* Color Picker */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-wider">Cor na Agenda</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { color: "#3ba2e8", label: "Azul" },
                    { color: "#4caf50", label: "Verde" },
                    { color: "#e05b5c", label: "Vermelho" },
                    { color: "#dfab01", label: "Amarelo" },
                    { color: "#8b5cf6", label: "Violeta" },
                    { color: "#f97316", label: "Laranja" },
                    { color: "#ec4899", label: "Rosa" },
                    { color: "#14b8a6", label: "Teal" },
                    { color: "#6b7280", label: "Cinza" },
                    { color: "#0f172a", label: "Preto" },
                  ].map(({ color, label }) => (
                    <button
                      key={color}
                      type="button"
                      title={label}
                      onClick={() => setAppointmentColor(appointmentColor === color ? null : color)}
                      className={`h-7 w-7 rounded-full transition-all border-2 ${
                        appointmentColor === color
                          ? "border-blue-600 scale-110 shadow-md"
                          : "border-transparent hover:scale-105 hover:border-neutral-300"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <label title="Cor personalizada" className="h-7 w-7 rounded-full border-2 border-dashed border-neutral-300 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-all overflow-hidden relative">
                    <input
                      type="color"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => setAppointmentColor(e.target.value)}
                    />
                    <span className="text-[10px] text-neutral-400 select-none">+</span>
                  </label>
                </div>
              </div>

              <DialogFooter className="flex justify-end gap-2 pt-2">
                <DialogClose render={<Button variant="outline" className="text-xs h-9 rounded-lg" />}>
                  Cancelar
                </DialogClose>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 font-bold rounded-lg px-4"
                >
                  {saving ? <Loader2Icon className="h-4 w-4 animate-spin mr-2" /> : "Salvar na Agenda"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        ) : !patientId ? (
          showNewPatientForm ? (
            /* Sub-view: Register New Patient */
            <div className="space-y-4 text-left">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-neutral-900">Cadastrar Novo Paciente</DialogTitle>
                <DialogDescription className="text-sm text-neutral-500">
                  Preencha os dados do paciente para cadastrá-lo e iniciar o agendamento.
                </DialogDescription>
              </DialogHeader>

              {newPatientError && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-xs">{newPatientError}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleCreatePatient} className="space-y-3.5 py-2 text-left">
                <div className="space-y-1">
                  <Label htmlFor="new-pt-name" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Nome Completo *</Label>
                  <Input
                    id="new-pt-name"
                    type="text"
                    placeholder="Nome completo do paciente..."
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    required
                    disabled={savingNewPatient}
                    className="rounded-xl border-neutral-200 h-10 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new-pt-phone" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">WhatsApp / Celular *</Label>
                  <Input
                    id="new-pt-phone"
                    type="tel"
                    placeholder="Ex: 11999999999"
                    value={newPatientPhone}
                    onChange={(e) => setNewPatientPhone(e.target.value)}
                    required
                    disabled={savingNewPatient}
                    className="rounded-xl border-neutral-200 h-10 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new-pt-email" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">E-mail (Opcional)</Label>
                  <Input
                    id="new-pt-email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={newPatientEmail}
                    onChange={(e) => setNewPatientEmail(e.target.value)}
                    disabled={savingNewPatient}
                    className="rounded-xl border-neutral-200 h-10 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowNewPatientForm(false);
                      setNewPatientError(null);
                    }}
                    disabled={savingNewPatient}
                    className="text-xs h-9 rounded-lg"
                  >
                    Voltar
                  </Button>
                  <Button
                    type="submit"
                    disabled={savingNewPatient}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 rounded-lg px-4 font-bold"
                  >
                    {savingNewPatient ? (
                      <>
                        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                        Cadastrando...
                      </>
                    ) : (
                      "Cadastrar e Selecionar"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            /* Initial view: Patient Picker / Search */
            <div className="space-y-4 text-left">
              <DialogHeader>
                <DialogTitle className="text-xl font-black text-neutral-900">Novo Agendamento</DialogTitle>
              </DialogHeader>

              {/* Type Tabs */}
              <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-1 gap-1">
                {([
                  { key: "consulta", label: "Agendamento", emoji: "📅" },
                  { key: "evento",   label: "Evento",       emoji: "🎯" },
                  { key: "bloqueio", label: "Bloqueio",     emoji: "🚫" },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setApptType(tab.key);
                      setAppointmentColor(null);
                    }}
                    className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                      apptType === tab.key
                        ? "bg-white shadow-sm text-blue-700 border border-blue-100"
                        : "text-neutral-500 hover:text-neutral-800"
                    }`}
                  >
                    <span className="mr-1">{tab.emoji}</span>{tab.label}
                  </button>
                ))}
              </div>

              {/* Color Picker */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-wider">Cor na Agenda</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { color: "#3ba2e8", label: "Azul" },
                    { color: "#4caf50", label: "Verde" },
                    { color: "#e05b5c", label: "Vermelho" },
                    { color: "#dfab01", label: "Amarelo" },
                    { color: "#8b5cf6", label: "Violeta" },
                    { color: "#f97316", label: "Laranja" },
                    { color: "#ec4899", label: "Rosa" },
                    { color: "#14b8a6", label: "Teal" },
                    { color: "#6b7280", label: "Cinza" },
                    { color: "#0f172a", label: "Preto" },
                  ].map(({ color, label }) => (
                    <button
                      key={color}
                      type="button"
                      title={label}
                      onClick={() => setAppointmentColor(appointmentColor === color ? null : color)}
                      className={`h-7 w-7 rounded-full transition-all border-2 ${
                        appointmentColor === color
                          ? "border-blue-600 scale-110 shadow-md"
                          : "border-transparent hover:scale-105 hover:border-neutral-300"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  {/* Custom color input */}
                  <label title="Cor personalizada" className="h-7 w-7 rounded-full border-2 border-dashed border-neutral-300 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-all overflow-hidden relative">
                    <input
                      type="color"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => setAppointmentColor(e.target.value)}
                    />
                    <span className="text-[10px] text-neutral-400 select-none">+</span>
                  </label>
                </div>
                {appointmentColor && (
                  <p className="text-[10px] text-neutral-400 flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full border border-neutral-200" style={{ backgroundColor: appointmentColor }} />
                    Cor selecionada: <span className="font-mono">{appointmentColor}</span>
                    <button type="button" onClick={() => setAppointmentColor(null)} className="text-neutral-400 hover:text-red-500 ml-1 font-black">✕</button>
                  </p>
                )}
              </div>

              {/* For Evento/Bloqueio: show quick form inline */}
              {(apptType === "evento" || apptType === "bloqueio") ? (
                <form id="appt-modal-form" onSubmit={handleSave} className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="quick-title" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">
                      {apptType === "evento" ? "Título do Evento *" : "Motivo do Bloqueio *"}
                    </Label>
                    <Input
                      id="quick-title"
                      type="text"
                      required
                      value={procedureName}
                      onChange={(e) => setProcedureName(e.target.value)}
                      placeholder={apptType === "evento" ? "Ex: Reunião Geral de Equipe" : "Ex: Horário de Almoço"}
                      className="rounded-xl border-neutral-200 h-10 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Profissional *</Label>
                    {renderStaffSelector()}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="quick-start" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Início *</Label>
                      <Input
                        id="quick-start"
                        type="datetime-local"
                        required
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="rounded-xl border-neutral-200 h-10 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="quick-end" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Término *</Label>
                      <Input
                        id="quick-end"
                        type="datetime-local"
                        required
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="rounded-xl border-neutral-200 h-10 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="quick-notes" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Observações</Label>
                    <Textarea
                      id="quick-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notas sobre este horário..."
                      className="rounded-xl border-neutral-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs"
                      rows={2}
                    />
                  </div>
                  {error && (
                    <Alert variant="destructive" className="py-2">
                      <AlertDescription className="text-xs">{error}</AlertDescription>
                    </Alert>
                  )}
                  <DialogFooter className="flex justify-end gap-2 pt-2">
                    <DialogClose render={<Button variant="outline" className="text-xs h-9 rounded-lg" />}>Cancelar</DialogClose>
                    <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 font-bold rounded-lg px-4">
                      {saving ? <Loader2Icon className="h-4 w-4 animate-spin mr-2" /> : null}
                      {saving ? "Salvando..." : (apptType === "evento" ? "Criar Evento" : "Bloquear Horário")}
                    </Button>
                  </DialogFooter>
                </form>
              ) : (
                /* Consulta: show patient search */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="search-pt" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Pesquisar Paciente</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewPatientForm(true);
                        setNewPatientError(null);
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 transition-all"
                    >
                      <UserPlusIcon className="h-3.5 w-3.5" /> + Cadastrar Novo
                    </button>
                  </div>

                  <div className="relative">
                    <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                    <Input
                      id="search-pt"
                      type="text"
                      placeholder="Digite nome, e-mail ou telefone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="rounded-xl border-neutral-200 pl-10 h-10 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div className="max-h-[240px] overflow-y-auto divide-y divide-neutral-100 border border-neutral-100 rounded-xl bg-neutral-50/50 shadow-inner">
                    {filteredPatients.length === 0 ? (
                      <p className="text-xs text-neutral-400 italic p-6 text-center">Nenhum paciente cadastrado encontrado.</p>
                    ) : (
                      filteredPatients.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPatientId(p.id)}
                          className="w-full text-left p-3 hover:bg-blue-50/50 flex items-center justify-between gap-3 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black shrink-0">
                              {p.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-neutral-800 truncate">{p.name}</p>
                              <p className="text-[10px] text-neutral-500 truncate">
                                {p.phone ? p.phone.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, "+$1 ($2) $3-$4") : "Sem Telefone"}
                                {p.email ? ` • ${p.email}` : ""}
                              </p>
                            </div>
                          </div>
                          <ChevronRightIcon className="h-4 w-4 text-neutral-400 shrink-0" />
                        </button>
                      ))
                    )}
                  </div>

                  <DialogFooter className="flex justify-end pt-2">
                    <DialogClose render={<Button variant="outline" className="text-xs h-9 rounded-lg" />}>
                      Cancelar
                    </DialogClose>
                  </DialogFooter>
                </div>
              )}
            </div>
          )
        ) : (
          /* Expanded Panel layout: Tabbed content + Smart panel */
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header: Patient Profile info */}
            <header className="bg-[#0B1528] text-white p-5 shrink-0 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-blue-900/40">
              <div className="flex items-center gap-4">
                {/* Photo/Avatar circle */}
                <div className="h-14 w-14 rounded-full bg-blue-600 border-2 border-blue-400 text-white flex items-center justify-center text-lg font-black shadow-inner shrink-0">
                  {firstName.charAt(0).toUpperCase()}
                  {lastName.charAt(0).toUpperCase()}
                </div>

                <div className="space-y-0.5 text-left min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <h2 className="text-lg font-extrabold tracking-tight truncate">
                      {firstName} <span className="font-medium text-neutral-300">{lastName}</span>
                    </h2>
                    
                    {/* Documents Alert status badge */}
                    {pendingDocsCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] text-rose-400 font-bold border border-rose-500/20">
                        <BadgeAlertIcon className="h-3 w-3" />
                        {pendingDocsCount} Assinatura{pendingDocsCount > 1 ? "s" : ""} Pendente{pendingDocsCount > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] text-emerald-400 font-bold border border-emerald-500/20">
                        <CheckCircle2Icon className="h-3 w-3" />
                        Tudo Assinado
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-neutral-400 font-semibold flex-wrap">
                    {selectedPatientInfo?.phone && (
                      <a
                        href={`https://wa.me/${selectedPatientInfo.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-emerald-400 transition-colors flex items-center gap-1 text-emerald-500"
                        title="Iniciar conversa no WhatsApp"
                      >
                        <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.528 2.028 14.066 1.03 11.453 1.03c-5.442 0-9.866 4.372-9.87 9.802 0 1.698.455 3.355 1.32 4.822l-1.006 3.677 3.75-.977z"/>
                        </svg>
                        {selectedPatientInfo.phone}
                      </a>
                    )}
                    {selectedPatientInfo?.email && (
                      <span className="truncate max-w-[180px]">{selectedPatientInfo.email}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation Tabs headers */}
              <nav className="flex flex-wrap gap-1.5 self-center">
                {[
                  { id: "details", label: "Agendamento", icon: CalendarDaysIcon },
                  { id: "history", label: "Histórico", icon: ClockIcon },
                  { id: "documents", label: "Documentos", icon: FileTextIcon },
                  { id: "financial", label: "Financeiro", icon: DollarSignIcon },
                  { id: "prontuario", label: "Prontuário", icon: UserIcon },
                ].map((tb) => {
                  const Icon = tb.icon;
                  const isActive = activeTab === tb.id;
                  return (
                    <button
                      key={tb.id}
                      type="button"
                      onClick={() => setActiveTab(tb.id as any)}
                      className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all ${
                        isActive
                          ? "bg-blue-600 text-white shadow-md"
                          : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {tb.label}
                    </button>
                  );
                })}
              </nav>
            </header>

            {/* Split panel Content body */}
            <div className="flex-1 flex overflow-hidden min-h-0 bg-neutral-50/25">
              {/* Main Tab Area (Left - 65% width) */}
              <div className="flex-1 overflow-y-auto p-6 bg-white min-w-0">
                {error && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription className="text-xs">{error}</AlertDescription>
                  </Alert>
                )}

                {loadingDetails ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2Icon className="h-7 w-7 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <>
                    {/* Tab: DETAILS (Forms) */}
                    {activeTab === "details" && (
                      <div className="space-y-4">
                        {/* Active Packages Indicator Banner */}
                        {patientPackages.filter(p => p.status === 'active').length > 0 && (
                          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-left shadow-xs">
                            <p className="text-xs font-black text-blue-900 flex items-center gap-1.5 mb-2">
                              <PackageIcon className="h-4 w-4 text-blue-700 animate-pulse" />
                              Pacotes de Sessões Ativos
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {patientPackages.filter(p => p.status === 'active').map(pkg => (
                                <div key={pkg.id} className="bg-white/80 border border-blue-100/50 rounded-lg p-2.5 flex flex-col text-[10px] text-blue-900 font-semibold space-y-0.5">
                                  <span className="font-extrabold text-neutral-800 text-xs">{pkg.name}</span>
                                  <span>Total de Sessões: {pkg.total}</span>
                                  <span>Sessões Consumidas: {pkg.used}</span>
                                  <span className="text-blue-700 font-bold">Restantes: {pkg.total - pkg.used}</span>
                                  <span className="text-neutral-400 font-medium text-[9px] mt-1 uppercase">Validade: {pkg.expires ? new Date(pkg.expires).toLocaleDateString("pt-BR") : "Sem expiração"}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <form id="appt-modal-form" onSubmit={handleSave} className="space-y-4">
                          {/* Professional selector */}
                          <div className="space-y-1 text-left">
                            <Label className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Profissional *</Label>
                            {renderStaffSelector()}
                          </div>

                          {/* Date and Times */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1 text-left">
                              <Label htmlFor="det-start" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Início *</Label>
                              <Input
                                id="det-start"
                                type="datetime-local"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                required
                                disabled={saving}
                                className="rounded-xl border-neutral-200 h-10 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              />
                            </div>
                            <div className="space-y-1 text-left">
                              <Label htmlFor="det-end" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Término *</Label>
                              <Input
                                id="det-end"
                                type="datetime-local"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                required
                                disabled={saving}
                                className="rounded-xl border-neutral-200 h-10 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              />
                            </div>
                          </div>

                          {/* Procedure and Room Selector */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1 text-left">
                              <Label htmlFor="det-procedure" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Procedimento / Serviço</Label>
                              <select
                                id="det-procedure"
                                value={procedureName}
                                onChange={(e) => {
                                  setProcedureName(e.target.value);
                                  setAiDocProcedure(e.target.value);
                                }}
                                className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                disabled={saving}
                              >
                                <option value="">Selecione...</option>
                                {procedures.map((p) => (
                                  <option key={p.id} value={p.name}>
                                    {p.name}
                                  </option>
                                ))}
                                {procedures.length === 0 && (
                                  <>
                                    <option value="Mentoria de Negócios">Mentoria de Negócios</option>
                                    <option value="Consultoria Operacional">Consultoria Operacional</option>
                                    <option value="Configuração de Funil CRM">Configuração de Funil CRM</option>
                                    <option value="Integração WhatsApp API">Integração WhatsApp API</option>
                                    <option value="Atendimento Avulso">Atendimento Avulso</option>
                                  </>
                                )}
                              </select>
                            </div>
                            <div className="space-y-1 text-left">
                              <Label htmlFor="det-room" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Sala / Mesa de Atendimento</Label>
                              <select
                                id="det-room"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                disabled={saving}
                              >
                                <option value="">Selecione...</option>
                                {rooms.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                                {rooms.length === 0 && (
                                  <>
                                    <option value="Sala Principal">Sala Principal</option>
                                    <option value="Sala de Reuniões">Sala de Reuniões</option>
                                    <option value="Estação de Trabalho A">Estação de Trabalho A</option>
                                  </>
                                )}
                              </select>
                            </div>
                          </div>

                          {/* Status selector */}
                          <div className="space-y-1 text-left">
                            <Label htmlFor="det-status" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Status da Consulta</Label>
                            <select
                              id="det-status"
                              value={status}
                              onChange={(e) => setStatus(e.target.value)}
                              className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              disabled={saving}
                            >
                              <option value="provisional">Provisório (Pendente)</option>
                              <option value="confirmed">Confirmado</option>
                              <option value="attended">Realizado</option>
                              <option value="cancelled">Cancelado</option>
                              <option value="no_show">Não compareceu</option>
                            </select>
                          </div>

                          {/* Notes */}
                          <div className="space-y-1 text-left">
                            <Label htmlFor="det-notes" className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Observações</Label>
                            <Textarea
                              id="det-notes"
                              placeholder="Detalhes adicionais da consulta..."
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              rows={3}
                              disabled={saving}
                              className="rounded-xl border-neutral-200 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                          </div>

                          {/* Toggle to send auto notification message */}
                          <div className="flex items-center justify-between rounded-xl border border-neutral-100 p-3.5 bg-neutral-50/50 mt-4">
                            <div className="text-left">
                              <p className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                Notificar paciente automaticamente no WhatsApp
                              </p>
                              <p className="text-[10px] text-neutral-500 mt-0.5">
                                O paciente receberá uma mensagem com a data, hora e status da consulta assim que salvar o agendamento.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSendWa(!sendWa)}
                              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                                sendWa ? "bg-blue-600" : "bg-neutral-300"
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
                                  sendWa ? "translate-x-4" : ""
                                }`}
                              />
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Tab: HISTORY (Appointments timeline & statistics) */}
                    {activeTab === "history" && (
                      <div className="space-y-5 text-left">
                        {/* Statistics Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                          <div className="text-left">
                            <span className="text-[9px] text-neutral-400 font-extrabold uppercase block">Agendamentos</span>
                            <span className="text-lg font-black text-neutral-800">{historyStats.total}</span>
                          </div>
                          <div className="text-left">
                            <span className="text-[9px] text-neutral-400 font-extrabold uppercase block">Realizados</span>
                            <span className="text-lg font-black text-emerald-600">{historyStats.attended}</span>
                          </div>
                          <div className="text-left">
                            <span className="text-[9px] text-neutral-400 font-extrabold uppercase block">Não Compareceu</span>
                            <span className="text-lg font-black text-amber-600">{historyStats.noShow}</span>
                          </div>
                          <div className="text-left">
                            <span className="text-[9px] text-neutral-400 font-extrabold uppercase block">Cancelados</span>
                            <span className="text-lg font-black text-rose-600">{historyStats.cancelled}</span>
                          </div>
                        </div>

                        <div className="space-y-1 bg-neutral-50/50 p-3 rounded-lg border border-neutral-100 text-[10px] text-neutral-600 font-semibold">
                          <p><span className="text-neutral-400 font-medium">Último profissional de atendimento:</span> {historyStats.lastProf}</p>
                          <p><span className="text-neutral-400 font-medium">Último serviço realizado:</span> {historyStats.lastProc}</p>
                        </div>

                        <h3 className="text-xs font-black text-neutral-700 uppercase tracking-wider mb-2">Histórico de Consultas</h3>
                        {patientAppointments.length === 0 ? (
                          <p className="text-xs text-neutral-400 italic">Nenhum agendamento anterior registrado.</p>
                        ) : (
                          <div className="border-l-2 border-neutral-200 pl-4 space-y-4">
                            {patientAppointments.map((appt) => {
                              const sTime = new Date(appt.start_time);
                              const formattedDate = sTime.toLocaleDateString("pt-BR", {
                                weekday: "long",
                                day: "2-digit",
                                month: "long",
                                year: "numeric",
                              });
                              const formattedTime = sTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                              
                              let statusBadge = "bg-neutral-100 text-neutral-600";
                              if (appt.status === "confirmed") statusBadge = "bg-emerald-50 text-emerald-700 border border-emerald-100";
                              if (appt.status === "cancelled") statusBadge = "bg-rose-50 text-rose-700 border border-rose-100 line-through";
                              if (appt.status === "attended") statusBadge = "bg-blue-50 text-blue-700 border border-blue-100";
                              if (appt.status === "no_show") statusBadge = "bg-amber-50 text-amber-700 border border-amber-100";

                              return (
                                <div key={appt.id} className="relative space-y-1.5 pb-1">
                                  {/* Point indicator */}
                                  <div className="absolute -left-[22px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-neutral-400 z-10" />
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-xs font-bold text-neutral-800 capitalize">
                                      {formattedDate} às {formattedTime}
                                    </span>
                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${statusBadge}`}>
                                      {appt.status}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-neutral-500">
                                    <span className="font-semibold">Profissional:</span> {(Array.isArray(appt.clinic_users) ? appt.clinic_users[0]?.name : (appt.clinic_users as any)?.name) || "Não atribuído"} | <span className="font-semibold">Procedimento:</span> {appt.type || "Consulta"}
                                  </p>
                                  {appt.notes && (
                                    <p className="text-[10px] bg-neutral-50 border border-neutral-100 rounded-lg p-2 italic text-neutral-600">
                                      {appt.notes}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab: DOCUMENTS (Templates checklist & AI document generator) */}
                    {activeTab === "documents" && (
                      <div className="space-y-6 text-left">
                        {/* Templates Checklist & Send */}
                        <div className="space-y-3 border border-neutral-200/80 rounded-xl p-4 bg-neutral-50/10 shadow-xs">
                          <h4 className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                            <SendIcon className="h-3.5 w-3.5 text-blue-600" />
                            Enviar Termo / Contrato Existente
                          </h4>
                          <p className="text-[10px] text-neutral-500">Marque as opções para gerar e enviar links de assinatura digital via WhatsApp do cliente.</p>
                          
                          {docTemplates.length === 0 ? (
                            <p className="text-xs text-neutral-400 italic">Nenhum template cadastrado no sistema.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                              {docTemplates.map((t) => (
                                <label key={t.id} className="flex items-center gap-2 text-xs text-neutral-700 bg-white border border-neutral-100 hover:border-blue-200 hover:bg-blue-50/10 rounded-lg p-2 cursor-pointer transition-colors shadow-xs">
                                  <input
                                    type="checkbox"
                                    checked={selectedDocs.includes(t.id)}
                                    onChange={() => handleToggleDocSelect(t.id)}
                                    className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                                  />
                                  <span className="truncate flex-1 font-semibold">{t.name}</span>
                                </label>
                              ))}
                            </div>
                          )}

                          <div className="flex justify-end pt-2">
                            <Button
                              type="button"
                              onClick={handleSendSelectedDocuments}
                              disabled={selectedDocs.length === 0 || saving}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] h-8 font-bold gap-1 rounded-lg"
                            >
                              <SendIcon className="h-3 w-3" />
                              Gerar & Enviar Selecionados
                            </Button>
                          </div>
                        </div>

                        {/* AI Term and Contract Generator Section */}
                        <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/20 space-y-4 shadow-sm/5">
                          <h4 className="text-xs font-extrabold text-blue-900 flex items-center gap-1.5 uppercase tracking-wide">
                            <SparklesIcon className="h-4 w-4 text-blue-600 animate-pulse" />
                            Redator de Documentos por IA (GPT)
                          </h4>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold text-neutral-500 uppercase">Serviço / Procedimento</Label>
                              <Input 
                                type="text"
                                placeholder="Ex: Contrato de Mentoria CRM"
                                value={aiDocProcedure}
                                onChange={(e) => setAiDocProcedure(e.target.value)}
                                className="text-xs h-8 bg-white border-neutral-200"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold text-neutral-500 uppercase">Tipo de Documento</Label>
                              <select
                                value={aiDocType}
                                onChange={(e) => setAiDocType(e.target.value)}
                                className="w-full text-xs h-8 rounded-md border border-neutral-200 bg-white px-2 focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="contrato">Contrato de Prestação de Serviços</option>
                                <option value="consentimento">Termo de Consentimento Livre e Esclarecido</option>
                                <option value="anamnese">Termo de Responsabilidade / Ficha Geral</option>
                              </select>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-neutral-500 uppercase">Riscos e Responsabilidades</Label>
                            <Input 
                              type="text"
                              placeholder="Descreva riscos específicos se houver..."
                              value={aiDocRisks}
                              onChange={(e) => setAiDocRisks(e.target.value)}
                              className="text-xs h-8 bg-white border-neutral-200"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold text-neutral-500 uppercase">Cuidados Necessários</Label>
                              <Textarea 
                                placeholder="Cuidados após o atendimento..."
                                value={aiDocCuidados}
                                onChange={(e) => setAiDocCuidados(e.target.value)}
                                rows={2}
                                className="text-xs bg-white border-neutral-200"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold text-neutral-500 uppercase">Observações Adicionais</Label>
                              <Textarea 
                                placeholder="Cláusulas extras, prazos ou devoluções..."
                                value={aiDocNotes}
                                onChange={(e) => setAiDocNotes(e.target.value)}
                                rows={2}
                                className="text-xs bg-white border-neutral-200"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end pt-1">
                            <Button
                              type="button"
                              onClick={handleGenerateAIDoc}
                              disabled={aiGeneratingDoc || !aiDocProcedure}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] h-8 font-black gap-1 rounded-lg"
                            >
                              {aiGeneratingDoc ? (
                                <>
                                  <Loader2Icon className="h-3 w-3 animate-spin" /> Redigindo Termo...
                                </>
                              ) : (
                                <>
                                  <SparklesIcon className="h-3 w-3" /> Gerar Termo com IA
                                </>
                              )}
                            </Button>
                          </div>

                          {aiGeneratedContent && (
                            <div className="space-y-3 bg-white p-3 rounded-lg border border-blue-100 shadow-inner">
                              <Label className="text-[10px] font-bold text-blue-900 uppercase">Documento Gerado (Pode editar se desejar)</Label>
                              <Textarea
                                value={aiGeneratedContent}
                                onChange={(e) => setAiGeneratedContent(e.target.value)}
                                rows={8}
                                className="text-xs font-mono border-neutral-200 leading-relaxed bg-[#fafafa]"
                              />
                              <div className="flex justify-end pt-1">
                                <Button
                                  type="button"
                                  onClick={handleSaveAIDoc}
                                  disabled={isSavingGeneratedDoc}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] h-8 font-black gap-1 rounded-lg"
                                >
                                  {isSavingGeneratedDoc ? (
                                    <>
                                      <Loader2Icon className="h-3 w-3 animate-spin" /> Salvando...
                                    </>
                                  ) : (
                                    <>
                                      <SendIcon className="h-3 w-3" /> Salvar & Enviar via WhatsApp
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* List of Sent/Generated Documents */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-black text-neutral-700 uppercase tracking-wider">Histórico de Documentos</h4>
                          {patientDocs.length === 0 ? (
                            <p className="text-xs text-neutral-400 italic">Nenhum documento gerado para este paciente.</p>
                          ) : (
                            <div className="divide-y divide-neutral-100">
                              {patientDocs.map((doc) => {
                                const isSigned = doc.status === "signed";
                                const signingUrl = `${window.location.origin}/portal/documento/${doc.public_token}`;
                                return (
                                  <div key={doc.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0 gap-4">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <FileTextIcon className="h-4.5 w-4.5 shrink-0 text-neutral-400" />
                                      <div className="min-w-0 text-left">
                                        <p className="text-xs font-extrabold text-neutral-800 truncate">{doc.title}</p>
                                        <p className="text-[9px] text-neutral-400">
                                          Enviado em: {new Date(doc.created_at || doc.sent_at).toLocaleDateString("pt-BR")}
                                          {isSigned && doc.signed_at && ` • Assinado em: ${new Date(doc.signed_at).toLocaleDateString("pt-BR")}`}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {!isSigned && doc.public_token && (
                                        <a
                                          href={signingUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-[9px] px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold transition-colors"
                                        >
                                          Link Assinatura
                                        </a>
                                      )}
                                      <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider border ${
                                        isSigned 
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                                          : "bg-amber-50 text-amber-600 border-amber-100"
                                      }`}>
                                        {isSigned ? "Assinado" : "Pendente"}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Tab: FINANCIAL (Paid/Pending transactions & packages credit list) */}
                    {activeTab === "financial" && (
                      <div className="space-y-6 text-left">
                        {/* Summary metrics card */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-left shadow-xs">
                            <span className="text-[9px] text-emerald-600 font-black uppercase block tracking-wider">Faturado / Recebido</span>
                            <span className="text-xl font-black text-emerald-800">
                              R$ {patientTransactions.filter(t => t.type === 'receita' && t.status === 'paid').reduce((acc, curr) => acc + Number(curr.value), 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-left shadow-xs">
                            <span className="text-[9px] text-rose-600 font-black uppercase block tracking-wider">Pendente de Cobrança</span>
                            <span className="text-xl font-black text-rose-800">
                              R$ {patientTransactions.filter(t => t.type === 'receita' && t.status === 'pending').reduce((acc, curr) => acc + Number(curr.value), 0).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* List of Financial Transactions */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-black text-neutral-700 uppercase tracking-wider">Lançamentos Financeiros</h4>
                          {patientTransactions.length === 0 ? (
                            <p className="text-xs text-neutral-400 italic">Nenhuma transação financeira lançada no histórico.</p>
                          ) : (
                            <div className="border border-neutral-100 rounded-xl overflow-hidden shadow-xs divide-y divide-neutral-100">
                              {patientTransactions.map((tx) => {
                                const isIncome = tx.type === "receita";
                                const isPaid = tx.status === "paid";
                                return (
                                  <div key={tx.id} className="flex items-center justify-between p-3.5 bg-white text-xs gap-4">
                                    <div className="text-left min-w-0">
                                      <p className="font-extrabold text-neutral-800 truncate">{tx.description || "Transação Sem Título"}</p>
                                      <p className="text-[9px] text-neutral-400">
                                        Data: {new Date(tx.created_at || tx.due_date).toLocaleDateString("pt-BR")}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className={`font-black ${isIncome ? "text-emerald-600" : "text-rose-600"}`}>
                                        {isIncome ? "+" : "-"} R$ {Number(tx.value).toFixed(2)}
                                      </span>
                                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                        isPaid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-600"
                                      }`}>
                                        {isPaid ? "Pago" : "Pendente"}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Quotes / Orçamentos Section */}
                        <div className="space-y-4 pt-4 border-t border-neutral-100">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-neutral-700 uppercase tracking-wider">Orçamentos Enviados</h4>
                            <Button
                              type="button"
                              onClick={() => setQuoteModalOpen(true)}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold h-7 gap-1 rounded-lg"
                            >
                              <PlusIcon className="h-3 w-3" />
                              Novo Orçamento
                            </Button>
                          </div>

                          {/* Quotes stats row */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-neutral-50 border border-neutral-200/50 rounded-xl p-2.5 text-center shadow-xs">
                              <span className="text-[8px] text-neutral-500 font-extrabold uppercase block tracking-wider">Total</span>
                              <span className="text-sm font-black text-neutral-700">{quotes.length}</span>
                            </div>
                            <div className="bg-blue-50 border border-blue-100/50 rounded-xl p-2.5 text-center shadow-xs">
                              <span className="text-[8px] text-blue-600 font-extrabold uppercase block tracking-wider">Enviados</span>
                              <span className="text-sm font-black text-blue-700">
                                {quotes.filter(q => q.status === 'sent').length}
                              </span>
                            </div>
                            <div className="bg-emerald-50 border border-emerald-100/50 rounded-xl p-2.5 text-center shadow-xs">
                              <span className="text-[8px] text-emerald-600 font-extrabold uppercase block tracking-wider">Aprovados</span>
                              <span className="text-sm font-black text-emerald-700">
                                {quotes.filter(q => q.status === 'accepted' || q.status === 'approved').length}
                              </span>
                            </div>
                          </div>

                          {loadingQuotes ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2Icon className="h-4 w-4 animate-spin text-blue-600" />
                            </div>
                          ) : quotes.length === 0 ? (
                            <p className="text-xs text-neutral-400 italic">Nenhum orçamento gerado para este paciente.</p>
                          ) : (
                            <div className="border border-neutral-100 rounded-xl overflow-hidden shadow-xs divide-y divide-neutral-100">
                              {quotes.map((q) => {
                                const isSent = q.status === "sent";
                                const isAccepted = q.status === "accepted" || q.status === "approved";
                                return (
                                  <div key={q.id} className="flex items-center justify-between p-3 bg-white text-xs gap-4">
                                    <div className="text-left min-w-0">
                                      <p className="font-extrabold text-neutral-800 truncate">
                                        Orçamento #{q.id.substring(0, 6).toUpperCase()}
                                      </p>
                                      {q.special_condition && (
                                        <p className="text-[9px] text-neutral-500 italic truncate">{q.special_condition}</p>
                                      )}
                                      <p className="text-[8px] text-neutral-400 font-medium">
                                        Gerado em: {new Date(q.created_at || q.sent_at).toLocaleDateString("pt-BR")}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className="font-extrabold text-neutral-700">
                                        R$ {Number(q.total_value || 0).toFixed(2)}
                                      </span>
                                      <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                        isAccepted ? "bg-emerald-50 text-emerald-700 border border-emerald-100/50" : isSent ? "bg-blue-50 text-blue-700 border border-blue-100/50" : "bg-neutral-100 text-neutral-500"
                                      }`}>
                                        {isAccepted ? "Aprovado" : isSent ? "Enviado" : "Rascunho"}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Active Packages Credit list inside Financial */}
                        <div className="space-y-3 pt-4 border-t border-neutral-100">
                          <h4 className="text-xs font-black text-neutral-700 uppercase tracking-wider">Crédito de Pacotes Contratados</h4>
                          {patientPackages.length === 0 ? (
                            <p className="text-xs text-neutral-400 italic">Nenhum pacote contratado no momento.</p>
                          ) : (
                            <div className="grid grid-cols-1 gap-3">
                              {patientPackages.map((pkg) => {
                                const remaining = pkg.total - pkg.used;
                                const pct = (pkg.used / pkg.total) * 100;
                                return (
                                  <div key={pkg.id} className="border border-neutral-200/80 rounded-xl p-3 bg-neutral-50/50 space-y-2.5 shadow-xs">
                                    <div className="flex justify-between items-center text-xs">
                                      <div>
                                        <p className="font-extrabold text-neutral-800">{pkg.name}</p>
                                        <p className="text-[8px] text-neutral-400 font-bold uppercase mt-0.5">Expira: {pkg.expires ? new Date(pkg.expires).toLocaleDateString("pt-BR") : "Sem validade"}</p>
                                      </div>
                                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                                        pkg.status === "active" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-neutral-100 text-neutral-500"
                                      }`}>
                                        {pkg.status}
                                      </span>
                                    </div>

                                    <div className="space-y-1">
                                      <div className="flex justify-between text-[9px] font-bold text-neutral-600">
                                        <span>Consumido: {pkg.used} / {pkg.total}</span>
                                        <span className="text-blue-700">{remaining} restantes</span>
                                      </div>
                                      <div className="w-full bg-neutral-200/60 rounded-full h-1.5 overflow-hidden">
                                        <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Tab: PRONTUARIO (Clinical note EMR, Body evaluations & interactive SVG charts) */}
                    {activeTab === "prontuario" && (
                      <div className="space-y-6 text-left">
                        {/* Section: Clinical Evolution Logs */}
                        <div className="space-y-4">
                          <h3 className="text-xs font-black text-neutral-700 uppercase tracking-wider">Evoluções Clínicas do Paciente</h3>
                          
                          {/* Create New Clinical note form */}
                          <form onSubmit={handleAddClinicalEvolution} className="bg-neutral-50/70 p-3.5 rounded-xl border border-neutral-100 space-y-3 text-left">
                            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Registrar Nova Evolução Clínica / Notas</p>
                            <Textarea
                              placeholder="Descreva a evolução do cliente, notas de atendimento ou particularidades..."
                              value={newEvolContent}
                              onChange={(e) => setNewEvolContent(e.target.value)}
                              rows={3}
                              className="text-xs rounded-xl border-neutral-200 bg-white focus:ring-blue-500"
                              required
                              disabled={evolSaving}
                            />
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 text-xs">
                              <div className="flex gap-4">
                                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-neutral-600 text-[10px]">
                                  <input
                                    type="checkbox"
                                    checked={evolSigned}
                                    onChange={(e) => setEvolSigned(e.target.checked)}
                                    className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                                  />
                                  Assinar Digitalmente
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-neutral-600 text-[10px]">
                                  <input
                                    type="checkbox"
                                    checked={evolShared}
                                    onChange={(e) => setEvolShared(e.target.checked)}
                                    className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                                  />
                                  Portal do Paciente
                                </label>
                              </div>
                              <Button size="sm" type="submit" disabled={evolSaving || !newEvolContent.trim()} className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] h-8 px-4 rounded-lg">
                                {evolSaving ? "Processando..." : "Registrar Evolução"}
                              </Button>
                            </div>
                          </form>

                          {/* List of clinical notes */}
                          {clinicalEvolutions.length === 0 ? (
                            <p className="text-xs text-neutral-400 italic">Nenhuma anotação de prontuário clínico registrada.</p>
                          ) : (
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                              {clinicalEvolutions.map((ev) => (
                                <div key={ev.id} className="p-3.5 rounded-xl border border-neutral-100 bg-white text-xs space-y-2 shadow-xs">
                                  <div className="flex items-center justify-between border-b border-neutral-50 pb-1.5 text-[9px] text-neutral-400 font-bold">
                                    <span className="text-neutral-700">{ev.professional_name}</span>
                                    <span>
                                      {new Date(ev.created_at).toLocaleDateString("pt-BR")} às {new Date(ev.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  </div>
                                  <p className="text-neutral-600 leading-relaxed whitespace-pre-wrap">{ev.content}</p>
                                  <div className="flex items-center gap-2 pt-1 text-[8px] font-bold">
                                    {ev.signed ? (
                                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded uppercase">
                                        Assinado Digitalmente
                                      </span>
                                    ) : (
                                      <span className="bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded uppercase">
                                        Rascunho Não Assinado
                                      </span>
                                    )}
                                    {ev.shared && (
                                      <span className="bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded uppercase">
                                        Compartilhado no Portal
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Section: Body Evolution Line Chart & Form */}
                        <div className="space-y-4 border-t border-neutral-100 pt-5">
                          <h3 className="text-xs font-black text-neutral-700 uppercase tracking-wider">Acompanhamento Corporal (Bioimpedância)</h3>
                          
                          {/* SVG Progression Line Chart */}
                          {renderSvgChart()}

                          {/* Create New Evaluation Form */}
                          <form onSubmit={handleSaveBodyEval} className="bg-neutral-50/70 p-4 rounded-xl border border-neutral-100 space-y-4">
                            <p className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-wider block">Registrar Novas Medidas</p>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Data da Avaliação</Label>
                                <Input 
                                  type="date"
                                  value={evalDate}
                                  onChange={(e) => setEvalDate(e.target.value)}
                                  className="text-xs h-9 bg-white"
                                  required
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Peso (kg)</Label>
                                <Input 
                                  type="number"
                                  step="0.01"
                                  placeholder="Ex: 72.50"
                                  value={evalWeight}
                                  onChange={(e) => setEvalWeight(e.target.value)}
                                  className="text-xs h-9 bg-white"
                                  required
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Altura (m) *</Label>
                                <Input 
                                  type="number"
                                  step="0.01"
                                  placeholder="Ex: 1.70"
                                  value={evalHeight}
                                  onChange={(e) => setEvalHeight(e.target.value)}
                                  className="text-xs h-9 bg-white"
                                  required
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-400 uppercase block truncate">IMC (Calculado)</Label>
                                <Input 
                                  type="text"
                                  value={currentCalculatedImc}
                                  disabled
                                  className="text-xs h-9 bg-neutral-100 border-neutral-200 text-neutral-500 font-extrabold"
                                  placeholder="Calcula automático"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 border-t border-dashed border-neutral-200 pt-3">
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Braço Dir (cm)</Label>
                                <Input 
                                  type="number" step="0.1" placeholder="Ex: 32"
                                  value={evalArmRight} onChange={(e) => setEvalArmRight(e.target.value)}
                                  className="text-[11px] h-8 bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Braço Esq (cm)</Label>
                                <Input 
                                  type="number" step="0.1" placeholder="Ex: 32"
                                  value={evalArmLeft} onChange={(e) => setEvalArmLeft(e.target.value)}
                                  className="text-[11px] h-8 bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Cintura (cm)</Label>
                                <Input 
                                  type="number" step="0.1" placeholder="Ex: 75"
                                  value={evalWaist} onChange={(e) => setEvalWaist(e.target.value)}
                                  className="text-[11px] h-8 bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Abdomen (cm)</Label>
                                <Input 
                                  type="number" step="0.1" placeholder="Ex: 85"
                                  value={evalAbdomen} onChange={(e) => setEvalAbdomen(e.target.value)}
                                  className="text-[11px] h-8 bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Quadril (cm)</Label>
                                <Input 
                                  type="number" step="0.1" placeholder="Ex: 98"
                                  value={evalHip} onChange={(e) => setEvalHip(e.target.value)}
                                  className="text-[11px] h-8 bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Gordura %</Label>
                                <Input 
                                  type="number" step="0.1" placeholder="Ex: 22.5"
                                  value={evalFatPercentage} onChange={(e) => setEvalFatPercentage(e.target.value)}
                                  className="text-[11px] h-8 bg-white"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Coxa Dir (cm)</Label>
                                <Input 
                                  type="number" step="0.1" placeholder="Ex: 58"
                                  value={evalThighRight} onChange={(e) => setEvalThighRight(e.target.value)}
                                  className="text-[11px] h-8 bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Coxa Esq (cm)</Label>
                                <Input 
                                  type="number" step="0.1" placeholder="Ex: 58"
                                  value={evalThighLeft} onChange={(e) => setEvalThighLeft(e.target.value)}
                                  className="text-[11px] h-8 bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Panturrilha Dir</Label>
                                <Input 
                                  type="number" step="0.1" placeholder="Ex: 38"
                                  value={evalCalfRight} onChange={(e) => setEvalCalfRight(e.target.value)}
                                  className="text-[11px] h-8 bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold text-neutral-500 uppercase">Panturrilha Esq</Label>
                                <Input 
                                  type="number" step="0.1" placeholder="Ex: 38"
                                  value={evalCalfLeft} onChange={(e) => setEvalCalfLeft(e.target.value)}
                                  className="text-[11px] h-8 bg-white"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[9px] font-bold text-neutral-500 uppercase">Notas Fisiológicas / Detalhamento</Label>
                              <Textarea 
                                placeholder="Observações de postura, dor lombar, evolução geral, etc..."
                                value={evalNotes}
                                onChange={(e) => setEvalNotes(e.target.value)}
                                rows={2}
                                className="text-xs bg-white border-neutral-200"
                              />
                            </div>

                            <div className="flex justify-end pt-1">
                              <Button
                                type="submit"
                                disabled={savingBodyEval}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] h-8 font-black rounded-lg px-4"
                              >
                                {savingBodyEval ? "Salvando Medidas..." : "Registrar Avaliação Física"}
                              </Button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Smart Sidebar Panel (Right - 35% width) */}
              <aside className="w-80 shrink-0 border-l border-neutral-200/80 bg-[#fbfcfc]/60 p-6 overflow-y-auto flex flex-col gap-5">
                <div className="flex items-center gap-1.5 border-b border-neutral-100 pb-2">
                  <SparklesIcon className="h-4 w-4 text-blue-600 animate-pulse" />
                  <span className="font-bold text-xs text-neutral-800 uppercase tracking-wider">Painel Inteligente</span>
                </div>

                {loadingSmartPanel ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2Icon className="h-5 w-5 animate-spin text-neutral-400" />
                  </div>
                ) : smartPanelData ? (
                  <div className="space-y-5">
                    {/* Buying Score */}
                    <div className="space-y-2 text-left">
                      <div className="flex justify-between text-xs text-neutral-500 font-bold">
                        <span>Score de Compra:</span>
                        <span className="font-extrabold text-blue-600">{smartPanelData.leadScore}%</span>
                      </div>
                      <div className="w-full bg-neutral-200/60 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${smartPanelData.leadScore}%` }} />
                      </div>
                      <p className="text-[9px] text-neutral-400 font-bold capitalize mt-0.5">Estágio CRM: {smartPanelData.stage}</p>
                    </div>

                    {/* Active tags */}
                    <div className="space-y-2 text-left">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                        <TagIcon className="h-3.5 w-3.5 text-blue-500" /> Tags Ativas
                      </span>
                      {smartPanelData.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {smartPanelData.tags.map((t) => (
                            <span key={t} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-[9px] font-bold border border-blue-100/50">
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-neutral-400 italic">Nenhuma tag cadastrada.</p>
                      )}
                    </div>

                    {/* Remaining package sessions alert summary */}
                    <div className="bg-white p-3 rounded-xl border border-neutral-200/70 space-y-1 text-left shadow-xs">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                        <UserCheckIcon className="h-3.5 w-3.5 text-blue-500" /> Sessões em Aberto
                      </span>
                      <p className={`text-sm font-black pt-1 ${smartPanelData.remainingSessions > 0 ? "text-emerald-600" : "text-neutral-400"}`}>
                        {smartPanelData.remainingSessions} sessões restantes
                      </p>
                    </div>

                    {/* Pending Transactions alert panel */}
                    <div className={`p-3.5 rounded-xl border flex items-start gap-2 text-left ${
                      smartPanelData.pendingTransactionsTotal > 0 
                        ? "bg-rose-500/5 border-rose-500/20 text-rose-700" 
                        : "bg-emerald-500/5 border-emerald-500/20 text-emerald-700"
                    }`}>
                      <BadgeAlertIcon className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider block">Faturamento Pendente</span>
                        <span className="text-base font-black block">
                          R$ {smartPanelData.pendingTransactionsTotal.toFixed(2)}
                        </span>
                        {smartPanelData.pendingTransactionsTotal > 0 && (
                          <span className="text-[8px] text-rose-500/80 font-bold block">Cobrança pendente ativa na conta!</span>
                        )}
                      </div>
                    </div>

                    {/* Last Appointment info */}
                    <div className="space-y-2 text-left">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                        <CalendarDaysIcon className="h-3.5 w-3.5 text-blue-500" /> Último Atendimento
                      </span>
                      {smartPanelData.lastAppointmentDate ? (
                        <div className="bg-white p-2.5 rounded-xl border border-neutral-200/50 text-[10px] shadow-xs space-y-1 font-semibold text-neutral-600">
                          <p><span className="text-neutral-400">Doutor:</span> {smartPanelData.lastProfessionalName}</p>
                          <p>
                            <span className="text-neutral-400">Data:</span> {new Date(smartPanelData.lastAppointmentDate).toLocaleDateString("pt-BR")} às {new Date(smartPanelData.lastAppointmentDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-neutral-400 italic">Nenhum atendimento anterior.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400 italic text-center py-10">Sem histórico.</p>
                )}
              </aside>
            </div>

            {/* Footer buttons row */}
            <footer className="border-t border-neutral-200 p-4 bg-white shrink-0 flex items-center justify-between">
              <div>
                {appointmentId && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleting || saving}
                    className="gap-1.5 text-xs h-9 rounded-lg px-4 border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2Icon className="h-4 w-4" />
                    Excluir
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <DialogClose render={<Button variant="outline" disabled={saving} className="text-xs h-9 rounded-lg px-4" />}>
                  Cancelar
                </DialogClose>
                {activeTab === "details" && (
                  <Button
                    type="submit"
                    form="appt-modal-form"
                    disabled={saving || loading || deleting}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 rounded-lg px-5 font-bold"
                  >
                    {saving ? (
                      <>
                        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar Agendamento"
                    )}
                  </Button>
                )}
              </div>
            </footer>
          </div>
        )}
      </DialogContent>

      {/* QuoteCreator Modal Overlay inside Appointment details financial */}
      <QuoteModal
        open={quoteModalOpen}
        onClose={() => {
          setQuoteModalOpen(false);
          fetchQuotes();
        }}
        contactId={patientId}
        contactName={selectedPatientInfo ? selectedPatientInfo.name : ""}
        contactPhone={selectedPatientInfo ? selectedPatientInfo.phone : ""}
        onQuoteCreated={() => {
          fetchQuotes();
        }}
      />
    </Dialog>
  );
}
