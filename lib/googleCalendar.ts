import { google } from "googleapis";

export function googleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

/**
 * Personal single-user OAuth: one refresh token, generated once (see
 * README), reused server-side forever. googleapis handles minting fresh
 * access tokens from it automatically — no token storage or refresh logic
 * needed here.
 */
function getCalendarClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

function calendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}

export type CalendarEventInput = {
  summary: string;
  description: string;
  startDateTime: string; // "YYYY-MM-DDTHH:mm:ss", local wall-clock, no offset
  endDateTime: string;
  timeZone: string; // IANA tz, e.g. "America/Denver"
};

export async function createCalendarEvent(event: CalendarEventInput) {
  const calendar = getCalendarClient();
  const res = await calendar.events.insert({
    calendarId: calendarId(),
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startDateTime, timeZone: event.timeZone },
      end: { dateTime: event.endDateTime, timeZone: event.timeZone },
    },
  });
  return { id: res.data.id, htmlLink: res.data.htmlLink };
}

export async function listUpcomingEvents(maxResults = 10) {
  const calendar = getCalendarClient();
  const res = await calendar.events.list({
    calendarId: calendarId(),
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });
  return (res.data.items || []).map((e) => ({
    summary: e.summary || "(untitled)",
    start: e.start?.dateTime || e.start?.date || "(unknown)",
  }));
}
