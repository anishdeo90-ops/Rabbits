import { createAdminClient } from "./supabase-script-client.mjs";

const supabase = createAdminClient();

try {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (error) throw error;
  console.log(`PASS: connected to Supabase; profiles has ${count ?? 0} rows`);
} catch (e) {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
}
