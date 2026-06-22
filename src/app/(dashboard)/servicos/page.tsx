"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  PlusIcon,
  Loader2Icon,
  XIcon,
  ActivityIcon,
  CheckCircle2Icon,
  XCircleIcon,
  MapPinIcon,
  SettingsIcon,
  DollarSignIcon,
  ClockIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Procedure {
  id: string;
  name: string;
  valor: number;
  price: number;
  duration_minutes: number;
  tempo_reserva_minutos: number;
  ativo: boolean;
}

interface Room {
  id: string;
  name: string;
  is_active: boolean;
}

export default function ServicosPage() {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [activeTab, setActiveTab] = useState<"procedures" | "rooms">("procedures");
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals & Drawer states
  const [isProcModalOpen, setIsProcModalOpen] = useState(false);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingProc, setEditingProc] = useState<Procedure | null>(null);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Fields - Procedures
  const [procName, setProcName] = useState("");
  const [procValue, setProcValue] = useState("");
  const [procDuration, setProcDuration] = useState("60");
  const [procAtivo, setProcAtivo] = useState(true);

  // Form Fields - Rooms
  const [roomName, setRoomName] = useState("");
  const [roomActive, setRoomActive] = useState(true);

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const clinicId = accountId;

      // 1. Fetch procedures
      const { data: procData, error: procErr } = await supabase
        .from("procedures")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("name");

      if (procErr) throw procErr;
      setProcedures(procData || []);

      // 2. Fetch rooms
      const { data: rmData, error: rmErr } = await supabase
        .from("rooms")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("name");

      if (rmErr) throw rmErr;
      setRooms(rmData || []);

    } catch (err: any) {
      console.error("Error loading services/rooms:", err);
      setError("Erro ao carregar dados operacionais da clínica.");
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Procedimento Form triggers
  const handleOpenAddProc = () => {
    setEditingProc(null);
    setProcName("");
    setProcValue("");
    setProcDuration("60");
    setProcAtivo(true);
    setIsProcModalOpen(true);
  };

  const handleOpenEditProc = (p: Procedure) => {
    setEditingProc(p);
    setProcName(p.name);
    setProcValue(p.valor?.toString() || p.price?.toString() || "");
    setProcDuration(p.duration_minutes?.toString() || p.tempo_reserva_minutos?.toString() || "60");
    setProcAtivo(p.ativo !== false);
    setIsProcModalOpen(true);
  };

  const handleSaveProcedure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !procName.trim()) return;

    setSaving(true);
    try {
      const clinicId = accountId;
      const cleanValue = parseFloat(procValue.replace(",", ".")) || 0.00;
      const cleanDuration = parseInt(procDuration, 10) || 60;

      const payload = {
        clinic_id: clinicId,
        name: procName.trim(),
        price: cleanValue,
        valor: cleanValue,
        duration_minutes: cleanDuration,
        tempo_reserva_minutos: cleanDuration,
        ativo: procAtivo,
      };

      if (editingProc) {
        const { error: err } = await supabase
          .from("procedures")
          .update(payload)
          .eq("id", editingProc.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from("procedures")
          .insert(payload);
        if (err) throw err;
      }

      setIsProcModalOpen(false);
      await loadData();
      alert(editingProc ? "Procedimento atualizado!" : "Procedimento cadastrado com sucesso!");
    } catch (err: any) {
      console.error("Error saving procedure:", err);
      alert("Erro ao salvar procedimento: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Sala Form triggers
  const handleOpenAddRoom = () => {
    setEditingRoom(null);
    setRoomName("");
    setRoomActive(true);
    setIsRoomModalOpen(true);
  };

  const handleOpenEditRoom = (r: Room) => {
    setEditingRoom(r);
    setRoomName(r.name);
    setRoomActive(r.is_active !== false);
    setIsRoomModalOpen(true);
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !roomName.trim()) return;

    setSaving(true);
    try {
      const clinicId = accountId;

      const payload = {
        clinic_id: clinicId,
        name: roomName.trim(),
        is_active: roomActive,
      };

      if (editingRoom) {
        const { error: err } = await supabase
          .from("rooms")
          .update(payload)
          .eq("id", editingRoom.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from("rooms")
          .insert(payload);
        if (err) throw err;
      }

      setIsRoomModalOpen(false);
      await loadData();
      alert(editingRoom ? "Sala de atendimento atualizada!" : "Sala cadastrada com sucesso!");
    } catch (err: any) {
      console.error("Error saving room:", err);
      alert("Erro ao salvar sala: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 min-h-[300px]">
        <Loader2Icon className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-900">Serviços & Salas</h1>
          <p className="text-sm text-neutral-500">Administre os procedimentos oferecidos e as salas de atendimento disponíveis.</p>
        </div>
        <button
          onClick={activeTab === "procedures" ? handleOpenAddProc : handleOpenAddRoom}
          className="flex items-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-2.5 text-xs font-black hover:bg-blue-700 transition-colors shadow-sm"
        >
          <PlusIcon className="h-4 w-4" />
          {activeTab === "procedures" ? "Novo Procedimento" : "Nova Sala"}
        </button>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs font-semibold">{error}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-200">
        <button
          onClick={() => setActiveTab("procedures")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px cursor-pointer flex items-center gap-1.5 ${
            activeTab === "procedures"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-500 hover:text-neutral-800"
          }`}
        >
          <ActivityIcon className="h-4 w-4" />
          Procedimentos ({procedures.length})
        </button>
        <button
          onClick={() => setActiveTab("rooms")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px cursor-pointer flex items-center gap-1.5 ${
            activeTab === "rooms"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-500 hover:text-neutral-800"
          }`}
        >
          <MapPinIcon className="h-4 w-4" />
          Salas de Atendimento ({rooms.length})
        </button>
      </div>

      {/* Content */}
      {activeTab === "procedures" ? (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase tracking-wide">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase tracking-wide">Preço (BRL)</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase tracking-wide">Duração</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-neutral-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {procedures.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50/50 transition-colors">
                  <td className="px-6 py-3.5 font-bold text-neutral-800">{p.name}</td>
                  <td className="px-6 py-3.5 font-mono text-neutral-600">{fmt(p.valor || p.price || 0)}</td>
                  <td className="px-6 py-3.5 text-neutral-500 font-semibold">{p.duration_minutes || p.tempo_reserva_minutos || 60} minutos</td>
                  <td className="px-6 py-3.5">
                    {p.ativo !== false ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200/50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2Icon className="h-3 w-3" />
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 border border-rose-200/50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
                        <XCircleIcon className="h-3 w-3" />
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button
                      onClick={() => handleOpenEditProc(p)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {procedures.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-xs text-neutral-400 italic">
                    Nenhum procedimento cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase tracking-wide">Nome da Sala</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-neutral-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rooms.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50/50 transition-colors">
                  <td className="px-6 py-3.5 font-bold text-neutral-800">{r.name}</td>
                  <td className="px-6 py-3.5">
                    {r.is_active !== false ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200/50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2Icon className="h-3 w-3" />
                        Ativa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 border border-rose-200/50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
                        <XCircleIcon className="h-3 w-3" />
                        Inativa
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button
                      onClick={() => handleOpenEditRoom(r)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {rooms.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-12 text-xs text-neutral-400 italic">
                    Nenhuma sala cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Procedure Dialog Modal */}
      {isProcModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveProcedure} className="bg-white w-full max-w-md rounded-2xl border border-neutral-200 p-6 space-y-4 shadow-xl text-left">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">
                {editingProc ? "Editar Procedimento" : "Cadastrar Novo Procedimento"}
              </h2>
              <button type="button" onClick={() => setIsProcModalOpen(false)} className="text-neutral-500 hover:text-neutral-800 cursor-pointer">
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="p-name" className="text-xs font-bold text-neutral-600">Nome do Procedimento *</Label>
                <Input
                  id="p-name"
                  required
                  placeholder="Ex: Toxina Botulínica"
                  value={procName}
                  onChange={(e) => setProcName(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="p-val" className="text-xs font-bold text-neutral-600">Preço (R$) *</Label>
                  <Input
                    id="p-val"
                    required
                    placeholder="0,00"
                    value={procValue}
                    onChange={(e) => setProcValue(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="p-dur" className="text-xs font-bold text-neutral-600">Duração (minutos) *</Label>
                  <Input
                    id="p-dur"
                    type="number"
                    required
                    placeholder="60"
                    value={procDuration}
                    onChange={(e) => setProcDuration(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Status Switch */}
              <div className="flex items-center justify-between rounded-xl bg-neutral-50 border p-3">
                <div>
                  <p className="text-xs font-bold text-neutral-800">Procedimento Ativo</p>
                  <p className="text-[10px] text-neutral-500">Procedimentos inativos não aparecem para novos agendamentos.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setProcAtivo(!procAtivo)}
                  className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors ${
                    procAtivo ? "bg-blue-600" : "bg-neutral-300"
                  }`}
                  disabled={saving}
                >
                  <span className={`inline-block h-4.5 w-4.5 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
                    procAtivo ? "translate-x-4.5" : ""
                  }`} />
                </button>
              </div>
            </div>

            <Button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 rounded-xl">
              {saving ? "Salvando..." : "Salvar Procedimento"}
            </Button>
          </form>
        </div>
      )}

      {/* Room Dialog Modal */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveRoom} className="bg-white w-full max-w-md rounded-2xl border border-neutral-200 p-6 space-y-4 shadow-xl text-left">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">
                {editingRoom ? "Editar Sala" : "Cadastrar Nova Sala"}
              </h2>
              <button type="button" onClick={() => setIsRoomModalOpen(false)} className="text-neutral-500 hover:text-neutral-800 cursor-pointer">
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="r-name" className="text-xs font-bold text-neutral-600">Nome/Número da Sala *</Label>
                <Input
                  id="r-name"
                  required
                  placeholder="Ex: Sala VIP 1"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  disabled={saving}
                />
              </div>

              {/* Status Switch */}
              <div className="flex items-center justify-between rounded-xl bg-neutral-50 border p-3">
                <div>
                  <p className="text-xs font-bold text-neutral-800">Sala Ativa</p>
                  <p className="text-[10px] text-neutral-500">Salas inativas não podem receber novos agendamentos.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRoomActive(!roomActive)}
                  className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors ${
                    roomActive ? "bg-blue-600" : "bg-neutral-300"
                  }`}
                  disabled={saving}
                >
                  <span className={`inline-block h-4.5 w-4.5 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
                    roomActive ? "translate-x-4.5" : ""
                  }`} />
                </button>
              </div>
            </div>

            <Button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 rounded-xl">
              {saving ? "Salvando..." : "Salvar Sala"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
