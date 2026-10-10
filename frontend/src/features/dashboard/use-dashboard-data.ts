"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFinanceApi } from "@/features/dashboard/finance-provider";

export type Category = {
  id: string;
  name: string;
  type: "income" | "expense";
  is_default: boolean;
};

export type Transaction = {
  id: string;
  type: "income" | "expense";
  amount_minor: number;
  currency: "INR";
  transaction_date: string;
  category_id: string;
  categories: { name: string } | null;
  note: string | null;
};

export type Budget = {
  id: string;
  category_id: string;
  month: string;
  amount_minor: number;
  categories: { name: string } | null;
};

export type MonthlyReport = {
  month: string;
  currency: "INR";
  income_minor: number;
  expenses_minor: number;
  net_minor: number;
  category_totals_minor: Record<string, number>;
  budgets: Budget[];
};

type DashboardFilters = {
  month: string;
  type: string;
  categoryId: string;
  search: string;
};

function queryString(filters: DashboardFilters) {
  const params = new URLSearchParams({ month: filters.month });
  if (filters.type) params.set("type", filters.type);
  if (filters.categoryId) params.set("category_id", filters.categoryId);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  return params.toString();
}

export function useDashboardData(filters: DashboardFilters) {
  const { apiRequest, accessToken, isSessionLoading } = useFinanceApi();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const query = queryString(filters);
  const monthQuery = encodeURIComponent(filters.month);

  const loadData = useCallback(async () => {
    if (isSessionLoading) return;
    if (!accessToken) {
      setIsLoading(false);
      setError("Your session has expired. Please sign in again.");
      return;
    }

    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const [nextTransactions, nextCategories, nextReport] = await Promise.all([
        apiRequest<Transaction[]>(`/api/transactions?${query}`),
        apiRequest<Category[]>("/api/categories"),
        apiRequest<MonthlyReport>(`/api/reports/monthly?month=${monthQuery}`),
      ]);
      if (currentRequest !== requestId.current) return;
      setTransactions(nextTransactions);
      setCategories(nextCategories);
      setReport(nextReport);
    } catch (requestError: unknown) {
      if (currentRequest !== requestId.current) return;
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load your finance data.",
      );
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [accessToken, apiRequest, isSessionLoading, monthQuery, query]);

  const refresh = useCallback(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return { transactions, categories, report, isLoading, error, refresh };
}
