"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
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
  ClockIcon,
  TagIcon,
  PackageIcon,
  PaletteIcon,
  Pencil,
  Trash2,
  ChevronDownIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/* ─── Types ──────────────────────────────────────────────── */
interface Procedure {
  id: string;
  name: string;
  category: string | null;
  color: string | null;
  description: string | null;
  valor: number;
  price: number;
  duration_minutes: number;
  tempo_reserva_minutos: number;
  is_active: boolean;
  ativo: boolean;
}

interface Room {
  id: string;
  name: string;
  is_active: boolean;
}

interface Package {
  id: string;
  name: string;
  description: string | null;
  validity_days: number | null;
  price: number;
  is_active: boolean;
  items?: PackageItem[];
}

interface PackageItem {
  id: string;
  procedure_name: string;
  sessions: number;
}

interface TeamMember {
  id: string;
  name: string;
}

/* ─── Constants ─────────────────────────────────────────── */
const PROCEDURE_CATEGORIES = [
  "Toxinas e Neuromoduladores",
  "Preenchimentos Faciais",
  "Bioestimuladores",
  "Laser e Luz Pulsada",
  "Radiofrequência e Ultrassom",
  "Estética Corporal",
  "Estética Facial",
  "Cabelos e Couro Cabeludo",
  "Consultas e Avaliações",
  "Outros",
];

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f97316",
  "#14b8a6", "#22c55e", "#eab308", "#ef4444",
  "#06b6d4", "#6366f1",
];

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-neutral-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : ""
        }`}
      />
    </button>
  );
}

/* ─── Main Component ────────────────────────────────────── */
type Tab = "procedures" | "rooms" | "packages";

export default function ServicosPage() {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("procedures");
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ─── Procedure form state ─── */
  const [isProcModalOpen, setIsProcModalOpen] = useState(false);
  const [editingProc, setEditingProc] = useState<Procedure | null>(null);
  const [saving, setSaving] = useState(false);
  const [procName, setProcName] = useState("");
  const [procCategory, setProcCategory] = useState("");
  const [procColor, setProcColor] = useState("#3b82f6");
  const [procValue, setProcValue] = useState("");
  const [procDuration, setProcDuration] = useState("60");
  const [procDescription, setProcDescription] = useState("");
  const [procAtivo, setProcAtivo] = useState(true);
  const [commissions, setCommissions] = useState<Record<string, { type: "percentage" | "fixed"; value: string }>>({});

  /* ─── Room form state ─── */
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomName, setRoomName] = useState("");
  const [roomActive, setRoomActive] = useState(true);

  /* ─── Package form state ─── */
  const [isPkgModalOpen, setIsPkgModalOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<Package | null>(null);
  const [pkgName, setPkgName] = useState("");
  const [pkgDescription, setPkgDescription] = useState("");
  const [pkgPrice, setPkgPrice] = useState("");
  const [pkgValidity, setPkgValidity] = useState("");
  const [pkgItems, setPkgItems] = useState<{ procedure_id: string; procedure_name: string; sessions: number }[]>([]);

  /* ─── Load Data ──────────────────────────────────────── */
  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const [procRes, roomRes, pkgRes, teamRes] = await Promise.all([
        supabase.from("procedures").select("*").eq("clinic_id", accountId).order("name"),
        supabase.from("rooms").select("*").eq("clinic_id", accountId).order("name"),
        supabase.from("packages").select("*, items:package_items(id, procedure_name, sessions)").eq("account_id", accountId).order("name"),
        supabase.from("clinic_users").select("id, name").eq("clinic_id", accountId).eq("is_active", true).order("name"),
      ]);

      if (procRes.error) throw procRes.error;
      if (roomRes.error) throw roomRes.error;

      setProcedures(procRes.data || []);
      setRooms(roomRes.data || []);
      setPackages((pkgRes.data || []) as Package[]);
      setTeamMembers(teamRes.data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar dados.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ─── Procedure handlers ─────────────────────────────── */
  const handleOpenAddProc = () => {
    setEditingProc(null);
    setProcName(""); setProcCategory(""); setProcColor("#3b82f6");
    setProcValue(""); setProcDuration("60"); setProcDescription("");
    setProcAtivo(true);
    setCommissions({});
    setIsProcModalOpen(true);
  };

  const handleOpenEditProc = async (p: Procedure) => {
    setEditingProc(p);
    setProcName(p.name);
    setProcCategory(p.category || "");
    setProcColor(p.color || "#3b82f6");
    setProcValue((p.valor || p.price || 0).toString());
    setProcDuration((p.duration_minutes || p.tempo_reserva_minutos || 60).toString());
    setProcDescription(p.description || "");
    setProcAtivo(p.is_active !== false && p.ativo !== false);
    setCommissions({});
    setIsProcModalOpen(true);

    try {
      const { data } = await supabase
        .from("procedure_commissions")
        .select("*")
        .eq("procedure_id", p.id);
      if (data) {
        const mapping: any = {};
        data.forEach((c: any) => {
          mapping[c.clinic_user_id] = { type: c.commission_type, value: c.commission_value.toString() };
        });
        setCommissions(mapping);
      }
    } catch (err) {
      console.error("Error loading commissions:", err);
    }
  };

  const handleSaveProcedure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !procName.trim()) return;
    setSaving(true);
    try {
      const v = parseFloat(procValue.replace(",", ".")) || 0;
      const d = parseInt(procDuration, 10) || 60;
      const payload = {
        clinic_id: accountId,
        name: procName.trim(),
        category: procCategory || null,
        color: procColor,
        description: procDescription.trim() || null,
        price: v, valor: v,
        duration_minutes: d, tempo_reserva_minutos: d,
        is_active: procAtivo, ativo: procAtivo,
      };
      let procId = editingProc?.id;
      if (editingProc) {
        const { error: err } = await supabase.from("procedures").update(payload).eq("id", editingProc.id);
        if (err) throw err;
        toast.success("Procedimento atualizado!");
      } else {
        const { data: newProc, error: err } = await supabase.from("procedures").insert(payload).select("id").single();
        if (err) throw err;
        procId = newProc.id;
        toast.success("Procedimento cadastrado!");
      }

      if (procId) {
        const commissionInserts = Object.keys(commissions).map((memberId) => {
          const c = commissions[memberId];
          return {
            procedure_id: procId,
            clinic_user_id: memberId,
            commission_type: c.type,
            commission_value: parseFloat(c.value.replace(",", ".")) || 0,
            is_active: true
          };
        }).filter(c => c.commission_value > 0);

        await supabase.from("procedure_commissions").delete().eq("procedure_id", procId);
        if (commissionInserts.length > 0) {
          const { error: commErr } = await supabase.from("procedure_commissions").insert(commissionInserts);
          if (commErr) throw commErr;
        }
      }

      setIsProcModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : ""));
    } finally { setSaving(false); }
  };

  const handleDeleteProc = async (id: string) => {
    if (!confirm("Remover procedimento? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("procedures").delete().eq("id", id);
    if (error) toast.error("Erro ao remover: " + error.message);
    else { toast.success("Procedimento removido."); await loadData(); }
  };

  /* ─── Room handlers ──────────────────────────────────── */
  const handleOpenAddRoom = () => {
    setEditingRoom(null); setRoomName(""); setRoomActive(true);
    setIsRoomModalOpen(true);
  };

  const handleOpenEditRoom = (r: Room) => {
    setEditingRoom(r); setRoomName(r.name); setRoomActive(r.is_active !== false);
    setIsRoomModalOpen(true);
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !roomName.trim()) return;
    setSaving(true);
    try {
      const payload = { clinic_id: accountId, name: roomName.trim(), is_active: roomActive };
      if (editingRoom) {
        const { error } = await supabase.from("rooms").update(payload).eq("id", editingRoom.id);
        if (error) throw error;
        toast.success("Sala atualizada!");
      } else {
        const { error } = await supabase.from("rooms").insert(payload);
        if (error) throw error;
        toast.success("Sala cadastrada!");
      }
      setIsRoomModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      toast.error("Erro: " + (err instanceof Error ? err.message : ""));
    } finally { setSaving(false); }
  };

  /* ─── Package handlers ───────────────────────────────── */
  const handleOpenAddPkg = () => {
    setEditingPkg(null);
    setPkgName(""); setPkgDescription(""); setPkgPrice("");
    setPkgValidity(""); setPkgItems([]);
    setIsPkgModalOpen(true);
  };

  const handleOpenEditPkg = (pkg: Package) => {
    setEditingPkg(pkg);
    setPkgName(pkg.name);
    setPkgDescription(pkg.description || "");
    setPkgPrice(pkg.price.toString());
    setPkgValidity(pkg.validity_days?.toString() || "");
    setPkgItems((pkg.items || []).map(i => ({
      procedure_id: "",
      procedure_name: i.procedure_name,
      sessions: i.sessions,
    })));
    setIsPkgModalOpen(true);
  };

  const addPkgItem = () => {
    setPkgItems(prev => [...prev, { procedure_id: "", procedure_name: "", sessions: 1 }]);
  };

  const removePkgItem = (idx: number) => {
    setPkgItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !pkgName.trim()) return;
    setSaving(true);
    try {
      const price = parseFloat(pkgPrice.replace(",", ".")) || 0;
      const validityDays = pkgValidity ? parseInt(pkgValidity, 10) : null;

      let pkgId: string;
      if (editingPkg) {
        const { error } = await supabase.from("packages").update({
          name: pkgName.trim(),
          description: pkgDescription.trim() || null,
          price, validity_days: validityDays,
        }).eq("id", editingPkg.id);
        if (error) throw error;
        pkgId = editingPkg.id;
        await supabase.from("package_items").delete().eq("package_id", pkgId);
      } else {
        const { data, error } = await supabase.from("packages").insert({
          account_id: accountId,
          name: pkgName.trim(),
          description: pkgDescription.trim() || null,
          price, validity_days: validityDays,
          is_active: true,
        }).select("id").single();
        if (error) throw error;
        pkgId = data.id;
      }

      if (pkgItems.length > 0) {
        const items = pkgItems
          .filter(i => i.procedure_name.trim())
          .map(i => ({
            package_id: pkgId,
            procedure_name: i.procedure_name.trim(),
            sessions: i.sessions,
          }));
        if (items.length > 0) {
          const { error } = await supabase.from("package_items").insert(items);
          if (error) throw error;
        }
      }

      toast.success(editingPkg ? "Pacote atualizado!" : "Pacote criado!");
      setIsPkgModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      toast.error("Erro: " + (err instanceof Error ? err.message : ""));
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 min-h-[300px]">
        <Loader2Icon className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const tabBtnCls = (t: Tab) =>
    `px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px cursor-pointer flex items-center gap-1.5 ${
      activeTab === t
        ? "border-blue-600 text-blue-600"
        : "border-transparent text-neutral-500 hover:text-neutral-800"
    }`;

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-900">Serviços & Pacotes</h1>
          <p className="text-sm text-neutral-500">Procedimentos, salas de atendimento e pacotes oferecidos pela clínica.</p>
        </div>
        <button
          onClick={activeTab === "procedures" ? handleOpenAddProc : activeTab === "rooms" ? handleOpenAddRoom : handleOpenAddPkg}
          className="flex items-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-2.5 text-xs font-black hover:bg-blue-700 transition-colors shadow-sm"
        >
          <PlusIcon className="h-4 w-4" />
          {activeTab === "procedures" ? "Novo Procedimento" : activeTab === "rooms" ? "Nova Sala" : "Novo Pacote"}
        </button>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs font-semibold">{error}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-200">
        <button onClick={() => setActiveTab("procedures")} className={tabBtnCls("procedures")}>
          <ActivityIcon className="h-4 w-4" />
          Procedimentos ({procedures.length})
        </button>
        <button onClick={() => setActiveTab("rooms")} className={tabBtnCls("rooms")}>
          <MapPinIcon className="h-4 w-4" />
          Salas ({rooms.length})
        </button>
        <button onClick={() => setActiveTab("packages")} className={tabBtnCls("packages")}>
          <PackageIcon className="h-4 w-4" />
          Pacotes ({packages.length})
        </button>
      </div>

      {/* ── PROCEDURES TAB ── */}
      {activeTab === "procedures" && (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-3 text-left text-xs font-bold text-neutral-500 uppercase tracking-wide w-6">Cor</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-neutral-500 uppercase tracking-wide">Procedimento</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-neutral-500 uppercase tracking-wide hidden sm:table-cell">Categoria</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-neutral-500 uppercase tracking-wide">Preço</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-neutral-500 uppercase tracking-wide hidden md:table-cell">Duração</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-neutral-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-neutral-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {procedures.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <span
                      className="inline-block h-5 w-5 rounded-full border border-black/10 shadow-sm"
                      style={{ backgroundColor: p.color || "#3b82f6" }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-neutral-800">{p.name}</p>
                    {p.description && <p className="text-[11px] text-neutral-400 truncate max-w-xs">{p.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 text-xs hidden sm:table-cell">
                    {p.category || <span className="text-neutral-300 italic">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-neutral-700 font-semibold">{fmt(p.valor || p.price || 0)}</td>
                  <td className="px-4 py-3 text-neutral-500 font-semibold text-xs hidden md:table-cell">
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-3.5 w-3.5" />
                      {p.duration_minutes || p.tempo_reserva_minutos || 60} min
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(p.is_active !== false && p.ativo !== false) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200/50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2Icon className="h-3 w-3" /> Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 border border-rose-200/50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                        <XCircleIcon className="h-3 w-3" /> Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleOpenEditProc(p)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                      <button
                        onClick={() => handleDeleteProc(p.id)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-rose-500 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {procedures.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-xs text-neutral-400 italic">
                    Nenhum procedimento cadastrado. Clique em &quot;Novo Procedimento&quot; para começar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ROOMS TAB ── */}
      {activeTab === "rooms" && (
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
                  <td className="px-6 py-3.5 font-bold text-neutral-800 flex items-center gap-2">
                    <MapPinIcon className="h-4 w-4 text-neutral-400" />{r.name}
                  </td>
                  <td className="px-6 py-3.5">
                    {r.is_active !== false ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200/50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2Icon className="h-3 w-3" /> Ativa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 border border-rose-200/50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
                        <XCircleIcon className="h-3 w-3" /> Inativa
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button onClick={() => handleOpenEditRoom(r)} className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {rooms.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-12 text-xs text-neutral-400 italic">Nenhuma sala cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PACKAGES TAB ── */}
      {activeTab === "packages" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => (
            <div key={pkg.id} className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3 hover:border-blue-200 hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center">
                    <PackageIcon className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-neutral-800">{pkg.name}</p>
                    {pkg.validity_days && (
                      <p className="text-[10px] text-neutral-400">{pkg.validity_days} dias de validade</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleOpenEditPkg(pkg)}
                  className="text-neutral-400 hover:text-blue-600 transition-colors p-1"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>

              {pkg.description && (
                <p className="text-xs text-neutral-500 leading-relaxed">{pkg.description}</p>
              )}

              {pkg.items && pkg.items.length > 0 && (
                <div className="space-y-1">
                  {pkg.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs bg-neutral-50 rounded-lg px-3 py-1.5">
                      <span className="font-semibold text-neutral-700">{item.procedure_name}</span>
                      <span className="text-neutral-400">{item.sessions}x sessão{item.sessions > 1 ? "ões" : ""}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                <span className="text-lg font-black text-blue-700">{fmt(pkg.price)}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  pkg.is_active
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                    : "bg-neutral-100 text-neutral-400 border-neutral-200"
                }`}>
                  {pkg.is_active ? "Ativo" : "Inativo"}
                </span>
              </div>
            </div>
          ))}
          {packages.length === 0 && (
            <div className="col-span-3 text-center py-16 text-neutral-400">
              <PackageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold">Nenhum pacote cadastrado.</p>
              <p className="text-xs mt-1">Crie pacotes com múltiplas sessões de procedimentos.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ PROCEDURE MODAL ════════════════════════════════════ */}
      {isProcModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveProcedure}
            className="bg-white w-full max-w-lg rounded-2xl border border-neutral-200 shadow-2xl text-left overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50">
              <h2 className="text-sm font-black text-neutral-900 uppercase tracking-wide">
                {editingProc ? "Editar Procedimento" : "Novo Procedimento"}
              </h2>
              <button type="button" onClick={() => setIsProcModalOpen(false)} className="text-neutral-400 hover:text-neutral-700">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Name */}
              <div className="space-y-1">
                <Label className="text-xs font-bold text-neutral-600">Nome do Procedimento *</Label>
                <Input required placeholder="Ex: Toxina Botulínica" value={procName} onChange={e => setProcName(e.target.value)} disabled={saving} />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <Label className="text-xs font-bold text-neutral-600 flex items-center gap-1">
                  <TagIcon className="h-3.5 w-3.5" /> Categoria
                </Label>
                <select
                  value={procCategory}
                  onChange={e => setProcCategory(e.target.value)}
                  className="w-full text-sm h-9 rounded-md border border-neutral-200 bg-white px-3 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  disabled={saving}
                >
                  <option value="">Selecione uma categoria...</option>
                  {PROCEDURE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <Label className="text-xs font-bold text-neutral-600">Descrição (opcional)</Label>
                <textarea
                  placeholder="Descreva o procedimento, indicações..."
                  value={procDescription}
                  onChange={e => setProcDescription(e.target.value)}
                  rows={2}
                  disabled={saving}
                  className="w-full text-sm rounded-md border border-neutral-200 bg-white px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
                />
              </div>

              {/* Color picker */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-neutral-600 flex items-center gap-1">
                  <PaletteIcon className="h-3.5 w-3.5" /> Cor na Agenda
                </Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setProcColor(c)}
                      className={`h-7 w-7 rounded-full border-2 transition-all ${procColor === c ? "border-neutral-800 scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={procColor}
                    onChange={e => setProcColor(e.target.value)}
                    className="h-7 w-7 rounded-full border border-neutral-200 cursor-pointer"
                    title="Cor personalizada"
                  />
                  <span className="text-xs text-neutral-400 ml-1">Prévia:</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: procColor }}>
                    {procName || "Procedimento"}
                  </span>
                </div>
              </div>

              {/* Price + Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-neutral-600 flex items-center gap-1">
                    <DollarSignIcon className="h-3.5 w-3.5" /> Preço (R$) *
                  </Label>
                  <Input required placeholder="0,00" value={procValue} onChange={e => setProcValue(e.target.value)} disabled={saving} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-neutral-600 flex items-center gap-1">
                    <ClockIcon className="h-3.5 w-3.5" /> Duração (min) *
                  </Label>
                  <Input type="number" required placeholder="60" value={procDuration} onChange={e => setProcDuration(e.target.value)} disabled={saving} />
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between rounded-xl bg-neutral-50 border p-3">
                <div>
                  <p className="text-xs font-bold text-neutral-800">Procedimento Ativo</p>
                  <p className="text-[10px] text-neutral-500">Inativos não aparecem em novos agendamentos.</p>
                </div>
                <Toggle checked={procAtivo} onChange={() => setProcAtivo(!procAtivo)} />
              </div>

              {/* Commissions per professional */}
              <div className="space-y-3 pt-2 border-t border-neutral-100">
                <Label className="text-xs font-bold text-neutral-600 flex items-center gap-1">
                  <UsersIcon className="h-3.5 w-3.5" /> Comissões por Profissional
                </Label>
                <p className="text-[10px] text-neutral-400">Configure a comissão (%) ou valor fixo (R$) para cada membro ativo da clínica.</p>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {teamMembers.map((member) => {
                    const comm = commissions[member.id] || { type: "percentage", value: "0" };
                    return (
                      <div key={member.id} className="flex items-center justify-between gap-3 text-xs p-2 rounded-lg border bg-neutral-50/50">
                        <span className="font-semibold text-neutral-700 truncate">{member.name}</span>
                        <div className="flex items-center gap-2">
                          <select
                            value={comm.type}
                            onChange={(e) => {
                              setCommissions({
                                ...commissions,
                                [member.id]: { ...comm, type: e.target.value as "percentage" | "fixed" }
                              });
                            }}
                            className="h-8 text-xs rounded border border-neutral-200 bg-white px-1.5 focus:outline-none"
                          >
                            <option value="percentage">% Percentual</option>
                            <option value="fixed">R$ Fixo</option>
                          </select>
                          <input
                            type="text"
                            placeholder="0"
                            value={comm.value}
                            onChange={(e) => {
                              setCommissions({
                                ...commissions,
                                [member.id]: { ...comm, value: e.target.value }
                              });
                            }}
                            className="h-8 w-16 text-center text-xs rounded border border-neutral-200 bg-white focus:outline-none"
                          />
                        </div>
                      </div>
                    );
                  })}
                  {teamMembers.length === 0 && (
                    <p className="text-xs text-neutral-400 italic">Nenhum profissional cadastrado na equipe.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50">
              <Button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 rounded-xl">
                {saving ? <><Loader2Icon className="h-4 w-4 animate-spin mr-2" />Salvando...</> : "Salvar Procedimento"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ═══ ROOM MODAL ═════════════════════════════════════════ */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveRoom}
            className="bg-white w-full max-w-md rounded-2xl border border-neutral-200 p-6 space-y-4 shadow-2xl text-left"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-neutral-900 uppercase tracking-wide">
                {editingRoom ? "Editar Sala" : "Nova Sala"}
              </h2>
              <button type="button" onClick={() => setIsRoomModalOpen(false)} className="text-neutral-400 hover:text-neutral-700">
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-neutral-600">Nome/Número da Sala *</Label>
              <Input required placeholder="Ex: Sala VIP 1" value={roomName} onChange={e => setRoomName(e.target.value)} disabled={saving} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-neutral-50 border p-3">
              <div>
                <p className="text-xs font-bold text-neutral-800">Sala Ativa</p>
                <p className="text-[10px] text-neutral-500">Salas inativas não recebem novos agendamentos.</p>
              </div>
              <Toggle checked={roomActive} onChange={() => setRoomActive(!roomActive)} />
            </div>
            <Button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 rounded-xl">
              {saving ? "Salvando..." : "Salvar Sala"}
            </Button>
          </form>
        </div>
      )}

      {/* ═══ PACKAGE MODAL ══════════════════════════════════════ */}
      {isPkgModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSavePackage}
            className="bg-white w-full max-w-lg rounded-2xl border border-neutral-200 shadow-2xl text-left overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50">
              <h2 className="text-sm font-black text-neutral-900 uppercase tracking-wide">
                {editingPkg ? "Editar Pacote" : "Novo Pacote"}
              </h2>
              <button type="button" onClick={() => setIsPkgModalOpen(false)} className="text-neutral-400 hover:text-neutral-700">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-neutral-600">Nome do Pacote *</Label>
                <Input required placeholder="Ex: Pacote Botox + Preenchimento" value={pkgName} onChange={e => setPkgName(e.target.value)} disabled={saving} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-neutral-600">Descrição (opcional)</Label>
                <textarea
                  placeholder="Descreva o que está incluso..."
                  value={pkgDescription}
                  onChange={e => setPkgDescription(e.target.value)}
                  rows={2}
                  disabled={saving}
                  className="w-full text-sm rounded-md border border-neutral-200 bg-white px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-neutral-600 flex items-center gap-1">
                    <DollarSignIcon className="h-3.5 w-3.5" /> Preço Total (R$) *
                  </Label>
                  <Input required placeholder="0,00" value={pkgPrice} onChange={e => setPkgPrice(e.target.value)} disabled={saving} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-neutral-600 flex items-center gap-1">
                    <ClockIcon className="h-3.5 w-3.5" /> Validade (dias)
                  </Label>
                  <Input type="number" placeholder="Ex: 180" value={pkgValidity} onChange={e => setPkgValidity(e.target.value)} disabled={saving} />
                </div>
              </div>

              {/* Package items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-neutral-600 flex items-center gap-1">
                    <ActivityIcon className="h-3.5 w-3.5" /> Serviços Incluídos
                  </Label>
                  <button
                    type="button"
                    onClick={addPkgItem}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <PlusIcon className="h-3.5 w-3.5" /> Adicionar
                  </button>
                </div>
                <div className="space-y-2">
                  {pkgItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-neutral-50 rounded-lg p-2.5">
                      <select
                        value={item.procedure_name}
                        onChange={e => {
                          const updated = [...pkgItems];
                          updated[idx].procedure_name = e.target.value;
                          setPkgItems(updated);
                        }}
                        className="flex-1 text-xs h-8 rounded-md border border-neutral-200 bg-white px-2 focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Selecione um procedimento...</option>
                        {procedures.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        <option value="__custom__">Outro (digitar)</option>
                      </select>
                      {item.procedure_name === "__custom__" && (
                        <Input
                          placeholder="Nome do serviço"
                          value={item.procedure_name === "__custom__" ? "" : item.procedure_name}
                          onChange={e => {
                            const updated = [...pkgItems];
                            updated[idx].procedure_name = e.target.value;
                            setPkgItems(updated);
                          }}
                          className="flex-1 h-8 text-xs"
                        />
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-neutral-500 font-bold">Sessões:</span>
                        <Input
                          type="number"
                          min={1}
                          value={item.sessions}
                          onChange={e => {
                            const updated = [...pkgItems];
                            updated[idx].sessions = parseInt(e.target.value) || 1;
                            setPkgItems(updated);
                          }}
                          className="w-14 h-8 text-xs text-center"
                        />
                      </div>
                      <button type="button" onClick={() => removePkgItem(idx)} className="text-rose-400 hover:text-rose-600 shrink-0">
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {pkgItems.length === 0 && (
                    <p className="text-xs text-neutral-400 italic text-center py-4">
                      Clique em &quot;Adicionar&quot; para incluir serviços no pacote.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50">
              <Button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 rounded-xl">
                {saving ? <><Loader2Icon className="h-4 w-4 animate-spin mr-2" />Salvando...</> : "Salvar Pacote"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
