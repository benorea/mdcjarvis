import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only client, service-role key. Never import this from a "use
// client" component — it must stay inside API routes / server code.
let cached: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill them in."
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cached;
}
