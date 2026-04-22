import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAIConfig } from "@/lib/ai-client";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const aiConfig = await resolveAIConfig(user.id);
  if (!aiConfig)
    return NextResponse.json({
      error: "No AI provider connected. Go to Settings → AI to connect Claude or ChatGPT.",
    }, { status: 503 });

  if (aiConfig.provider !== "anthropic")
    return NextResponse.json({
      error: "AI scoring currently requires Claude. Connect a Claude key in Settings → AI.",
    }, { status: 503 });

  // Fetch candidate
  const { data: cand, error: candErr } = await supabase
    .from("candidates")
    .select("name, current_designation, designation_id, present_salary, expected_salary, notice_period_days, current_location, naukri_profile_url, final_status, ai_summary")
    .eq("id", id)
    .single();

  if (candErr || !cand) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  // Fetch designation name
  let designationName = "";
  if (cand.designation_id) {
    const { data: desig } = await supabase
      .from("masters")
      .select("name")
      .eq("id", cand.designation_id)
      .single();
    designationName = desig?.name ?? "";
  }

  const prompt = `You are a senior HR recruiter evaluating a candidate. Based on the profile below, provide:
1. An overall fit score from 0 to 100
2. A 2–3 sentence professional summary

Candidate Profile:
- Name: ${cand.name}
- Current Role: ${cand.current_designation ?? "Not specified"}
- Applying For: ${designationName || "Not specified"}
- Current Location: ${cand.current_location ?? "Not specified"}
- Current CTC: ₹${cand.present_salary ? `${(cand.present_salary/100000).toFixed(1)}L` : "Not specified"}
- Expected CTC: ₹${cand.expected_salary ? `${(cand.expected_salary/100000).toFixed(1)}L` : "Not specified"}
- Notice Period: ${cand.notice_period_days ? `${cand.notice_period_days} days` : "Not specified"}
- Pipeline Status: ${cand.final_status ?? "Sourced"}

Score criteria:
- 80–100: Strong match, clear progression, reasonable salary ask, immediate availability
- 60–79: Good match with minor concerns (notice period, location, salary gap)
- 40–59: Partial match — role mismatch or significant concerns
- 0–39: Poor match

Return ONLY a JSON object:
{
  "ai_score": 75,
  "ai_summary": "2-3 sentence summary here"
}

No markdown, no explanation. JSON only.`;

  try {
    const client = new Anthropic({ apiKey: aiConfig.api_key });
    const message = await client.messages.create({
      model: aiConfig.model,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "AI returned unexpected format" }, { status: 422 });

    const parsed = JSON.parse(jsonMatch[0]);
    const ai_score = Math.min(100, Math.max(0, Math.round(Number(parsed.ai_score) || 0)));
    const ai_summary = String(parsed.ai_summary ?? "").slice(0, 500);

    // Save to candidate
    await supabase
      .from("candidates")
      .update({ ai_score, ai_summary, updated_by: user.id })
      .eq("id", id);

    return NextResponse.json({ data: { ai_score, ai_summary } });
  } catch (err) {
    console.error("AI score error:", err);
    return NextResponse.json({ error: "AI scoring failed. Please try again." }, { status: 500 });
  }
}
