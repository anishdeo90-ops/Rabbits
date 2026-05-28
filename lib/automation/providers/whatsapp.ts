import type { AutomationSettings } from "@/lib/types";

export function normalizeWhatsAppNumber(value?: string | null) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("whatsapp:+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `whatsapp:+91${digits}`;
  if (raw.startsWith("+")) return `whatsapp:${raw}`;
  if (digits.length > 10) return `whatsapp:+${digits}`;
  return "";
}

export async function sendWhatsApp(settings: AutomationSettings, to: string, body: string) {
  const accountSid = settings.twilio_account_sid;
  const authToken = settings.twilio_auth_token;
  const from = settings.twilio_whatsapp_from;
  if (!accountSid || !authToken || !from) throw new Error("Twilio WhatsApp credentials are incomplete");

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message ?? `Twilio request failed (${res.status})`) as Error & { status?: number; response?: unknown };
    err.status = res.status;
    err.response = json;
    throw err;
  }
  return { messageId: json.sid as string | undefined, response: json as Record<string, unknown> };
}
