"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { MessageTemplate } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ChevronRight,
  LayoutTemplate,
  Loader2,
} from "lucide-react";
import { extractVariableIndices } from "@/lib/whatsapp/template-validators";

export interface TemplateSendValues {
  body: string[];
  namedValues?: Record<string, string>;
  headerText?: string;
  buttonParams?: Record<number, string>;
}

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: MessageTemplate, values: TemplateSendValues) => void;
}

function renderBodyPreview(body: string, params: string[], namedValues: Record<string, string>): string {
  const withNamed = body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, name) => {
    const value = namedValues[name];
    return value && value.trim().length > 0 ? value : `{{${name}}}`;
  });
  return withNamed.replace(/\{\{(\d+)\}\}/g, (_, raw) => {
    const idx = Number(raw) - 1;
    const value = params[idx];
    return value && value.trim().length > 0 ? value : `{{${raw}}}`;
  });
}

function extractNamedVars(text: string): string[] {
  const matches = text.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g);
  const set = new Set<string>();
  for (const m of matches) set.add(m[1]);
  return [...set];
}

interface UrlButtonSlot {
  index: number;
  text: string;
  url: string;
}

/**
 * Templates may need values for: body variables, a text-header
 * variable, and per-URL-button suffixes. Collect them all so the
 * send-message path doesn't 400 on missing parameters.
 */
function collectVariableSlots(template: MessageTemplate): {
  bodyVars: number[];
  namedVars: string[];
  headerVarCount: number;
  urlButtonSlots: UrlButtonSlot[];
} {
  const bodyVars = extractVariableIndices(template.body_text);
  // Named vars (Uazapi path, and now multi-part templates) come from
  // every part's text, not just body_text — a template built entirely
  // from parts may have an empty body_text.
  const partsText =
    Array.isArray(template.parts) && template.parts.length > 0
      ? template.parts.filter((p) => p.type === 'text').map((p) => p.text ?? '').join(' ')
      : template.body_text;
  const namedVars = bodyVars.length === 0 ? extractNamedVars(partsText) : [];
  const headerVarCount =
    template.header_type === "text" && template.header_content
      ? extractVariableIndices(template.header_content).length
      : 0;
  const urlButtonSlots: UrlButtonSlot[] = [];
  (template.buttons ?? []).forEach((b, i) => {
    if (b.type === "URL" && extractVariableIndices(b.url).length > 0) {
      urlButtonSlots.push({ index: i, text: b.text, url: b.url });
    }
  });
  return { bodyVars, namedVars, headerVarCount, urlButtonSlots };
}

export function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
}: TemplatePickerProps) {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [namedValues, setNamedValues] = useState<Record<string, string>>({});
  const [headerText, setHeaderText] = useState<string>("");
  const [buttonParams, setButtonParams] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!open || !profile?.account_id) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();

      // Meta-approved-only makes no sense for a Uazapi-connected
      // instance — there's no approval pipeline on that path. Same
      // provider check as the broadcast wizard's template picker.
      const { data: config } = await supabase
        .from("whatsapp_config")
        .select("provider_type")
        .eq("account_id", profile.account_id)
        .maybeSingle();
      const provider = (config?.provider_type as "meta" | "uazapi" | undefined) ?? "uazapi";

      let query = supabase
        .from("message_templates")
        .select("*")
        .eq("account_id", profile.account_id)
        .order("created_at", { ascending: false });

      if (provider === "meta") {
        query = query.eq("status", "APPROVED");
      } else {
        query = query.not("status", "in", "(REJECTED,DISABLED)");
      }

      const { data, error } = await query;

      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch templates:", error);
        setTemplates([]);
      } else {
        setTemplates((data as MessageTemplate[]) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, profile?.account_id]);

  function resetSelection() {
    setSelected(null);
    setParams([]);
    setNamedValues({});
    setHeaderText("");
    setButtonParams({});
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetSelection();
    onOpenChange(next);
  }

  function pickTemplate(template: MessageTemplate) {
    const slots = collectVariableSlots(template);
    const noInputsNeeded =
      slots.bodyVars.length === 0 &&
      slots.namedVars.length === 0 &&
      slots.headerVarCount === 0 &&
      slots.urlButtonSlots.length === 0;
    if (noInputsNeeded) {
      onSelect(template, { body: [] });
      handleOpenChange(false);
      return;
    }
    setSelected(template);
    setParams(new Array(slots.bodyVars.length).fill(""));
    setNamedValues(Object.fromEntries(slots.namedVars.map((v) => [v, ""])));
    setHeaderText("");
    setButtonParams({});
  }

  function confirm() {
    if (!selected) return;
    const values: TemplateSendValues = { body: params, namedValues };
    if (headerText.trim()) values.headerText = headerText.trim();
    if (Object.keys(buttonParams).length > 0) {
      values.buttonParams = Object.fromEntries(
        Object.entries(buttonParams).map(([k, v]) => [Number(k), v.trim()]),
      );
    }
    onSelect(selected, values);
    handleOpenChange(false);
  }

  const slots = useMemo(
    () => (selected ? collectVariableSlots(selected) : null),
    [selected],
  );
  const canConfirm =
    !!selected &&
    !!slots &&
    slots.bodyVars.every((_, i) => (params[i] ?? "").trim().length > 0) &&
    slots.namedVars.every((v) => (namedValues[v] ?? "").trim().length > 0) &&
    (slots.headerVarCount === 0 || headerText.trim().length > 0) &&
    slots.urlButtonSlots.every(
      (s) => (buttonParams[s.index] ?? "").trim().length > 0,
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-popover-foreground">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            {selected ? selected.name : "Enviar modelo"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {selected
              ? "Preencha as variáveis pra montar este modelo."
              : "Escolha um modelo pra enviar pra este contato."}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-md border border-border bg-background/50 p-6 text-center">
                <p className="text-sm text-popover-foreground">Nenhum modelo disponível</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Aprove um modelo no Gerenciador do WhatsApp da Meta, ou crie um em
                  Configurações → Modelos.
                </p>
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTemplate(t)}
                  className="w-full rounded-md border border-border bg-background/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-popover"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-popover-foreground">
                          {t.name}
                        </p>
                        <Badge className="border border-primary/30 bg-primary/20 text-[10px] text-primary">
                          {t.category}
                        </Badge>
                        {t.language && (
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {t.language}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {t.body_text}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-background/50 p-3">
              <p className="mb-1 text-xs text-muted-foreground">Prévia</p>
              <p className="whitespace-pre-wrap text-sm text-popover-foreground">
                {renderBodyPreview(selected.body_text, params, namedValues)}
              </p>
              {selected.footer_text && (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  {selected.footer_text}
                </p>
              )}
            </div>
            {slots && slots.headerVarCount > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {`Cabeçalho {{1}}`}
                </Label>
                <Input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="Valor da variável do cabeçalho"
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            )}
            {slots?.namedVars.map((v) => (
              <div key={v} className="space-y-1">
                <Label className="text-xs text-popover-foreground">{`{{${v}}}`}</Label>
                <Input
                  value={namedValues[v] ?? ""}
                  onChange={(e) => setNamedValues((prev) => ({ ...prev, [v]: e.target.value }))}
                  placeholder={`Valor para {{${v}}}`}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            ))}
            {slots?.bodyVars.map((v, i) => (
              <div key={v} className="space-y-1">
                <Label className="text-xs text-popover-foreground">{`Corpo {{${v}}}`}</Label>
                <Input
                  value={params[i] ?? ""}
                  onChange={(e) => {
                    const next = [...params];
                    next[i] = e.target.value;
                    setParams(next);
                  }}
                  placeholder={`Valor para {{${v}}}`}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            ))}
            {slots?.urlButtonSlots.map((slot) => (
              <div key={slot.index} className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {`Botão de URL "${slot.text}" — valor para `}{`{{1}}`}
                </Label>
                <Input
                  value={buttonParams[slot.index] ?? ""}
                  onChange={(e) =>
                    setButtonParams((prev) => ({
                      ...prev,
                      [slot.index]: e.target.value,
                    }))
                  }
                  placeholder="Sufixo da URL"
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-[10px] text-muted-foreground break-all">
                  URL final: {slot.url.replace(/\{\{1\}\}/g, buttonParams[slot.index] || "{{1}}")}
                </p>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {selected ? (
            <>
              <Button
                variant="outline"
                onClick={resetSelection}
                className="border-border text-popover-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
              <Button
                disabled={!canConfirm}
                onClick={confirm}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Enviar modelo
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="border-border text-popover-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
