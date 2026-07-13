const fs = require('fs');
const path = require('path');

const srcPath = 'c:/Users/SenetUser/Downloads/MARCELLE-20260617T162810Z-3-001/MARCELLE/lead-pluz/web/src/components/ui/appointment-modal.tsx';
const destPath = 'c:/Users/SenetUser/Downloads/MARCELLE-20260617T162810Z-3-001/MARCELLE/wacrm/src/components/ui/appointment-modal.tsx';

let content = fs.readFileSync(srcPath, 'utf8');

// 1. Imports
content = content.replace(
  `import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/hooks/useAuthStore";`,
  `import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";`
);

// 2. Component Setup & hook values
content = content.replace(
  `  const { profile } = useAuthStore();`,
  `  const supabase = createClient();
  const { profile, accountId, user } = useAuth();
  const clinicId = accountId;
  const [originalStatus, setOriginalStatus] = useState<string>("");`
);

// 3. Load options (clinic_users search using id)
content = content.replace(
  `        // Fetch staff (clinic_users)
        const { data: stData } = await supabase
          .from("clinic_users")
          .select("user_id, name")
          .eq("clinic_id", clinicId)
          .eq("is_active", true)
          .order("name");
        setStaff((stData || []).map((s) => ({ id: s.user_id, name: s.name })));

        // Pre-fill professional if creating a new appointment and user is staff
        if (!appointmentId && profile?.id) {
          const currentStaff = stData?.find((s: any) => s.user_id === profile.id);
          if (currentStaff) {
            setProfessionalId(currentStaff.user_id);
          }
        }`,
  `        // Fetch staff (clinic_users) using id as primary key
        const { data: stData } = await supabase
          .from("clinic_users")
          .select("id, name, user_id")
          .eq("clinic_id", clinicId)
          .eq("is_active", true)
          .order("name");
        const mappedStaff = (stData || []).map((s) => ({ id: s.id, name: s.name, user_id: s.user_id }));
        setStaff(mappedStaff);

        // Pre-fill professional if creating a new appointment and user is staff
        if (!appointmentId) {
          const currentStaff = mappedStaff.find(s => s.user_id === user?.id);
          if (currentStaff) {
            setProfessionalId(currentStaff.id);
          }
        }`
);

// 4. loadAppointment adaptations
content = content.replace(
  `      if (!appointmentId) {
        setPatientId("");
        setProfessionalId("");
        setStartTime("");
        setEndTime("");
        setProcedureName("");
        setRoomId("");
        setStatus("provisional");
        setNotes("");
        setSendWa(true);
        return;
      }`,
  `      if (!appointmentId) {
        setPatientId("");
        const currentStaff = staff.find(s => s.user_id === user?.id);
        setProfessionalId(currentStaff?.id || "");
        setStartTime("");
        setEndTime("");
        setProcedureName("");
        setRoomId("");
        setStatus("provisional");
        setOriginalStatus("");
        setNotes("");
        setSendWa(true);
        return;
      }`
);

content = content.replace(
  `        if (appt) {
          setPatientId(appt.patient_id || "");
          setProfessionalId(appt.professional_id || "");
          
          // Dates in local datetime format for input: YYYY-MM-DDTHH:mm`,
  `        if (appt) {
          setPatientId(appt.patient_id || "");
          setProfessionalId(appt.professional_id || "");
          setOriginalStatus(appt.status || "");
          
          // Dates in local datetime format for input: YYYY-MM-DDTHH:mm`
);

// 5. Smart panel fetch
content = content.replace(
  `          if (lastAppt.professional_id) {
            const { data: prof } = await supabase
              .from("clinic_users")
              .select("name")
              .eq("user_id", lastAppt.professional_id)
              .maybeSingle();
            if (prof) {
              lastProfessionalName = prof.name;
            }
          }`,
  `          if (lastAppt.professional_id) {
            const { data: prof } = await supabase
              .from("clinic_users")
              .select("name")
              .eq("id", lastAppt.professional_id)
              .maybeSingle();
            if (prof) {
              lastProfessionalName = prof.name;
            }
          }`
);

// 6. handleSave clinicId & Triggers
content = content.replace(
  `    try {
      const clinicId = profile.clinic_id;

      if (appointmentId) {
        // Update appointment
        const { error: updateErr } = await supabase
          .from("appointments")
          .update({
            patient_id: patientId,
            professional_id: professionalId || null,
            start_time: startObj.toISOString(),
            end_time: endObj.toISOString(),
            status,
            notes,
            type: procedureName || null,
            room_id: roomId || null,
          })
          .eq("id", appointmentId);

        if (updateErr) throw updateErr;

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
          title: \`Agendamento atualizado para [\${statusMap[status] || status}]\`,
          payload: {
            updated_by: profile.name,
            start_time: startObj.toISOString(),
          },
        });

      } else {
        // Create appointment
        const { error: createErr } = await supabase
          .from("appointments")
          .insert({
            clinic_id: clinicId,
            patient_id: patientId,
            professional_id: professionalId || null,
            start_time: startObj.toISOString(),
            end_time: endObj.toISOString(),
            status,
            notes,
            type: procedureName || null,
            room_id: roomId || null,
          });

        if (createErr) throw createErr;

        // Log timeline
        await supabase.from("patient_timeline").insert({
          patient_id: patientId,
          event_type: "appointment",
          title: \`Nova consulta agendada para \${startObj.toLocaleDateString("pt-BR")} às \${startObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}\`,
          payload: {
            created_by: profile.name,
            status,
          },
        });
      }`,
  `    try {
      const clinicId = accountId;
      const profileName = profile?.full_name || "Sistema";

      if (appointmentId) {
        // Update appointment
        const { error: updateErr } = await supabase
          .from("appointments")
          .update({
            patient_id: patientId,
            professional_id: professionalId || null,
            start_time: startObj.toISOString(),
            end_time: endObj.toISOString(),
            status,
            notes,
            type: procedureName || null,
            room_id: roomId || null,
          })
          .eq("id", appointmentId);

        if (updateErr) throw updateErr;

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
          title: \`Agendamento atualizado para [\${statusMap[status] || status}]\`,
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
            patient_id: patientId,
            professional_id: professionalId || null,
            start_time: startObj.toISOString(),
            end_time: endObj.toISOString(),
            status,
            notes,
            type: procedureName || null,
            room_id: roomId || null,
          })
          .select("id")
          .single();

        if (createErr) throw createErr;

        // Log timeline
        await supabase.from("patient_timeline").insert({
          patient_id: patientId,
          event_type: "appointment",
          title: \`Nova consulta agendada para \${startObj.toLocaleDateString("pt-BR")} às \${startObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}\`,
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

          // Trigger Google Calendar sync
          fetch("/api/integrations/google/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create",
              appointmentId: newAppt.id,
            }),
          }).catch((err) => console.error("Error syncing Google Calendar create:", err));
        }
      }`
);

// 7. handleSendSelectedDocuments clinic_id check
content = content.replace(
  `            clinic_id: profile.clinic_id,`,
  `            clinic_id: clinicId,`
);

// 8. Other profileName replacements
content = content.replace(/profile\.name/g, 'profileName');

fs.writeFileSync(destPath, content, 'utf8');
console.log("Adapted appointment-modal successfully!");
