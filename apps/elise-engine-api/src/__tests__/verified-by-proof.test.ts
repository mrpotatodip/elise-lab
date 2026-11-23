import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { authAccount, authUser, ensureTenantRoles } from "@repo/db-elise";
import { hashPassword } from "better-auth/crypto";
import { buildAuth } from "#/lib/auth";
import type { QueuedEmail } from "#/modules/email";
import { acceptInviteEffect, createInviteEffect } from "#/modules/team/queries";
import { openTestDb, seedTenant, type TestDb } from "./test-db";

let db: TestDb;
let tenantId: string;
let adminUserId: string;

const NOW = new Date("2026-11-08T00:00:00Z");

beforeAll(async () => {
  db = await openTestDb();
  const seeded = await seedTenant(db, "acme");
  tenantId = seeded.tenantId;
  await ensureTenantRoles(db.raw, tenantId);
  adminUserId = "admin-user";
  await db.raw.insert(authUser).values({ id: adminUserId, name: "Ada Rossi", email: "ada@example.com", partyId: seeded.partyId });
});

afterAll(() => db.close());

const seedUnverified = async (id: string, email: string) => {
  const { partyId } = await seedTenant(db, `acct-${id}`);
  const now = new Date();
  await db.raw.insert(authUser).values({ id, partyId, name: "Bo", email, emailVerified: false, createdAt: now, updatedAt: now });
  await db.raw.insert(authAccount).values({ id: `a-${id}`, accountId: id, providerId: "credential", userId: id, password: await hashPassword("old-password-1"), createdAt: now, updatedAt: now });
};

const invite = async (email: string) => {
  const tokenHash = crypto.randomUUID();
  await Effect.runPromise(
    createInviteEffect(db.pool, { tenantId, actorUserId: adminUserId, email, roleKey: "workspace_member", groupIds: [], tokenHash, now: NOW, expiresAt: new Date("2026-11-15T00:00:00Z") }),
  );
  return tokenHash;
};

const acceptInvite = (tokenHash: string, extra: { signedInUserId?: string; newLogin?: { firstName: string; lastName: string; passwordHash: string } }) =>
  Effect.runPromise(acceptInviteEffect(db.pool, { tokenHash, now: NOW, signedInUserId: extra.signedInUserId, newLogin: extra.newLogin }));

const resetPassword = async (email: string) => {
  const queued: QueuedEmail[] = [];
  const auth = buildAuth({
    db: db.pool,
    secret: "s".repeat(32),
    baseUrl: "http://localhost:8787",
    trustedOrigins: ["http://localhost:3100"],
    dashboardUrl: "http://localhost:3100",
    enqueueEmail: async (mail) => {
      queued.push(mail);
    },
  });
  await auth.api.requestPasswordReset({ body: { email } });
  const reset = queued.find((mail) => mail.kind === "password-reset");
  const token = new URL(reset?.kind === "password-reset" ? reset.link : "http://none").searchParams.get("token") ?? "";
  await auth.api.resetPassword({ body: { token, newPassword: "new-password-22" } });
};

const verifiedOf = async (email: string) => (await db.raw.select().from(authUser).where(eq(authUser.email, email)))[0]?.emailVerified;

describe("a proof of ownership verifies the Login", () => {
  it.each([
    {
      proof: "accepting an invite sent to its address, signed in",
      email: "signed-in@example.com",
      run: async (email: string) => {
        await seedUnverified("u-invited", email);
        await acceptInvite(await invite(email), { signedInUserId: "u-invited" });
      },
    },
    {
      proof: "accepting an invite sent to its address, as a new Login",
      email: "fresh@example.com",
      run: async (email: string) => {
        await acceptInvite(await invite(email), { newLogin: { firstName: "Bo", lastName: "Chen", passwordHash: "hash" } });
      },
    },
    {
      proof: "completing a password reset",
      email: "reset@example.com",
      run: async (email: string) => {
        await seedUnverified("u-reset", email);
        await resetPassword(email);
      },
    },
  ])("$proof", async ({ email, run }) => {
    await run(email);

    expect(await verifiedOf(email)).toBe(true);
  });
});
