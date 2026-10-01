"use client";

import { useEffect, useRef, useState } from "react";
import Dashboard from "./Dashboard";

type ToolCallLog = { name: string; ok: boolean };

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallLog[];
};

type StatusData = {
  anthropicKeyFingerprint: string | null;
  wordpress: boolean;
  wordpressIcsOnly: boolean;
  googleCalendar: boolean;
  calendarWebhook: boolean;
  square: boolean;
  push: boolean;
  voiceTranscription: boolean;
  bookkeepingSheet: boolean;
  socialMetrics: boolean;
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
  training_progress_read: "Reading training log",
  bookkeeping_log: "Logging to the sheet",
  bookkeeping_read: "Reading the sheet",
  save_content_idea: "Saving content idea",
  log_post_performance: "Logging post performance",
  list_content_ideas: "Reading content ideas",
  social_metrics_read: "Checking follower counts",
  web_search: "Searching the web",
  list_reminders: "Checking reminders",
  cancel_reminder: "Cancelling reminder",
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

/** Filled step-circle mark, matching the numbered stepper on maydayco.dog/book-with-us. */
function Badge({ size = 40, active = false }: { size?: number; active?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full border-2 border-navy bg-navy font-serif font-semibold text-cream ${
        active ? "recording-pulse" : ""
      }`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      J
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-purple">{children}</p>;
}

/** Thin-line icons matching the outlined-circle icon style on maydayco.dog (house/paw badges) — stroke only, no fills. */
function ChartIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="10" width="3.2" height="7" />
      <rect x="8.4" y="6" width="3.2" height="11" />
      <rect x="13.8" y="3" width="3.2" height="14" />
    </svg>
  );
}

function ChatBubbleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5h12a2 2 0 0 1 2 2V12a2 2 0 0 1-2 2H8.5L5 17v-3H4a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

function InfoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="10" r="7.25" />
      <line x1="10" y1="9" x2="10" y2="13.5" />
      <circle cx="10" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BellIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8.5a5 5 0 0 1 10 0c0 3.2 1.1 4.3 1.6 4.9a.6.6 0 0 1-.45 1H3.85a.6.6 0 0 1-.45-1C3.9 12.8 5 11.7 5 8.5Z" />
      <path d="M8.2 16.3a1.9 1.9 0 0 0 3.6 0" />
    </svg>
  );
}

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
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-cream px-6">
      <Badge size={64} />
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-navy">Jarvis</h1>
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="rounded-full border border-hairline bg-card px-4 py-2 text-sm text-navy outline-none placeholder:text-navy/35 focus:border-purple/60"
        />
        {error && <p className="text-center text-xs text-gold">{error}</p>}
        <button
          type="submit"
          disabled={checking || !password}
          className="rounded-full bg-navy px-4 py-2 text-sm font-medium text-cream disabled:opacity-40"
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
  const [transcribing, setTranscribing] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"unsupported" | "off" | "on" | "working">("off");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [view, setView] = useState<"chat" | "dashboard">("chat");
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const sessionIdRef = useRef<string>("default");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pendingStopRef = useRef(false);
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

    // Recording + server-side transcription, not the browser's own speech
    // recognition — that API is inconsistent enough across platforms
    // (notably: silently does nothing in an installed iOS PWA) that this is
    // the only approach that behaves the same way everywhere.
    setVoiceSupported(
      typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined"
    );

    // Fetch integration status quietly up front (not just when the Status
    // panel is opened) so the mic button can warn instantly if
    // OPENAI_API_KEY isn't set, instead of after a wasted recording.
    fetch("/api/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setStatusData(data))
      .catch(() => {});
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

  /** The browser's default TTS voice is usually the flattest, most robotic
   * option it ships with. Network-backed voices (not localService) and named
   * "enhanced/premium/natural" system voices sound meaningfully smoother —
   * prefer those when the device has them installed. */
  function pickVoice(): SpeechSynthesisVoice | undefined {
    const voices = window.speechSynthesis.getVoices();
    const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
    return (
      english.find((v) => /enhanced|premium|natural/i.test(v.name)) ||
      english.find((v) => /Google US English/i.test(v.name)) ||
      english.find((v) => !v.localService) ||
      english.find((v) => v.default) ||
      english[0]
    );
  }

  function speakMessage(id: string, text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (speakingId === id) {
      setSpeakingId(null);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 0.97;
    utterance.pitch = 1;
    utterance.onend = () => setSpeakingId((cur) => (cur === id ? null : cur));
    utterance.onerror = () => setSpeakingId((cur) => (cur === id ? null : cur));
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
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

  async function transcribeAndSend(blob: Blob) {
    if (blob.size < 500) return; // near-empty — an accidental tap, not a real recording

    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });

      if (res.status === 401) {
        setAuthed(false);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcription failed");

      const transcript = String(data.transcript || "").trim();
      if (!transcript) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: "Didn't catch anything in that recording — try again?" },
        ]);
        return;
      }
      await sendMessage(transcript);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Voice note error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setTranscribing(false);
    }
  }

  async function startRecording(e: React.PointerEvent<HTMLButtonElement>) {
    if (listening) return;

    if (statusData && !statusData.voiceTranscription) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Voice notes need OPENAI_API_KEY set in env first — recording works, but there's nothing to transcribe it with yet.",
        },
      ]);
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    pendingStopRef.current = false;
    setListening(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setListening(false);
        transcribeAndSend(blob);
      };

      recorder.start();
      // Finger already lifted before the mic was even ready — stop right away.
      if (pendingStopRef.current) recorder.stop();
    } catch {
      setListening(false);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Mic access is blocked — check your browser/site permissions and try again.",
        },
      ]);
    }
  }

  function stopRecording(e?: React.PointerEvent<HTMLButtonElement>) {
    if (e) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // already released — fine
      }
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    } else {
      pendingStopRef.current = true;
    }
  }

  if (!authChecked) {
    return <div className="flex h-dvh items-center justify-center bg-cream" />;
  }

  if (!authed) {
    return <LockScreen onUnlock={loadHistory} />;
  }

  return (
    <div className="flex h-dvh flex-col bg-cream text-navy">
      <header className="border-b border-hairline bg-card px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge size={26} active={listening} />
            <h1 className="font-serif text-base font-semibold tracking-tight text-navy">Jarvis</h1>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-steel">MayDay &amp; Co.</p>
        </div>
        <div className="mt-1.5 flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => setView(view === "chat" ? "dashboard" : "chat")}
            className="text-navy/60 hover:text-purple"
            title={view === "chat" ? "Open dashboard" : "Back to chat"}
            aria-label={view === "chat" ? "Open dashboard" : "Back to chat"}
          >
            {view === "chat" ? <ChartIcon /> : <ChatBubbleIcon />}
          </button>
          <button
            type="button"
            onClick={openStatus}
            className="text-navy/60 hover:text-purple"
            title="What's connected right now"
            aria-label="Status"
          >
            <InfoIcon />
          </button>
          {notifStatus !== "unsupported" && notifStatus !== "on" && (
            <button
              type="button"
              onClick={notifStatus === "off" ? enableNotifications : undefined}
              disabled={notifStatus === "working"}
              className="text-navy/60 disabled:opacity-60"
              title="Turn on reminder notifications"
              aria-label="Notifications"
            >
              <BellIcon />
            </button>
          )}
        </div>
      </header>

      {statusOpen && (
        <div
          className="fixed inset-0 z-10 flex items-start justify-center bg-navy/30 p-4 pt-16"
          onClick={() => setStatusOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-hairline bg-card p-4 text-sm text-navy shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif font-semibold text-purple">Status</h2>
              <button type="button" onClick={() => setStatusOpen(false)} className="text-navy/50 hover:text-navy" aria-label="Close">
                ✕
              </button>
            </div>

            <Eyebrow>This device</Eyebrow>
            <ul className="mb-3 mt-1 space-y-1 text-navy/80">
              <li>
                {notifStatus === "on" ? "✅" : notifStatus === "unsupported" ? "❌" : "⚪"} Notifications:{" "}
                {notifStatus === "on" ? "on" : notifStatus === "unsupported" ? "not supported here" : "off"}
              </li>
            </ul>

            <Eyebrow>Connected integrations</Eyebrow>
            {statusLoading && <p className="mt-1 text-navy/50">Checking…</p>}
            {!statusLoading && statusData && (
              <ul className="mt-1 space-y-1 text-navy/80">
                <li>
                  {statusData.anthropicKeyFingerprint ? "✅" : "❌"} Core chat (Claude) key loaded:{" "}
                  <span className="font-mono text-xs text-navy/60">
                    {statusData.anthropicKeyFingerprint || "not set"}
                  </span>
                </li>
                <li>
                  {!voiceSupported
                    ? "❌ Voice notes — this browser can't record audio"
                    : statusData.voiceTranscription
                      ? "✅ Voice notes — ready"
                      : "❌ Voice notes — recording works, but OPENAI_API_KEY isn't set so nothing gets transcribed"}
                </li>
                <li>
                  {statusData.wordpress ? "✅" : statusData.wordpressIcsOnly ? "🟡" : "❌"} Report cards / live
                  pricing / bookings{statusData.wordpressIcsOnly ? " (basic ICS only)" : ""}
                </li>
                <li>{statusData.googleCalendar ? "✅" : "❌"} Google Calendar reads</li>
                <li>{statusData.calendarWebhook ? "✅" : "❌"} Calendar auto-sync on booking</li>
                <li>{statusData.square ? "✅" : "❌"} Square draft invoices</li>
                <li>{statusData.bookkeepingSheet ? "✅" : "❌"} Shared bookkeeping sheet</li>
                <li>{statusData.socialMetrics ? "✅" : "❌"} Instagram/Facebook follower counts</li>
                <li>✅ Web search — ask about reviews/mentions/rankings anytime</li>
              </ul>
            )}
            {!statusLoading && !statusData && <p className="mt-1 text-navy/50">Couldn&apos;t load status.</p>}
          </div>
        </div>
      )}

      {view === "dashboard" ? (
        <div className="flex-1 overflow-y-auto">
          <Dashboard />
        </div>
      ) : (
        <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mx-auto max-w-sm pt-16 text-center text-sm text-navy/45">
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
                  ? "ml-auto bg-navy text-cream"
                  : "mr-auto border border-hairline bg-card text-navy"
              }`}
            >
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                  {m.toolCalls.map((t, i) => (
                    <span
                      key={i}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        t.ok ? "bg-purple/10 text-purple" : "bg-gold/15 text-gold"
                      }`}
                    >
                      {t.ok ? "🔧" : "⚠️"} {TOOL_LABELS[t.name] || t.name}
                    </span>
                  ))}
                </div>
              )}
              {m.content}
              {m.role === "assistant" && (
                <>
                  <button
                    type="button"
                    onClick={() => speakMessage(m.id, m.content)}
                    className="ml-2 align-middle text-xs font-semibold uppercase tracking-wide text-steel hover:text-purple"
                    aria-label={speakingId === m.id ? "Stop speaking" : "Speak this reply"}
                    title={speakingId === m.id ? "Stop" : "Speak this reply"}
                  >
                    {speakingId === m.id ? "⏹ stop" : "🔊 speak"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(m.content).then(() => {
                        setCopiedId(m.id);
                        setTimeout(() => setCopiedId((id) => (id === m.id ? null : id)), 1500);
                      });
                    }}
                    className="ml-2 align-middle text-xs font-semibold uppercase tracking-wide text-steel hover:text-purple"
                    aria-label="Copy"
                  >
                    {copiedId === m.id ? "copied" : "copy"}
                  </button>
                </>
              )}
            </li>
          ))}
          {transcribing && (
            <li className="mr-auto max-w-[85%] rounded-2xl border border-hairline bg-card px-4 py-2 text-sm text-navy/50">
              transcribing voice note…
            </li>
          )}
          {loading && (
            <li className="mr-auto max-w-[85%] rounded-2xl border border-hairline bg-card px-4 py-2 text-sm text-navy/50">
              thinking…
            </li>
          )}
        </ul>
      </div>

      <form
        className="flex items-center gap-2 border-t border-hairline bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        {voiceSupported && (
          <button
            type="button"
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerCancel={stopRecording}
            disabled={transcribing}
            style={{ touchAction: "none" }}
            className={`flex shrink-0 select-none items-center justify-center rounded-full text-sm disabled:opacity-40 ${
              listening
                ? "recording-pulse h-10 w-10 bg-gold text-cream"
                : "h-10 w-10 border border-hairline bg-cream text-navy"
            }`}
            aria-label="Record a voice note"
          >
            {listening ? "●" : "🎤"}
          </button>
        )}
        <input
          className="flex-1 rounded-full border border-hairline bg-cream px-4 py-2 text-sm text-navy outline-none placeholder:text-navy/35 focus:border-purple/60"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message Jarvis…"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-medium text-cream disabled:opacity-40"
        >
          Send
        </button>
      </form>
        </>
      )}
    </div>
  );
}
