import { ApproveRunnerLoginBodySchema, type MeAccount } from "@repo/contracts/elise";
import { describe, expect, it } from "vitest";
import { DEVICE_COPY } from "#/modules/device/constants";
import { approvalBody, approvedMessage, clampChoices, deviceAccounts } from "#/modules/device/utils";

const account = (id: string, name: string, powers: string[]): MeAccount => ({
  id,
  name,
  slug: name,
  role: "member",
  roleLabel: "Member",
  powers,
});

const ADMIN = account("11111111-1111-4111-8111-111111111111", "Acme", [
  "company:runners:create",
  "company:dashboard:read",
]);
const WATCHER = account("22222222-2222-4222-8222-222222222222", "Beta", ["company:summary:read"]);
const NOTHING = account("33333333-3333-4333-8333-333333333333", "Gamma", ["company:team:members:read"]);

describe("what each Account lets this login approve", () => {
  it("offers Runner and read and start where the Role holds the Powers", () => {
    expect(deviceAccounts([ADMIN])).toEqual([{ id: ADMIN.id, name: "Acme", runScans: true, maxCli: "start" }]);
  });

  it("gives a Watcher read only and no Runner", () => {
    expect(deviceAccounts([WATCHER])).toEqual([{ id: WATCHER.id, name: "Beta", runScans: false, maxCli: "read" }]);
  });

  it("leaves out an Account that allows neither choice", () => {
    expect(deviceAccounts([NOTHING])).toEqual([]);
  });
});

describe("what the page sends", () => {
  it.each([
    { runScans: true, cli: "none" as const, cliScope: null },
    { runScans: true, cli: "read" as const, cliScope: "read" },
    { runScans: false, cli: "start" as const, cliScope: "start" },
  ])("runScans $runScans and CLI $cli sends cliScope $cliScope", ({ runScans, cli, cliScope }) => {
    const body = approvalBody({ userCode: "K7QM-4TXD", name: "Build box", runScans, cli });
    expect(ApproveRunnerLoginBodySchema.parse(body)).toEqual({
      userCode: "K7QM-4TXD",
      name: "Build box",
      runScans,
      cliScope,
    });
  });

  it.each([
    {
      limits: { runScans: false, maxCli: "read" as const },
      asked: { runScans: true, cli: "start" as const },
      sent: { runScans: false, cli: "read" },
    },
    {
      limits: { runScans: true, maxCli: "none" as const },
      asked: { runScans: true, cli: "read" as const },
      sent: { runScans: true, cli: "none" },
    },
  ])("clamps $asked to what the Account allows", ({ limits, asked, sent }) => {
    expect(clampChoices(limits, asked)).toEqual(sent);
  });
});

describe("what the page says", () => {
  it("offers the two choices in the words of the glossary", () => {
    expect([DEVICE_COPY.runScansLabel, DEVICE_COPY.cliLegend, DEVICE_COPY.cliRead, DEVICE_COPY.cliStart]).toEqual([
      "Run Scans on this computer",
      "Start and read Scans from this CLI",
      "Read only",
      "Read and start",
    ]);
  });

  it.each([
    { runScans: true, cliScope: null, text: "Build box is now a Runner of Acme." },
    { runScans: false, cliScope: "read" as const, text: "Build box can now read Scans of Acme from the Elise CLI." },
    {
      runScans: true,
      cliScope: "start" as const,
      text: "Build box is now a Runner of Acme, and can start and read Scans from the Elise CLI.",
    },
  ])("says $text", ({ runScans, cliScope, text }) => {
    expect(approvedMessage({ name: "Build box", accountName: "Acme", runScans, cliScope })).toBe(text);
  });
});
