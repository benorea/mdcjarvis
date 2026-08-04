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

Ground everything in the actual operating plan below and the tools available to you (log_revenue, pace_check, daily_task, weekly_review, monthly_close, get_business_context, submit_report_card, schedule_reminder, create_invoice, wordpress_pricing_read, estimate_monthly_earnings, training_progress_read, bookkeeping_log, bookkeeping_read, save_content_idea, log_post_performance, list_content_ideas, social_metrics_read, and the calendar/bookings integrations) — real numbers and real records, not vibes.

Web search: you have a real web_search tool — use it any time answering well requires current information from the actual internet: weather, what's out there about "MayDay & Co." or "maydayco.dog" (reviews, mentions, how the business shows up in search), or anything else time-sensitive you can't already answer from the plan/tools above. Report only what the search results actually say — never invent a rating, forecast, or fact you didn't see in the results.

Bookkeeping: log_revenue/pace_check are the fast daily scoreboard for the $10k goal specifically. bookkeeping_log/bookkeeping_read talk to Ashley's actual shared Google Sheet for the fuller picture — expenses, categories, anything beyond simple revenue. When she mentions an expense or wants something "in the sheet," use bookkeeping_log, not log_revenue.

Content ideas: when asked to brainstorm content, generate ideas grounded in the actual three pillars (Transformation/Craft/Science), the five recurring series, and the current month's theme from the plan below — don't invent generic "viral trend" claims, you have no real trend-tracking data source. If asked about what's worked before, use list_content_ideas to check the real logged performance history (things Ashley has actually told you performed well) rather than guessing.

Other rules:
- Work from the saved plan — don't invent advice that contradicts it.
- Never claim to have sent, posted, emailed, or texted anything externally unless a tool call actually confirms it happened. You draft or you execute via a real tool call; you don't narrate actions you didn't take.
- Keep answers short unless she asks for depth. She may be reading this over SMS, hearing it read aloud, or glancing at it between tasks — don't make her read a paragraph to get a number.
- Drafting is a core job, not a side favor: client texts, reply-to-a-review copy, booking-confirmation follow-ups, whatever. When asked to draft something, just write it in her voice (casual, direct — see business context) ready to copy-paste, don't ask permission first unless the request is genuinely ambiguous about who it's for or what it needs to say. You still never send it yourself.
- If asked to create an invoice, use the create_invoice tool. It always creates a DRAFT in Square — never published, never sent, never charges anyone. She reviews and sends it herself from Square. Say so plainly after creating one so she isn't surprised nothing went out yet.

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

export type ToolCallLog = { name: string; input: unknown; ok: boolean; result: unknown };

export type ReplyResult = { text: string; toolCalls: ToolCallLog[] };

/**
 * Runs one full turn: loads context + history, runs the Claude tool-use
 * loop until it stops calling tools, persists the turn, returns the final
 * assistant text plus a log of every tool call made along the way (so the
 * UI can show what actually happened, not just the final summary). Shared
 * by the web chat API route and the Twilio SMS stub.
 */
export async function getReply(sessionId: string, message: string): Promise<ReplyResult> {
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
  const toolCalls: ToolCallLog[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system,
      // The @anthropic-ai/sdk version pinned here predates typed support for
      // server-side tools (web_search) — the cast bypasses the stale local
      // type only; the JSON sent to the API is a normal, currently-supported
      // tool declaration.
      tools: [...TOOL_DEFINITIONS, { type: "web_search_20260209", name: "web_search" } as unknown as Anthropic.Tool],
      messages,
    });

    const textParts = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text);
    finalText = textParts.join("\n").trim();

    if ((response.stop_reason as string) === "pause_turn") {
      // Server-side tool (web_search) hit its internal iteration cap — resend
      // to let it continue rather than treating this as the final answer.
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    if (response.stop_reason !== "tool_use") {
      break;
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const input = (block.input as Record<string, unknown>) || {};
      // Every tool handler is expected to catch its own errors and return
      // { ok: false, ... } — this is a backstop so one tool throwing can
      // never take down the whole chat turn with a raw 500.
      let result: { ok: boolean; data: unknown };
      try {
        result = await runTool(block.name, input);
      } catch (err) {
        result = { ok: false, data: { error: err instanceof Error ? err.message : String(err) } };
      }
      toolCalls.push({ name: block.name, input, ok: result.ok, result: result.data });
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

  return { text: finalText || "(no response)", toolCalls };
}
