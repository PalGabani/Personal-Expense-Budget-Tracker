import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/login?error=configuration", request.url));
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error("Unable to sign out. Please try again.");
  }
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
