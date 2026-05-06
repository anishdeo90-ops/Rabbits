import { NextRequest, NextResponse } from "next/server";
import { forbidden, isAutomationManager, requireUser } from "@/lib/automation/http";
import { sendEmail } from "@/lib/automation/providers/email";
import { normalizeWhatsAppNumber, sendWhatsApp } from "@/lib/automation/providers/whatsapp";
import type { AutomationSettings } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { supabase, profile, response } = await requireUser();
  if (response) return response;
  if (!isAutomationManager(profile?.role)) return forbidden();
  const body = await req.json();
  const { data: settings } = await supabase.from("automation_settings").select("*").limit(1).single();
  try {
    if (body.channel === "whatsapp") {
      const to = normalizeWhatsAppNumber(body.to);
      if (!to) return NextResponse.json({ error: "Valid WhatsApp number required" }, { status: 400 });
      const result = await sendWhatsApp(settings as AutomationSettings, to, "HireRabbits automation test message.");
      return NextResponse.json({ data: result });
    }
    const to = String(body.to ?? "");
    if (!to.includes("@")) return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    const result = await sendEmail(settings as AutomationSettings, to, "HireRabbits automation test", "This is a test email from HireRabbits automation.");
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Provider test failed" }, { status: 500 });
  }
}
