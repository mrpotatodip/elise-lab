import { describe, expect, it } from "vitest";
import { CreateScanInputSchema, VerdictInputSchema } from "#/modules/scan/schemas";
import { scanCreateBodyOf, scanStartProblem } from "#/modules/scan/utils/scan-create-body";

const OPTIONS = { model: "claude-sonnet-5-5", effort: "high", profile: "standard" } as const;
const RUNNER = "6f1c1f8e-2b7a-4c55-9a0e-6f3d2f6b1a01";
const ZIP = "0d6f7a1e-9c1b-4f7e-8a43-5b2e9d4c7a10";

describe("scanCreateBodyOf", () => {
  it("sends a github plan as before providers: no provider, the ref as typed", () => {
    expect(scanCreateBodyOf({ ...OPTIONS, provider: "github", repo: "https://github.com/acme/app", ref: "main" })).toEqual({
      ...OPTIONS,
      repo: "https://github.com/acme/app",
      ref: "main",
      runner_id: undefined,
    });
  });

  it("starts an upload Scan from the chosen zip, by its id, on the Runner and with no ref", () => {
    expect(scanCreateBodyOf({ ...OPTIONS, provider: "upload", repo: "Billing API", archiveId: ZIP, runnerId: RUNNER })).toEqual({
      ...OPTIONS,
      provider: "upload",
      repo: "Billing API",
      archive_id: ZIP,
      runner_id: RUNNER,
    });
  });
});

describe("scanStartProblem", () => {
  it.each([
    [
      "an older Runner asked for an upload Scan",
      "runner_id: this Runner cannot read uploaded zips. Update the Elise Runner app on that computer and let it connect, then start the Scan again.",
      "This Runner cannot read uploaded zips. Update the Elise Runner app on that computer and let it connect, then start the Scan again.",
    ],
    ["a refusal with no field", "This plan allows 10 scans a month", "This plan allows 10 scans a month"],
  ])("says the engine's reason without its field name for %s", (_, message, shown) => {
    expect(scanStartProblem(message)).toBe(shown);
  });
});

describe("VerdictInputSchema", () => {
  it.each([
    ["a git commit", "4b825dc642cb6eb9a060e54bf8d69288fbee4904", true],
    ["the SHA-256 of an uploaded zip, its commit", "3ff652db2f06f3e24d5eb0824d3e1ee38401754fe10663f374417be55ce39061", true],
    ["a short commit", "4b825dc", false],
  ])("asks the Verdict of %s", (_, commit, accepted) => {
    expect(VerdictInputSchema.safeParse({ repoId: "0d6f7a1e-9c1b-4f7e-8a43-5b2e9d4c7a10", commit }).success).toBe(accepted);
  });
});

describe("CreateScanInputSchema", () => {
  it.each([
    ["an upload plan with no zip", { ...OPTIONS, provider: "upload", repo: "Billing API", runnerId: RUNNER }, ["archiveId"]],
    ["an upload plan with a ref", { ...OPTIONS, provider: "upload", repo: "Billing API", archiveId: ZIP, runnerId: RUNNER, ref: "main" }, ["ref"]],
    ["a github plan with a zip", { ...OPTIONS, repo: "https://github.com/acme/app", archiveId: ZIP }, ["archiveId"]],
    ["an upload plan with a zip and a Runner", { ...OPTIONS, provider: "upload", repo: "Billing API", archiveId: ZIP, runnerId: RUNNER }, []],
  ])("refuses the fields that are wrong in %s", (_, plan, fields) => {
    const parsed = CreateScanInputSchema.safeParse(plan);
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path[0])).toEqual(fields);
  });
});
