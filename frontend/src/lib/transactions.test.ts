import { describe, expect, it } from "vitest";
import { neutralizeSpreadsheetFormula, transactionsToCsv } from "@/lib/csv";
import { formatPaiseAsINR, parseRupeesToPaise } from "@/lib/money";

describe("INR money helpers", () => {
  it("parses decimal strings to integer paise without float arithmetic", () => {
    expect(parseRupeesToPaise("123.45")).toBe(12345);
    expect(parseRupeesToPaise("10")).toBe(1000);
  });

  it("rejects zero, negatives, and more than two decimal places", () => {
    expect(() => parseRupeesToPaise("0")).toThrow();
    expect(() => parseRupeesToPaise("-1.00")).toThrow();
    expect(() => parseRupeesToPaise("1.234")).toThrow();
  });

  it("formats integer paise as INR", () => {
    expect(formatPaiseAsINR(12345)).toContain("123.45");
  });
});

describe("CSV export", () => {
  it("neutralizes spreadsheet formula prefixes including leading whitespace", () => {
    expect(neutralizeSpreadsheetFormula("  =SUM(A1:A2)")).toBe("'  =SUM(A1:A2)");
    expect(neutralizeSpreadsheetFormula("@cmd")).toBe("'@cmd");
  });

  it("quotes fields and escapes embedded quotes", () => {
    const csv = transactionsToCsv([
      {
        date: "2026-10-01",
        type: "expense",
        amountMinor: 1000,
        currency: "INR",
        category: 'Food, "Dining"',
        note: null,
      },
    ]);
    expect(csv).toContain('"Food, ""Dining"""');
    expect(csv.endsWith('""')).toBe(true);
  });
});
