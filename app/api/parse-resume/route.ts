import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAIConfig } from "@/lib/ai-client";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const mimeType = file.type || "application/pdf";
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];
  if (!allowedTypes.includes(mimeType))
    return NextResponse.json({ error: "Only PDF, Word, or text files are supported" }, { status: 400 });

  // Resolve AI config: personal key → org key → env key
  const aiConfig = await resolveAIConfig(user.id);
  if (!aiConfig)
    return NextResponse.json({
      error: "No AI provider connected. Go to Settings → AI to connect Claude or ChatGPT.",
    }, { status: 503 });

  // Currently only Anthropic/Claude is supported for document parsing
  if (aiConfig.provider !== "anthropic")
    return NextResponse.json({
      error: "Resume parsing currently requires Claude (Anthropic). Connect a Claude key in Settings → AI.",
    }, { status: 503 });

  try {
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const client = new Anthropic({ apiKey: aiConfig.api_key });

    const prompt = `You are a resume parser. Extract key details from this resume and return ONLY a valid JSON object with these fields (omit any you cannot find — do not invent data):

{
  "name": "Full name",
  "email": "email@example.com",
  "mobile": "10-digit mobile number",
  "current_designation": "Current job title",
  "current_location": "City, State",
  "present_salary": 500000,
  "expected_salary": 700000,
  "notice_period_days": 30,
  "naukri_profile_url": "LinkedIn or Naukri profile URL if present",
  "ai_summary": "2–3 sentence professional summary of this candidate"
}

Rules:
- Salary must be annual in rupees (convert if needed). Return as integer.
- notice_period_days: convert months to days (1 month = 30 days)
- Return ONLY the JSON object. No markdown, no explanation.`;

    let content: Anthropic.MessageParam["content"];
    if (mimeType === "application/pdf") {
      content = [
        { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } },
        { type: "text" as const, text: prompt },
      ];
    } else {
      const text = Buffer.from(bytes).toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ");
      content = [{ type: "text" as const, text: `Resume text:\n\n${text}\n\n${prompt}` }];
    }

    const message = await client.messages.create({
      model: aiConfig.model,
      max_tokens: 1024,
      messages: [{ role: "user", content }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "Could not parse resume data" }, { status: 422 });

    const parsed = JSON.parse(jsonMatch[0]);
    const safe: Record<string, unknown> = {};
    const allowedFields = [
      "name", "email", "mobile", "current_designation", "current_location",
      "present_salary", "expected_salary", "notice_period_days", "naukri_profile_url", "ai_summary",
    ];
    for (const f of allowedFields) {
      if (parsed[f] !== undefined && parsed[f] !== null && parsed[f] !== "") safe[f] = parsed[f];
    }

    return NextResponse.json({ data: safe, source: aiConfig.scope });
  } catch (err) {
    console.error("Resume parse error:", err);
    return NextResponse.json({ error: "Failed to parse resume. Please try again." }, { status: 500 });
  }
}
