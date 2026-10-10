import { describe, expect, it } from "vitest";
import { readErrorDetail } from "@/features/dashboard/finance-provider";

describe("API error detail formatting", () => {
  it("passes through a plain string detail", () => {
    expect(readErrorDetail("The data service could not complete the request.")).toBe(
      "The data service could not complete the request.",
    );
  });

  it("flattens a Pydantic 422 detail array into one sentence", () => {
    const detail = [
      { loc: ["body", "currency"], msg: "Extra inputs are not permitted" },
      { loc: ["body", "amount_minor"], msg: "Input should be greater than 0" },
    ];
    expect(readErrorDetail(detail)).toBe(
      "Extra inputs are not permitted Input should be greater than 0",
    );
  });

  it("strips the Pydantic Value error prefix", () => {
    expect(readErrorDetail([{ msg: "Value error, At least one field must be provided." }])).toBe(
      "At least one field must be provided.",
    );
  });

  it("rewrites Field required into plain language", () => {
    expect(readErrorDetail([{ msg: "Field required" }])).toBe("This field is required.");
  });

  it("deduplicates repeated messages", () => {
    expect(readErrorDetail([{ msg: "Field required" }, { msg: "Field required" }])).toBe(
      "This field is required.",
    );
  });

  it("returns null for empty or unusable detail payloads", () => {
    expect(readErrorDetail([])).toBeNull();
    expect(readErrorDetail([{ noMsg: true }])).toBeNull();
    expect(readErrorDetail(null)).toBeNull();
  });
});
