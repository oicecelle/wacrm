"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Coins, Loader2, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CURRENCIES } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

/**
 * Deals settings — account-wide default currency.
 *
 * One currency per account (issue #218): the chosen code seeds new
 * deals and formats every aggregated total. Existing deals keep their
 * own saved currency. Writes go straight to `accounts.default_currency`;
 * the `accounts_update` RLS policy (017) already restricts that to
 * admins+, so non-admins see a disabled, read-only control.
 */
export function DealsSettings() {
  const supabase = createClient();
  const {
    accountId,
    defaultCurrency,
    canEditSettings,
    profileLoading,
    refreshProfile,
  } = useAuth();

  const [selected, setSelected] = useState(defaultCurrency);
  const [saving, setSaving] = useState(false);

  // Follow-up settings state
  const [followupDelayHours, setFollowupDelayHours] = useState(4);
  const [followupScheduleType, setFollowupScheduleType] = useState<"next_day_at_time" | "hours_after">("next_day_at_time");
  const [followupSendTime, setFollowupSendTime] = useState("10:00");
  const [followupHoursAfter, setFollowupHoursAfter] = useState(24);
  const [followupUseAi, setFollowupUseAi] = useState(true);
  const [followupDefaultTemplate, setFollowupDefaultTemplate] = useState("");
  const [leadSources, setLeadSources] = useState<string[]>([]);
  const [newSource, setNewSource] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Keep the select in sync once the profile (and its account default)
  // resolves, and after a save round-trips through refreshProfile.
  useEffect(() => {
    setSelected(defaultCurrency);
  }, [defaultCurrency]);

  // Load follow-up settings
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      setLoadingSettings(true);
      try {
        const res = await fetch("/api/account/followup-settings");
        if (res.ok) {
          const data = await res.json();
          if (data.settings && !cancelled) {
            setFollowupDelayHours(data.settings.followup_delay_hours ?? 4);
            setFollowupScheduleType(data.settings.followup_schedule_type ?? "next_day_at_time");
            setFollowupSendTime(data.settings.followup_send_time ?? "10:00");
            setFollowupHoursAfter(data.settings.followup_hours_after ?? 24);
            setFollowupUseAi(data.settings.followup_use_ai ?? true);
            setFollowupDefaultTemplate(data.settings.followup_default_template ?? "");
            setLeadSources(data.settings.lead_sources ?? []);
          }
        }
      } catch (e) {
        console.error("Error loading follow-up settings", e);
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const dirty = selected !== defaultCurrency;

  async function handleSaveCurrency() {
    if (!accountId || !dirty) return;
    setSaving(true);
    const { error } = await supabase
      .from("accounts")
      .update({ default_currency: selected })
      .eq("id", accountId);
    if (error) {
      toast.error("Failed to save default currency");
      setSaving(false);
      return;
    }
    await refreshProfile();
    setSaving(false);
    toast.success("Default currency updated");
  }

  async function handleSaveFollowup() {
    if (!accountId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/account/followup-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followup_delay_hours: followupDelayHours,
          followup_schedule_type: followupScheduleType,
          followup_send_time: followupSendTime,
          followup_hours_after: followupHoursAfter,
          followup_use_ai: followupUseAi,
          followup_default_template: followupDefaultTemplate || null,
          lead_sources: leadSources,
        }),
      });

      if (res.ok) {
        toast.success("Configurações de follow-up salvas com sucesso!");
      } else {
        toast.error("Erro ao salvar configurações de follow-up");
      }
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  }

  function handleAddSource(e: React.FormEvent) {
    e.preventDefault();
    const clean = newSource.trim();
    if (!clean) return;
    if (leadSources.includes(clean)) {
      toast.error("Esta origem já existe");
      return;
    }
    setLeadSources([...leadSources, clean]);
    setNewSource("");
  }

  function handleRemoveSource(src: string) {
    setLeadSources(leadSources.filter((s) => s !== src));
  }

  return (
    <section className="max-w-2xl space-y-6 animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Configurações de Vendas & CRM"
        description="Gerencie a moeda padrão, regras de follow-up automático com IA e origens de leads do seu CRM."
      />

      {/* Currency Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Coins className="size-4 text-primary" />
            Moeda Padrão
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            A moeda utilizada para novos negócios, pipeline e totais do painel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-xs">
            <Label className="text-muted-foreground">Moeda</Label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={!canEditSettings || profileLoading}
              className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </select>
            {!canEditSettings && (
              <p className="text-xs text-muted-foreground">
                Apenas administradores podem alterar a moeda padrão.
              </p>
            )}
          </div>

          {canEditSettings && (
            <Button
              onClick={handleSaveCurrency}
              disabled={saving || !dirty}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Moeda"
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Follow-up Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <svg
              className="size-4 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Follow-up Automático
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Configure quando o sistema deve criar e sugerir mensagens automáticas de follow-up para leads sem resposta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSettings ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label className="text-muted-foreground">Considerar sem resposta após (horas)</Label>
                  <input
                    type="number"
                    min="1"
                    value={followupDelayHours}
                    onChange={(e) => setFollowupDelayHours(Math.max(1, parseInt(e.target.value) || 4))}
                    disabled={!canEditSettings}
                    className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-muted-foreground">Forma de Agendamento</Label>
                  <select
                    value={followupScheduleType}
                    onChange={(e) => setFollowupScheduleType(e.target.value as any)}
                    disabled={!canEditSettings}
                    className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="next_day_at_time">Programar para o dia seguinte em horário fixo</option>
                    <option value="hours_after">Programar exatas X horas depois</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {followupScheduleType === "next_day_at_time" ? (
                  <div className="grid gap-2">
                    <Label className="text-muted-foreground">Horário no dia seguinte</Label>
                    <input
                      type="time"
                      value={followupSendTime}
                      onChange={(e) => setFollowupSendTime(e.target.value)}
                      disabled={!canEditSettings}
                      className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Label className="text-muted-foreground">Intervalo (horas após)</Label>
                    <input
                      type="number"
                      min="1"
                      value={followupHoursAfter}
                      onChange={(e) => setFollowupHoursAfter(Math.max(1, parseInt(e.target.value) || 24))}
                      disabled={!canEditSettings}
                      className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="followupUseAi"
                    checked={followupUseAi}
                    onChange={(e) => setFollowupUseAi(e.target.checked)}
                    disabled={!canEditSettings}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <Label htmlFor="followupUseAi" className="text-sm font-semibold cursor-pointer">
                    Usar IA (GPT-4o mini) para criar sugestão personalizada
                  </Label>
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="text-muted-foreground">Mensagem / Template padrão de follow-up</Label>
                <textarea
                  value={followupDefaultTemplate}
                  onChange={(e) => setFollowupDefaultTemplate(e.target.value)}
                  disabled={!canEditSettings}
                  placeholder="Olá! Tudo bem? Passando para saber se ficou com alguma dúvida sobre o que conversamos..."
                  className="min-h-[90px] w-full rounded-lg border border-border bg-muted p-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {canEditSettings && (
                <Button
                  onClick={handleSaveFollowup}
                  disabled={saving}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Configurações de Follow-up"
                  )}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lead Sources Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <svg
              className="size-4 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Origens do Lead (Lead Sources)
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Cadastre as origens possíveis dos seus leads para marcar em qual canal ele chegou até sua clínica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSettings ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={handleAddSource} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ex: Facebook Ads, Influenciador..."
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  disabled={!canEditSettings}
                  className="h-9 flex-1 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <Button
                  type="submit"
                  disabled={!canEditSettings || !newSource.trim()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-3 h-9"
                >
                  Adicionar
                </Button>
              </form>

              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-border bg-muted/30">
                {leadSources.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">Nenhuma origem cadastrada. Adicione acima.</span>
                ) : (
                  leadSources.map((src) => (
                    <span
                      key={src}
                      className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded-full"
                    >
                      {src}
                      {canEditSettings && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSource(src)}
                          className="hover:bg-blue-200 rounded-full p-0.5"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </span>
                  ))
                )}
              </div>

              {canEditSettings && (
                <Button
                  onClick={handleSaveFollowup}
                  disabled={saving}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Origens"
                  )}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
