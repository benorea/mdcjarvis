import { NextRequest, NextResponse } from "next/server";
import { getConversationHistory } from "@/lib/chatEngine";
import { isAuthed } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim() || "default";
  const messages = await getConversationHistory(sessionId);
  return NextResponse.json({ messages });
}
