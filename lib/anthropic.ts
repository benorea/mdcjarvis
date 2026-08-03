import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (cached) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Copy .env.example to .env.local and fill it in."
    );
  }

  cached = new Anthropic({ apiKey });
  return cached;
}

/** Safe fingerprint for the Status panel — enough to confirm which key is
 * actually loaded (vs. what you think you pasted) without exposing it. */
export function anthropicKeyFingerprint(): string | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return `${apiKey.slice(0, 10)}…${apiKey.slice(-4)} (${apiKey.length} chars)`;
}

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
