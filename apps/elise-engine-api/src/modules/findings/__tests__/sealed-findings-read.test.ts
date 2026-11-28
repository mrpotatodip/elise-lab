import { scanFindings, scanFindingTriage, scans } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { giveDataKey } from "#/__tests__/sealed-test-helpers";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";

const FindingsBodySchema = z.object({
  data: z.object({
    findings: z.array(
      z.object({
        findingId: z.string(),
        title: z.string(),
        impact: z.string().nullable(),
        triage: z.object({ note: z.string().nullable() }).nullable(),
      }),
    ),
  }),
});

let test: TestDb;
let acme: string;
let other: string;
let seal: (text: string) => Promise<string>;

const app = tenantRouteApp(() => test);

const listFindings = async (accountId: string) => {
  const res = await callAs(app, accountId, "/findings");
  return FindingsBodySchema.parse(await res.json()).data.findings;
};

beforeAll(async () => {
  test = await openTestDb();
  acme = (await seedTenant(test, "acme")).tenantId;
  other = (await seedTenant(test, "other")).tenantId;
  seal = await giveDataKey(test, acme);
  const repoId = await seedRepo(test, acme);
  const otherRepoId = await seedRepo(test, other);
  await test.raw
    .insert(scans)
    .values([
      scanValues(acme, repoId, "mine", "2026-11-01T00:00:00Z"),
      scanValues(other, otherRepoId, "theirs", "2026-11-01T00:00:00Z"),
    ]);
  const common = { status: "confirmed", severity: "high", class: "authz" } as const;
  await test.raw.insert(scanFindings).values([
    {
      ...common,
      tenantId: acme,
      scanId: "mine",
      findingId: await seal("F-SEALED"),
      fingerprint: "a".repeat(64),
      title: await seal("Sealed title"),
      impact: await seal("Sealed impact"),
    },
    {
      ...common,
      tenantId: acme,
      scanId: "mine",
      findingId: "F-PLAIN",
      fingerprint: "b".repeat(64),
      title: "Plain title",
    },
    {
      ...common,
      tenantId: other,
      scanId: "theirs",
      findingId: await seal("F-COPIED"),
      fingerprint: "c".repeat(64),
      title: await seal("Copied title"),
    },
  ]);
  await test.raw.insert(scanFindingTriage).values({
    tenantId: acme,
    repoId,
    fingerprint: "a".repeat(64),
    status: "false_positive",
    note: await seal("Sealed note"),
  });
});

afterAll(async () => {
  await test.close();
});

describe("GET /findings with sealed and plain rows", () => {
  it("opens a sealed Finding for its own Account and still reads a plain one", async () => {
    const findings = await listFindings(acme);

    expect(findings.map((finding) => [finding.findingId, finding.title, finding.impact]).toSorted()).toEqual([
      ["F-PLAIN", "Plain title", null],
      ["F-SEALED", "Sealed title", "Sealed impact"],
    ]);
  });

  it("opens the sealed triage note", async () => {
    const findings = await listFindings(acme);

    expect(findings.find((finding) => finding.findingId === "F-SEALED")?.triage?.note).toBe("Sealed note");
  });

  it("shows 'cannot be read' for a sealed value copied into another Account's row", async () => {
    const [copied] = await listFindings(other);

    expect([copied.findingId, copied.title]).toEqual(["cannot be read", "cannot be read"]);
  });
});
