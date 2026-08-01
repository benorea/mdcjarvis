import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createCalendarEvent, googleCalendarConfigured } from "@/lib/googleCalendar";

export const runtime = "nodejs";

type BookingPayload = {
  booking_ref: string;
  service_label: string;
  service_type: string;
  dogs: string[];
  client_name: string;
  client_phone: string;
  check_in: string; // "YYYY-MM-DD HH:mm:ss", local wall-clock (America/Denver)
  check_out: string;
  address: string;
  notes: string;
  timezone: string;
};

function verifySecret(req: NextRequest): boolean {
  const expected = process.env.JARVIS_CALENDAR_WEBHOOK_SECRET;
  const given = req.headers.get("x-jarvis-secret");
  if (!expected || !given) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  } catch {
    return false;
  }
}

/** "YYYY-MM-DD HH:mm:ss" (MySQL DATETIME) -> "YYYY-MM-DDTHH:mm:ss" (RFC3339 local, no offset) */
function toLocalIso(mysqlDateTime: string): string {
  return mysqlDateTime.trim().replace(" ", "T");
}

/**
 * Google Calendar requires an IANA zone name (e.g. "America/Denver"), not a
 * raw UTC offset. wp_timezone_string() returns a plain offset like "-06:00"
 * if the WordPress site is configured with a manual UTC offset instead of a
 * named city — fall back to the business's actual timezone in that case
 * rather than sending Google something it'll reject.
 */
function resolveTimeZone(wpTimezone: string | undefined): string {
  if (wpTimezone && wpTimezone.includes("/")) return wpTimezone;
  return "America/Denver";
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  if (!googleCalendarConfigured()) {
    return NextResponse.json(
      { error: "Google Calendar isn't configured on Jarvis (missing GOOGLE_* env vars)." },
      { status: 501 }
    );
  }

  let body: BookingPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.check_in || !body.check_out) {
    return NextResponse.json({ error: "Missing check_in/check_out" }, { status: 400 });
  }

  const dogNames = Array.isArray(body.dogs) ? body.dogs.join(", ") : "";
  const summary = `${body.service_label || body.service_type}${dogNames ? " — " + dogNames : ""}`;

  const descriptionLines = [
    `Ref: ${body.booking_ref}`,
    `Client: ${body.client_name}${body.client_phone ? " (" + body.client_phone + ")" : ""}`,
  ];
  if (body.address) descriptionLines.push(`Address: ${body.address}`);
  if (body.notes) descriptionLines.push(`Notes: ${body.notes}`);

  try {
    const event = await createCalendarEvent({
      summary,
      description: descriptionLines.join("\n"),
      startDateTime: toLocalIso(body.check_in),
      endDateTime: toLocalIso(body.check_out),
      timeZone: resolveTimeZone(body.timezone),
    });

    return NextResponse.json({ ok: true, event });
  } catch (err) {
    console.error("booking webhook error", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Calendar error: ${detail}` }, { status: 500 });
  }
}
