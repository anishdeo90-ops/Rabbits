import { createAdminClient, createAnonClient } from "./supabase-script-client.mjs";
import { randomBytes } from "node:crypto";

const admin = createAdminClient();
const anon = createAnonClient();
const email = `rp-smoke-${Date.now()}@example.test`;
const oldPassword = "OldPass#1234";
const newPassword = randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12) + "Aa1!";
let userId;

try {
  console.log("--- C4.1 create user with old password ---");
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: oldPassword,
    email_confirm: true,
  });
  if (createError) throw createError;
  userId = created.user.id;
  console.log("OK created", email);

  console.log("--- C4.2 reset password through Supabase Auth admin API ---");
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (updateError) throw updateError;
  console.log("OK reset password");

  console.log("--- C4.3 verify new password works ---");
  const { error: newSignInError } = await anon.auth.signInWithPassword({
    email,
    password: newPassword,
  });
  if (newSignInError) throw newSignInError;
  await anon.auth.signOut();
  console.log("OK new password verifies");

  console.log("--- C4.4 verify old password is rejected ---");
  const { error: oldSignInError } = await anon.auth.signInWithPassword({
    email,
    password: oldPassword,
  });
  if (!oldSignInError) throw new Error("old password still works");
  console.log("OK old password rejected");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
} finally {
  if (userId) {
    console.log("--- C4.5 cleanup ---");
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("Cleanup failed:", error.message);
      process.exitCode = 1;
    } else {
      console.log("OK deleted");
    }
  }
}

console.log("SMOKE_C_DONE");
