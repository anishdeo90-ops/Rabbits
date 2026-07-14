import { readFileSync } from "fs";
import { google } from "googleapis";

export type GoogleIndexingNotificationType = "URL_UPDATED" | "URL_DELETED";

const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const PUBLISH_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const METADATA_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications/metadata";

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
};

export function assertCrawlableUrl(url: string) {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:") {
    throw new Error("Google Indexing API needs NEXT_PUBLIC_SITE_URL to be a public https URL.");
  }
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")) {
    throw new Error("Google cannot crawl localhost. Set NEXT_PUBLIC_SITE_URL to the production domain first.");
  }
}

export function hasGoogleIndexingCredentials() {
  return Boolean(
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON_BASE64 ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

export async function publishGoogleIndexingNotification(url: string, type: GoogleIndexingNotificationType) {
  assertCrawlableUrl(url);

  const token = await getAccessToken();
  const response = await fetch(PUBLISH_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type }),
  });

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(getGoogleErrorMessage(payload, response.status));
  }

  return payload;
}

export async function getGoogleIndexingMetadata(url: string) {
  assertCrawlableUrl(url);

  const token = await getAccessToken();
  const response = await fetch(`${METADATA_ENDPOINT}?url=${encodeURIComponent(url)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(getGoogleErrorMessage(payload, response.status));
  }

  return payload;
}

async function getAccessToken() {
  const account = parseServiceAccount();
  if (!account.client_email || !account.private_key) {
    throw new Error("Google Indexing service account JSON must include client_email and private_key.");
  }

  const jwt = new google.auth.JWT({
    email: account.client_email,
    key: account.private_key.replace(/\\n/g, "\n"),
    scopes: [INDEXING_SCOPE],
  });

  const token = await jwt.getAccessToken();
  if (!token.token) throw new Error("Google did not return an access token.");
  return token.token;
}

function parseServiceAccount(): ServiceAccount {
  const rawJson = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON;
  if (rawJson) return JSON.parse(rawJson);

  const base64Json = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON_BASE64;
  if (base64Json) return JSON.parse(Buffer.from(base64Json, "base64").toString("utf8"));

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialsPath) {
    return JSON.parse(readFileSync(credentialsPath, "utf8"));
  }

  throw new Error("Set GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON or GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON_BASE64.");
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function getGoogleErrorMessage(payload: Record<string, unknown>, status: number) {
  const error = payload.error as { message?: string; status?: string } | undefined;
  if (error?.message) return error.message;
  if (typeof payload.raw === "string") return payload.raw;
  return `Google Indexing API request failed with HTTP ${status}.`;
}
