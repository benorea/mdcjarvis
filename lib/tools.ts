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
import { fieldVocabularyForPrompt } from "./reportCardFields";
import { googleCalendarConfigured, listUpcomingEvents } from "./googleCalendar";
import { localToUtcDate, todayInBusinessTimezone, lastDayOfMonth } from "./timezone";
import { pushConfigured } from "./webpush";
import { squareConfigured, createDraftInvoice } from "./square";
import { sheetsConfigured, appendRow, readRange } from "./googleSheets";
import { readSocialMetrics } from "./socialMetrics";

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
      "Reads Ashley's upcoming Google Calendar events (read-only). Only works if GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN are configured in env. Never writes to the calendar — booking confirmations create events automatically via a separate webhook, not this tool.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "wordpress_bookings_read",
    description:
      "Reads upcoming confirmed bookings. Uses the richer live REST API (dollar amounts, dog names, per-booking detail) when WORDPRESS_API_URL/WORDPRESS_API_KEY are configured; falls back to the basic ICS feed (WORDPRESS_ICS_URL) otherwise. Read-only either way.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "wordpress_pricing_read",
    description:
      "Reads the CURRENT admin-set prices straight from the live mayday-hub site — the actual numbers the booking widget charges right now, not whatever's written in the saved business context doc (which can go stale after a price change). Use this instead of quoting prices from memory when it matters that the number is current. Only works if WORDPRESS_API_URL/WORDPRESS_API_KEY are configured.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "estimate_monthly_earnings",
    description:
      "Estimates THIS MONTH's revenue from bookings already confirmed on the calendar (sums each booking's actual saved price) and compares it to that month's ramped target. This is a projection from what's booked, NOT the same as pace_check (which sums what Ashley has actually logged as earned via log_revenue) — booked money isn't in-hand money yet. Only works if WORDPRESS_API_URL/WORDPRESS_API_KEY are configured.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "training_progress_read",
    description:
      "Reads real certification progress (CPDT-KA hours logged vs. the 300-hour requirement, plus PCT-A/CTT-A/CBCC-KA numbers) from the live Training Log. Use this instead of guessing when asked how close Ashley is to certified. Only works if WORDPRESS_API_URL/WORDPRESS_API_KEY are configured.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "bookkeeping_log",
    description:
      "Appends one row to the shared Google Sheet Ashley uses for full bookkeeping (revenue, expenses, categories — the broader picture beyond what log_revenue/pace_check track for the $10k goal specifically). Use this whenever she mentions an expense, or wants something noted in 'the sheet' specifically rather than just the daily revenue log. Only works if GOOGLE_SHEETS_ID and the Google OAuth env vars are configured.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today (America/Denver) if omitted." },
        type: { type: "string", enum: ["revenue", "expense"] },
        category: { type: "string", description: "e.g. 'boarding', 'gear materials', 'software', 'Etsy fees'." },
        amount: { type: "number", description: "Dollars. Always positive — the type field says which direction." },
        note: { type: "string", description: "Optional context." },
      },
      required: ["type", "category", "amount"],
    },
  },
  {
    name: "bookkeeping_read",
    description:
      "Reads rows from the shared Google Sheet's Transactions tab (or another tab/range if given) so you can answer questions grounded in what's actually in the sheet. Only works if GOOGLE_SHEETS_ID and the Google OAuth env vars are configured.",
    input_schema: {
      type: "object",
      properties: {
        range: { type: "string", description: "Optional. Defaults to 'Transactions!A:E'. Use A1 notation, e.g. 'Transactions!A1:E50'." },
      },
    },
  },
  {
    name: "save_content_idea",
    description:
      "Saves a content idea for later. Use this when Ashley says 'log that idea' or when you generate one worth keeping during a brainstorm. Ground generated ideas in the actual three pillars (Transformation/Craft/Science) and five recurring series from the business plan — don't invent generic viral-trend claims, there's no real trend data source here.",
    input_schema: {
      type: "object",
      properties: {
        idea: { type: "string", description: "The idea itself, plainly stated." },
        pillar: { type: "string", enum: ["transformation", "craft", "science"] },
        series: { type: "string", description: "One of the five recurring series, if it fits one." },
      },
      required: ["idea"],
    },
  },
  {
    name: "log_post_performance",
    description:
      "Records how a real posted piece of content actually performed, in Ashley's own words (views, saves, conversions, whatever she reports). This builds a REAL performance history over time — use list_content_ideas later to ground future suggestions in what's actually worked, instead of guessing.",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Which post/content this is, e.g. 'the Millie decompression walk reel'." },
        performance_note: { type: "string", description: "What Ashley reported, e.g. '40k views, high saves, two DMs asking about boarding'." },
      },
      required: ["description", "performance_note"],
    },
  },
  {
    name: "list_content_ideas",
    description:
      "Lists saved content ideas, optionally filtered by status. Use this to check what's already been suggested (avoid repeating ideas) or to pull real logged performance history before brainstorming new ones.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["idea", "drafted", "posted"], description: "Optional filter." },
      },
    },
  },
  {
    name: "submit_report_card",
    description:
      `Writes a dog report card into the mayday-hub site, the same as the staff wizard would. Use this when Ashley describes a dog's day or walk (typically from a voice note) and wants it logged.

CRITICAL: only use the exact field keys and values listed below. If something wasn't clearly said, leave that field out entirely — do NOT guess a value or pick the "closest" enum option. Always fill extra_notes with a clean written summary of what was actually said, even if you also mapped some of it to specific fields, so nothing said is lost.

${fieldVocabularyForPrompt()}

If the dog's name doesn't match one on file, the tool will return the valid list — ask Ashley to confirm rather than guessing which one she meant.`,
    input_schema: {
      type: "object",
      properties: {
        dog: {
          type: "string",
          description: "Dog's name exactly as it appears in MayDay Reports (e.g. 'Millie P.').",
        },
        report_type: { type: "string", enum: ["day", "walk"] },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today (America/Denver) if omitted." },
        time: { type: "string", description: "HH:MM 24h. Defaults to now (America/Denver) if omitted." },
        appetite_am: { type: "string" },
        appetite_pm: { type: "string" },
        body_check: { type: "string" },
        engagement_drive: { type: "string" },
        energy_level: { type: "string" },
        manners: { type: "string" },
        meds: { type: "string", description: "Free text." },
        enrichment: { type: "string", description: "Free text." },
        body_check_notes: { type: "string", description: "Free text." },
        botd: { type: "string", description: "Free text — who they socialized with." },
        tension_with: { type: "string", description: "Free text." },
        elims: { type: "string" },
        state_of_mind: { type: "string" },
        cooperation: { type: "string" },
        enrichment_motivator: { type: "string" },
        rest: { type: "string" },
        social_log: { type: "string" },
        sensitivities: { type: "string" },
        feeling: { type: "string" },
        walk_location: { type: "string" },
        triggers_quantity: { type: "string" },
        urination: { type: "string" },
        defecation: { type: "string" },
        panting: { type: "string" },
        post_walk_recovery: { type: "string" },
        walk_choice: { type: "string" },
        state_of_mind_walk: { type: "string" },
        sniff_scale: { type: "string" },
        social_coping: { type: "string" },
        leash_tension: { type: "string" },
        cohesion: { type: "string" },
        gait: { type: "string" },
        extra_notes: { type: "string", description: "Free text — always include a clean summary here." },
      },
      required: ["dog", "report_type", "extra_notes"],
    },
  },
  {
    name: "create_invoice",
    description:
      "Creates a DRAFT invoice in Square for a client — never publishes or sends it. Ashley reviews and sends it herself from the Square Dashboard. Use this when she asks to invoice/bill a client for something. Only works if SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID are configured.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client's full name." },
        client_email: { type: "string", description: "Optional but recommended — needed for Square to eventually email it once she publishes." },
        client_phone: { type: "string", description: "Optional." },
        line_items: {
          type: "array",
          description: "One or more charges. Each needs a plain description and a dollar amount.",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              amount: { type: "number", description: "Dollars, e.g. 68 for $68.00." },
            },
            required: ["description", "amount"],
          },
        },
        due_date: { type: "string", description: "YYYY-MM-DD. Defaults to 7 days out if omitted." },
        note: { type: "string", description: "Optional message/memo shown on the invoice." },
      },
      required: ["client_name", "line_items"],
    },
  },
  {
    name: "social_metrics_read",
    description:
      "Reads current Instagram follower count and/or Facebook Page likes/followers. Use this when Ashley asks about her follower counts or social growth. Only works if META_ACCESS_TOKEN plus META_IG_USER_ID/META_PAGE_ID are configured.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "schedule_reminder",
    description:
      "Schedules a push notification reminder to Ashley's phone/devices at a specific date/time. Use this whenever she asks to be reminded of something ('don't let me forget to...', 'remind me at...'). Resolve relative times ('6pm today', 'in an hour') against the current date/time given in the system prompt — never guess the date. Only works if push notifications are configured (VAPID keys set, at least one device subscribed).",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The reminder text to send, written plainly, e.g. 'Give Millie her meds'." },
        date: { type: "string", description: "YYYY-MM-DD, America/Denver. Defaults to today if omitted." },
        time: { type: "string", description: "HH:MM in 24h time, America/Denver." },
      },
      required: ["message", "time"],
    },
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

    case "wordpress_pricing_read":
      return wordpressPricingRead();

    case "estimate_monthly_earnings":
      return estimateMonthlyEarnings();

    case "training_progress_read":
      return trainingProgressRead();

    case "bookkeeping_log":
      return bookkeepingLog(input);

    case "bookkeeping_read":
      return bookkeepingRead(input);

    case "save_content_idea":
      return saveContentIdea(input);

    case "log_post_performance":
      return logPostPerformance(input);

    case "list_content_ideas":
      return listContentIdeas(input);

    case "submit_report_card":
      return submitReportCard(input);

    case "social_metrics_read":
      return ok(await readSocialMetrics());

    case "schedule_reminder":
      return scheduleReminder(input);

    case "create_invoice":
      return createInvoice(input);

    default:
      return fail(`Unknown tool: ${name}`);
  }
}

async function logRevenue(input: Record<string, unknown>): Promise<ToolResult> {
  const amount = Number(input.amount);
  const stream = String(input.stream || "").trim();
  const date =
    typeof input.date === "string" && input.date ? input.date : todayInBusinessTimezone();
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

  // Best-effort mirror to the shared bookkeeping sheet — this is a nice-to-have
  // copy for her to see/edit directly, never a reason to fail the actual log.
  if (sheetsConfigured()) {
    appendRow("Transactions!A:E", [date, "revenue", stream, amount, note || ""]).catch((err) => {
      console.error("sheet mirror for log_revenue failed", err);
    });
  }

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
  const end = `${month}-${String(lastDayOfMonth(month)).padStart(2, "0")}`;

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

async function googleCalendarRead(): Promise<ToolResult> {
  if (!googleCalendarConfigured()) {
    return ok({
      configured: false,
      message:
        "Google Calendar isn't connected yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in env (see README for the one-time setup) to enable this.",
    });
  }
  try {
    const events = await listUpcomingEvents();
    return ok({ configured: true, upcoming_events: events });
  } catch (err) {
    return fail(
      `Could not read calendar: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function wordpressApiConfigured(): boolean {
  return Boolean(process.env.WORDPRESS_API_URL && process.env.WORDPRESS_API_KEY);
}

/** GET a mayday-hub REST route with the shared Jarvis API key. Throws on non-2xx. */
async function wordpressApiGet(path: string): Promise<any> {
  const base = process.env.WORDPRESS_API_URL!.replace(/\/$/, "");
  const res = await fetch(`${base}/wp-json/mayday-hub/v1/${path}`, {
    headers: { Authorization: `Bearer ${process.env.WORDPRESS_API_KEY}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `WordPress returned ${res.status}`);
  return data;
}

async function wordpressBookingsRead(): Promise<ToolResult> {
  if (wordpressApiConfigured()) {
    try {
      const data = await wordpressApiGet("bookings?days=45");
      return ok({ configured: true, source: "live_api", ...data });
    } catch (err) {
      return fail(`Could not read live bookings: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const icsUrl = process.env.WORDPRESS_ICS_URL;
  if (!icsUrl) {
    return ok({
      configured: false,
      message:
        "WordPress bookings read is not configured. Set WORDPRESS_API_URL/WORDPRESS_API_KEY for full detail, or WORDPRESS_ICS_URL for a basic read-only feed.",
    });
  }

  try {
    const res = await fetch(icsUrl, { cache: "no-store" });
    if (!res.ok) {
      return fail(`ICS feed returned ${res.status}`);
    }
    const text = await res.text();
    const events = parseIcsEvents(text).slice(0, 10);
    return ok({ configured: true, source: "ics_feed", upcoming_bookings: events });
  } catch (err) {
    return fail(
      `Could not fetch ICS feed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function wordpressPricingRead(): Promise<ToolResult> {
  if (!wordpressApiConfigured()) {
    return ok({
      configured: false,
      message: "Live pricing isn't connected. Set WORDPRESS_API_URL and WORDPRESS_API_KEY in env.",
    });
  }
  try {
    const data = await wordpressApiGet("pricing");
    return ok({ configured: true, ...data });
  } catch (err) {
    return fail(`Could not read live pricing: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function trainingProgressRead(): Promise<ToolResult> {
  if (!wordpressApiConfigured()) {
    return ok({
      configured: false,
      message: "Training log isn't connected. Set WORDPRESS_API_URL and WORDPRESS_API_KEY in env.",
    });
  }
  try {
    const data = await wordpressApiGet("training-summary");
    return ok({ configured: true, ...data });
  } catch (err) {
    return fail(`Could not read training log: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function bookkeepingLog(input: Record<string, unknown>): Promise<ToolResult> {
  if (!sheetsConfigured()) {
    return ok({
      configured: false,
      message: "The shared bookkeeping sheet isn't connected. Set GOOGLE_SHEETS_ID (plus the Google OAuth env vars — see README) to enable this.",
    });
  }

  const type = input.type === "expense" ? "expense" : input.type === "revenue" ? "revenue" : "";
  const category = String(input.category || "").trim();
  const amount = Number(input.amount);
  const date = typeof input.date === "string" && input.date ? input.date : todayInBusinessTimezone();
  const note = typeof input.note === "string" ? input.note : "";

  if (!type) return fail("type must be 'revenue' or 'expense'");
  if (!category) return fail("category is required");
  if (!Number.isFinite(amount) || amount <= 0) return fail("amount must be a positive number");

  try {
    await appendRow("Transactions!A:E", [date, type, category, amount, note]);
    return ok({ logged: true, date, type, category, amount, note });
  } catch (err) {
    return fail(`Could not write to the sheet: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function bookkeepingRead(input: Record<string, unknown>): Promise<ToolResult> {
  if (!sheetsConfigured()) {
    return ok({
      configured: false,
      message: "The shared bookkeeping sheet isn't connected. Set GOOGLE_SHEETS_ID (plus the Google OAuth env vars — see README) to enable this.",
    });
  }

  const range = typeof input.range === "string" && input.range ? input.range : "Transactions!A:E";

  try {
    const rows = await readRange(range);
    return ok({ configured: true, range, rows });
  } catch (err) {
    return fail(`Could not read the sheet: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function saveContentIdea(input: Record<string, unknown>): Promise<ToolResult> {
  const idea = String(input.idea || "").trim();
  if (!idea) return fail("idea is required");

  const supabase = getSupabaseServer();
  const { error } = await supabase.from("content_ideas").insert({
    idea,
    pillar: typeof input.pillar === "string" ? input.pillar : null,
    series: typeof input.series === "string" ? input.series : null,
  });

  if (error) return fail(error.message);
  return ok({ saved: true, idea });
}

async function logPostPerformance(input: Record<string, unknown>): Promise<ToolResult> {
  const description = String(input.description || "").trim();
  const performanceNote = String(input.performance_note || "").trim();
  if (!description) return fail("description is required");
  if (!performanceNote) return fail("performance_note is required");

  const supabase = getSupabaseServer();
  // Try to attach this to an existing matching idea (best-effort text match); otherwise log it as its own row.
  const { data: existing } = await supabase
    .from("content_ideas")
    .select("id")
    .ilike("idea", `%${description}%`)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("content_ideas")
      .update({ status: "posted", performance_note: performanceNote, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return fail(error.message);
    return ok({ logged: true, matched_existing_idea: true, description, performance_note: performanceNote });
  }

  const { error } = await supabase.from("content_ideas").insert({
    idea: description,
    status: "posted",
    performance_note: performanceNote,
  });
  if (error) return fail(error.message);
  return ok({ logged: true, matched_existing_idea: false, description, performance_note: performanceNote });
}

async function listContentIdeas(input: Record<string, unknown>): Promise<ToolResult> {
  const supabase = getSupabaseServer();
  let query = supabase
    .from("content_ideas")
    .select("idea, pillar, series, status, performance_note, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (typeof input.status === "string" && input.status) {
    query = query.eq("status", input.status);
  }

  const { data, error } = await query;
  if (error) return fail(error.message);
  return ok({ ideas: data || [] });
}

async function estimateMonthlyEarnings(): Promise<ToolResult> {
  if (!wordpressApiConfigured()) {
    return ok({
      configured: false,
      message: "Live bookings aren't connected. Set WORDPRESS_API_URL and WORDPRESS_API_KEY in env.",
    });
  }

  try {
    const monthKey = currentMonthKey();
    const todayDay = Number(todayInBusinessTimezone().slice(8, 10));
    const daysLeftInMonth = lastDayOfMonth(monthKey) - todayDay + 1;
    const data = await wordpressApiGet(`bookings?days=${Math.max(daysLeftInMonth, 1)}`);

    const bookingsThisMonth = (data.bookings || []).filter(
      (b: any) => typeof b.check_in === "string" && b.check_in.slice(0, 7) === monthKey
    );
    const bookedProjected = bookingsThisMonth.reduce(
      (sum: number, b: any) => sum + Number(b.subtotal || 0),
      0
    );

    const target = targetForMonth(monthKey);

    return ok({
      month: target?.label || monthKey,
      booked_projected: bookedProjected,
      target: target?.target ?? null,
      booking_count: bookingsThisMonth.length,
      note: "This is what's already on the calendar, not money in hand — compare against pace_check's logged/actual number separately.",
    });
  } catch (err) {
    return fail(`Could not estimate earnings: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function submitReportCard(input: Record<string, unknown>): Promise<ToolResult> {
  const apiUrl = process.env.WORDPRESS_API_URL;
  const apiKey = process.env.WORDPRESS_API_KEY;

  if (!apiUrl || !apiKey) {
    return fail(
      "Report cards aren't connected yet. Set WORDPRESS_API_URL and WORDPRESS_API_KEY in env (values from MayDay Co. -> Jarvis Integration in WP admin)."
    );
  }

  const dog = String(input.dog || "").trim();
  const extraNotes = String(input.extra_notes || "").trim();
  if (!dog) return fail("dog is required");
  if (!extraNotes) return fail("extra_notes is required — always summarize what was actually said");

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/wp-json/mayday-hub/v1/report-card`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(input),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return fail(data?.message || `WordPress returned ${res.status}`);
    }

    return ok(data);
  } catch (err) {
    return fail(
      `Could not reach WordPress: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function scheduleReminder(input: Record<string, unknown>): Promise<ToolResult> {
  if (!pushConfigured()) {
    return fail(
      "Reminders aren't set up yet — need VAPID keys configured and at least one device with notifications enabled."
    );
  }

  const message = String(input.message || "").trim();
  const time = String(input.time || "").trim();
  const date = String(input.date || "").trim() || todayInBusinessTimezone();

  if (!message) return fail("message is required");
  if (!/^\d{2}:\d{2}$/.test(time)) return fail("time must be HH:MM (24h)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("date must be YYYY-MM-DD");

  const remindAt = localToUtcDate(date, time);
  if (isNaN(remindAt.getTime())) return fail("Could not parse that date/time");
  if (remindAt.getTime() < Date.now() - 60_000) {
    return fail("That time is in the past — double check the date/time before scheduling.");
  }

  const supabase = getSupabaseServer();
  const { error } = await supabase.from("reminders").insert({
    message,
    remind_at: remindAt.toISOString(),
  });

  if (error) return fail(error.message);

  return ok({ scheduled: true, message, remind_at_utc: remindAt.toISOString(), remind_at_local: `${date} ${time} America/Denver` });
}

async function createInvoice(input: Record<string, unknown>): Promise<ToolResult> {
  if (!squareConfigured()) {
    return fail("Square isn't connected yet. Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in env.");
  }

  const clientName = String(input.client_name || "").trim();
  if (!clientName) return fail("client_name is required");

  const rawItems = Array.isArray(input.line_items) ? input.line_items : [];
  const lineItems = rawItems
    .map((item: any) => ({
      description: String(item?.description || "").trim(),
      amount: Number(item?.amount),
    }))
    .filter((item) => item.description && Number.isFinite(item.amount) && item.amount > 0);

  if (lineItems.length === 0) {
    return fail("line_items must have at least one item with a description and a positive amount");
  }

  try {
    const result = await createDraftInvoice(clientName, lineItems, {
      email: typeof input.client_email === "string" ? input.client_email : undefined,
      phone: typeof input.client_phone === "string" ? input.client_phone : undefined,
      dueDate: typeof input.due_date === "string" ? input.due_date : undefined,
      note: typeof input.note === "string" ? input.note : undefined,
    });

    return ok({
      created: true,
      status: result.status,
      total: result.totalDollars,
      invoice_id: result.invoiceId,
      note: "This is a DRAFT only — nothing was sent. Review and publish it from the Square Dashboard when ready.",
    });
  } catch (err) {
    return fail(`Could not create invoice: ${err instanceof Error ? err.message : String(err)}`);
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
