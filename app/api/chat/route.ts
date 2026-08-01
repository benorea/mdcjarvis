import { NextRequest, NextResponse } from "next/server";
import { getReply } from "@/lib/chatEngine";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { message?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message?.trim();
  const sessionId = body.sessionId?.trim() || "default";

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const reply = await getReply(sessionId, message);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("chat route error", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Server error: ${detail}` }, { status: 500 });
  }
}
