import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Bot, User, ImagePlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

import { getApiBase } from "@/lib/capacitor";
import { getAuthHeaders } from "@/lib/auth-token";
const BASE = getApiBase();

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Come emetto uno scontrino?",
  "Come annullo un documento?",
  "Come faccio un reso?",
  "Come faccio il login?",
  "Quali aliquote IVA esistono?",
  "Come aggiungo articoli al catalogo?",
];

function renderBold(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

function formatMessage(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("### ")) {
      return (
        <p key={i} className="font-semibold text-[#1e3a5f] mt-3 mb-1 text-sm">
          {line.replace("### ", "")}
        </p>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <p key={i} className="font-bold text-[#1e3a5f] mt-3 mb-1">
          {line.replace("## ", "")}
        </p>
      );
    }
    if (line === "---") return <hr key={i} className="my-2 border-blue-100" />;
    if (line.startsWith("⚠️")) {
      return (
        <p key={i} className="text-amber-700 bg-amber-50 rounded px-2 py-1 text-xs mt-1">
          {renderBold(line)}
        </p>
      );
    }
    const trimmed = line.trim();
    const isNumbered = /^\d+\./.test(trimmed);
    const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ");
    if (isNumbered || isBullet) {
      return (
        <p key={i} className={`text-sm ${i > 0 ? "mt-0.5" : ""} pl-2`}>
          {renderBold(line)}
        </p>
      );
    }
    if (!line.trim()) return <div key={i} className="h-1" />;
    return <p key={i} className="text-sm">{renderBold(line)}</p>;
  });
}

export function GuidaChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("azienda_logo");
    if (saved) setLogoUrl(saved);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setLogoUrl(url);
      localStorage.setItem("azienda_logo", url);
    };
    reader.readAsDataURL(file);
  };

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isLoading) return;

    const userMsg: Message = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) throw new Error("Errore di rete");

      const assistantMsg: Message = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistantMsg]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          try {
            const data = JSON.parse(json) as { content?: string; done?: boolean; error?: string };
            if (data.error) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return [...prev.slice(0, -1), { ...last, content: last.content + data.error! }];
                }
                return prev;
              });
            } else if (data.content) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return [...prev.slice(0, -1), { ...last, content: last.content + data.content! }];
                }
                return prev;
              });
            }
          } catch {
            // ignore malformed JSON
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Errore di connessione. Controlla la rete e riprova." },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo + title */}
      <div className="shrink-0 flex items-center gap-3 pb-3 border-b border-gray-200 mb-3">
        <div
          className="relative cursor-pointer group"
          onClick={() => fileRef.current?.click()}
          title="Clicca per caricare il logo aziendale"
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo aziendale"
              className="h-10 w-auto max-w-[120px] object-contain rounded"
            />
          ) : (
            <div className="h-10 w-24 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center gap-0.5 bg-gray-50 group-hover:border-[#1e3a5f] group-hover:bg-blue-50 transition-colors">
              <ImagePlus className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#1e3a5f]" />
              <span className="text-[9px] text-gray-400 group-hover:text-[#1e3a5f] leading-tight text-center">
                Logo
              </span>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#1e3a5f] shrink-0" />
            <span className="font-semibold text-[#1e3a5f] text-sm">Assistente Scontrini</span>
          </div>
          <p className="text-xs text-gray-500">Chiedi come usare l'app</p>
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {messages.length === 0 && (
          <>
            <div className="flex gap-2 items-start">
              <div className="w-7 h-7 rounded-full bg-[#1e3a5f] flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
                <p className="text-sm text-gray-800">
                  Ciao! 👋 Sono il tuo assistente per l'app Scontrini Fiscali. Dimmi cosa vuoi fare e ti guido passo per passo.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-9">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  disabled={isLoading}
                  className="text-xs bg-white border border-[#1e3a5f]/30 text-[#1e3a5f] rounded-full px-3 py-1.5 hover:bg-[#1e3a5f] hover:text-white transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 items-start ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                msg.role === "user" ? "bg-gray-200" : "bg-[#1e3a5f]"
              }`}
            >
              {msg.role === "user" ? (
                <User className="w-4 h-4 text-gray-600" />
              ) : (
                <Bot className="w-4 h-4 text-white" />
              )}
            </div>
            <div
              className={`rounded-2xl px-4 py-3 shadow-sm max-w-[85%] ${
                msg.role === "user"
                  ? "bg-[#1e3a5f] text-white rounded-tr-sm"
                  : "bg-gray-100 text-gray-800 rounded-tl-sm"
              }`}
            >
              {msg.role === "user" ? (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div className="text-sm leading-relaxed space-y-0.5">
                  {msg.content ? formatMessage(msg.content) : (
                    <span className="text-gray-400 italic">...</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-full bg-[#1e3a5f] flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Sto cercando la risposta...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 pt-3 border-t border-gray-200 mt-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scrivi la tua domanda..."
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f] disabled:opacity-50 max-h-24 overflow-y-auto"
            style={{ lineHeight: "1.4" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 96) + "px";
            }}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            size="icon"
            className="bg-[#1e3a5f] hover:bg-[#162d4a] rounded-xl h-10 w-10 shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-gray-400 text-center mt-1.5">
          Invio per inviare · Shift+Invio per andare a capo
        </p>
      </div>
    </div>
  );
}
