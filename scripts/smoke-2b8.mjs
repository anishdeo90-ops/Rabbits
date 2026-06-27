import { createAdminClient, createAnonClient } from "./supabase-script-client.mjs";

const admin = createAdminClient();
const anon = createAnonClient();
const email = `smoke-${Date.now()}@example.test`;
const password = "Smoke#Test1234";
let userId;

try {
  console.log("--- E1. create Supabase Auth user ---");
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Smoke User", role: "recruiter" },
  });
  if (createError) throw createError;
  userId = created.user.id;
  console.log("OK created", { id: userId, email });

  console.log("--- E2. profile row exists? ---");
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  console.log(profile ? `OK profile available: ${JSON.stringify(profile)}` : "WARN no profile row");

  console.log("--- E3. password sign-in works? ---");
  const { error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  console.log("OK password verifies through Supabase Auth");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
} finally {
  if (userId) {
    console.log("--- E4. cleanup ---");
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("Cleanup failed:", error.message);
      process.exitCode = 1;
    } else {
      console.log("OK deleted");
    }
  }
}

console.log("SMOKE_E_DONE");
