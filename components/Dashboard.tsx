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
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neon-cyan/15 bg-panel p-4 text-white">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neon-cyan/70">{title}</h3>
      {children}
    </div>
  );
}

function money(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : "—";
}

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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40">As of right now, {data.timezone}</p>
        <button type="button" onClick={load} className="text-xs text-white/50 hover:text-neon-cyan">
          ↻ Refresh
        </button>
      </div>

      <Card title="Today's one thing">
        {task?.top_task ? (
          <>
            <p className="text-sm font-medium">{task.top_task}</p>
            {task.focus && <p className="mt-1 text-xs text-white/50">{task.focus}</p>}
          </>
        ) : (
          <p className="text-sm text-white/50">{task?.message || "Nothing set."}</p>
        )}
      </Card>

      <Card title="Reminders today">
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
      </Card>

      <Card title="Money">
        {pace?.status ? (
          <div className="space-y-1 text-sm text-white/90">
            <p>
              Logged this month: <strong>{money(pace.earned)}</strong> of {money(pace.target)} target
              {" "}
              <span className={pace.status === "behind" ? "text-neon-pink" : "text-neon-cyan"}>
                ({pace.status === "behind" ? "behind" : "on/ahead"})
              </span>
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
      </Card>

      <Card title="Upcoming bookings">
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
      </Card>

      <Card title="Content">
        <p className="text-sm text-white/90">This month's theme: <strong>{data.contentTheme}</strong></p>
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
      </Card>

      <Card title="Training / certification">
        {training?.cpdt_ka ? (
          <div className="text-sm text-white/90">
            <p>
              CPDT-KA: <strong>{training.cpdt_ka.total_hours}</strong> / {training.cpdt_ka.target_hours} hrs
              {" "}
              ({training.cpdt_ka.remaining_hours} to go)
            </p>
            {training.last_entry_date && (
              <p className="mt-1 text-white/50">Last logged session: {training.last_entry_date}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-white/50">{training?.message || "Not connected yet."}</p>
        )}
      </Card>
    </div>
  );
}
