import { NextRequest } from "next/server";
import crypto from "crypto";

/** Shared by every /api/cron/* route — timing-safe compare against CRON_SECRET, sent as X-Cron-Secret. */
export function verifyCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const given = req.headers.get("x-cron-secret");
  if (!expected || !given) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  } catch {
    return false;
  }
}
