import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Expense & Budget Tracker",
  description: "A private, practical way to understand monthly spending and budgets.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
