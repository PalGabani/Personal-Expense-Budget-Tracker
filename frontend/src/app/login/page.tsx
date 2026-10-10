import { ChartPie, Lock, ShieldCheck, WalletCards } from "lucide-react";
import { Logo } from "@/components/brand";
import { AuthForm } from "@/features/auth/auth-form";

const HIGHLIGHTS = [
  {
    icon: WalletCards,
    title: "Track every rupee",
    description: "Log income and expenses to the paisa, grouped by the categories you choose.",
  },
  {
    icon: ChartPie,
    title: "See where it goes",
    description: "Monthly category breakdowns and budget progress, updated as you add records.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    description: "Row Level Security keeps every record scoped to your account only.",
  },
];

export default function LoginPage() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <Logo className="h-11 w-11 text-emerald-500" />
          <div className="leading-tight">
            <p className="font-semibold text-white">Expense &amp; Budget</p>
            <p className="text-xs tracking-wide text-slate-400">Personal finance tracker</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight text-white">
            Your money, clearly accounted for.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-300">
            A practical way to understand monthly spending and stay inside your budgets, without
            sharing your financial data with anyone else.
          </p>
        </div>

        <ul className="relative space-y-5">
          {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
            <li className="flex gap-3.5" key={title}>
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                <Icon aria-hidden="true" className="h-5 w-5 text-emerald-400" />
              </span>
              <div>
                <p className="font-medium text-white">{title}</p>
                <p className="mt-0.5 text-sm leading-6 text-slate-400">{description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 lg:hidden">
            <Logo className="h-10 w-10 text-emerald-700" />
            <div className="leading-tight">
              <p className="font-semibold text-slate-950">Expense &amp; Budget</p>
              <p className="text-xs tracking-wide text-slate-500">Personal finance tracker</p>
            </div>
          </div>

          <div className="mt-8 lg:mt-0">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Welcome back</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Sign in to continue, or create an account to start tracking.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <AuthForm />
          </div>

          <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-slate-500">
            <Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Budget tracking is informational and is not a bank balance or financial advice. Your
              records stay private to your account.
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}
