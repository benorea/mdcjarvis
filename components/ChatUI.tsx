"use client";

import { useEffect, useRef, useState } from "react";

type ToolCallLog = { name: string; ok: boolean };

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallLog[];
};

type StatusData = {
  wordpress: boolean;
  wordpressIcsOnly: boolean;
  googleCalendar: boolean;
  calendarWebhook: boolean;
  square: boolean;
  push: boolean;
  twilioSms: boolean;
};

const TOOL_LABELS: Record<string, string> = {
  get_business_context: "Reading business plan",
  log_revenue: "Logging revenue",
  pace_check: "Checking pace",
  daily_task: "Getting today's task",
  weekly_review: "Weekly review",
  monthly_close: "Monthly close",
  submit_report_card: "Writing report card",
  wordpress_pricing_read: "Reading live pricing",
  wordpress_bookings_read: "Reading bookings",
  estimate_monthly_earnings: "Estimating earnings",
  schedule_reminder: "Scheduling reminder",
  create_invoice: "Creating draft invoice",
  google_calendar_read: "Reading calendar",
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

// Push subscriptions need the VAPID public key as a raw byte array, not the
// base64url string it's normally shared as.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// iOS Safari's speech recognition passes feature detection (the constructor
// exists) but silently does nothing when the site is running as an
// installed home-screen app — a known Apple platform limitation, not
// something fixable here. It only works in a regular Safari tab. Detect
// that specific broken combo so we can say so instead of a silent hang.
function isIosInstalledPwa(): boolean {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  return isIos && isStandalone;
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
  const [notifStatus, setNotifStatus] = useState<"unsupported" | "off" | "on" | "working">("off");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
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

      if ("PushManager" in window) {
        navigator.serviceWorker.ready
          .then((reg) => reg.pushManager.getSubscription())
          .then((sub) => setNotifStatus(sub ? "on" : "off"))
          .catch(() => setNotifStatus("off"));
      } else {
        setNotifStatus("unsupported");
      }
    } else {
      setNotifStatus("unsupported");
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
      const toolCalls: ToolCallLog[] = Array.isArray(data.toolCalls)
        ? data.toolCalls.map((t: any) => ({ name: t.name, ok: t.ok }))
        : [];
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: reply, toolCalls },
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

  async function openStatus() {
    setStatusOpen(true);
    setStatusLoading(true);
    try {
      const res = await fetch("/api/status");
      if (res.ok) setStatusData(await res.json());
    } catch {
      // Panel just shows nothing connected — not fatal.
    } finally {
      setStatusLoading(false);
    }
  }

  async function enableNotifications() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Push notifications aren't configured yet (missing VAPID keys) — reminders can't be turned on until that's set up.",
        },
      ]);
      return;
    }

    setNotifStatus("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotifStatus("off");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      setNotifStatus("on");
    } catch {
      setNotifStatus("off");
    }
  }

  function startListening(e: React.PointerEvent<HTMLButtonElement>) {
    const recognition = recognitionRef.current;
    if (!recognition || listening) return;

    if (isIosInstalledPwa()) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Voice doesn't work in the installed app on iPhone — that's an Apple limitation on installed home-screen apps, not something in here. Open this same site in a regular Safari tab instead (not the installed icon) and voice will work there. Typing works fine either way.",
        },
      ]);
      return;
    }

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
        <div className="flex items-center gap-3">
          <button type="button" onClick={openStatus} className="text-xs opacity-80" title="What's connected right now">
            ⓘ Status
          </button>
          {notifStatus !== "unsupported" && (
            <button
              type="button"
              onClick={notifStatus === "off" ? enableNotifications : undefined}
              disabled={notifStatus === "working" || notifStatus === "on"}
              className="text-xs opacity-80 disabled:opacity-60"
              title={notifStatus === "on" ? "Reminders will show up as notifications" : "Turn on reminder notifications"}
            >
              {notifStatus === "on" ? "🔔 Reminders on" : notifStatus === "working" ? "🔔 …" : "🔔 Enable reminders"}
            </button>
          )}
          <label className="flex items-center gap-2 text-xs opacity-80">
            <input
              type="checkbox"
              checked={speakReplies}
              onChange={(e) => setSpeakReplies(e.target.checked)}
            />
            Speak replies
          </label>
        </div>
      </header>

      {statusOpen && (
        <div
          className="fixed inset-0 z-10 flex items-start justify-center bg-black/40 p-4 pt-16"
          onClick={() => setStatusOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-4 text-sm shadow-xl dark:bg-[#2a2a24]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Status</h2>
              <button type="button" onClick={() => setStatusOpen(false)} className="opacity-60" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="mb-1 text-xs font-semibold opacity-60">This device</div>
            <ul className="mb-3 space-y-1">
              <li>{voiceSupported ? "✅" : "❌"} Voice input {voiceSupported ? "supported" : "not supported in this browser"}</li>
              <li>
                {notifStatus === "on" ? "✅" : notifStatus === "unsupported" ? "❌" : "⚪"} Notifications:{" "}
                {notifStatus === "on" ? "on" : notifStatus === "unsupported" ? "not supported here" : "off"}
              </li>
            </ul>

            <div className="mb-1 text-xs font-semibold opacity-60">Connected integrations</div>
            {statusLoading && <p className="opacity-60">Checking…</p>}
            {!statusLoading && statusData && (
              <ul className="space-y-1">
                <li>
                  {statusData.wordpress ? "✅" : statusData.wordpressIcsOnly ? "🟡" : "❌"} Report cards / live
                  pricing / bookings{statusData.wordpressIcsOnly ? " (basic ICS only)" : ""}
                </li>
                <li>{statusData.googleCalendar ? "✅" : "❌"} Google Calendar reads</li>
                <li>{statusData.calendarWebhook ? "✅" : "❌"} Calendar auto-sync on booking</li>
                <li>{statusData.square ? "✅" : "❌"} Square draft invoices</li>
                <li>{statusData.twilioSms ? "✅" : "❌"} Two-way SMS texting</li>
              </ul>
            )}
            {!statusLoading && !statusData && <p className="opacity-60">Couldn&apos;t load status.</p>}
          </div>
        </div>
      )}

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
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                  {m.toolCalls.map((t, i) => (
                    <span
                      key={i}
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        t.ok ? "bg-black/10 dark:bg-white/15" : "bg-red-500/20 text-red-700 dark:text-red-300"
                      }`}
                    >
                      {t.ok ? "🔧" : "⚠️"} {TOOL_LABELS[t.name] || t.name}
                    </span>
                  ))}
                </div>
              )}
              {m.content}
              {m.role === "assistant" && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(m.content).then(() => {
                      setCopiedId(m.id);
                      setTimeout(() => setCopiedId((id) => (id === m.id ? null : id)), 1500);
                    });
                  }}
                  className="ml-2 align-middle text-xs opacity-40 hover:opacity-100"
                  aria-label="Copy"
                >
                  {copiedId === m.id ? "copied" : "copy"}
                </button>
              )}
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
