"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PlusIcon,
  Trash2Icon,
  CalendarCheck2Icon,
  ClockIcon,
} from "lucide-react";

interface WaitlistItem {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  professionalId: string;
  professionalName: string;
  procedureName: string;
  notes: string;
  createdAt: string;
}

interface WaitlistDrawerProps {
  open: boolean;
  onClose: () => void;
  onSchedule: (patientId: string, professionalId: string, procedureName: string, patientName?: string, patientPhone?: string) => void;
}

export function WaitlistDrawer({ open, onClose, onSchedule }: WaitlistDrawerProps) {
  const supabase = createClient();
  const { accountId } = useAuth();
  
  const [items, setItems] = useState<WaitlistItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form states
  const [patients, setPatients] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [notes, setNotes] = useState("");

  // Load items from localStorage
  useEffect(() => {
    if (!open) return;
    const saved = localStorage.getItem("wacrm:waitlist");
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, [open]);

  // Load patients and staff
  useEffect(() => {
    if (!open || !accountId) return;
    
    const loadData = async () => {
      // Fetch patients
      const { data: pts } = await supabase
        .from("patients")
        .select("id, name, phone")
        .eq("clinic_id", accountId)
        .order("name");

      // Fetch contacts to fallback/merge
      const { data: cts } = await supabase
        .from("contacts")
        .select("id, name, phone")
        .eq("account_id", accountId)
        .order("name");

      const mergedMap = new Map();
      (pts || []).forEach(p => mergedMap.set(p.id, p));
      (cts || []).forEach(c => {
        if (!mergedMap.has(c.id)) {
          mergedMap.set(c.id, { id: c.id, name: c.name || c.phone || "Contato sem nome", phone: c.phone });
        }
      });
      const mergedList = Array.from(mergedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      setPatients(mergedList);

      // Fetch staff
      const { data: st } = await supabase
        .from("clinic_users")
        .select("user_id, name")
        .eq("clinic_id", accountId)
        .eq("is_active", true)
        .order("name");
      setStaff(st || []);
    };

    loadData();
  }, [open, accountId, supabase]);

  const saveItems = (newItems: WaitlistItem[]) => {
    setItems(newItems);
    localStorage.setItem("wacrm:waitlist", JSON.stringify(newItems));
  };

  const handleAdd = () => {
    if (!selectedPatientId) {
      alert("Por favor, selecione um paciente.");
      return;
    }
    
    const patientObj = patients.find(p => p.id === selectedPatientId);
    const staffObj = staff.find(s => s.user_id === selectedStaffId);
    
    const newItem: WaitlistItem = {
      id: Math.random().toString(36).substring(2, 9),
      patientId: selectedPatientId,
      patientName: patientObj ? patientObj.name : "Paciente Desconhecido",
      patientPhone: patientObj ? patientObj.phone : "",
      professionalId: selectedStaffId,
      professionalName: staffObj ? staffObj.name : "Qualquer profissional",
      procedureName: procedureName || "Não especificado",
      notes: notes || "",
      createdAt: new Date().toISOString()
    };

    saveItems([newItem, ...items]);
    
    // Reset form
    setSelectedPatientId("");
    setSelectedStaffId("");
    setProcedureName("");
    setNotes("");
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    const updated = items.filter(item => item.id !== id);
    saveItems(updated);
  };

  const handleScheduleClick = (item: WaitlistItem) => {
    // Call parent schedule hook
    onSchedule(item.patientId, item.professionalId, item.procedureName, item.patientName, item.patientPhone);
    // Remove from waitlist since they are being scheduled!
    handleDelete(item.id);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[420px] sm:max-w-[420px] bg-white flex flex-col p-6 z-50">
        <SheetHeader className="pb-4 border-b border-neutral-100 text-left">
          <SheetTitle className="text-lg font-black text-neutral-800 uppercase tracking-wider flex items-center gap-2">
            Fila / Lista de Espera
          </SheetTitle>
          <SheetDescription className="text-xs text-neutral-500 font-medium">
            Gerencie pacientes aguardando desistências ou horários disponíveis.
          </SheetDescription>
        </SheetHeader>

        {/* Content list or form */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 scrollbar-thin text-left">
          {showAddForm ? (
            <div className="border border-border rounded-2xl p-4 bg-neutral-50/50 space-y-4">
              <h3 className="text-xs font-black text-neutral-700 uppercase tracking-wider">Adicionar à Fila</h3>
              
              {/* Select Patient */}
              <div className="space-y-1">
                <Label className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Paciente *</Label>
                <Select
                  value={selectedPatientId || "none"}
                  onValueChange={(val) => setSelectedPatientId(val === "none" || val === null ? "" : val)}
                >
                  <SelectTrigger className="w-full rounded-xl border border-border bg-white h-9 px-3 text-xs text-neutral-800 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                    <SelectValue placeholder="Selecione o paciente...">
                      {selectedPatientId
                        ? patients.find((p) => p.id === selectedPatientId)?.name ?? "Selecione o paciente..."
                        : "Selecione o paciente..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-60 rounded-xl overflow-y-auto bg-white border border-border">
                    <SelectItem value="none" className="rounded-lg text-xs">Selecione o paciente...</SelectItem>
                    {patients.map(p => (
                      <SelectItem key={p.id} value={p.id} className="rounded-lg text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Select Professional */}
              <div className="space-y-1">
                <Label className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Profissional Desejado</Label>
                <Select
                  value={selectedStaffId || "none"}
                  onValueChange={(val) => setSelectedStaffId(val === "none" || val === null ? "" : val)}
                >
                  <SelectTrigger className="w-full rounded-xl border border-border bg-white h-9 px-3 text-xs text-neutral-800 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                    <SelectValue placeholder="Qualquer profissional...">
                      {selectedStaffId
                        ? staff.find((s) => s.user_id === selectedStaffId)?.name ?? "Qualquer profissional..."
                        : "Qualquer profissional..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-60 rounded-xl overflow-y-auto bg-white border border-border">
                    <SelectItem value="none" className="rounded-lg text-xs">Qualquer profissional...</SelectItem>
                    {staff.map(s => (
                      <SelectItem key={s.user_id} value={s.user_id} className="rounded-lg text-xs">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Procedure */}
              <div className="space-y-1">
                <Label className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Procedimento Desejado</Label>
                <Input
                  value={procedureName}
                  onChange={(e) => setProcedureName(e.target.value)}
                  placeholder="Ex: Toxina Botulínica"
                  className="rounded-xl border-border h-9 text-xs"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Observações / Preferência de Turno</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Prefere turno da tarde, segundas ou quartas..."
                  className="rounded-xl border-border text-xs"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs h-8 rounded-lg"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 font-bold rounded-lg px-3"
                >
                  Confirmar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center pb-2">
              <span className="text-xs font-bold text-neutral-500">
                {items.length} {items.length === 1 ? "paciente aguardando" : "pacientes aguardando"}
              </span>
              <Button
                size="sm"
                onClick={() => setShowAddForm(true)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-bold h-7 gap-1 rounded-lg"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Adicionar à Fila
              </Button>
            </div>
          )}

          {/* List of waitlist entries */}
          {!showAddForm && (
            <div className="space-y-3">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-2 border border-dashed border-border rounded-2xl">
                  <ClockIcon className="h-8 w-8 text-neutral-300" />
                  <p className="text-xs text-neutral-400 italic font-medium">A lista de espera está vazia.</p>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="border border-border/80 rounded-2xl p-4 bg-white shadow-xs space-y-3 relative group">
                    <div className="text-left space-y-1 pr-6">
                      <p className="text-xs font-black text-neutral-800">{item.patientName}</p>
                      {item.patientPhone && (
                        <p className="text-[10px] text-neutral-500 font-semibold">Tel: {item.patientPhone}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 pt-1.5">
                        <span className="text-[9px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100/50 font-bold">
                          {item.procedureName}
                        </span>
                        <span className="text-[9px] px-2 py-0.5 rounded bg-neutral-50 text-neutral-600 border border-border/50 font-bold">
                          Prof: {item.professionalName}
                        </span>
                      </div>
                      {item.notes && (
                        <p className="text-[10px] text-neutral-500 italic bg-neutral-50 rounded-lg p-2 border border-neutral-100/80 mt-2">
                          "{item.notes}"
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(item.id)}
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50/50 text-[10px] font-bold h-7 rounded-lg px-2 border-rose-100 hover:border-rose-200 gap-1"
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                        Remover
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleScheduleClick(item)}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-bold h-7 rounded-lg px-2.5 gap-1.5"
                      >
                        <CalendarCheck2Icon className="h-3.5 w-3.5" />
                        Agendar Horário
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
