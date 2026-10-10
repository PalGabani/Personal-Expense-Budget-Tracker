/**
 * Brand mark for the tracker: a rupee coin over a wallet silhouette.
 * Inherits `currentColor` so it works on light and dark surfaces.
 */
export function Logo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="currentColor" height="48" rx="13" width="48" />
      <path
        d="M13 19.5h13.5M13 24h11M13 28.5h7.5"
        stroke="#ecfdf5"
        strokeLinecap="round"
        strokeWidth="2.6"
      />
      <path
        d="M30.5 14.5c3.2 0 5.8 2.6 5.8 5.9 0 2.2-1.2 4.1-3 5.1l-8.2 4.6c-.6.4-1.3.6-2 .6h-.8v2.4a1.6 1.6 0 0 1-3.2 0v-2.4h-2.1"
        stroke="#6ee7b7"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <Logo className="h-9 w-9" />
      <span className="flex flex-col leading-none">
        <span className="text-base font-semibold tracking-tight text-slate-950">
          Expense &amp; Budget
        </span>
        <span className="mt-1 text-xs font-medium tracking-wide text-slate-500">
          Private personal finance
        </span>
      </span>
    </span>
  );
}
