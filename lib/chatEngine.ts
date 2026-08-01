import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import { getSupabaseServer } from "./supabase";
import { getBusinessContext } from "./businessContext";
import { TOOL_DEFINITIONS, runTool } from "./tools";

const MAX_HISTORY_TURNS = 20;
const MAX_TOOL_ITERATIONS = 6;

const SYSTEM_PROMPT_HEADER = `You are Jarvis, Ashley's personal AI assistant for her business, MayDay & Co.

You are not a generic dog-business chatbot. You are grounded in the exact operating plan below, and you use the tools available to you (log_revenue, pace_check, daily_task, weekly_review, monthly_close, get_business_context, and the optional calendar/bookings readers) to answer with real numbers instead of guesses.

Rules:
- Be direct and concise. No corporate fluff, no fake quotas, no burnout scheduling. Match Ashley's casual tone.
- Be honest. If she's behind pace or avoiding something, say so plainly. Do not be a yes-man.
- Work from the saved plan below — don't invent advice that contradicts it.
- Never claim to have sent, posted, or emailed anything externally. You draft; she approves and sends.
- Keep answers short unless she asks for depth. She may be reading this over SMS or hearing it read aloud, so avoid heavy markdown.

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
  const system = SYSTEM_PROMPT_HEADER + businessContext;

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
