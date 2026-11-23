import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { authUser, parties, partyPersons, partyRoles, platformMasterPlans, scanRepos, scans, tenants, tenantSubscriptions } from "@repo/db-elise/schema";
import { buildApp } from "#/index";
import { buildAuth } from "#/lib/auth";
import { fakeBindings, testExecutionContext } from "#/__tests__/fake-bindings";
import { testDeps } from "#/__tests__/test-deps";
import { openTestDb, scanValues, seedRepo, type TestDb } from "#/__tests__/test-db";
import { SIGN_UP_REFUSED } from "#/modules/sign-up/constants";
import type { QueuedEmail } from "#/modules/email";

let test: TestDb;
let queued: QueuedEmail[];

const bodyFor = (email: string, accountName: string) => ({
  firstName: "Ada",
  lastName: "Rossi",
  email,
  password: "correct-horse-battery",
  accountName,
  timezone: "Europe/Rome",
  turnstileToken: "tok",
});

const signUp = async (email: string, accountName: string) => {
  const { app } = buildApp(
    testDeps({
      enqueueEmail: async (_env, mail) => {
        queued.push(mail);
      },
      withOwner: (_c, run) => run(test.pool),
    }),
  );
  const { env } = fakeBindings();
  return app.fetch(
    new Request("http://localhost/sign-up", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bodyFor(email, accountName)) }),
    env,
    testExecutionContext,
  );
};

const loginOf = async (email: string) => {
  const [login] = await test.raw.select().from(authUser).where(eq(authUser.email, email));
  return login;
};

const accountOf = async (partyId: string) => {
  const [tenant] = await test.raw.select().from(tenants).where(eq(tenants.partyId, partyId));
  return tenant;
};

const blockers = {
  "a Plan": async (tenantId: string) => {
    const [plan] = await test.raw.select().from(platformMasterPlans).where(eq(platformMasterPlans.key, "pro"));
    await test.raw.insert(tenantSubscriptions).values({ tenantId, planId: plan.id, status: "active", source: "grant" });
  },
  "a Stripe customer": async (tenantId: string) => {
    const [plan] = await test.raw.select().from(platformMasterPlans).where(eq(platformMasterPlans.key, "pro"));
    await test.raw
      .insert(tenantSubscriptions)
      .values({ tenantId, planId: plan.id, status: "canceled", source: "stripe", stripeCustomerId: "cus_x", stripeSubscriptionId: "sub_x" });
  },
  "a Scan": async (tenantId: string) => {
    const repoId = await seedRepo(test, tenantId);
    await test.raw.insert(scans).values(scanValues(tenantId, repoId, `scan-${tenantId}`, "2026-11-01T00:00:00Z"));
  },
  "another member": async (tenantId: string) => {
    const [admin] = await test.raw.select().from(partyRoles).where(eq(partyRoles.tenantId, tenantId));
    const [person] = await test.raw.select().from(partyPersons).limit(1);
    const [party] = await test.raw.insert(parties).values({ masterTypeId: (await test.raw.select().from(parties).where(eq(parties.id, person.partyId)))[0].masterTypeId }).returning();
    await test.raw.insert(partyPersons).values({ partyId: party.id, firstName: "Bo", lastName: "Kim" });
    await test.raw.insert(partyRoles).values({ partyId: party.id, tenantId, roleId: admin.roleId, roleScope: admin.roleScope });
  },
} satisfies Record<string, (tenantId: string) => Promise<void>>;

beforeAll(async () => {
  test = await openTestDb();
});

afterAll(async () => {
  await test.close();
});

describe("POST /sign-up for an email held by an unverified Login", () => {
  it("replaces an empty Account and Login and sends a fresh Verification email", async () => {
    queued = [];
    await signUp("empty@example.com", "Old Co");
    const old = await loginOf("empty@example.com");

    const res = await signUp("empty@example.com", "New Co");

    expect(res.status).toBe(201);
    const fresh = await loginOf("empty@example.com");
    expect(fresh.id).not.toBe(old.id);
    expect(await test.raw.select().from(tenants).where(eq(tenants.partyId, old.partyId))).toHaveLength(0);
    expect(await test.raw.select().from(parties).where(eq(parties.id, old.partyId))).toHaveLength(0);
    expect((await accountOf(fresh.partyId)).name).toBe("New Co");
    expect(queued.filter((mail) => mail.kind === "verify-email")).toHaveLength(2);
  });

  it("kills the old link: only the replacing Login's link verifies", async () => {
    queued = [];
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() - 10_000 });
    await signUp("swap@example.com", "First Co");
    vi.useRealTimers();
    await signUp("swap@example.com", "Second Co");
    const [oldLink, newLink] = queued.flatMap((mail) => (mail.kind === "verify-email" ? [mail.link] : []));
    const auth = buildAuth({
      db: test.pool,
      secret: fakeBindings().env.AUTH_SECRET,
      baseUrl: "http://localhost",
      trustedOrigins: ["http://localhost"],
      dashboardUrl: "https://app.example.com",
      enqueueEmail: async () => undefined,
    });
    const verify = (link: string | undefined) =>
      auth.handler(new Request(`http://localhost/auth/verify-email?token=${new URL(link ?? "http://none").searchParams.get("token")}`));

    expect((await verify(oldLink)).status).toBe(401);
    expect((await loginOf("swap@example.com")).emailVerified).toBe(false);
    expect((await verify(newLink)).status).toBe(200);
    expect((await loginOf("swap@example.com")).emailVerified).toBe(true);
  });

  it.each(["a Plan", "a Stripe customer", "a Scan", "another member"] as const)("is refused when the Account has %s, and keeps everything", async (reason) => {
    const email = `${reason.replace(/\W+/g, "-").toLowerCase()}@example.com`;
    await signUp(email, `Held ${reason}`);
    const old = await loginOf(email);
    const tenant = await accountOf(old.partyId);
    await blockers[reason](tenant.id);

    const res = await signUp(email, "Taker");

    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toContain(SIGN_UP_REFUSED);
    expect((await loginOf(email)).id).toBe(old.id);
    expect((await accountOf(old.partyId)).id).toBe(tenant.id);
  });

  it("gives a verified email the same refusal and keeps the Login", async () => {
    await signUp("done@example.com", "Done Co");
    const old = await loginOf("done@example.com");
    await test.raw.update(authUser).set({ emailVerified: true }).where(eq(authUser.id, old.id));

    const res = await signUp("done@example.com", "Taker");

    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toContain(SIGN_UP_REFUSED);
    expect((await loginOf("done@example.com")).id).toBe(old.id);
    expect(await test.raw.select().from(scanRepos).where(eq(scanRepos.tenantId, (await accountOf(old.partyId)).id))).toHaveLength(0);
  });
});
