import { google } from "googleapis";

export function sheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN &&
      process.env.GOOGLE_SHEETS_ID
  );
}

// Same OAuth client pattern as lib/googleCalendar.ts, same credentials —
// the refresh token just needs the Sheets scope included alongside the
// Calendar one when it's generated (see README). One Google connection,
// two capabilities.
function getSheetsClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.sheets({ version: "v4", auth: oauth2Client });
}

function spreadsheetId(): string {
  return process.env.GOOGLE_SHEETS_ID!;
}

/** Appends one row to the end of the given tab/range, e.g. "Transactions!A:E". */
export async function appendRow(range: string, values: (string | number)[]): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

/** Reads a tab/range as-is, e.g. "Transactions!A1:E50". Returns raw rows (arrays of cell strings). */
export async function readRange(range: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range,
  });
  return (res.data.values as string[][]) || [];
}
