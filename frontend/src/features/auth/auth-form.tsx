"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});

type Credentials = z.infer<typeof credentialsSchema>;

type Notice = { tone: "error" | "success"; text: string } | null;

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [notice, setNotice] = useState<Notice>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Credentials>({ resolver: zodResolver(credentialsSchema) });

  const isSignUp = mode === "sign-up";

  async function submit(credentials: Credentials) {
    setNotice(null);
    setIsSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        setNotice({
          tone: "error",
          text: "Supabase is not configured. Add the frontend variables from .env.example.",
        });
        return;
      }

      const result =
        mode === "sign-in"
          ? await supabase.auth.signInWithPassword(credentials)
          : await supabase.auth.signUp({
              ...credentials,
              options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
            });

      if (result.error) {
        // Map the raw Supabase message onto the field that caused it so the
        // user gets feedback next to the input, not only in a banner.
        const raw = result.error.message;
        if (/invalid login credentials/i.test(raw)) {
          setError("password", { message: "That email and password do not match." });
          setError("email", { message: "" });
        } else if (/already registered|already been registered/i.test(raw)) {
          setNotice({
            tone: "error",
            text: "An account already exists for that email. Sign in instead.",
          });
        } else if (/password should be at least/i.test(raw)) {
          setError("password", { message: "Use at least 8 characters." });
        } else if (/email.*invalid|unable to validate email/i.test(raw)) {
          setError("email", { message: "Enter a valid email address." });
        } else {
          setNotice({ tone: "error", text: raw });
        }
        return;
      }

      if (isSignUp && !result.data.session) {
        setNotice({
          tone: "success",
          text: "Check your email to confirm your account, then sign in.",
        });
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to complete the request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode() {
    setNotice(null);
    setShowPassword(false);
    setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
  }

  const inputClass = (hasError: boolean) =>
    `w-full rounded-xl border bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none ${
      hasError
        ? "border-rose-400 focus:border-rose-500"
        : "border-slate-300 hover:border-slate-400 focus:border-emerald-600"
    }`;

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit(submit)}>
      {notice && (
        <p
          className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${
            notice.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.tone === "error" ? (
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </p>
      )}

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-800" htmlFor="email">
          Email address
        </label>
        <input
          {...register("email")}
          aria-describedby={errors.email ? "email-error" : undefined}
          aria-invalid={Boolean(errors.email)}
          autoComplete="email"
          className={inputClass(Boolean(errors.email))}
          id="email"
          name="email"
          placeholder="you@example.com"
          type="email"
        />
        {errors.email && (
          <span className="block text-sm text-rose-700" id="email-error">
            {errors.email.message}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-800" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <input
            {...register("password")}
            aria-describedby={errors.password ? "password-error" : undefined}
            aria-invalid={Boolean(errors.password)}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            className={`${inputClass(Boolean(errors.password))} pr-11`}
            id="password"
            name="password"
            placeholder={isSignUp ? "At least 8 characters" : "Your password"}
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-700"
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="h-5 w-5" />
            ) : (
              <Eye aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
        </div>
        {errors.password && (
          <span className="block text-sm text-rose-700" id="password-error">
            {errors.password.message}
          </span>
        )}
      </div>

      <button
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3.5 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? (
          <>
            <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />
            {isSignUp ? "Creating your account…" : "Signing you in…"}
          </>
        ) : (
          <>
            {isSignUp ? "Create account" : "Sign in"}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </>
        )}
      </button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
          {isSignUp ? "Already registered" : "New here"}
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
        onClick={switchMode}
        type="button"
      >
        {isSignUp ? "Sign in to your account" : "Create a new account"}
      </button>
    </form>
  );
}
