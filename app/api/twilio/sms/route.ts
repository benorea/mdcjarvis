import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getReply } from "@/lib/chatEngine";

export const runtime = "nodejs";

// Optional path — off by default. To enable:
//   1. Set TWILIO_ENABLED=true, TWILIO_AUTH_TOKEN=... in env.
//   2. Point your Twilio phone number's "A message comes in" webhook at
//      https://<your-deployment>/api/twilio/sms
// Every inbound text is treated as its own session, keyed by the sender's
// phone number, so history stays continuous per-texter.

function validateTwilioSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>
): boolean {
  if (!signature) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  const expected = crypto.createHmac("sha1", authToken).update(data, "utf-8").digest("base64");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function twiml(message: string): string {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

export async function POST(req: NextRequest) {
  if (process.env.TWILIO_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Twilio SMS is not enabled. Set TWILIO_ENABLED=true to turn it on." },
      { status: 404 }
    );
  }

  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const signature = req.headers.get("X-Twilio-Signature");
    const url = req.nextUrl.toString();
    if (!validateTwilioSignature(authToken, signature, url, params)) {
      return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
    }
  }

  const from = params.From;
  const body = params.Body?.trim();

  if (!from || !body) {
    return new NextResponse(twiml("Didn't catch that — try again?"), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  try {
    const { text } = await getReply(`sms:${from}`, body);
    return new NextResponse(twiml(text), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    console.error("twilio sms route error", err);
    return new NextResponse(twiml("Jarvis hit an error — try again in a bit."), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
