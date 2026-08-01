// Structured numbers the tools compute against. Prose lives in
// content/business-context.md; this file is the machine-readable mirror of
// the ramped targets and routines described there. Keep the two in sync.

import { todayInBusinessTimezone } from "./timezone";

export type MonthlyTarget = {
  /** e.g. "2026-08" */
  month: string;
  label: string;
  target: number;
};

export const MONTHLY_TARGETS: MonthlyTarget[] = [
  { month: "2026-08", label: "Aug 2026", target: 1100 },
  { month: "2026-09", label: "Sep 2026", target: 1400 },
  { month: "2026-10", label: "Oct 2026", target: 1600 },
  { month: "2026-11", label: "Nov 2026", target: 1800 },
  { month: "2026-12", label: "Dec 2026", target: 2000 },
  { month: "2027-01", label: "Jan 2027", target: 2100 },
];

export const GOAL_TOTAL = MONTHLY_TARGETS.reduce((sum, m) => sum + m.target, 0); // 10,000

/** Defaults to Denver's current month, not the server's — the server runs in UTC, which is a different calendar day for a big chunk of every Denver evening. */
export function currentMonthKey(dateStr: string = todayInBusinessTimezone()): string {
  return dateStr.slice(0, 7);
}

export function targetForMonth(monthKey: string): MonthlyTarget | undefined {
  return MONTHLY_TARGETS.find((m) => m.month === monthKey);
}

// Rotating daily-task phases. daily_task() picks the phase whose date range
// contains today, then hands back the standing checklist item for it. This
// is intentionally simple — a single "what matters most right now" pointer,
// not a task manager.
export type Phase = {
  id: string;
  from: string; // inclusive, YYYY-MM-DD
  to: string; // inclusive, YYYY-MM-DD
  focus: string;
  checklist: string[];
};

export const PHASES: Phase[] = [
  {
    id: "async-plan-launch",
    from: "2026-08-01",
    to: "2026-08-14",
    focus: "Launch the $75 async written training plan — the flagship mind-my-business product.",
    checklist: [
      "Write intake form questions (8-10: issue, history, what they've tried, video links, goals, environment).",
      "Write the deliverable template (assessment → 3-4 focus areas → protocol → follow-up).",
      "Confirm service shows at checkout (deploy v4.9.1).",
      "Write listing copy (what they get, 72hr turnaround, who it's for).",
      "Announce on every channel, pin it.",
    ],
  },
  {
    id: "boarding-pipeline",
    from: "2026-08-15",
    to: "2026-09-30",
    focus: "Boarding + training are load-bearing — fill the pipeline before layering on content.",
    checklist: [
      "Same-day reply to every booking inquiry.",
      "Fix the homepage title tag and per-page meta descriptions (highest-leverage SEO fix).",
      "Unify the Aurora / Denver Metro location story across site, GBP, and directories.",
      "Push the async plan + virtual package in every touchpoint.",
    ],
  },
  {
    id: "content-and-etsy",
    from: "2026-10-01",
    to: "2026-11-29",
    focus: "Layer in content engine + Etsy relist while boarding/training keep cash flowing.",
    checklist: [
      "Batch one week of content against the current month's calendar theme.",
      "Split Etsy listings toward the 35-40 target (length/width/color variants + collars).",
      "Ship one finished Tier-2 item this week — not three started.",
      "Review Goal Tracker pace against this month's target.",
    ],
  },
  {
    id: "december-lockdown",
    from: "2026-11-30",
    to: "2026-12-31",
    focus: "December capacity is sacred. No experiments. Fill boarding, protect the routine.",
    checklist: [
      "Checkpoint: is December 80%+ booked? If not, this is the one thing to fix today.",
      "No new side-build experiments this month.",
      "Keep the daily 15-min routine — log money, one content beat, clear stragglers.",
    ],
  },
  {
    id: "final-push",
    from: "2027-01-01",
    to: "2027-01-31",
    focus: "Train Your Dog Month — the biggest training push of the plan, and the final $2,100 to close the $10k goal.",
    checklist: [
      "Lead every channel with training (virtual sessions, async plans, packages).",
      "Run the kill/keep review on every side stream one last time.",
      "Track pace daily — this is the last month, no slack left in the ramp.",
    ],
  },
];

export function phaseForDate(dateStr: string = todayInBusinessTimezone()): Phase | undefined {
  return PHASES.find((p) => dateStr >= p.from && dateStr <= p.to);
}

export const WEEKLY_REVIEW_QUESTIONS = [
  "What did you actually earn this week, and did you log every transaction?",
  "Where are you on pace for this month's target?",
  "What's the one outreach action you took this week?",
  "What Tier-2 item did you ship (finished, not started)?",
  "Anything you're avoiding that needs to happen next week?",
];

export const MONTHLY_CLOSE_QUESTIONS = [
  "What was this month's actual net, vs. the target?",
  "Which revenue streams pulled their weight, and which are >5hrs effort for <$50 — candidates to kill or demote?",
  "What's next month's content theme, and is it already on the calendar?",
  "Any guardrail close to being broken (gear spend vs. gear P&L, December capacity, trading cap)?",
  "One sentence: what's the single most important thing next month?",
];

// From the content calendar in business-context.md — theme by calendar
// month (1-12), independent of the 6-month plan phases above so it keeps
// working past January too.
export const CONTENT_THEMES: Record<number, string> = {
  1: "Train Your Dog Month — the biggest training push of the year",
  2: "Love & dental health",
  3: "Reactivity",
  4: "Bite prevention",
  5: "Anxiety awareness / events",
  6: "Summer safety",
  7: "Fireworks",
  8: "DOGust",
  9: "Separation anxiety / back-to-routine",
  10: "Spooky season / cooperative care",
  11: "Holiday booking urgency",
  12: "Peak occupancy",
};

export const CONTENT_SERIES = [
  "Decompression Diaries",
  "Making Their Gear",
  "Myth on Monday",
  "Study With Me (CPDT-KA)",
  "Ask a Trainer",
];

export function contentThemeForMonth(monthNum: number): string {
  return CONTENT_THEMES[monthNum] || "No theme set for this month";
}
