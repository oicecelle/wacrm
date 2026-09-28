"use client";

import { Clock, Coffee } from "lucide-react";
import { Label } from "@/components/ui/label";
import { WEEKDAYS, WEEKDAY_LABELS, type DaySchedule, type WeekSchedule } from "@/lib/schedule/professional-schedule";

interface ProfessionalScheduleEditorProps {
  value: WeekSchedule;
  onChange: (next: WeekSchedule) => void;
  disabled?: boolean;
}

/**
 * 7-day editor for a professional's attendance days, working hours
 * and lunch break — used from the Equipe drawer. The Agenda's
 * booking-time warning reads the same clinic_users.schedules shape
 * this writes, via lib/schedule/professional-schedule.ts.
 */
export function ProfessionalScheduleEditor({ value, onChange, disabled }: ProfessionalScheduleEditorProps) {
  function updateDay(day: keyof WeekSchedule, patch: Partial<DaySchedule>) {
    onChange({ ...value, [day]: { ...value[day], ...patch } });
  }

  function toggleLunch(day: keyof WeekSchedule, enabled: boolean) {
    updateDay(day, enabled ? { lunchStart: "12:00", lunchEnd: "13:00" } : { lunchStart: null, lunchEnd: null });
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-600">
        <Clock className="h-3.5 w-3.5" /> Horário de Atendimento
      </Label>
      <p className="text-[11px] text-muted-foreground">
        Dias, horário e almoço deste profissional. A Agenda avisa (sem bloquear) quando alguém marca fora disso.
      </p>

      <div className="space-y-1.5">
        {WEEKDAYS.map((day) => {
          const d = value[day];
          const hasLunch = !!(d.lunchStart && d.lunchEnd);
          return (
            <div
              key={day}
              className={`rounded-xl border p-2.5 transition-colors ${d.active ? "border-border bg-card" : "border-border/60 bg-neutral-50/60"}`}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={d.active}
                  disabled={disabled}
                  onClick={() => updateDay(day, { active: !d.active })}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${d.active ? "bg-blue-600" : "bg-neutral-300"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${d.active ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <span className="w-16 shrink-0 text-xs font-bold text-foreground">{WEEKDAY_LABELS[day]}</span>

                {d.active ? (
                  <div className="flex flex-1 flex-wrap items-center gap-1.5">
                    <input
                      type="time"
                      value={d.start}
                      disabled={disabled}
                      onChange={(e) => updateDay(day, { start: e.target.value })}
                      className="h-7 w-[86px] rounded-lg border border-input bg-background px-1.5 text-[11px]"
                    />
                    <span className="text-[10px] text-muted-foreground">às</span>
                    <input
                      type="time"
                      value={d.end}
                      disabled={disabled}
                      onChange={(e) => updateDay(day, { end: e.target.value })}
                      className="h-7 w-[86px] rounded-lg border border-input bg-background px-1.5 text-[11px]"
                    />
                  </div>
                ) : (
                  <span className="flex-1 text-[11px] italic text-muted-foreground">Não atende</span>
                )}
              </div>

              {d.active && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-11">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleLunch(day, !hasLunch)}
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                      hasLunch ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border text-muted-foreground hover:bg-neutral-100"
                    }`}
                  >
                    <Coffee className="h-3 w-3" /> Almoço
                  </button>
                  {hasLunch && (
                    <>
                      <input
                        type="time"
                        value={d.lunchStart ?? ""}
                        disabled={disabled}
                        onChange={(e) => updateDay(day, { lunchStart: e.target.value })}
                        className="h-7 w-[86px] rounded-lg border border-input bg-background px-1.5 text-[11px]"
                      />
                      <span className="text-[10px] text-muted-foreground">às</span>
                      <input
                        type="time"
                        value={d.lunchEnd ?? ""}
                        disabled={disabled}
                        onChange={(e) => updateDay(day, { lunchEnd: e.target.value })}
                        className="h-7 w-[86px] rounded-lg border border-input bg-background px-1.5 text-[11px]"
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
