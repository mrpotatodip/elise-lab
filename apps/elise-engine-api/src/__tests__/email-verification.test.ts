import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { authAccount, authSession, authUser } from "@repo/db-elise/schema";
import { hashPassword } from "better-auth/crypto";
import { buildAuth, verifiedUserId } from "#/lib/auth";
import type { QueuedEmail } from "#/modules/email";
import { openTestDb, seedTenant, type TestDb } from "./test-db";

let db: TestDb;
const queued: QueuedEmail[] = [];

const authConfig = () => ({
  db: db.pool,
  secret: "s".repeat(32),
  baseUrl: "http://localhost:8787",
  trustedOrigins: ["http://localhost:3100"],
  dashboardUrl: "http://localhost:3100",
  enqueueEmail: async (mail: QueuedEmail) => {
    queued.push(mail);
  },
});

const auth = () => buildAuth(authConfig());

const seedLogin = async (id: string, email: string, emailVerified: boolean) => {
  const { partyId } = await seedTenant(db, `acct-${id}`);
  const now = new Date();
  await db.raw
    .insert(authUser)
    .values({ id, partyId, name: "Bo", email, emailVerified, createdAt: now, updatedAt: now });
  await db.raw.insert(authAccount).values({
    id: `a-${id}`,
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword("old-password-1"),
    createdAt: now,
    updatedAt: now,
  });
};

const verificationToken = async (email: string) => {
  queued.length = 0;
  await auth().api.sendVerificationEmail({ body: { email } });
  const mail = queued.find((entry) => entry.kind === "verify-email");
  return new URL(mail?.kind === "verify-email" ? mail.link : "http://none").searchParams.get("token") ?? "";
};

const verify = (token: string) => auth().api.verifyEmail({ query: { token }, asResponse: true });
const sessionsOf = async (id: string) =>
  (await db.raw.select().from(authSession).where(eq(authSession.userId, id))).length;

beforeAll(async () => {
  db = await openTestDb();
  await seedLogin("u-unverified", "new@example.com", false);
  await seedLogin("u-once", "once@example.com", false);
  await seedLogin("u-late", "late@example.com", false);
  await seedLogin("u-old", "old@example.com", true);
});

afterAll(() => db.close());
afterEach(() => vi.useRealTimers());

describe("the sign-in gate", () => {
  it("refuses a Login that is not a Verified Login, with the password right", async () => {
    await expect(
      auth().api.signInEmail({ body: { email: "new@example.com", password: "old-password-1" } }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(await sessionsOf("u-unverified")).toBe(0);
  });

  it("re-sends the Verification email on each refused attempt, up to the address limit", async () => {
    queued.length = 0;
    const counts = new Map<string, number>();
    const limiter: RateLimit = {
      limit: async ({ key }) => {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return { success: (counts.get(key) ?? 0) <= 2 };
      },
    };
    const limited = buildAuth({ ...authConfig(), verificationAddressLimiter: limiter });

    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(
        limited.api.signInEmail({ body: { email: "New@example.com", password: "old-password-1" } }),
      ).rejects.toMatchObject({ status: "FORBIDDEN" });
    }

    expect(queued.filter((mail) => mail.kind === "verify-email")).toHaveLength(2);
  });

  it("lets a Verified Login in", async () => {
    const signedIn = await auth().api.signInEmail({ body: { email: "old@example.com", password: "old-password-1" } });

    expect(signedIn.user.id).toBe("u-old");
  });
});

describe("a session of an unverified Login", () => {
  it.each([
    { session: { user: { id: "u1", emailVerified: false } }, userId: undefined },
    { session: { user: { id: "u1", emailVerified: true } }, userId: "u1" },
    { session: null, userId: undefined },
  ])("resolves to $userId", ({ session, userId }) => {
    expect(verifiedUserId(session)).toBe(userId);
  });
});

describe("the Verification link", () => {
  it("verifies the Login and signs it in, once", async () => {
    const token = await verificationToken("once@example.com");

    const first = await verify(token);
    expect(first.headers.get("set-cookie")).toContain("session_token");
    expect(first.headers.get("set-auth-token")).toBeTruthy();
    expect((await db.raw.select().from(authUser).where(eq(authUser.id, "u-once")))[0]?.emailVerified).toBe(true);
    expect(await sessionsOf("u-once")).toBe(1);

    const second = await verify(token);
    expect(second.headers.get("set-cookie")).toBeNull();
    expect(await sessionsOf("u-once")).toBe(1);
  });

  it("is refused after 24 hours", async () => {
    const token = await verificationToken("late@example.com");
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 25 * 3600 * 1000 });

    const late = await verify(token);
    expect(late.status).toBe(401);
    expect(late.headers.get("set-cookie")).toBeNull();
    expect((await db.raw.select().from(authUser).where(eq(authUser.id, "u-late")))[0]?.emailVerified).toBe(false);
  });
});
