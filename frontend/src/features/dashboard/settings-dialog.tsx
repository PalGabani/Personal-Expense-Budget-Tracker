"use client";

import { CircleAlert, LoaderCircle, Pencil, Tags, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFinanceApi } from "@/features/dashboard/finance-provider";
import type { Category } from "@/features/dashboard/use-dashboard-data";

const MAX_NAME_LENGTH = 60;

function CategoryRow({ category, onChanged }: { category: Category; onChanged: () => void }) {
  const { apiRequest } = useFinanceApi();
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(category.name);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Move focus into the rename field once it opens.
  useEffect(() => {
    if (isRenaming) nameInputRef.current?.focus();
  }, [isRenaming]);

  async function saveName() {
    const nextName = draftName.trim();
    if (!nextName) {
      setError("Category name cannot be blank.");
      return;
    }
    if (nextName === category.name) {
      setIsRenaming(false);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await apiRequest(`/api/categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: nextName }),
      });
      setIsRenaming(false);
      onChanged();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not rename the category.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    const confirmed = window.confirm(
      `Delete "${category.name}"? Categories used by a transaction or budget cannot be deleted.`,
    );
    if (!confirmed) return;
    setIsDeleting(true);
    setError(null);
    try {
      await apiRequest(`/api/categories/${category.id}`, { method: "DELETE" });
      onChanged();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not delete the category.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      {isRenaming ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-label={`Rename ${category.name}`}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            maxLength={MAX_NAME_LENGTH}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraftName(category.name);
                setIsRenaming(false);
              }
            }}
            ref={nameInputRef}
            type="text"
            value={draftName}
          />
          <div className="flex gap-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              disabled={isSaving}
              onClick={() => void saveName()}
              type="button"
            >
              {isSaving && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}
              Save
            </button>
            <button
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
              onClick={() => {
                setDraftName(category.name);
                setIsRenaming(false);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{category.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {category.is_default ? "Default category" : "Custom category"}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              aria-label={`Rename ${category.name}`}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              onClick={() => setIsRenaming(true)}
              title="Rename category"
              type="button"
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              aria-label={`Delete ${category.name}`}
              className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
              disabled={isDeleting}
              onClick={() => void remove()}
              title="Delete category"
              type="button"
            >
              {isDeleting ? (
                <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

export function CategorySettings({
  categories,
  onChanged,
}: {
  categories: Category[];
  onChanged: () => void;
}) {
  const expenseCategories = categories.filter((category) => category.type === "expense");
  const incomeCategories = categories.filter((category) => category.type === "income");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-slate-950">Expense categories</h3>
        <p className="mt-1 text-sm text-slate-600">
          Used when recording expenses and setting monthly budgets.
        </p>
        {expenseCategories.length === 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No expense categories yet. Add one in the &ldquo;Create a category&rdquo; panel on the
              dashboard.
            </span>
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {expenseCategories.map((category) => (
              <CategoryRow category={category} key={category.id} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-slate-950">Income categories</h3>
        <p className="mt-1 text-sm text-slate-600">Used when recording income.</p>
        {incomeCategories.length === 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No income categories yet. Add one in the &ldquo;Create a category&rdquo; panel on the
              dashboard.
            </span>
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {incomeCategories.map((category) => (
              <CategoryRow category={category} key={category.id} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SettingsDialog({
  categories,
  onClose,
  onChanged,
}: {
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby="settings-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center"
      role="dialog"
    >
      <button
        aria-label="Close settings"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div className="relative my-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Tags aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-950" id="settings-title">
                Category settings
              </h2>
              <p className="text-sm text-slate-600">
                Rename or remove the categories you record against.
              </p>
            </div>
          </div>
          <button
            aria-label="Close settings"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="p-5">
          <CategorySettings categories={categories} onChanged={onChanged} />
        </div>

        <footer className="flex justify-end border-t border-slate-200 p-5">
          <button
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={onClose}
            type="button"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
