import { NextRequest, NextResponse } from "next/server";

// Legacy Supabase OAuth callback — no longer used with NextAuth v5
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`);
}
