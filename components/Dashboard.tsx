"use client";

import { useEffect, useState } from "react";

type DashboardData = {
  dailyTask: any;
  paceCheck: any;
  monthlyEarnings: any;
  bookings: any;
  training: any;
  contentIdeas: any;
  remindersToday: { message: string; remind_at: string; sent: boolean }[];
  contentTheme: string;
  timezone: string;
  socialMetrics: any;
  webPresence: { summary: string; created_at: string } | null;
};

function money(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : "—";
}

function HudPanel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative rounded-lg border border-neon-cyan/15 bg-panel p-4 text-white ${className}`}>
      <span className="pointer-events-none absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2 border-neon-cyan/50" />
      <span className="pointer-events-none absolute -right-px -top-px h-3 w-3 border-r-2 border-t-2 border-neon-cyan/50" />
      <span className="pointer-events-none absolute -bottom-px -left-px h-3 w-3 border-b-2 border-l-2 border-neon-cyan/50" />
      <span className="pointer-events-none absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2 border-neon-cyan/50" />
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neon-cyan/70">{title}</h3>
      {children}
    </div>
  );
}

function RadialGauge({
  pct,
  label,
  sublabel,
  color = "#2dd9ff",
}: {
  pct: number;
  label: string;
  sublabel?: string;
  color?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const r = 38;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r={r} fill="none" stroke="#ffffff17" strokeWidth="7" />
        <circle
          cx="46"
          cy="46"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 46 46)"
          style={{ filter: `drop-shadow(0 0 5px ${color}aa)` }}
        />
        <text x="46" y="51" textAnchor="middle" fontSize="17" fontWeight="700" fill="white">
          {Math.round(clamped)}%
        </text>
      </svg>
      <p className="text-center text-xs font-semibold text-white/80">{label}</p>
      {sublabel && <p className="text-center text-[10px] text-white/40">{sublabel}</p>}
    </div>
  );
}

type Highlight = { icon: string; text: string; tone: "alert" | "info" | "ok" };

/** Synthesized from the same real numbers the cards below show — nothing invented, just surfaced first. */
function computeHighlights(data: DashboardData): Highlight[] {
  const items: Highlight[] = [];
  const pace = data.paceCheck;

  if (pace?.status === "behind") {
    items.push({ icon: "⚠️", text: `Behind pace this month by ${money(Math.abs(pace.delta))}`, tone: "alert" });
  } else if (pace?.status) {
    items.push({ icon: "✅", text: `On pace this month — ${money(pace.earned)} logged`, tone: "ok" });
  }

  const dueToday = data.remindersToday.filter((r) => !r.sent).length;
  if (dueToday > 0) {
    items.push({ icon: "🔔", text: `${dueToday} reminder${dueToday > 1 ? "s" : ""} due today`, tone: "info" });
  }

  const bookingsList: any[] = data.bookings?.bookings || [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekOutStr = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const next7 = bookingsList.filter((b) => {
    const d = String(b.check_in || b.start || "").slice(0, 10);
    return d >= todayStr && d <= weekOutStr;
  });
  if (next7.length > 0) {
    items.push({ icon: "📅", text: `${next7.length} booking${next7.length > 1 ? "s" : ""} in the next 7 days`, tone: "info" });
  }

  const training = data.training;
  if (training?.cpdt_ka?.remaining_hours > 0) {
    items.push({ icon: "🎓", text: `${training.cpdt_ka.remaining_hours} hrs left toward CPDT-KA`, tone: "info" });
  }

  if (items.length === 0) {
    items.push({ icon: "✅", text: "Nothing urgent — you're on track", tone: "ok" });
  }

  return items.slice(0, 5);
}

const TONE_STYLES: Record<Highlight["tone"], string> = {
  alert: "border-neon-pink/40 text-neon-pink",
  info: "border-neon-cyan/30 text-white/90",
  ok: "border-neon-cyan/30 text-neon-cyan",
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Couldn't load dashboard");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="p-6 text-center text-sm text-white/50">Loading…</div>;
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-sm text-white">
        <p className="mb-2 text-white/50">{error || "Couldn't load dashboard."}</p>
        <button type="button" onClick={load} className="text-neon-cyan underline">
          Retry
        </button>
      </div>
    );
  }

  const task = data.dailyTask;
  const pace = data.paceCheck;
  const earnings = data.monthlyEarnings;
  const bookingsList = data.bookings?.bookings || [];
  const training = data.training;
  const dueReminders = data.remindersToday;
  const highlights = computeHighlights(data);

  const pacePct = pace?.target ? (Number(pace.earned) / Number(pace.target)) * 100 : 0;
  const cpdtPct = training?.cpdt_ka ? (training.cpdt_ka.total_hours / training.cpdt_ka.target_hours) * 100 : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40">As of right now, {data.timezone}</p>
        <button type="button" onClick={load} className="text-xs text-white/50 hover:text-neon-cyan">
          ↻ Refresh
        </button>
      </div>

      <HudPanel title="Briefing">
        <ul className="space-y-1.5">
          {highlights.map((h, i) => (
            <li key={i} className={`flex items-start gap-2 rounded border-l-2 py-0.5 pl-2 text-sm ${TONE_STYLES[h.tone]}`}>
              <span>{h.icon}</span>
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      </HudPanel>

      {(pace?.status || training?.cpdt_ka) && (
        <div className="flex justify-around rounded-lg border border-neon-cyan/15 bg-panel py-4">
          {pace?.status && (
            <RadialGauge
              pct={pacePct}
              label="Pace to target"
              sublabel={`${money(pace.earned)} / ${money(pace.target)}`}
              color="#2dd9ff"
            />
          )}
          {training?.cpdt_ka && (
            <RadialGauge
              pct={cpdtPct}
              label="CPDT-KA"
              sublabel={`${training.cpdt_ka.total_hours} / ${training.cpdt_ka.target_hours} hrs`}
              color="#ff3ec8"
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HudPanel title="Today's one thing">
          {task?.top_task ? (
            <>
              <p className="text-sm font-medium">{task.top_task}</p>
              {task.focus && <p className="mt-1 text-xs text-white/50">{task.focus}</p>}
            </>
          ) : (
            <p className="text-sm text-white/50">{task?.message || "Nothing set."}</p>
          )}
        </HudPanel>

        <HudPanel title="Reminders today">
          {dueReminders.length === 0 ? (
            <p className="text-sm text-white/50">Nothing scheduled for today.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {dueReminders.map((r, i) => (
                <li key={i} className={r.sent ? "text-white/30 line-through" : "text-white/90"}>
                  {new Date(r.remind_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} — {r.message}
                </li>
              ))}
            </ul>
          )}
        </HudPanel>

        <HudPanel title="Money">
          {pace?.status ? (
            <div className="space-y-1 text-sm text-white/90">
              <p>
                Logged this month: <strong>{money(pace.earned)}</strong> of {money(pace.target)} target
              </p>
              {earnings?.booked_projected !== undefined && (
                <p className="text-white/60">
                  Booked (not yet earned): {money(earnings.booked_projected)}
                  {earnings.booking_count != null ? ` across ${earnings.booking_count} booking(s)` : ""}
                </p>
              )}
              <p className="text-white/60">Cumulative toward $10k goal: {money(pace.cumulative_earned)}</p>
            </div>
          ) : (
            <p className="text-sm text-white/50">{pace?.message || "No pace data yet — log some revenue first."}</p>
          )}
        </HudPanel>

        <HudPanel title="Upcoming bookings">
          {bookingsList.length === 0 ? (
            <p className="text-sm text-white/50">
              {data.bookings?.configured === false ? data.bookings.message : "Nothing confirmed coming up."}
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm text-white/90">
              {bookingsList.slice(0, 8).map((b: any, i: number) => (
                <li key={i}>
                  <span className="text-white/50">{String(b.check_in || b.start || "").slice(0, 10)}</span> —{" "}
                  {b.service_label || b.summary} {b.dogs?.length ? `(${b.dogs.join(", ")})` : ""}
                  {b.subtotal != null && <span className="text-white/50"> · {money(b.subtotal)}</span>}
                </li>
              ))}
            </ul>
          )}
        </HudPanel>

        <HudPanel title="Content">
          <p className="text-sm text-white/90">
            This month's theme: <strong>{data.contentTheme}</strong>
          </p>
          {(data.contentIdeas?.ideas || []).length > 0 && (
            <>
              <p className="mb-1 mt-2 text-xs font-semibold text-white/50">Saved ideas</p>
              <ul className="space-y-1 text-sm text-white/90">
                {data.contentIdeas.ideas.slice(0, 6).map((i: any, idx: number) => (
                  <li key={idx}>
                    {i.idea}
                    {i.series && <span className="text-white/50"> · {i.series}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </HudPanel>

        <HudPanel title="Training / certification">
          {training?.cpdt_ka ? (
            <div className="text-sm text-white/90">
              <p>
                CPDT-KA: <strong>{training.cpdt_ka.total_hours}</strong> / {training.cpdt_ka.target_hours} hrs (
                {training.cpdt_ka.remaining_hours} to go)
              </p>
              {training.last_entry_date && (
                <p className="mt-1 text-white/50">Last logged session: {training.last_entry_date}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/50">{training?.message || "Not connected yet."}</p>
          )}
        </HudPanel>

        <HudPanel title="Social">
          {data.socialMetrics?.configured ? (
            <div className="space-y-1 text-sm text-white/90">
              {data.socialMetrics.instagram && <p>Instagram: <strong>{data.socialMetrics.instagram.followers}</strong> followers</p>}
              {data.socialMetrics.facebook && (
                <p>
                  Facebook: <strong>{data.socialMetrics.facebook.likes}</strong> likes ({data.socialMetrics.facebook.followers} followers)
                </p>
              )}
              {data.socialMetrics.message && <p className="text-white/50">{data.socialMetrics.message}</p>}
            </div>
          ) : (
            <p className="text-sm text-white/50">{data.socialMetrics?.message || "Not connected yet."}</p>
          )}
        </HudPanel>

        <HudPanel title="Web presence" className="sm:col-span-2">
          {data.webPresence ? (
            <>
              <p className="whitespace-pre-wrap text-sm text-white/90">{data.webPresence.summary}</p>
              <p className="mt-2 text-xs text-white/40">
                Checked {new Date(data.webPresence.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </>
          ) : (
            <p className="text-sm text-white/50">No search run yet — the daily check hasn&apos;t fired, or ask Jarvis directly in chat.</p>
          )}
        </HudPanel>
      </div>
    </div>
  );
}
