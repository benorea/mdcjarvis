// Pushes content/business-context.md into the Supabase business_context
// table as a new version. Run this after editing the plan:
//
//   npm run seed:context
//
import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const envLocalPath = path.join(process.cwd(), ".env.local");
  if (existsSync(envLocalPath)) {
    const dotenv = await import("dotenv");
    dotenv.config({ path: envLocalPath, override: true });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Fill in .env.local first."
    );
    process.exit(1);
  }

  const contextPath = path.join(process.cwd(), "content", "business-context.md");
  const content = readFileSync(contextPath, "utf-8");

  const supabase = createClient(url, key);

  const { data: latest } = await supabase
    .from("business_context")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;

  const { error } = await supabase
    .from("business_context")
    .insert({ content, version: nextVersion });

  if (error) {
    console.error("Failed to seed business_context:", error.message);
    process.exit(1);
  }

  console.log(`Seeded business_context version ${nextVersion} (${content.length} chars).`);
}

main();
