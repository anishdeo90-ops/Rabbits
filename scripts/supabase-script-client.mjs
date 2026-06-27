import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL and Supabase service role key in .env.local");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function upsertFormByName(supabase, { name, type, description, fields }) {
  const { data: existing, error: findError } = await supabase
    .from("forms")
    .select("id")
    .eq("name", name)
    .order("created_at", { ascending: false })
    .limit(1);

  if (findError) throw findError;

  const payload = {
    fields,
    description,
    type,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  if (existing?.length) {
    const id = existing[0].id;
    const { error } = await supabase.from("forms").update(payload).eq("id", id);
    if (error) throw error;
    return { id, inserted: false };
  }

  const { data, error } = await supabase
    .from("forms")
    .insert({ name, ...payload })
    .select("id")
    .single();

  if (error) throw error;
  return { id: data.id, inserted: true };
}
