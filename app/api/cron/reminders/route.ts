import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { pushConfigured, sendPushToAll } from "@/lib/webpush";
import { verifyCronSecret } from "@/lib/cronAuth";
import { localToUtcDate, utcToLocalParts, nextRecurrenceDate, type Recurrence } from "@/lib/timezone";

export const runtime = "nodejs";

/**
 * Polled by the GitHub Actions workflow (.github/workflows/reminders.yml)
 * every few minutes. Vercel's own Cron on the free Hobby tier only fires
 * once a day, which isn't tight enough for "remind me at 6pm" — this is
 * the free, precise alternative.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  if (!pushConfigured()) {
    return NextResponse.json({ sent: 0, skipped: "Push notifications not configured" });
  }

  const supabase = getSupabaseServer();
  const { data: due, error } = await supabase
    .from("reminders")
    .select("id, message, remind_at, recurrence")
    .eq("sent", false)
    .lte("remind_at", new Date().toISOString())
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sentCount = 0;
  for (const reminder of due || []) {
    try {
      await sendPushToAll({ title: "Jarvis", body: reminder.message });
      await supabase
        .from("reminders")
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq("id", reminder.id);
      sentCount++;

      const recurrence = reminder.recurrence as Recurrence | null;
      if (recurrence) {
        const { date, time } = utcToLocalParts(new Date(reminder.remind_at));
        const nextDate = nextRecurrenceDate(date, recurrence);
        const nextRemindAt = localToUtcDate(nextDate, time);
        await supabase.from("reminders").insert({
          message: reminder.message,
          remind_at: nextRemindAt.toISOString(),
          recurrence,
        });
      }
    } catch (err) {
      console.error(`reminder ${reminder.id} failed to send`, err);
    }
  }

  return NextResponse.json({ sent: sentCount, checked: (due || []).length });
}
