'use client';

import { useState } from 'react';
import { X, ArrowRight, ArrowLeft, Loader2, Send } from 'lucide-react';

export interface BioFormField {
  id: string;
  label: string;
  type: 'text' | 'dropdown' | 'textarea';
  options?: string[];
  required?: boolean;
}

export interface BioFormDefinition {
  id: string;
  name: string;
  fields: BioFormField[];
  whatsapp_message_template: string;
}

interface BioFormModalProps {
  form: BioFormDefinition;
  whatsappNumber: string; // digits only, with country code
  themeColor: string;
  onClose: () => void;
}

/**
 * One question per screen, typeform-style — the clinic configures the
 * fields and a message template with {{field_id}} placeholders; on
 * the last step this builds the final WhatsApp message and opens
 * wa.me with it pre-filled, so the lead only has to hit send.
 */
export function BioFormModal({ form, whatsappNumber, themeColor, onClose }: BioFormModalProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const field = form.fields[stepIndex];
  const isLastStep = stepIndex === form.fields.length - 1;
  const currentValue = answers[field?.id] ?? '';
  const canAdvance = !field?.required || currentValue.trim().length > 0;

  function setAnswer(value: string) {
    setAnswers((prev) => ({ ...prev, [field.id]: value }));
  }

  function goNext() {
    if (!canAdvance) return;
    if (isLastStep) {
      submit();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function goBack() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  function submit() {
    setSubmitting(true);
    let message = form.whatsapp_message_template;
    for (const f of form.fields) {
      const value = answers[f.id] ?? '';
      message = message.replaceAll(`{{${f.id}}}`, value);
    }
    const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.location.href = waUrl;
    // Left true so the button stays in its "enviando" state — the
    // page is about to navigate away to WhatsApp, and flipping this
    // back would just flash the form again for a moment first.
  }

  if (form.fields.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Progress */}
        <div className="h-1 w-full bg-neutral-100">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${((stepIndex + 1) / form.fields.length) * 100}%`,
              backgroundColor: themeColor,
            }}
          />
        </div>

        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            {stepIndex + 1} de {form.fields.length}
          </span>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-8 min-h-[180px] flex flex-col justify-center">
          <label className="mb-3 block text-base font-bold text-neutral-800">{field.label}</label>

          {field.type === 'text' && (
            <input
              autoFocus
              value={currentValue}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && goNext()}
              className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
              placeholder="Digite aqui..."
            />
          )}

          {field.type === 'textarea' && (
            <textarea
              autoFocus
              value={currentValue}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none"
              placeholder="Digite aqui..."
            />
          )}

          {field.type === 'dropdown' && (
            <div className="space-y-2">
              {(field.options ?? []).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setAnswer(opt)}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                    currentValue === opt
                      ? 'border-transparent text-white'
                      : 'border-neutral-200 text-neutral-700 hover:border-neutral-300'
                  }`}
                  style={currentValue === opt ? { backgroundColor: themeColor } : undefined}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-neutral-100 px-5 py-4">
          {stepIndex > 0 && (
            <button
              onClick={goBack}
              className="flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-500 hover:bg-neutral-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          )}
          <button
            onClick={goNext}
            disabled={!canAdvance || submitting}
            className="ml-auto flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: themeColor }}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isLastStep ? (
              <Send className="h-4 w-4" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {isLastStep ? 'Enviar pelo WhatsApp' : 'Próxima'}
          </button>
        </div>
      </div>
    </div>
  );
}
