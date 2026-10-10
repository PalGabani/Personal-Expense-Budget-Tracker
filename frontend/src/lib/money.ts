const AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function parseRupeesToPaise(value: string): number {
  const normalized = value.trim();
  if (!AMOUNT_PATTERN.test(normalized)) {
    throw new Error("Enter a positive INR amount with up to two decimal places.");
  }

  const [rupees, paise = ""] = normalized.split(".");
  const amount = BigInt(rupees) * 100n + BigInt(paise.padEnd(2, "0") || "0");
  if (amount <= 0n || amount > 100_000_000_000n) {
    throw new Error("Amount must be greater than zero and within the supported range.");
  }
  return Number(amount);
}

export function formatPaiseAsINR(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error("Amount in paise must be a safe integer.");
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}
