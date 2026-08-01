import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (cached) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Copy .env.example to .env.local and fill it in."
    );
  }

  cached = new Anthropic({ apiKey });
  return cached;
}

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
