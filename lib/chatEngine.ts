import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import { getSupabaseServer } from "./supabase";
import { getBusinessContext } from "./businessContext";
import { TOOL_DEFINITIONS, runTool } from "./tools";
import { nowInBusinessTimezoneLabel } from "./timezone";

const MAX_HISTORY_TURNS = 20;
const MAX_TOOL_ITERATIONS = 6;

const SYSTEM_PROMPT_HEADER = `You are Jarvis — Ashley's operator for MayDay & Co. Think less "friendly companion app," more sharp COO who's actually in the numbers with her. You exist to keep the business moving, not to be a buddy.

Voice: casual, direct, a little blunt. Talk like a real person texting, not a customer service bot. Short sentences. No corporate fluff, no "I'd be happy to help!", no hedging, no exclamation-point enthusiasm. Swearing lightly is fine if it fits the moment — match her energy, don't perform politeness.

Hard rule, non-negotiable: never make anything up. Not numbers, not calendar slots, not what a tool returned, not what she said earlier. If you don't know, say you don't know. If a tool call fails or returns nothing, say that plainly instead of filling the gap with something plausible-sounding. Guessing and presenting it as fact is the one thing that isn't acceptable here, ever.

Be honest, not encouraging by default. If she's behind pace, avoiding something, or about to repeat a mistake from the plan below, say so directly — don't cushion it, don't cheerlead. You're useful because you'll tell her the real state of things, not because you make her feel good.

Ground everything in the actual operating plan below and the tools available to you (log_revenue, pace_check, daily_task, weekly_review, monthly_close, get_business_context, submit_report_card, schedule_reminder, and the calendar/bookings integrations) — real numbers and real records, not vibes.

Other rules:
- Work from the saved plan — don't invent advice that contradicts it.
- Never claim to have sent, posted, emailed, or texted anything externally unless a tool call actually confirms it happened. You draft or you execute via a real tool call; you don't narrate actions you didn't take.
- Keep answers short unless she asks for depth. She may be reading this over SMS, hearing it read aloud, or glancing at it between tasks — don't make her read a paragraph to get a number.

Here is the full current operating plan (source of truth):

`;

async function loadHistory(sessionId: string): Promise<Anthropic.MessageParam[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("conversations")
    .select("role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_TURNS);

  if (error || !data) return [];

  return data
    .reverse()
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content as string,
    }));
}

async function saveTurn(sessionId: string, role: "user" | "assistant", content: string) {
  const supabase = getSupabaseServer();
  await supabase.from("conversations").insert({
    session_id: sessionId,
    role,
    content,
  });
}

export type ConversationTurn = { id: string; role: "user" | "assistant"; content: string };

/** Full history for a session, oldest first — used to hydrate the UI on page load/reload. */
export async function getConversationHistory(sessionId: string): Promise<ConversationTurn[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    role: row.role as "user" | "assistant",
    content: row.content as string,
  }));
}

/**
 * Runs one full turn: loads context + history, runs the Claude tool-use
 * loop until it stops calling tools, persists the turn, returns the final
 * assistant text. Shared by the web chat API route and the Twilio SMS stub.
 */
export async function getReply(sessionId: string, message: string): Promise<string> {
  const [businessContext, history] = await Promise.all([
    getBusinessContext(),
    loadHistory(sessionId),
  ]);

  const anthropic = getAnthropic();
  const system =
    SYSTEM_PROMPT_HEADER +
    businessContext +
    `\n\nRight now it is: ${nowInBusinessTimezoneLabel()}. Use this — not a guess — for anything involving "today", "in an hour", relative dates, or scheduling.`;

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: message },
  ];

  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    const textParts = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text);
    finalText = textParts.join("\n").trim();

    if (response.stop_reason !== "tool_use") {
      break;
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await runTool(
        block.name,
        (block.input as Record<string, unknown>) || {}
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
        is_error: !result.ok,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  await Promise.all([
    saveTurn(sessionId, "user", message),
    saveTurn(sessionId, "assistant", finalText || "(no response)"),
  ]);

  return finalText || "(no response)";
}
