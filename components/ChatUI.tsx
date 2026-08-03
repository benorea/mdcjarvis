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
  twilioSms: boolean;
  voiceTranscription: boolean;
  bookkeepingSheet: boolean;
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

function HudRing({ size = 40, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={active ? "recording-pulse rounded-full" : ""}
    >
      <defs>
        <linearGradient id="hud-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff3ec8" />
          <stop offset="100%" stopColor="#2dd9ff" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="none" stroke="url(#hud-gradient)" strokeWidth="2" opacity="0.9" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="#2dd9ff" strokeWidth="1" opacity="0.35" strokeDasharray="2 4" />
      <circle cx="50" cy="50" r="10" fill="none" stroke="#ff3ec8" strokeWidth="2" opacity="0.9" />
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
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-void px-6">
      <HudRing size={64} />
      <h1 className="bg-gradient-to-r from-neon-pink to-neon-cyan bg-clip-text text-xl font-semibold tracking-wide text-transparent">
        JARVIS
      </h1>
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="rounded-full border border-neon-cyan/20 bg-panel px-4 py-2 text-sm text-neon-cyan outline-none placeholder:text-white/30 focus:border-neon-cyan/60 focus:shadow-glow-sm"
        />
        {error && <p className="text-center text-xs text-neon-pink">{error}</p>}
        <button
          type="submit"
          disabled={checking || !password}
          className="rounded-full bg-gradient-to-r from-neon-pink to-neon-cyan px-4 py-2 text-sm font-medium text-void disabled:opacity-40"
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
    return <div className="flex h-dvh items-center justify-center bg-void" />;
  }

  if (!authed) {
    return <LockScreen onUnlock={loadHistory} />;
  }

  return (
    <div className="flex h-dvh flex-col bg-void text-white">
      <header className="border-b border-neon-cyan/15 bg-panel px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HudRing size={26} active={listening} />
            <h1 className="bg-gradient-to-r from-neon-pink to-neon-cyan bg-clip-text text-base font-semibold tracking-wide text-transparent">
              JARVIS
            </h1>
          </div>
          <p className="text-[11px] text-white/40">MayDay &amp; Co.</p>
        </div>
        <div className="mt-1.5 flex items-center justify-end gap-4 text-lg">
          <button
            type="button"
            onClick={() => setView(view === "chat" ? "dashboard" : "chat")}
            className="text-white/70 hover:text-neon-cyan"
            title={view === "chat" ? "Open dashboard" : "Back to chat"}
            aria-label={view === "chat" ? "Open dashboard" : "Back to chat"}
          >
            {view === "chat" ? "📊" : "💬"}
          </button>
          <button
            type="button"
            onClick={openStatus}
            className="text-white/70 hover:text-neon-cyan"
            title="What's connected right now"
            aria-label="Status"
          >
            ⓘ
          </button>
          {notifStatus !== "unsupported" && notifStatus !== "on" && (
            <button
              type="button"
              onClick={notifStatus === "off" ? enableNotifications : undefined}
              disabled={notifStatus === "working"}
              className="text-white/70 disabled:opacity-60"
              title="Turn on reminder notifications"
              aria-label="Notifications"
            >
              🔔
            </button>
          )}
        </div>
      </header>

      {statusOpen && (
        <div
          className="fixed inset-0 z-10 flex items-start justify-center bg-black/40 p-4 pt-16"
          onClick={() => setStatusOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-neon-cyan/20 bg-panel p-4 text-sm text-white shadow-glow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-neon-cyan">Status</h2>
              <button type="button" onClick={() => setStatusOpen(false)} className="text-white/50 hover:text-white" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="mb-1 text-xs font-semibold text-white/50">This device</div>
            <ul className="mb-3 space-y-1 text-white/80">
              <li>
                {notifStatus === "on" ? "✅" : notifStatus === "unsupported" ? "❌" : "⚪"} Notifications:{" "}
                {notifStatus === "on" ? "on" : notifStatus === "unsupported" ? "not supported here" : "off"}
              </li>
            </ul>

            <div className="mb-1 text-xs font-semibold text-white/50">Connected integrations</div>
            {statusLoading && <p className="text-white/50">Checking…</p>}
            {!statusLoading && statusData && (
              <ul className="space-y-1 text-white/80">
                <li>
                  {statusData.anthropicKeyFingerprint ? "✅" : "❌"} Core chat (Claude) key loaded:{" "}
                  <span className="font-mono text-xs text-white/60">
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
                <li>{statusData.twilioSms ? "✅" : "❌"} Two-way SMS texting</li>
                <li>{statusData.bookkeepingSheet ? "✅" : "❌"} Shared bookkeeping sheet</li>
              </ul>
            )}
            {!statusLoading && !statusData && <p className="text-white/50">Couldn&apos;t load status.</p>}
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
          <div className="mx-auto max-w-sm pt-16 text-center text-sm text-white/40">
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
                  ? "ml-auto bg-gradient-to-br from-neon-purple/70 to-neon-pink/60 text-white"
                  : "mr-auto border border-neon-cyan/15 bg-panel text-white/90"
              }`}
            >
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                  {m.toolCalls.map((t, i) => (
                    <span
                      key={i}
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        t.ok ? "bg-neon-cyan/10 text-neon-cyan" : "bg-neon-pink/20 text-neon-pink"
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
                    className="ml-2 align-middle text-xs text-neon-cyan/50 hover:text-neon-cyan"
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
                    className="ml-2 align-middle text-xs text-neon-cyan/50 hover:text-neon-cyan"
                    aria-label="Copy"
                  >
                    {copiedId === m.id ? "copied" : "copy"}
                  </button>
                </>
              )}
            </li>
          ))}
          {transcribing && (
            <li className="mr-auto max-w-[85%] rounded-2xl border border-neon-cyan/15 bg-panel px-4 py-2 text-sm text-white/50">
              transcribing voice note…
            </li>
          )}
          {loading && (
            <li className="mr-auto max-w-[85%] rounded-2xl border border-neon-cyan/15 bg-panel px-4 py-2 text-sm text-white/50">
              thinking…
            </li>
          )}
        </ul>
      </div>

      <form
        className="flex items-center gap-2 border-t border-neon-cyan/15 bg-panel p-3"
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
                ? "recording-pulse h-10 w-10 bg-neon-pink text-void"
                : "h-10 w-10 border border-neon-cyan/30 bg-panel text-neon-cyan"
            }`}
            aria-label="Record a voice note"
          >
            {listening ? "●" : "🎤"}
          </button>
        )}
        <input
          className="flex-1 rounded-full border border-neon-cyan/20 bg-void px-4 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-neon-cyan/60 focus:shadow-glow-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message Jarvis…"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="shrink-0 rounded-full bg-gradient-to-r from-neon-pink to-neon-cyan px-4 py-2 text-sm font-medium text-void disabled:opacity-40"
        >
          Send
        </button>
      </form>
        </>
      )}
    </div>
  );
}
