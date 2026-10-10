import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiSummaryContent } from "@/features/dashboard/ai-summary-content";

function render(text: string) {
  return renderToStaticMarkup(<AiSummaryContent text={text} />);
}

describe("AI summary Markdown rendering", () => {
  it("renders bold markers as strong elements, not literal asterisks", () => {
    const html = render("**Total Expenditure:** 680,000 paise (6,800)");
    expect(html).toContain("<strong");
    expect(html).toContain("Total Expenditure:");
    expect(html).not.toContain("**");
  });

  it("renders the real provider response with headings and a bullet list", () => {
    const html = render(
      [
        "**Monthly Spending Summary: October 2026**",
        "",
        "**Total Expenditure:** 680,000 paise (6,800)",
        "",
        "**Category Breakdown:**",
        "* **Home Rent:** 680,000 paise (100% of total spending)",
        "",
        "**Spending Patterns:** All recorded expenses fell within a single category.",
      ].join("\n"),
    );

    expect(html).toContain("<strong");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("Home Rent:");
    // Every literal markdown marker must be gone.
    expect(html).not.toContain("**");
  });

  it("preserves newlines as separate blocks rather than collapsing them", () => {
    const html = render("First line\n\nSecond line");
    expect(html.match(/<p/g)?.length).toBe(2);
  });

  it("renders unordered bullets for both - and * markers", () => {
    expect(render("- one\n- two")).toContain("<ul");
    expect(render("* one\n* two")).toContain("<ul");
  });

  it("renders ordered lists as ol", () => {
    const html = render("1. first\n2. second");
    expect(html).toContain("<ol");
    expect(html).toContain("<li");
  });

  it("renders inline code", () => {
    const html = render("Total was `680000` paise.");
    expect(html).toContain("<code");
    expect(html).toContain("680000");
  });

  it("escapes HTML instead of injecting it", () => {
    const html = render("<img src=x onerror=alert(1)> and <script>bad()</script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
  });

  it("renders plain text with no markdown unchanged", () => {
    const html = render("Spending was steady this month.");
    expect(html).toContain("Spending was steady this month.");
  });

  it("handles an empty string without crashing", () => {
    expect(() => render("")).not.toThrow();
  });
});
