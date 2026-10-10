"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  Plus,
  Settings,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";
import { AiSummaryContent } from "@/features/dashboard/ai-summary-content";
import { useFinanceApi } from "@/features/dashboard/finance-provider";
import { SettingsDialog } from "@/features/dashboard/settings-dialog";
import {
  type Budget,
  type Category,
  type MonthlyReport,
  type Transaction,
  useDashboardData,
} from "@/features/dashboard/use-dashboard-data";
import { formatPaiseAsINR, parseRupeesToPaise } from "@/lib/money";

const PALETTE = ["#047857", "#0f766e", "#0891b2", "#4f46e5", "#7c3aed", "#c2410c", "#be123c"];
const currentMonth = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
})();
const amountSchema = z
  .string()
  .trim()
  .refine((value) => {
    try {
      parseRupeesToPaise(value);
      return true;
    } catch {
      return false;
    }
  }, "Enter a positive INR amount with up to two decimal places.");

const transactionSchema = z.object({
  type: z.enum(["expense", "income"]),
  amount: amountSchema,
  transaction_date: z.string().min(1, "Choose a date."),
  category_id: z.string().uuid("Choose a category."),
  note: z.string().max(300, "Notes must be 300 characters or fewer."),
});

const budgetSchema = z.object({
  category_id: z.string().uuid("Choose a category."),
  amount: amountSchema,
});

const categorySchema = z.object({
  name: z.string().trim().min(1, "Enter a category name.").max(60),
  type: z.enum(["expense", "income"]),
});

type TransactionValues = z.infer<typeof transactionSchema>;
type BudgetValues = z.infer<typeof budgetSchema>;
type CategoryValues = z.infer<typeof categorySchema>;

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <span className="mt-1 block text-xs text-rose-700">{children}</span>;
}

function TransactionEditor({
  categories,
  initial,
  month,
  onCancel,
  onSaved,
}: {
  categories: Category[];
  initial: Transaction | null;
  month: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { apiRequest } = useFinanceApi();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TransactionValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: initial
      ? {
          type: initial.type,
          amount: (initial.amount_minor / 100).toFixed(2),
          transaction_date: initial.transaction_date,
          category_id: initial.category_id,
          note: initial.note ?? "",
        }
      : {
          type: "expense",
          amount: "",
          transaction_date: todayIso(),
          category_id: "",
          note: "",
        },
  });
  const transactionType = watch("type");
  const watchedDate = watch("transaction_date");
  const availableCategories = categories.filter((category) => category.type === transactionType);

  // The form renders directly under the button that opened it, so move focus
  // to the amount field and the user can type straight away.
  useEffect(() => {
    setFocus("amount");
  }, [setFocus]);

  useEffect(() => {
    reset(
      initial
        ? {
            type: initial.type,
            amount: (initial.amount_minor / 100).toFixed(2),
            transaction_date: initial.transaction_date,
            category_id: initial.category_id,
            note: initial.note ?? "",
          }
        : {
            type: "expense",
            amount: "",
            transaction_date: todayIso(),
            category_id: "",
            note: "",
          },
    );
  }, [initial, reset]);

  const submit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const fields = {
        type: values.type,
        amount_minor: parseRupeesToPaise(values.amount),
        transaction_date: values.transaction_date,
        category_id: values.category_id,
        note: values.note.trim() || null,
      };
      // The update schema forbids unknown fields, and currency is immutable,
      // so it is sent on create only.
      const body = initial ? fields : { ...fields, currency: "INR" };
      await apiRequest(initial ? `/api/transactions/${initial.id}` : "/api/transactions", {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      reset();
      onSaved();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not save transaction.");
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5"
    >
      <div className="sm:col-span-2">
        <h2 className="font-semibold text-slate-950">
          {initial ? "Edit transaction" : "Add a transaction"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Amounts are recorded in Indian rupees and stored precisely as paise.
        </p>
      </div>
      <label className="text-sm font-medium text-slate-700">
        Type
        <select
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          {...register("type", {
            onChange: () => setValue("category_id", ""),
          })}
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Amount (₹)
        <input
          inputMode="decimal"
          placeholder="0.00"
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          {...register("amount")}
        />
        <FieldError>{errors.amount?.message}</FieldError>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Date
        <input
          type="date"
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          {...register("transaction_date")}
        />
        <FieldError>{errors.transaction_date?.message}</FieldError>
        {watchedDate && watchedDate.slice(0, 7) !== month && (
          <span className="mt-1 block text-xs text-amber-800">
            This date is outside {month}, so it will not appear in the current list. Switch the
            month filter above to see it.
          </span>
        )}
      </label>
      <label className="text-sm font-medium text-slate-700">
        Category
        <select
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          {...register("category_id")}
        >
          <option value="">Select category</option>
          {availableCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <FieldError>{errors.category_id?.message}</FieldError>
        {availableCategories.length === 0 && (
          <span className="mt-1 block text-xs text-amber-800">
            Add a {transactionType} category below first.
          </span>
        )}
      </label>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
        Note <span className="font-normal text-slate-500">(optional)</span>
        <input
          maxLength={300}
          placeholder="What was this for?"
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          {...register("note")}
        />
        <FieldError>{errors.note?.message}</FieldError>
      </label>
      {submitError && (
        <p
          className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800"
          role="alert"
        >
          {submitError}
        </p>
      )}
      {availableCategories.length === 0 && (
        <p
          className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Every transaction needs a {transactionType} category. Create one in the &ldquo;Create a
            category&rdquo; panel below, then this form will unlock.
          </span>
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button
          disabled={isSubmitting || availableCategories.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
        >
          {isSubmitting ? (
            <>
              <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : initial ? (
            "Save changes"
          ) : (
            "Save transaction"
          )}
        </button>
        <button
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function CategoryBudgetTools({
  categories,
  month,
  onSaved,
}: {
  categories: Category[];
  month: string;
  onSaved: () => void;
}) {
  const { apiRequest } = useFinanceApi();
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [isCategorySubmitting, setIsCategorySubmitting] = useState(false);
  const [isBudgetSubmitting, setIsBudgetSubmitting] = useState(false);
  const {
    register: registerCategory,
    handleSubmit: handleCategorySubmit,
    reset: resetCategory,
    formState: { errors: categoryErrors },
  } = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", type: "expense" },
  });
  const {
    register: registerBudget,
    handleSubmit: handleBudgetSubmit,
    reset: resetBudget,
    formState: { errors: budgetErrors },
  } = useForm<BudgetValues>({ resolver: zodResolver(budgetSchema) });
  const expenseCategories = categories.filter((category) => category.type === "expense");

  const createCategory = handleCategorySubmit(async (values) => {
    setIsCategorySubmitting(true);
    setCategoryError(null);
    try {
      await apiRequest("/api/categories", {
        method: "POST",
        body: JSON.stringify(values),
      });
      resetCategory();
      onSaved();
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : "Could not create category.");
    } finally {
      setIsCategorySubmitting(false);
    }
  });
  const saveBudget = handleBudgetSubmit(async (values) => {
    setIsBudgetSubmitting(true);
    setBudgetError(null);
    try {
      await apiRequest("/api/budgets", {
        method: "PUT",
        body: JSON.stringify({
          category_id: values.category_id,
          month: `${month}-01`,
          amount_minor: parseRupeesToPaise(values.amount),
        }),
      });
      resetBudget();
      onSaved();
    } catch (error) {
      setBudgetError(error instanceof Error ? error.message : "Could not save budget.");
    } finally {
      setIsBudgetSubmitting(false);
    }
  });

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <form onSubmit={createCategory} className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-950">Create a category</h2>
        <p className="mt-1 text-sm text-slate-500">
          Make categories fit how you organize spending.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label className="flex-1 text-sm font-medium text-slate-700">
            Name
            <input
              maxLength={60}
              placeholder="e.g. Pet care"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5"
              {...registerCategory("name")}
            />
            <FieldError>{categoryErrors.name?.message}</FieldError>
          </label>
          <label className="text-sm font-medium text-slate-700 sm:w-36">
            Type
            <select
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              {...registerCategory("type")}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
        </div>
        {categoryError && (
          <p className="mt-2 text-sm text-rose-700" role="alert">
            {categoryError}
          </p>
        )}
        <button
          disabled={isCategorySubmitting}
          className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          type="submit"
        >
          {isCategorySubmitting ? "Adding…" : "Add category"}
        </button>
      </form>

      <form onSubmit={saveBudget} className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-950">Set a monthly budget</h2>
        <p className="mt-1 text-sm text-slate-500">Set an INR spending limit for {month}.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label className="flex-1 text-sm font-medium text-slate-700">
            Expense category
            <select
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              {...registerBudget("category_id")}
            >
              <option value="">Choose category</option>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <FieldError>{budgetErrors.category_id?.message}</FieldError>
          </label>
          <label className="text-sm font-medium text-slate-700 sm:w-40">
            Limit (₹)
            <input
              inputMode="decimal"
              placeholder="0.00"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5"
              {...registerBudget("amount")}
            />
            <FieldError>{budgetErrors.amount?.message}</FieldError>
          </label>
        </div>
        {expenseCategories.length === 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Add an expense category on the left to start setting budgets.</span>
          </p>
        )}
        {budgetError && (
          <p className="mt-2 text-sm text-rose-700" role="alert">
            {budgetError}
          </p>
        )}
        <button
          disabled={isBudgetSubmitting || expenseCategories.length === 0}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          type="submit"
        >
          {isBudgetSubmitting ? "Saving…" : "Save budget"}
        </button>
      </form>
    </div>
  );
}

function AiSummary({
  month,
  apiRequest,
}: {
  month: string;
  apiRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const [consented, setConsented] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const requestSummary = async () => {
    if (!consented) {
      setError("Review the data-use notice and opt in before requesting a summary.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSummary(null);
    try {
      const response = await apiRequest<{ summary: string }>("/api/reports/ai-summary", {
        method: "POST",
        body: JSON.stringify({ month: `${month}-01`, consent: true }),
      });
      setSummary(response.summary);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The AI summary is temporarily unavailable.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden="true" className="h-5 w-5 text-violet-700" />
        <h2 className="font-semibold text-slate-950">Optional AI spending summary</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        If you opt in, this month and aggregate category totals are sent to Gemini. Transaction
        notes, merchant names, and account identifiers are excluded. Google&apos;s free-tier terms
        may allow submitted content to improve its products.
      </p>
      <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
        <input
          checked={consented}
          className="mt-1 accent-violet-700"
          onChange={(event) => setConsented(event.target.checked)}
          type="checkbox"
        />
        I understand and consent to sending aggregate spending totals to Gemini for this request.
      </label>
      <button
        className="mt-4 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!consented || isLoading}
        onClick={() => void requestSummary()}
        type="button"
      >
        {isLoading ? "Preparing summary…" : "Generate summary"}
      </button>
      {summary && (
        <div className="mt-4 rounded-xl border border-violet-100 bg-white p-4">
          <AiSummaryContent text={summary} />
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm text-rose-800" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "green" | "red" | "slate";
  icon: React.ReactNode;
}) {
  const colors = {
    green: "bg-emerald-50 text-emerald-800",
    red: "bg-rose-50 text-rose-800",
    slate: "bg-slate-100 text-slate-800",
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`rounded-xl p-2 ${colors[tone]}`}>{icon}</span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
        {formatPaiseAsINR(value)}
      </p>
    </article>
  );
}

function SpendingCharts({ report }: { report: MonthlyReport }) {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [isBudgetListOpen, setIsBudgetListOpen] = useState(false);
  const categoryData = useMemo(
    () =>
      Object.entries(report.category_totals_minor)
        .map(([name, spent]) => ({ name, spent }))
        .sort((a, b) => b.spent - a.spent),
    [report.category_totals_minor],
  );
  const categoryTotal = useMemo(
    () => categoryData.reduce((sum, entry) => sum + entry.spent, 0),
    [categoryData],
  );
  const budgetData = useMemo(
    () =>
      report.budgets.map((budget: Budget) => ({
        name: budget.categories?.name ?? "Category",
        spent: report.category_totals_minor[budget.categories?.name ?? ""] ?? 0,
        budget: budget.amount_minor,
      })),
    [report.budgets, report.category_totals_minor],
  );
  const breakdownId = "category-breakdown";
  const budgetListId = "budget-limits";

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">Spending by category</h2>
            <p className="mt-1 text-sm text-slate-500">Expenses only · {report.month}</p>
          </div>
          {categoryData.length > 0 && (
            <button
              aria-controls={breakdownId}
              aria-expanded={isBreakdownOpen}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              onClick={() => setIsBreakdownOpen((open) => !open)}
              type="button"
            >
              {isBreakdownOpen ? "Hide" : "Show"} breakdown
              <ChevronDown
                aria-hidden="true"
                className={`h-4 w-4 transition-transform ${isBreakdownOpen ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>

        {categoryData.length ? (
          <div className="mt-5 flex min-h-[12rem] w-full flex-1 flex-col items-center justify-center gap-5 sm:flex-row sm:items-center">
            <div className="relative h-44 w-44 shrink-0 sm:h-48 sm:w-48">
              <div
                aria-label={`Donut chart of monthly expense totals by category. Total ${formatPaiseAsINR(categoryTotal)} across ${categoryData.length} categories.`}
                className="h-full w-full"
                role="img"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="spent"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="95%"
                      paddingAngle={1.5}
                      stroke="none"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatPaiseAsINR(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <span className="text-[0.65rem] font-medium uppercase tracking-wider text-slate-500">
                  Total
                </span>
                <span className="mt-0.5 text-base font-semibold tracking-tight text-slate-950">
                  {formatPaiseAsINR(categoryTotal)}
                </span>
                <span className="mt-0.5 text-[0.7rem] leading-tight text-slate-500">
                  {categoryData.length} {categoryData.length === 1 ? "category" : "categories"}
                </span>
              </div>
            </div>

            <ul
              className={`w-full min-w-0 space-y-2.5 sm:flex-1 ${isBreakdownOpen ? "max-h-80 overflow-y-auto pr-1" : ""}`}
              id={breakdownId}
            >
              {categoryData.map((category, index) => {
                const share = categoryTotal > 0 ? (category.spent / categoryTotal) * 100 : 0;
                const color = PALETTE[index % PALETTE.length];
                return (
                  <li key={category.name}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: color }}
                        />
                        <span className="truncate font-medium text-slate-800">{category.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-600">
                        {formatPaiseAsINR(category.spent)}
                        {isBreakdownOpen && (
                          <span className="ml-1.5 text-xs text-slate-400">{share.toFixed(1)}%</span>
                        )}
                      </span>
                    </div>
                    {isBreakdownOpen && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{ background: color, width: `${Math.max(share, 2)}%` }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="py-16 text-center text-sm text-slate-500">
            Add an expense to see your category breakdown.
          </p>
        )}
      </section>

      <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">Budget progress</h2>
            <p className="mt-1 text-sm text-slate-500">
              Actual expense compared with each monthly limit
            </p>
          </div>
          {budgetData.length > 0 && (
            <button
              aria-controls={budgetListId}
              aria-expanded={isBudgetListOpen}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              onClick={() => setIsBudgetListOpen((open) => !open)}
              type="button"
            >
              {isBudgetListOpen ? "Hide" : "Show"} limits
              <ChevronDown
                aria-hidden="true"
                className={`h-4 w-4 transition-transform ${isBudgetListOpen ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
        {budgetData.length ? (
          <div
            aria-label="Bar chart comparing budget and actual spending by category"
            className="mt-5 flex min-h-[13rem] w-full min-w-0 flex-1 items-center"
            role="img"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                barCategoryGap="28%"
                barGap={2}
                data={budgetData}
                margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  height={26}
                  tickFormatter={(value: string) =>
                    value.length > 12 ? `${value.slice(0, 11)}…` : value
                  }
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: number) => `₹${Math.round(value / 100)}`}
                  width={58}
                />
                <Tooltip
                  cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                  formatter={(value) => formatPaiseAsINR(Number(value))}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                <Bar
                  dataKey="spent"
                  name="Spent"
                  fill="#047857"
                  maxBarSize={22}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="budget"
                  name="Budget"
                  fill="#cbd5e1"
                  maxBarSize={22}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-16 text-center text-sm text-slate-500">
            Set a category budget to compare it with spending.
          </p>
        )}
        {isBudgetListOpen && budgetData.length > 0 && (
          <ul className="mt-4 space-y-2.5 border-t border-slate-100 pt-4" id={budgetListId}>
            {report.budgets.map((budget) => {
              const categoryName = budget.categories?.name ?? "Category";
              const spent = report.category_totals_minor[categoryName] ?? 0;
              const percent = Math.min(100, (spent / budget.amount_minor) * 100);
              const isOver = spent > budget.amount_minor;
              return (
                <li key={budget.id} className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-slate-800">{categoryName}</span>
                    <span
                      className={`shrink-0 tabular-nums ${isOver ? "font-semibold text-rose-700" : "text-slate-600"}`}
                    >
                      {formatPaiseAsINR(spent)} / {formatPaiseAsINR(budget.amount_minor)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${isOver ? "bg-rose-600" : "bg-emerald-600"}`}
                      style={{ width: `${Math.max(percent, 1.5)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {isOver
                      ? `${formatPaiseAsINR(spent - budget.amount_minor)} over budget`
                      : `${formatPaiseAsINR(budget.amount_minor - spent)} remaining`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export function Dashboard({ email }: { email: string | undefined }) {
  const { apiRequest, accessToken, isSessionLoading, sessionError } = useFinanceApi();
  const [month, setMonth] = useState(currentMonth);
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const filters = useMemo(
    () => ({ month, type: typeFilter, categoryId: categoryFilter, search }),
    [month, typeFilter, categoryFilter, search],
  );
  const { transactions, categories, report, isLoading, error, refresh } = useDashboardData(filters);

  const afterSave = useCallback(() => {
    setActionError(null);
    setIsEditorOpen(false);
    setEditing(null);
    refresh();
  }, [refresh]);

  const deleteTransaction = async (transaction: Transaction) => {
    if (
      !window.confirm(
        `Delete this ${transaction.type} of ${formatPaiseAsINR(transaction.amount_minor)}?`,
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await apiRequest(`/api/transactions/${transaction.id}`, { method: "DELETE" });
      refresh();
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error ? deleteError.message : "Could not delete transaction.",
      );
    }
  };

  const exportCsv = async () => {
    setIsExporting(true);
    setActionError(null);
    try {
      if (!accessToken) throw new Error("Your session has expired. Please sign in again.");
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
      if (!baseUrl) throw new Error("The API URL is not configured.");
      const params = new URLSearchParams({ month });
      if (typeFilter) params.set("type", typeFilter);
      if (categoryFilter) params.set("category_id", categoryFilter);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/api/reports/transactions.csv?${params}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok) throw new Error(`CSV export failed (${response.status}).`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `transactions-${month}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      setActionError(
        exportError instanceof Error ? exportError.message : "Could not export transactions.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (isSessionLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-600">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading your secure session…
      </div>
    );
  }
  if (!accessToken) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        {sessionError ?? error ?? "Sign in to load your dashboard."}{" "}
        <a className="font-semibold underline" href="/login">
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Personal Expense &amp; Budget Tracker
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Your money, in focus.
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {email ? `Signed in as ${email}` : "Your private finance dashboard"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span className="sr-only">Selected month</span>
            <input
              aria-label="Selected month"
              className="bg-transparent text-slate-800"
              onChange={(event) => setMonth(event.target.value)}
              type="month"
              value={month}
            />
          </label>
          <button
            aria-haspopup="dialog"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setIsSettingsOpen(true)}
            type="button"
          >
            <Settings aria-hidden="true" className="h-4 w-4" />
            Settings
          </button>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {isSettingsOpen && (
        <SettingsDialog
          categories={categories}
          onChanged={refresh}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {error && (
        <div
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
          role="alert"
        >
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">Could not load your finance data</p>
            <p className="mt-1">{error}</p>
          </div>
          <button className="font-semibold underline" onClick={refresh} type="button">
            Retry
          </button>
        </div>
      )}
      {actionError && (
        <p
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
          role="alert"
        >
          {actionError}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Monthly totals">
        <MetricCard
          label="Income"
          value={report?.income_minor ?? 0}
          tone="green"
          icon={<ArrowDownLeft className="h-4 w-4" aria-hidden="true" />}
        />
        <MetricCard
          label="Expenses"
          value={report?.expenses_minor ?? 0}
          tone="red"
          icon={<ArrowUpRight className="h-4 w-4" aria-hidden="true" />}
        />
        <MetricCard
          label="Net this month"
          value={report?.net_minor ?? 0}
          tone="slate"
          icon={<WalletCards className="h-4 w-4" aria-hidden="true" />}
        />
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Transactions</p>
          <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
            {transactions.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Matching selected filters</p>
        </article>
      </section>

      {report && <SpendingCharts report={report} />}

      <CategoryBudgetTools
        key={`budgets-${month}`}
        categories={categories}
        month={month}
        onSaved={refresh}
      />

      <AiSummary key={`ai-${month}`} month={month} apiRequest={apiRequest} />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center">
          <div>
            <h2 className="font-semibold text-slate-950">Transactions</h2>
            <p className="mt-1 text-sm text-slate-500">
              Filter, review, edit, or export your records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
              disabled={isExporting || transactions.length === 0}
              onClick={() => void exportCsv()}
              type="button"
            >
              {isExporting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-4 w-4" />
              )}
              Export CSV
            </button>
            <button
              aria-expanded={isEditorOpen}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              onClick={() => {
                setEditing(null);
                setIsEditorOpen((open) => !open);
              }}
              type="button"
            >
              {isEditorOpen && editing === null ? (
                <>
                  <X className="h-4 w-4" aria-hidden="true" />
                  Close form
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add transaction
                </>
              )}
            </button>
          </div>
        </div>
        {isEditorOpen && (
          <div className="border-b border-slate-200 bg-emerald-50/40 p-4 sm:p-5">
            <TransactionEditor
              categories={categories}
              initial={editing}
              month={month}
              onCancel={() => {
                setIsEditorOpen(false);
                setEditing(null);
              }}
              onSaved={afterSave}
            />
          </div>
        )}
        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            Search notes/categories
            <input
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              type="search"
              value={search}
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Type
            <select
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
              onChange={(event) => {
                setTypeFilter(event.target.value);
                setCategoryFilter("");
              }}
              value={typeFilter}
            >
              <option value="">All types</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Category
            <select
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
              onChange={(event) => setCategoryFilter(event.target.value)}
              value={categoryFilter}
            >
              <option value="">All categories</option>
              {categories
                .filter((category) => !typeFilter || category.type === typeFilter)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 underline underline-offset-4"
              onClick={() => {
                setSearch("");
                setTypeFilter("");
                setCategoryFilter("");
              }}
              type="button"
            >
              Clear filters
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading
            transactions…
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center">
            <WalletCards className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="mt-3 font-medium text-slate-800">No matching transactions</p>
            <p className="mt-1 text-sm text-slate-500">
              Try another filter or add your first transaction.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Category</th>
                  <th className="px-5 py-3 font-semibold">Note</th>
                  <th className="px-5 py-3 text-right font-semibold">Amount</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">
                      {transaction.transaction_date}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-800">
                      {transaction.categories?.name ?? "Category"}
                    </td>
                    <td className="max-w-64 truncate px-5 py-3.5 text-slate-500">
                      {transaction.note ?? "—"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-5 py-3.5 text-right font-semibold ${transaction.type === "income" ? "text-emerald-700" : "text-slate-900"}`}
                    >
                      {transaction.type === "income" ? "+" : "−"}
                      {formatPaiseAsINR(transaction.amount_minor)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      <button
                        className="mr-3 text-xs font-semibold text-emerald-800 underline"
                        onClick={() => {
                          setEditing(transaction);
                          setIsEditorOpen(true);
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="text-xs font-semibold text-rose-700 underline"
                        onClick={() => void deleteTransaction(transaction)}
                        type="button"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-center text-xs text-slate-500">
        Budget tracking is informational and is not a bank balance or financial advice.
      </p>
    </div>
  );
}
