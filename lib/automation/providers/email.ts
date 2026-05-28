import type { AutomationSettings } from "@/lib/types";

export async function sendEmail(settings: AutomationSettings, to: string, subject: string, body: string) {
  if (!settings.resend_api_key || !settings.resend_from_email) throw new Error("Resend credentials are incomplete");
  const fromName = settings.resend_from_name || settings.company_name || "HireRabbits ATS";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.resend_api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${settings.resend_from_email}>`,
      to: [to],
      subject,
      text: body,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message ?? `Resend request failed (${res.status})`) as Error & { status?: number; response?: unknown };
    err.status = res.status;
    err.response = json;
    throw err;
  }
  return { messageId: json.id as string | undefined, response: json as Record<string, unknown> };
}
