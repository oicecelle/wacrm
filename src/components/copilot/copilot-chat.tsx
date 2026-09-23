"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  SparklesIcon,
  SendIcon,
  Loader2Icon,
  BotIcon,
  UserIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PaperclipIcon,
  MicIcon,
} from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Mostre os leads mais quentes",
  "Resumo do dashboard",
  "Quais automações estão ativas?",
  "Buscar contato...",
];

const COLLAPSED_STORAGE_KEY = "lia-chat-collapsed";

function getStoredCollapsed(): boolean | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

/**
 * The LIA bar — anchored to the bottom of every screen, horizontal
 * (like this chat's own input), open by default on desktop so
 * "type instead of click" reads as the primary way to use the app,
 * not a hidden extra. Collapses to just the input row via the arrow;
 * the choice is remembered per browser. Defaults to collapsed on
 * narrow (mobile) viewports on first visit only — after that, the
 * person's own last choice always wins, on any device.
 */
export function CopilotChat() {
  const { accountId } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const stored = getStoredCollapsed();
    if (stored !== null) return stored;
    if (typeof window !== "undefined") return window.innerWidth < 768;
    return false;
  });
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Olá! Sou a LIA 🚀\n\nPosso agendar, buscar leads, criar/editar automações e fluxos, mostrar indicadores, disparar mensagens e atualizar o CRM. É só me pedir!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  function setCollapsedAndPersist(next: boolean) {
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
    } catch {
      // Storage can fail (private browsing, quota) — the toggle
      // still works for this session, just won't be remembered.
    }
    if (!next) {
      // Expanding — bring focus back to the input like opening any
      // chat would.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  useEffect(() => {
    const handleOpenCopilot = () => setCollapsedAndPersist(false);
    window.addEventListener("open-copilot", handleOpenCopilot);
    return () => window.removeEventListener("open-copilot", handleOpenCopilot);
  }, []);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading || !accountId) return;
    setInput("");
    if (collapsed) setCollapsedAndPersist(false);

    const newMessages: Message[] = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          account_id: accountId,
        }),
      });

      const data = await res.json();
      const reply = data.reply || "Não consegui processar sua solicitação. Tente novamente.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Erro de conexão. Verifique sua internet e tente novamente." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const notYetAvailable = () => toast("Em breve — por enquanto, só texto mesmo.");

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="pointer-events-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Collapse toggle strip */}
        <button
          onClick={() => setCollapsedAndPersist(!collapsed)}
          aria-label={collapsed ? "Abrir LIA" : "Recolher LIA"}
          className="flex w-full items-center justify-between bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-white"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-card/20">
              <SparklesIcon className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-black leading-none">LIA</span>
            <span className="text-[10px] leading-none text-white/70">Assistente do LeadPluz</span>
          </div>
          {collapsed ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
        </button>

        {!collapsed && (
          <>
            {/* Messages */}
            <div className="max-h-[50vh] flex-1 space-y-3 overflow-y-auto p-3 sm:max-h-[55vh]">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      m.role === "assistant" ? "bg-gradient-to-br from-blue-500 to-violet-500 text-white" : "bg-neutral-200 text-neutral-600"
                    }`}
                  >
                    {m.role === "assistant" ? <BotIcon className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
                  </div>
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                      m.role === "user" ? "rounded-tr-sm bg-blue-600 text-white" : "rounded-tl-sm bg-neutral-100 text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500">
                    <BotIcon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-neutral-100 px-3 py-2.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Suggestions (only on the initial greeting) */}
            {messages.length <= 1 && (
              <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="rounded-full border border-border bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-blue-50 hover:text-blue-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Input row — always visible, even collapsed, so typing works either way */}
        <div className="border-t border-neutral-100 p-2.5 sm:p-3">
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-neutral-50 px-2 py-1.5 transition-all focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-300 sm:px-3 sm:py-2">
            <button
              type="button"
              onClick={notYetAvailable}
              aria-label="Anexar arquivo"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground"
            >
              <PaperclipIcon className="h-3.5 w-3.5" />
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Fale com a LIA — pergunte ou peça algo..."
              disabled={loading}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
            <button
              type="button"
              onClick={notYetAvailable}
              aria-label="Gravar áudio"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground"
            >
              <MicIcon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              aria-label="Enviar mensagem"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              {loading ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <SendIcon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
