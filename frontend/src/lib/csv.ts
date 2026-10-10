export type CsvTransaction = {
  date: string;
  type: string;
  amountMinor: number;
  currency: string;
  category: string;
  note: string | null;
};

export function neutralizeSpreadsheetFormula(value: string): string {
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function quoteCsvCell(value: string): string {
  return `"${neutralizeSpreadsheetFormula(value).replaceAll('"', '""')}"`;
}

export function transactionsToCsv(rows: CsvTransaction[]): string {
  const header = ["date", "type", "amount_minor", "currency", "category", "note"];
  const lines = rows.map((row) =>
    [row.date, row.type, String(row.amountMinor), row.currency, row.category, row.note ?? ""]
      .map(quoteCsvCell)
      .join(","),
  );
  return [header.map(quoteCsvCell).join(","), ...lines].join("\r\n");
}
