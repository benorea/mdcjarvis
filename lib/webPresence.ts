import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import { getSupabaseServer } from "./supabase";

const SEARCH_PROMPT = `Search the web for "MayDay & Co. LLC" and "maydayco.dog" (a fear-free dog boarding/daycare/training business in Aurora, CO). Report plainly, in under 150 words:
- Where it actually shows up in search results right now (which pages rank, roughly what position if you can tell)
- Any reviews or mentions you find (Google, Yelp, social, directories) and their gist
- Anything notably wrong or outdated (bad info, old hours, wrong address)

Only report what the search results actually say — never invent a rating, review count, or ranking position you didn't see. If search turns up basically nothing, say that plainly instead of padding it out.`;

/** Runs a real web search via Claude and returns a short plain-text summary. Costs a small Anthropic web-search fee each time it's called. */
export async function checkWebPresence(): Promise<string> {
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    tools: [{ type: "web_search_20260209", name: "web_search" } as unknown as Anthropic.Tool],
    messages: [{ role: "user", content: SEARCH_PROMPT }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return text || "Search ran but returned no readable summary.";
}

export async function saveWebPresenceSnapshot(summary: string): Promise<void> {
  const supabase = getSupabaseServer();
  await supabase.from("web_presence_snapshots").insert({ summary });
}

export async function latestWebPresenceSnapshot(): Promise<{ summary: string; created_at: string } | null> {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("web_presence_snapshots")
    .select("summary, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}
