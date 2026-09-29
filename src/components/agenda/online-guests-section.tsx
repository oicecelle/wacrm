"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Mail, MessageCircle, UserPlus, Video, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addGuestEmails, isValidGuestEmail, MAX_GUESTS } from "@/lib/appointments/guests";

interface OnlineGuestsSectionProps {
  isOnline: boolean;
  onIsOnlineChange: (value: boolean) => void;
  guestEmails: string[];
  onGuestEmailsChange: (emails: string[]) => void;
  /** Google Meet link, once it has been generated. */
  meetLink?: string | null;
  /** The patient's own e-mail, offered as a one-click guest. */
  patientEmail?: string | null;
  patientPhone?: string | null;
  /** Message sent along with the link when sharing on WhatsApp. */
  shareText?: string;
  disabled?: boolean;
}

/**
 * "Atendimento online + convidados" block of the appointment form.
 * Guests become attendees of the Google Calendar event (Google e-mails
 * them the invitation); an online appointment gets a Google Meet room
 * generated when it's saved. Both need the professional's Google
 * Calendar connected, which the hint text says out loud.
 */
export function OnlineGuestsSection({
  isOnline,
  onIsOnlineChange,
  guestEmails,
  onGuestEmailsChange,
  meetLink,
  patientEmail,
  patientPhone,
  shareText,
  disabled,
}: OnlineGuestsSectionProps) {
  const [draft, setDraft] = useState("");

  const commitDraft = () => {
    if (!draft.trim()) return;
    const r = addGuestEmails(guestEmails, draft);
    if (r.added.length > 0) onGuestEmailsChange(r.emails);
    if (r.invalid.length > 0) toast.error(`E-mail inválido: ${r.invalid.join(", ")}`);
    else if (r.overLimit) toast.error(`Limite de ${MAX_GUESTS} convidados por agendamento.`);
    else if (r.added.length === 0 && r.duplicates.length > 0) toast.info("Esse e-mail já está na lista.");
    // Keep only what wasn't accepted so the person can fix it.
    setDraft(r.invalid.join(", "));
  };

  const removeGuest = (email: string) => onGuestEmailsChange(guestEmails.filter((e) => e !== email));

  const patientEmailClean = patientEmail?.trim().toLowerCase() || "";
  const canAddPatient =
    !!patientEmailClean && isValidGuestEmail(patientEmailClean) && !guestEmails.includes(patientEmailClean);

  const copyLink = async () => {
    if (!meetLink) return;
    try {
      await navigator.clipboard.writeText(meetLink);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  };

  const whatsappHref = (() => {
    if (!meetLink || !patientPhone) return null;
    const digits = patientPhone.replace(/\D/g, "");
    if (!digits) return null;
    const full = digits.length <= 11 ? `55${digits}` : digits;
    const text = `${shareText ? `${shareText} ` : "Segue o link do seu atendimento online: "}${meetLink}`;
    return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
  })();

  return (
    <div className="space-y-3 rounded-xl border border-border bg-neutral-50/50 p-3 text-left">
      {/* Online toggle */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-600">
            <Video className="h-3.5 w-3.5" /> Atendimento online
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Gera um link do Google Meet ao salvar e anexa ao evento no Google Agenda.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isOnline}
          disabled={disabled}
          onClick={() => onIsOnlineChange(!isOnline)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${isOnline ? "bg-primary" : "bg-neutral-300"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isOnline ? "translate-x-5" : "translate-x-0.5"}`}
          />
        </button>
      </div>

      {isOnline && meetLink && (
        <div className="space-y-2 rounded-lg border border-primary-soft-2 bg-primary-soft p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Link do Google Meet</p>
          <p className="break-all text-xs font-semibold text-primary">{meetLink}</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={copyLink}
              className="flex items-center gap-1 rounded-lg border border-primary-soft-2 bg-white px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary-soft"
            >
              <Copy className="h-3 w-3" /> Copiar
            </button>
            <a
              href={meetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-primary-soft-2 bg-white px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary-soft"
            >
              <ExternalLink className="h-3 w-3" /> Abrir
            </a>
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50"
              >
                <MessageCircle className="h-3 w-3" /> Enviar no WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
      {isOnline && !meetLink && (
        <p className="text-[11px] text-muted-foreground">O link aparece aqui depois de salvar o agendamento.</p>
      )}

      {/* Guests */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-600">
          <Mail className="h-3.5 w-3.5" /> Convidados (e-mail)
        </Label>
        <div className="flex gap-2">
          <Input
            type="email"
            inputMode="email"
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commitDraft();
              }
            }}
            onBlur={commitDraft}
            placeholder="nome@email.com — Enter para adicionar"
            className="h-8 rounded-xl text-xs"
          />
          <button
            type="button"
            disabled={disabled || !draft.trim()}
            onClick={commitDraft}
            className="shrink-0 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-neutral-100 disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>

        {guestEmails.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {guestEmails.map((email) => (
              <span
                key={email}
                className="flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-[11px] font-semibold text-foreground"
              >
                {email}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeGuest(email)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-neutral-200 hover:text-foreground"
                  aria-label={`Remover ${email}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {canAddPatient && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onGuestEmailsChange([...guestEmails, patientEmailClean])}
            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
          >
            <UserPlus className="h-3 w-3" /> Convidar o paciente ({patientEmailClean})
          </button>
        )}

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Os convidados recebem o convite do Google Agenda no e-mail. Funciona quando o profissional responsável tem o Google Agenda conectado (Configurações → Google Agenda).
        </p>
      </div>
    </div>
  );
}
