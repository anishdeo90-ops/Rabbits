import { createBrowserClient } from "@supabase/ssr";

function cleanHeaderValue(value: unknown) {
  return String(value).replace(/[^\t\x20-\xff]/g, "").trim();
}

function cleanHeaders(headers?: HeadersInit) {
  if (!headers) return headers;

  const cleaned = new Headers();
  if (headers instanceof Headers) {
    headers.forEach((value, key) => cleaned.set(key, cleanHeaderValue(value)));
    return cleaned;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) cleaned.set(key, cleanHeaderValue(value));
    return cleaned;
  }

  for (const [key, value] of Object.entries(headers)) {
    cleaned.set(key, cleanHeaderValue(value));
  }
  return cleaned;
}

const safeFetch: typeof fetch = (input, init) => {
  return fetch(input, init ? { ...init, headers: cleanHeaders(init.headers) } : init);
};

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    {
      global: {
        fetch: safeFetch,
      },
    }
  );
}
