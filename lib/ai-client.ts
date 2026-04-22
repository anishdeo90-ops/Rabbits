// ── AI Client — Server-side resolver ──────────────────────────────────────────
// Priority: user's personal key → org-wide key → ANTHROPIC_API_KEY env var
// Import only in server components / API routes (never in "use client" files)

import { createClient } from "@/lib/supabase/server";

export type AIProvider = "anthropic" | "openai" | "gemini";

export interface AIConfig {
  provider: AIProvider;
  api_key:  string;
  model:    string;
  scope:    "personal" | "org" | "env";
}

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-opus-4-5",
  openai:    "gpt-4o",
  gemini:    "gemini-1.5-pro",
};

/**
 * Resolves the AI configuration to use for a given user.
 * Returns null if no key is available at all.
 */
export async function resolveAIConfig(userId: string): Promise<AIConfig | null> {
  const supabase = await createClient();

  // 1. Personal key
  const { data: personal } = await supabase
    .from("ai_settings")
    .select("provider, api_key, model")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .eq("is_active", true)
    .maybeSingle();

  if (personal?.api_key) {
    return {
      provider: personal.provider as AIProvider,
      api_key:  personal.api_key,
      model:    personal.model ?? DEFAULT_MODELS[personal.provider as AIProvider],
      scope:    "personal",
    };
  }

  // 2. Org-wide key
  const { data: org } = await supabase
    .from("ai_settings")
    .select("provider, api_key, model")
    .eq("scope", "org")
    .eq("is_active", true)
    .maybeSingle();

  if (org?.api_key) {
    return {
      provider: org.provider as AIProvider,
      api_key:  org.api_key,
      model:    org.model ?? DEFAULT_MODELS[org.provider as AIProvider],
      scope:    "org",
    };
  }

  // 3. Fall back to env variable (Anthropic only)
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey !== "your-anthropic-api-key-here") {
    return {
      provider: "anthropic",
      api_key:  envKey,
      model:    DEFAULT_MODELS.anthropic,
      scope:    "env",
    };
  }

  return null;
}

/**
 * Returns a masked version of an API key (last 4 chars visible).
 */
export function maskKey(key: string): string {
  if (!key || key.length < 8) return "••••••••";
  return "•".repeat(Math.min(key.length - 4, 20)) + key.slice(-4);
}
