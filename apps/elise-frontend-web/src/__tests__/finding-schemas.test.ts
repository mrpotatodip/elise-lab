import { describe, expect, it } from "vitest";
import { FindingsFileSchema } from "#/modules/scan/schemas/finding-schemas";

// -----
// An old lite Scan wrote a flat finding; a Scan on a profile writes the
// nested one. The dashboard reads both into one shape.
// -----
const flat = {
  status: "confirmed",
  severity: "high",
  title: "SQL injection in search",
  location: [{ file: "src/search.ts", line: 42 }],
};

const nested = {
  verdict: "needs_validation",
  title: "Open redirect after sign-in",
  severity: { overall_severity: "medium" },
  evidence: [{ file: "src/auth/redirect.ts", line: 17 }],
};

describe("FindingsFileSchema", () => {
  it("reads the old flat finding", () => {
    expect(FindingsFileSchema.parse([flat])).toEqual([{ title: "SQL injection in search", state: "confirmed", severity: "high", place: { file: "src/search.ts", line: 42 } }]);
  });

  it("reads the nested finding of a profile Scan", () => {
    expect(FindingsFileSchema.parse([nested])).toEqual([{ title: "Open redirect after sign-in", state: "needs_validation", severity: "medium", place: { file: "src/auth/redirect.ts", line: 17 } }]);
  });

  it("keeps a rejected nested finding as rejected, so the list can leave it out", () => {
    expect(FindingsFileSchema.parse([{ ...nested, verdict: "rejected" }])[0]?.state).toBe("rejected");
  });

  it("reads both shapes from one file and keeps their order", () => {
    expect(FindingsFileSchema.parse([nested, flat]).map((finding) => finding.title)).toEqual(["Open redirect after sign-in", "SQL injection in search"]);
  });

  it.each([
    ["a flat finding with no location", { status: "confirmed", severity: "low", title: "Weak hash" }],
    ["a nested finding with no evidence", { verdict: "confirmed", title: "Weak hash", severity: { overall_severity: "low" } }],
  ])("gives %s no place", (_name, item) => {
    expect(FindingsFileSchema.parse([item])[0]?.place).toBeNull();
  });

  it("keeps the findings around one malformed item", () => {
    expect(FindingsFileSchema.parse([{ title: "no state" }, nested, 7, flat])).toHaveLength(2);
  });
});
