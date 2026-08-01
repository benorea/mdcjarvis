import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { googleCalendarConfigured } from "@/lib/googleCalendar";
import { pushConfigured } from "@/lib/webpush";
import { squareConfigured } from "@/lib/square";
import { sheetsConfigured } from "@/lib/googleSheets";

export const runtime = "nodejs";

// Booleans only — never leaks the actual key values, just whether each
// integration has what it needs to work.
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    wordpress: Boolean(process.env.WORDPRESS_API_URL && process.env.WORDPRESS_API_KEY),
    wordpressIcsOnly: Boolean(process.env.WORDPRESS_ICS_URL) && !process.env.WORDPRESS_API_URL,
    googleCalendar: googleCalendarConfigured(),
    calendarWebhook: Boolean(process.env.JARVIS_CALENDAR_WEBHOOK_SECRET),
    square: squareConfigured(),
    push: pushConfigured(),
    twilioSms: process.env.TWILIO_ENABLED === "true",
    voiceTranscription: Boolean(process.env.OPENAI_API_KEY),
    bookkeepingSheet: sheetsConfigured(),
  });
}
