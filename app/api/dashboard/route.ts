import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { runTool } from "@/lib/tools";
import { getSupabaseServer } from "@/lib/supabase";
import { todayInBusinessTimezone, BUSINESS_TIMEZONE } from "@/lib/timezone";
import { contentThemeForMonth } from "@/lib/planData";
import { readSocialMetrics } from "@/lib/socialMetrics";
import { latestWebPresenceSnapshot } from "@/lib/webPresence";

export const runtime = "nodejs";

async function remindersToday() {
  const today = todayInBusinessTimezone();
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("reminders")
    .select("message, remind_at, sent")
    .gte("remind_at", `${today}T00:00:00`)
    .lte("remind_at", `${today}T23:59:59`)
    .order("remind_at", { ascending: true });
  return data || [];
}

/**
 * One call, everything the summary view needs. Reuses the same tool
 * handlers chat uses (runTool) rather than duplicating fetch logic —
 * whatever pace_check or wordpress_bookings_read do for chat is exactly
 * what powers this view too, so the two never quietly disagree.
 */
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const monthNum = Number(todayInBusinessTimezone().slice(5, 7));

  const [dailyTask, paceCheck, monthlyEarnings, bookings, training, contentIdeas, reminders, socialMetrics, webPresence] =
    await Promise.all([
      runTool("daily_task", {}),
      runTool("pace_check", {}),
      runTool("estimate_monthly_earnings", {}),
      runTool("wordpress_bookings_read", {}),
      runTool("training_progress_read", {}),
      runTool("list_content_ideas", { status: "idea" }),
      remindersToday(),
      readSocialMetrics().catch((err) => ({ configured: true, message: err instanceof Error ? err.message : String(err) })),
      latestWebPresenceSnapshot(),
    ]);

  return NextResponse.json({
    dailyTask: dailyTask.data,
    paceCheck: paceCheck.data,
    monthlyEarnings: monthlyEarnings.data,
    bookings: bookings.data,
    training: training.data,
    contentIdeas: contentIdeas.data,
    remindersToday: reminders,
    contentTheme: contentThemeForMonth(monthNum),
    timezone: BUSINESS_TIMEZONE,
    socialMetrics,
    webPresence,
  });
}
