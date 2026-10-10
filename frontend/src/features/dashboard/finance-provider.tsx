"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type FinanceContextValue = {
  accessToken: string | null;
  isSessionLoading: boolean;
  sessionError: string | null;
  apiRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

/**
 * FastAPI sends `detail` as a string for explicit errors and as a list of
 * validation objects for 422s. Reduce the latter to one readable sentence
 * instead of leaking the raw structure into the UI.
 */
export function readErrorDetail(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value) || value.length === 0) return null;

  const messages = value
    .map((item) => {
      if (typeof item === "string") return item;
      if (typeof item !== "object" || item === null) return null;
      const message = (item as { msg?: unknown }).msg;
      return typeof message === "string" ? message : null;
    })
    .filter((message): message is string => Boolean(message))
    .map((message) =>
      message.replace(/^Value error, /, "").replace(/^Field required$/i, "This field is required."),
    );

  if (messages.length === 0) return null;
  return Array.from(new Set(messages)).join(" ");
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setIsSessionLoading(false);
      return;
    }

    let isActive = true;
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isActive) return;
        if (error) {
          setSessionError("Unable to restore your session. Please sign in again.");
          return;
        }
        setAccessToken(data.session?.access_token ?? null);
      })
      .catch(() => {
        if (isActive) {
          setAccessToken(null);
          setSessionError("Unable to restore your session. Please sign in again.");
        }
      })
      .finally(() => {
        if (isActive) setIsSessionLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionError(null);
      setAccessToken(session?.access_token ?? null);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  const apiRequest = useMemo(
    () =>
      async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
        if (!accessToken) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
        if (!baseUrl) {
          throw new Error("The API URL is missing. Configure NEXT_PUBLIC_API_BASE_URL.");
        }
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
          },
        });
        if (!response.ok) {
          let detail = `Request failed (${response.status}).`;
          try {
            const body: unknown = await response.json();
            if (typeof body === "object" && body !== null && "detail" in body) {
              detail = readErrorDetail(body.detail) ?? detail;
            }
          } catch {
            // The response was not JSON; retain the HTTP status message.
          }
          throw new Error(detail);
        }
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      },
    [accessToken],
  );

  const value = useMemo(
    () => ({ accessToken, isSessionLoading, sessionError, apiRequest }),
    [accessToken, isSessionLoading, sessionError, apiRequest],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinanceApi() {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error("useFinanceApi must be used inside FinanceProvider.");
  }
  return context;
}
