import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabase";
import { sendSms, smsConfigured } from "@/lib/sms";

export const runtime = "nodejs";

function verifyCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const given = req.headers.get("x-cron-secret");
  if (!expected || !given) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  } catch {
    return false;
  }
}

/**
 * Polled by the GitHub Actions workflow (.github/workflows/reminders.yml)
 * every few minutes. Vercel's own Cron on the free Hobby tier only fires
 * once a day, which isn't tight enough for "text me at 6pm" — this is the
 * free, precise alternative.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  if (!smsConfigured() || !process.env.OWNER_PHONE_NUMBER) {
    return NextResponse.json({ sent: 0, skipped: "SMS not configured" });
  }

  const supabase = getSupabaseServer();
  const { data: due, error } = await supabase
    .from("reminders")
    .select("id, message")
    .eq("sent", false)
    .lte("remind_at", new Date().toISOString())
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  for (const reminder of due || []) {
    try {
      await sendSms(process.env.OWNER_PHONE_NUMBER!, reminder.message);
      await supabase
        .from("reminders")
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq("id", reminder.id);
      sent++;
    } catch (err) {
      console.error(`reminder ${reminder.id} failed to send`, err);
    }
  }

  return NextResponse.json({ sent, checked: (due || []).length });
}
