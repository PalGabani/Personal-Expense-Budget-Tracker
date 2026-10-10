import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Dashboard } from "@/features/dashboard/dashboard";
import { FinanceProvider } from "@/features/dashboard/finance-provider";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const instant = false;

export default async function Home() {
  await connection();
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
          Personal Expense &amp; Budget Tracker
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
          Your money, clearly accounted for.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
          The full-stack starter is ready. Add the Supabase settings from{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-base">.env.example</code> to{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-base">frontend/.env.local</code>{" "}
          to enable sign-in and the private dashboard.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            ["Track", "Record income and expenses in INR."],
            ["Plan", "Set monthly category budgets."],
            ["Understand", "Review trends and export your data."],
          ].map(([title, description]) => (
            <section
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="font-semibold text-slate-900">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </section>
          ))}
        </div>
      </main>
    );
  }

  const { data, error } = await supabase.auth.getUser();
  if (error && !isAuthSessionMissingError(error)) {
    throw new Error("Unable to verify your session. Please try again.");
  }
  if (!data.user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <FinanceProvider>
        <Dashboard email={data.user.email} />
      </FinanceProvider>
    </main>
  );
}
