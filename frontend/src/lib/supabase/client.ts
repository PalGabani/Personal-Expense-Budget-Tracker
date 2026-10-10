"use client";

import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigConfigured } from "./config";

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!isSupabaseConfigConfigured(url) || !isSupabaseConfigConfigured(key)) return null;
  return createBrowserClient(url, key);
}
