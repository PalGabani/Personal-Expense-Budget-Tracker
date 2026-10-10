export function isSupabaseConfigConfigured(value?: string): value is string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length > 0 &&
    !normalized.includes("your-project") &&
    !normalized.includes("your-supabase-publishable-key") &&
    !normalized.includes("placeholder")
  );
}
