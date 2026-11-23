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
  await db.raw.insert(authUser).values({ id, partyId, name: id, email: `${id}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
  await db.raw.insert(authAccount).values({ id: `acc-${id}`, accountId: id, providerId: "credential", userId: id, password: await hashPassword("password-123"), createdAt: now, updatedAt: now });
};

beforeAll(async () => {
  db = await openTestDb();
  await seedLogin((await seedTenant(db, "one")).partyId, "u1");
  await seedLogin((await seedTenant(db, "two")).partyId, "u2");
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

    const mine = await db.raw.select().from(authSession).where(eq(authSession.userId, "u1")).orderBy(asc(authSession.createdAt));
    const theirs = await db.raw.select().from(authSession).where(eq(authSession.userId, "u2"));
    expect(mine).toHaveLength(MAX_SESSIONS_PER_LOGIN);
    expect(mine.map((row) => row.token)).not.toContain(first);
    expect(theirs.map((row) => row.token)).toEqual([other]);
  });
});
