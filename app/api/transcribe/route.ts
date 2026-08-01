import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Transcribes a recorded voice note via OpenAI's Whisper API. This is the
 * universal fallback for voice input — the browser's own SpeechRecognition
 * API is inconsistent enough across platforms (notably: silently does
 * nothing in an installed iOS PWA) that recording + server-side
 * transcription is the only approach that works the same way everywhere.
 */
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Voice transcription isn't configured — set OPENAI_API_KEY in env." },
      { status: 501 }
    );
  }

  const formData = await req.formData();
  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("file", audio, "recording.webm");
  upstream.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: upstream,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error?.message || `Transcription failed (${res.status})` },
      { status: 502 }
    );
  }

  return NextResponse.json({ transcript: data.text || "" });
}
