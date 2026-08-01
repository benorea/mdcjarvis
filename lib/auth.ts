import crypto from "crypto";
import { NextRequest } from "next/server";

export const AUTH_COOKIE = "jarvis_auth";
const SALT = "jarvis-mayday-co-v1"; // not secret — just keeps the cookie from being the plaintext password

function appPassword(): string {
  return process.env.APP_PASSWORD || "mayday";
}

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(`${password}:${SALT}`).digest("hex");
}

export function isCorrectPassword(password: string): boolean {
  const expected = hashPassword(appPassword());
  const given = hashPassword(password || "");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

export function expectedCookieValue(): string {
  return hashPassword(appPassword());
}

/** True if the request carries a valid auth cookie. Used to gate API routes. */
export function isAuthed(req: NextRequest): boolean {
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (!cookie) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expectedCookieValue()));
  } catch {
    return false;
  }
}
