import { readFile } from "fs/promises";
import path from "path";
import { getSupabaseServer } from "./supabase";

const FALLBACK_PATH = path.join(process.cwd(), "content", "business-context.md");

/**
 * Returns the latest business_context row from Supabase. Falls back to the
 * on-disk markdown file if the table is empty or Supabase isn't reachable
 * yet (e.g. first run before `npm run seed:context`), so the app still
 * works before the DB is fully wired up.
 */
export async function getBusinessContext(): Promise<string> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("business_context")
      .select("content")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.content) {
      return data.content;
    }
  } catch {
    // fall through to disk
  }

  return readFile(FALLBACK_PATH, "utf-8");
}
