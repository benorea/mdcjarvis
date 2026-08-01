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

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Wrong password.");
        return;
      }
      onUnlock();
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-cream px-6 dark:bg-[#1c1c18]">
      <h1 className="text-lg font-semibold">Jarvis</h1>
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm outline-none dark:border-white/10 dark:bg-white/5"
        />
        {error && <p className="text-center text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={checking || !password}
          className="rounded-full bg-sage px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {checking ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

export default function ChatUI() {
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const sessionIdRef = useRef<string>("default");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadHistory() {
    try {
      const res = await fetch(`/api/conversations?sessionId=${encodeURIComponent(sessionIdRef.current)}`);
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      const data = await res.json();
      const loaded: Message[] = (data.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }));
      setMessages(loaded);
    } catch {
      // Non-fatal — chat still works, it just starts blank this load.
    } finally {
      setAuthChecked(true);
    }
  }

  useEffect(() => {
    sessionIdRef.current = getSessionId();
    loadHistory();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      if (res.status === 401) {
        setAuthed(false);
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
        return;
      }

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

  function startListening(e: React.PointerEvent<HTMLButtonElement>) {
    const recognition = recognitionRef.current;
    if (!recognition || listening) return;

    // Without this, a slight layout shift under the finger (or even normal
    // touch jitter) fires pointerleave and yanks the mic back off a few ms
    // after it started. Capturing the pointer ties all further events for
    // this touch/click to this button regardless of where it physically is.
    e.currentTarget.setPointerCapture(e.pointerId);

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) sendMessage(transcript);
    };
    recognition.onerror = (event: any) => {
      setListening(false);
      const reason = event?.error || "unknown error";
      if (reason === "no-speech" || reason === "aborted") return;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            reason === "not-allowed" || reason === "service-not-allowed"
              ? "Mic access is blocked — check your browser/site permissions and try again."
              : `Mic error: ${reason}`,
        },
      ]);
    };
    recognition.onend = () => setListening(false);

    try {
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
    }
  }

  function stopListening(e?: React.PointerEvent<HTMLButtonElement>) {
    if (e) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // already released — fine
      }
    }
    recognitionRef.current?.stop();
    setListening(false);
  }

  if (!authChecked) {
    return <div className="flex h-dvh items-center justify-center bg-cream dark:bg-[#1c1c18]" />;
  }

  if (!authed) {
    return <LockScreen onUnlock={loadHistory} />;
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
            onPointerCancel={stopListening}
            style={{ touchAction: "none" }}
            className={`flex shrink-0 select-none items-center justify-center rounded-full text-sm ${
              listening ? "h-10 w-10 animate-pulse bg-red-500 text-white" : "h-10 w-10 bg-sage/20"
            }`}
            aria-label="Push to talk"
          >
            {listening ? "●" : "🎤"}
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
