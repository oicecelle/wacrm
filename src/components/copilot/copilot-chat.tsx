"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  SparklesIcon,
  XIcon,
  SendIcon,
  Loader2Icon,
  BotIcon,
  UserIcon,
  MinimizeIcon,
  MaximizeIcon,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Mostre os leads mais quentes",
  "Resumo do dashboard",
  "Buscar contato...",
  "Criar lembrete...",
];

export function CopilotChat() {
  // Temporarily hidden on Agenda — that page gets its own floating
  // "+" button for quick appointment creation instead, and the two
  // floating buttons would otherwise collide in the same corner.
  const pathname = usePathname();
  const hiddenOnThisPage = pathname?.startsWith("/agenda");

  const { accountId } = useAuth();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open && !minimized) inputRef.current?.focus();
  }, [open, minimized]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setMinimized(false);
    if (messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: "Olá! Sou o Copiloto do LeadPluz 🚀\n\nPosso te ajudar a agendar, buscar leads, criar lembretes, atualizar o CRM e muito mais. É só me pedir!",
      }]);
    }
  }, [messages.length]);

  useEffect(() => {
    const handleOpenCopilot = () => {
      handleOpen();
    };
    window.addEventListener("open-copilot", handleOpenCopilot);
    return () => {
      window.removeEventListener("open-copilot", handleOpenCopilot);
    };
  }, [handleOpen]);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading || !accountId) return;
    setInput("");

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

  if (hiddenOnThisPage) return null;

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        id="copilot-open-btn"
        aria-label="Abrir Copiloto"
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#2585fc] to-[#003bbd] text-white shadow-lg hover:shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all duration-200 group"
      >
        <SparklesIcon className="h-5.5 w-5.5 group-hover:rotate-12 transition-transform" />
        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-white animate-pulse" />
      </button>
    );
  }

  return (
    <div
      id="copilot-panel"
      className={`fixed bottom-5 right-5 z-50 flex flex-col rounded-2xl border border-border bg-card shadow-2xl transition-all duration-200 ${
        minimized ? "h-14 w-72" : "h-[520px] w-96"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-card/20 flex items-center justify-center">
            <SparklesIcon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-black leading-none">Copiloto</p>
            <p className="text-[10px] text-white/70 leading-none mt-0.5">LeadPluz AI</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(!minimized)}
            className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-card/20 transition-colors"
            aria-label={minimized ? "Expandir" : "Minimizar"}
          >
            {minimized ? <MaximizeIcon className="h-3.5 w-3.5" /> : <MinimizeIcon className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-card/20 transition-colors"
            aria-label="Fechar copiloto"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                  m.role === "assistant"
                    ? "bg-gradient-to-br from-blue-500 to-violet-500 text-white"
                    : "bg-neutral-200 text-neutral-600"
                }`}>
                  {m.role === "assistant" ? <BotIcon className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
                </div>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-blue-600 text-white rounded-tr-sm"
                      : "bg-neutral-100 text-foreground rounded-tl-sm"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shrink-0">
                  <BotIcon className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="bg-neutral-100 rounded-2xl rounded-tl-sm px-3 py-2.5 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions (only on first message) */}
          {messages.length <= 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="text-[11px] font-semibold bg-neutral-100 hover:bg-blue-50 hover:text-blue-700 border border-border rounded-full px-2.5 py-1 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-neutral-100 shrink-0">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-neutral-50 px-3 py-2 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-300 transition-all">
              <input
                ref={inputRef}
                id="copilot-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte ou peça algo..."
                disabled={loading}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground disabled:opacity-50"
              />
              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                id="copilot-send-btn"
                aria-label="Enviar mensagem"
                className="h-7 w-7 rounded-lg bg-blue-600 text-white flex items-center justify-center disabled:opacity-40 hover:bg-blue-700 transition-colors shrink-0"
              >
                {loading ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <SendIcon className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-center text-[9px] text-muted-foreground mt-1.5">
              Powered by GPT-4o · LeadPluz AI
            </p>
          </div>
        </>
      )}
    </div>
  );
}
