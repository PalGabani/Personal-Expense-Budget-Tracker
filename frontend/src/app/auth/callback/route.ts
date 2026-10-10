import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createServerSupabaseClient();
  if (!code || !supabase) {
    return NextResponse.redirect(new URL("/login?error=confirmation", request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=confirmation", request.url));
  }
  return NextResponse.redirect(new URL("/", request.url));
}
