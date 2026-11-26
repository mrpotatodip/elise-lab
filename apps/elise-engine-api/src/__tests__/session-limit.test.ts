import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { authAccount, authSession, authUser } from "@repo/db-elise/schema";
import { hashPassword } from "better-auth/crypto";
import { MAX_SESSIONS_PER_LOGIN } from "#/constants";
import { buildAuth } from "#/lib/auth";
import { openTestDb, seedTenant, type TestDb } from "./test-db";

let db: TestDb;

const seedLogin = async (partyId: string, id: string) => {
  const now = new Date();
  await db.raw
    .insert(authUser)
    .values({ id, partyId, name: id, email: `${id}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
  await db.raw.insert(authAccount).values({
    id: `acc-${id}`,
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword("password-123"),
    createdAt: now,
    updatedAt: now,
  });
};

beforeAll(async () => {
  db = await openTestDb();
  await seedLogin((await seedTenant(db, "one")).partyId, "u1");
  await seedLogin((await seedTenant(db, "two")).partyId, "u2");
  await seedLogin((await seedTenant(db, "three")).partyId, "u3");
});

afterAll(() => db.close());

const auth = () =>
  buildAuth({
    db: db.pool,
    secret: "s".repeat(32),
    baseUrl: "http://localhost:8787",
    trustedOrigins: ["http://localhost:3100"],
    dashboardUrl: "http://localhost:3100",
    enqueueEmail: async () => {},
  });

const signIn = async (email: string) => {
  const result = await auth().api.signInEmail({ body: { email, password: "password-123" } });
  await new Promise((resolve) => setTimeout(resolve, 5));
  return result.token;
};

describe("Session limit", () => {
  it("signs out a Login's oldest Session on the sign-in over the limit and leaves other Logins alone", async () => {
    const other = await signIn("u2@example.com");
    const first = await signIn("u1@example.com");
    await signIn("u1@example.com");
    await signIn("u1@example.com");
    await signIn("u1@example.com");

    const mine = await db.raw
      .select()
      .from(authSession)
      .where(eq(authSession.userId, "u1"))
      .orderBy(asc(authSession.createdAt));
    const theirs = await db.raw.select().from(authSession).where(eq(authSession.userId, "u2"));
    expect(mine).toHaveLength(MAX_SESSIONS_PER_LOGIN);
    expect(mine.map((row) => row.token)).not.toContain(first);
    expect(theirs.map((row) => row.token)).toEqual([other]);
  });

  it("does not sign out a Session when the password step of a Two-factor Login has not passed its code", async () => {
    const now = new Date();
    await db.raw.update(authUser).set({ twoFactorEnabled: true }).where(eq(authUser.id, "u3"));
    await db.raw.insert(authSession).values(
      [1, 2, 3].map((n) => ({
        id: `s3-${n}`,
        token: `t3-${n}`,
        userId: "u3",
        expiresAt: new Date(now.getTime() + 3_600_000),
        createdAt: new Date(now.getTime() - n * 1000),
        updatedAt: now,
      })),
    );

    const result = await auth().api.signInEmail({ body: { email: "u3@example.com", password: "password-123" } });

    const kept = await db.raw.select().from(authSession).where(eq(authSession.userId, "u3"));
    expect(result).toMatchObject({ twoFactorRedirect: true });
    expect(kept.map((row) => row.id).toSorted()).toEqual(["s3-1", "s3-2", "s3-3"]);
  });
});
