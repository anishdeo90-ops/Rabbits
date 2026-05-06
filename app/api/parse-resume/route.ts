import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAIConfig } from "@/lib/ai-client";
import Anthropic from "@anthropic-ai/sdk";

const PROFILE_FIELDS = [
  "name",
  "email",
  "mobile",
  "current_designation",
  "current_location",
  "present_salary",
  "expected_salary",
  "notice_period_days",
  "naukri_profile_url",
  "ai_summary",
] as const;

const KEYWORD_FIELDS = [
  "skills",
  "years_experience",
  "education",
  "current_role",
  "industries",
  "tools",
  "certifications",
  "languages",
  "summary_tags",
] as const;

function pickFields<T extends readonly string[]>(source: Record<string, unknown>, fields: T) {
  const safe: Record<string, unknown> = {};
  for (const field of fields) {
    const value = source[field];
    if (value !== undefined && value !== null && value !== "") safe[field] = value;
  }
  return safe;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const jobId = formData.get("job_id") as string | null;
  const candidateId = formData.get("candidate_id") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const mimeType = file.type || "application/pdf";
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];
  if (!allowedTypes.includes(mimeType)) {
    return NextResponse.json({ error: "Only PDF, Word, or text files are supported" }, { status: 400 });
  }

  const aiConfig = await resolveAIConfig(user.id);
  if (!aiConfig) {
    return NextResponse.json({
      error: "No AI provider connected. Go to Settings -> AI to connect Claude or ChatGPT.",
    }, { status: 503 });
  }

  if (aiConfig.provider !== "anthropic") {
    return NextResponse.json({
      error: "Resume parsing currently requires Claude (Anthropic). Connect a Claude key in Settings -> AI.",
    }, { status: 503 });
  }

  try {
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const client = new Anthropic({ apiKey: aiConfig.api_key });

    const extractionPrompt = `You are a resume parser. Extract key details from this resume and return ONLY a valid JSON object with exactly two top-level keys: "profile" and "keywords".

{
  "profile": {
    "name": "Full name",
    "email": "email@example.com",
    "mobile": "10-digit mobile number",
    "current_designation": "Current job title",
    "current_location": "City, State",
    "present_salary": 500000,
    "expected_salary": 700000,
    "notice_period_days": 30,
    "naukri_profile_url": "LinkedIn or Naukri profile URL if present",
    "ai_summary": "2-3 sentence professional summary"
  },
  "keywords": {
    "skills": ["Python", "React", "SQL"],
    "years_experience": 4,
    "education": "B.Tech Computer Science",
    "current_role": "Senior Software Engineer",
    "industries": ["FinTech", "SaaS"],
    "tools": ["Docker", "AWS", "Git"],
    "certifications": ["AWS Solutions Architect"],
    "languages": ["English", "Hindi"],
    "summary_tags": ["Python 4yr", "React 2yr", "Team Lead", "FinTech", "B.Tech"]
  }
}

Rules:
- Omit any profile field you cannot find - do not invent data
- Salary must be annual in rupees (integer)
- notice_period_days: convert months to days (1 month = 30 days)
- years_experience = total professional experience in years (integer)
- summary_tags: concise human-readable labels, include "{skill} {N}yr" where applicable
- skills: programming languages, frameworks, methodologies (title-cased, deduplicated)
- tools: platforms, cloud services, software (title-cased, deduplicated)
- Return ONLY the JSON object. No markdown, no explanation.`;

    let content: Anthropic.MessageParam["content"];
    if (mimeType === "application/pdf") {
      content = [
        { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } },
        { type: "text" as const, text: extractionPrompt },
      ];
    } else {
      const text = Buffer.from(bytes).toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ");
      content = [{ type: "text" as const, text: `Resume text:\n\n${text}\n\n${extractionPrompt}` }];
    }

    const message = await client.messages.create({
      model: aiConfig.model,
      max_tokens: 2048,
      messages: [{ role: "user", content }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "Could not parse resume data" }, { status: 422 });

    const parsed = JSON.parse(jsonMatch[0]) as { profile?: Record<string, unknown>; keywords?: Record<string, unknown> };
    const safeProfile = pickFields(parsed.profile ?? parsed as Record<string, unknown>, PROFILE_FIELDS);
    const safeKeywords = pickFields(parsed.keywords ?? {}, KEYWORD_FIELDS);

    let jobFit: Record<string, unknown> | null = null;
    if (jobId) {
      const { data: job } = await supabase
        .from("jobs")
        .select("title, description, requirements")
        .eq("id", jobId)
        .single();

      if (job) {
        const scoringPrompt = `You are a technical recruiter. Score this candidate's fit for a job from 0-100.

Candidate keyword profile:
${JSON.stringify(safeKeywords, null, 2)}

Job title: ${job.title}
Job requirements:
${job.requirements ?? "Not specified"}
${job.description ?? ""}

Return ONLY a JSON object:
{
  "fit_score": 82,
  "skills_match": 85,
  "experience_match": 90,
  "education_match": 70,
  "matched_skills": ["Python", "SQL"],
  "missing_skills": ["Go", "Kubernetes"],
  "ai_reasoning": "One sentence explaining the score."
}`;

        const scoreMsg = await client.messages.create({
          model: aiConfig.model,
          max_tokens: 512,
          messages: [{ role: "user", content: scoringPrompt }],
        });

        const scoreRaw = scoreMsg.content[0].type === "text" ? scoreMsg.content[0].text : "";
        const scoreMatch = scoreRaw.match(/\{[\s\S]*\}/);
        if (scoreMatch) {
          try {
            jobFit = JSON.parse(scoreMatch[0]) as Record<string, unknown>;
          } catch {
            jobFit = null;
          }
        }
      }
    }

    if (candidateId) {
      await supabase
        .from("candidates")
        .update({ parsed_keywords: safeKeywords })
        .eq("id", candidateId);

      if (jobId && jobFit && typeof jobFit.fit_score === "number") {
        await supabase
          .from("candidate_job_scores")
          .upsert({
            candidate_id: candidateId,
            job_id: jobId,
            fit_score: jobFit.fit_score,
            fit_breakdown: jobFit,
            scored_by_model: aiConfig.model,
          }, { onConflict: "candidate_id,job_id" });
      }
    }

    return NextResponse.json({
      data: { ...safeProfile, parsed_keywords: safeKeywords },
      job_fit: jobFit,
      source: aiConfig.scope,
    });
  } catch (err) {
    console.error("Resume parse error:", err);
    return NextResponse.json({ error: "Failed to parse resume. Please try again." }, { status: 500 });
  }
}
