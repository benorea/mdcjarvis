import type Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServer } from "./supabase";
import { getBusinessContext } from "./businessContext";
import {
  MONTHLY_TARGETS,
  GOAL_TOTAL,
  currentMonthKey,
  targetForMonth,
  phaseForDate,
  WEEKLY_REVIEW_QUESTIONS,
  MONTHLY_CLOSE_QUESTIONS,
} from "./planData";

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_business_context",
    description:
      "Returns the full MayDay & Co. operating plan: pricing, routines, guardrails, content engine, positioning. Call this if you need to quote exact numbers or policy and aren't sure the system prompt has the latest version.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "log_revenue",
    description:
      "Logs a revenue transaction to the tracker. This is the daily non-negotiable scoreboard entry — use it whenever Ashley reports money earned.",
    input_schema: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "Net amount earned, in dollars. Positive number.",
        },
        stream: {
          type: "string",
          description:
            "Revenue stream, e.g. 'boarding', 'training_virtual', 'training_plan', 'training_person', 'walk', 'dropin', 'etsy', 'other'.",
        },
        date: {
          type: "string",
          description:
            "Date the revenue occurred, YYYY-MM-DD. Defaults to today if omitted.",
        },
        note: {
          type: "string",
          description: "Optional short note, e.g. client name or context.",
        },
      },
      required: ["amount", "stream"],
    },
  },
  {
    name: "pace_check",
    description:
      "Sums this month's logged net revenue and compares it against this month's ramped target from the $10k / 6-month goal. Returns ahead/behind and how much of the total $10k goal has been banked so far.",
    input_schema: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description:
            "Optional month to check in YYYY-MM format. Defaults to the current month.",
        },
      },
    },
  },
  {
    name: "daily_task",
    description:
      "Returns the single most important task for today, based on the current phase of the 6-month plan (async-plan launch, boarding pipeline, content/Etsy, December lockdown, final push).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "weekly_review",
    description:
      "Runs the weekly review. Call with no arguments first to get the saved check-in questions to ask Ashley. Once she's answered them, call again passing `answers` (question -> answer) to store the review.",
    input_schema: {
      type: "object",
      properties: {
        answers: {
          type: "object",
          description:
            "Map of question text to Ashley's answer. Only pass this once you have real answers to store.",
        },
      },
    },
  },
  {
    name: "monthly_close",
    description:
      "Runs the monthly close. Call with no arguments first to get the saved check-in questions to ask Ashley. Once she's answered them, call again passing `answers` (question -> answer) to store the close.",
    input_schema: {
      type: "object",
      properties: {
        answers: {
          type: "object",
          description:
            "Map of question text to Ashley's answer. Only pass this once you have real answers to store.",
        },
      },
    },
  },
  {
    name: "google_calendar_read",
    description:
      "Reads upcoming Google Calendar events (read-only). Stub — only works if GOOGLE_CALENDAR_ENABLED and credentials are configured in env. Never writes to the calendar.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "wordpress_bookings_read",
    description:
      "Reads confirmed bookings from the mayday-hub WordPress plugin's ICS calendar feed (read-only, secret-URL feed, no OAuth). Only works if WORDPRESS_ICS_URL is configured in env.",
    input_schema: { type: "object", properties: {} },
  },
];

type ToolResult = { ok: boolean; data: unknown };

function ok(data: unknown): ToolResult {
  return { ok: true, data };
}

function fail(message: string): ToolResult {
  return { ok: false, data: { error: message } };
}

export async function runTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  switch (name) {
    case "get_business_context":
      return ok({ context: await getBusinessContext() });

    case "log_revenue":
      return logRevenue(input);

    case "pace_check":
      return paceCheck(input);

    case "daily_task":
      return dailyTask();

    case "weekly_review":
      return checkIn("weekly", WEEKLY_REVIEW_QUESTIONS, input);

    case "monthly_close":
      return checkIn("monthly", MONTHLY_CLOSE_QUESTIONS, input);

    case "google_calendar_read":
      return googleCalendarRead();

    case "wordpress_bookings_read":
      return wordpressBookingsRead();

    default:
      return fail(`Unknown tool: ${name}`);
  }
}

async function logRevenue(input: Record<string, unknown>): Promise<ToolResult> {
  const amount = Number(input.amount);
  const stream = String(input.stream || "").trim();
  const date =
    typeof input.date === "string" && input.date
      ? input.date
      : new Date().toISOString().slice(0, 10);
  const note = typeof input.note === "string" ? input.note : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    return fail("amount must be a positive number");
  }
  if (!stream) {
    return fail("stream is required");
  }

  const supabase = getSupabaseServer();
  const { error } = await supabase.from("transactions").insert({
    amount,
    stream,
    occurred_on: date,
    note,
  });

  if (error) return fail(error.message);

  const pace = await paceCheck({ month: date.slice(0, 7) });
  return ok({ logged: { amount, stream, date, note }, pace: pace.data });
}

async function paceCheck(input: Record<string, unknown>): Promise<ToolResult> {
  const month =
    typeof input.month === "string" && input.month
      ? input.month
      : currentMonthKey();

  const target = targetForMonth(month);
  if (!target) {
    return fail(
      `No target defined for ${month} — the plan only covers Aug 2026 through Jan 2027.`
    );
  }

  const supabase = getSupabaseServer();
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const end = new Date(y, m, 0).toISOString().slice(0, 10); // last day of month

  const { data, error } = await supabase
    .from("transactions")
    .select("amount")
    .gte("occurred_on", start)
    .lte("occurred_on", end);

  if (error) return fail(error.message);

  const earned = (data || []).reduce((sum, row) => sum + Number(row.amount), 0);
  const delta = earned - target.target;

  // Cumulative progress toward the full $10k across all logged months.
  const { data: allData, error: allError } = await supabase
    .from("transactions")
    .select("amount");
  const cumulativeEarned = allError
    ? null
    : (allData || []).reduce((sum, row) => sum + Number(row.amount), 0);

  return ok({
    month: target.label,
    target: target.target,
    earned,
    status: delta >= 0 ? "ahead_or_on_pace" : "behind",
    delta,
    goal_total: GOAL_TOTAL,
    cumulative_earned: cumulativeEarned,
    all_monthly_targets: MONTHLY_TARGETS,
  });
}

function dailyTask(): ToolResult {
  const phase = phaseForDate();
  if (!phase) {
    return ok({
      message:
        "Today's date falls outside the 6-month plan window (Aug 2026 - Jan 2027). No standing phase task — use judgment based on the business context.",
    });
  }
  return ok({
    phase: phase.id,
    focus: phase.focus,
    top_task: phase.checklist[0],
    full_checklist: phase.checklist,
  });
}

async function checkIn(
  type: "weekly" | "monthly",
  questions: string[],
  input: Record<string, unknown>
): Promise<ToolResult> {
  const answers = input.answers as Record<string, string> | undefined;

  if (!answers || Object.keys(answers).length === 0) {
    return ok({ questions });
  }

  const supabase = getSupabaseServer();
  const { error } = await supabase.from("check_ins").insert({
    type,
    answers,
  });

  if (error) return fail(error.message);

  return ok({ stored: true, type, answers });
}

function googleCalendarRead(): ToolResult {
  if (process.env.GOOGLE_CALENDAR_ENABLED !== "true") {
    return ok({
      configured: false,
      message:
        "Google Calendar read is not configured. Set GOOGLE_CALENDAR_ENABLED=true and the required credentials in env to enable this (see .env.example).",
    });
  }
  return ok({
    configured: true,
    message:
      "GOOGLE_CALENDAR_ENABLED is set but no calendar client is wired up yet — this stub is a placeholder for a future read-only integration.",
  });
}

async function wordpressBookingsRead(): Promise<ToolResult> {
  const icsUrl = process.env.WORDPRESS_ICS_URL;
  if (!icsUrl) {
    return ok({
      configured: false,
      message:
        "WordPress bookings read is not configured. Set WORDPRESS_ICS_URL (the secret ICS feed URL from MayDay Bookings -> Settings) in env to enable this.",
    });
  }

  try {
    const res = await fetch(icsUrl, { cache: "no-store" });
    if (!res.ok) {
      return fail(`ICS feed returned ${res.status}`);
    }
    const text = await res.text();
    const events = parseIcsEvents(text).slice(0, 10);
    return ok({ configured: true, upcoming_bookings: events });
  } catch (err) {
    return fail(
      `Could not fetch ICS feed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function parseIcsEvents(ics: string): { summary: string; start: string }[] {
  const events: { summary: string; start: string }[] = [];
  const blocks = ics.split("BEGIN:VEVENT").slice(1);
  for (const block of blocks) {
    const summaryMatch = block.match(/SUMMARY:(.*)/);
    const startMatch = block.match(/DTSTART[^:]*:(.*)/);
    events.push({
      summary: summaryMatch ? summaryMatch[1].trim() : "(untitled)",
      start: startMatch ? startMatch[1].trim() : "(unknown)",
    });
  }
  return events;
}
