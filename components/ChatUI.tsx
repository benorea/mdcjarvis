"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const SESSION_KEY = "jarvis_session_id";

function getSessionId(): string {
  if (typeof window === "undefined") return "default";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// Minimal ambient types so this compiles without dom-speech lib types.
type SpeechRecognitionLike = {
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

export default function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const sessionIdRef = useRef<string>("default");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionIdRef.current = getSessionId();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: app still works without offline shell caching.
      });
    }

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionCtor) {
      setVoiceSupported(true);
      const recognition: SpeechRecognitionLike = new SpeechRecognitionCtor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, sessionId: sessionIdRef.current }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      const reply: string = data.reply || "(no response)";
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: reply },
      ]);

      if (speakReplies && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(reply);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function startListening() {
    const recognition = recognitionRef.current;
    if (!recognition || listening) return;

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) sendMessage(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    setListening(true);
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  return (
    <div className="flex h-dvh flex-col bg-cream dark:bg-[#1c1c18]">
      <header className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">Jarvis</h1>
          <p className="text-xs opacity-60">MayDay &amp; Co.</p>
        </div>
        <label className="flex items-center gap-2 text-xs opacity-80">
          <input
            type="checkbox"
            checked={speakReplies}
            onChange={(e) => setSpeakReplies(e.target.checked)}
          />
          Speak replies
        </label>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mx-auto max-w-sm pt-16 text-center text-sm opacity-60">
            Ask about your numbers, today&apos;s task, or run your weekly review.
            Try: &quot;what&apos;s my one task today&quot; or &quot;log $58 boarding
            today&quot;.
          </div>
        )}
        <ul className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-sage text-white"
                  : "mr-auto bg-white/80 dark:bg-white/10"
              }`}
            >
              {m.content}
            </li>
          ))}
          {loading && (
            <li className="mr-auto max-w-[85%] rounded-2xl bg-white/80 px-4 py-2 text-sm opacity-60 dark:bg-white/10">
              thinking…
            </li>
          )}
        </ul>
      </div>

      <form
        className="flex items-center gap-2 border-t border-black/10 p-3 dark:border-white/10"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        {voiceSupported && (
          <button
            type="button"
            onPointerDown={startListening}
            onPointerUp={stopListening}
            onPointerLeave={() => listening && stopListening()}
            className={`shrink-0 rounded-full px-3 py-2 text-sm ${
              listening ? "bg-red-500 text-white" : "bg-sage/20"
            }`}
            aria-label="Push to talk"
          >
            {listening ? "● listening" : "🎤"}
          </button>
        )}
        <input
          className="flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-sm outline-none dark:border-white/10 dark:bg-white/5"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message Jarvis…"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="shrink-0 rounded-full bg-sage px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
