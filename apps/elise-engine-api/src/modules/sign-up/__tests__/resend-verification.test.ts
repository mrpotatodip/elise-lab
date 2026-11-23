import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authUser } from "@repo/db-elise/schema";
import { buildApp } from "#/index";
import { fakeBindings, testExecutionContext } from "#/__tests__/fake-bindings";
import { testDeps } from "#/__tests__/test-deps";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import type { QueuedEmail } from "#/modules/email";

let test: TestDb;

beforeAll(async () => {
  test = await openTestDb();
  const unverified = await seedTenant(test, "resend-unverified");
  const verified = await seedTenant(test, "resend-verified");
  const now = new Date();
  await test.raw.insert(authUser).values([
    { id: "u-new", partyId: unverified.partyId, name: "Ada", email: "ada@example.com", emailVerified: false, createdAt: now, updatedAt: now },
    { id: "u-old", partyId: verified.partyId, name: "Bo", email: "bo@example.com", emailVerified: true, createdAt: now, updatedAt: now },
  ]);
});

afterAll(() => test.close());

const countingLimiter = (limit: number): RateLimit => {
  const counts = new Map<string, number>();
  return {
    limit: async ({ key }) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { success: count <= limit };
    },
  };
};

const resender = (limiters: { ip?: RateLimit; address?: RateLimit } = {}) => {
  const queued: QueuedEmail[] = [];
  const { app } = buildApp(testDeps({ enqueueEmail: async (_env, mail) => void queued.push(mail), withOwner: (_c, run) => run(test.pool) }));
  const { env } = fakeBindings({ VERIFICATION_RESEND_LIMITER: limiters.ip, VERIFICATION_RESEND_ADDRESS_LIMITER: limiters.address });
  const resend = async (email: string) => {
    const res = await app.fetch(
      new Request("http://localhost/sign-up/resend-verification", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4" }, body: JSON.stringify({ email }) }),
      env,
      testExecutionContext,
    );
    return { status: res.status, body: await res.text() };
  };
  return { queued, resend };
};

describe("POST /sign-up/resend-verification", () => {
  it("queues one verify-email for an unverified Login and answers the same for an unknown or verified address", async () => {
    const { queued, resend } = resender();

    const answers = [await resend("ada@example.com"), await resend("bo@example.com"), await resend("nobody@example.com")];

    expect(queued.map((mail) => mail.kind === "verify-email" && mail.to)).toEqual(["ada@example.com"]);
    expect(new Set(answers.map((a) => a.body)).size).toBe(1);
    expect(new Set(answers.map((a) => a.status))).toEqual(new Set([200]));
  });

  it("queues no email past the address cap, whatever the letter case, and answers the same", async () => {
    const { queued, resend } = resender({ address: countingLimiter(2) });

    const answers = [await resend("ada@example.com"), await resend("ADA@example.com"), await resend("Ada@Example.com"), await resend("ada@example.com")];

    expect(queued).toHaveLength(2);
    expect(new Set(answers.map((a) => a.body)).size).toBe(1);
  });

  it("answers 429 past the IP cap", async () => {
    const { queued, resend } = resender({ ip: countingLimiter(1) });

    const first = await resend("ada@example.com");
    const second = await resend("ada@example.com");

    expect([first.status, second.status]).toEqual([200, 429]);
    expect(queued).toHaveLength(1);
  });
});
