import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { checkWebPresence, saveWebPresenceSnapshot } from "@/lib/webPresence";

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
 * Polled once a day by .github/workflows/web-presence.yml. Runs a real web
 * search for the business name/domain and saves a plain-text snapshot for
 * the Dashboard's "Web presence" panel. Reuses the same CRON_SECRET as the
 * reminders poller.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const summary = await checkWebPresence();
    await saveWebPresenceSnapshot(summary);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error("web-presence cron failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
