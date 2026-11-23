import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureTenantRoles, findTenantRole } from "@repo/db-elise";
import { authAccount, authSession, authTwoFactor, authUser, partyRoles, tenants } from "@repo/db-elise/schema";
import { hashPassword } from "better-auth/crypto";
import { buildAuth } from "#/lib/auth";
import type { QueuedEmail } from "#/modules/email";
import { openTestDb, seedTenant, type TestDb } from "./test-db";

let db: TestDb;
const queued: QueuedEmail[] = [];
const PASSWORD = "old-password-1";

const auth = () =>
  buildAuth({
    db: db.pool,
    secret: "s".repeat(32),
    baseUrl: "http://localhost:8787",
    trustedOrigins: ["http://localhost:3100"],
    dashboardUrl: "http://localhost:3100",
    enqueueEmail: async (mail) => {
      queued.push(mail);
    },
  });

const seedLogin = async (id: string) => {
  const { partyId } = await seedTenant(db, `acct-${id}`);
  const now = new Date();
  await db.raw.insert(authUser).values({ id, partyId, name: "Bo", email: `${id}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
  await db.raw.insert(authAccount).values({ id: `a-${id}`, accountId: id, providerId: "credential", userId: id, password: await hashPassword(PASSWORD), createdAt: now, updatedAt: now });
  return `${id}@example.com`;
};

// -----
// RFC 6238 over WebCrypto, so the expected code comes from
// the standard and not from the library under test.
// -----
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const base32Bytes = (text: string) => {
  const bits = [...text.replace(/=+$/, "")].map((char) => BASE32.indexOf(char).toString(2).padStart(5, "0")).join("");
  return Uint8Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2));
};

const totpAt = async (secret: string, atMs: number) => {
  const key = await crypto.subtle.importKey("raw", base32Bytes(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const counter = new DataView(new ArrayBuffer(8));
  counter.setBigUint64(0, BigInt(Math.floor(atMs / 30_000)));
  const mac = new DataView(await crypto.subtle.sign("HMAC", key, counter));
  const offset = mac.getUint8(19) & 0x0f;
  const value = mac.getUint32(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
};

const secretOf = (totpURI: string) => new URL(totpURI).searchParams.get("secret") ?? "";
const codeNow = (secret: string) => totpAt(secret, Date.now());

const cookiesOf = (headers: Headers) =>
  headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .filter((pair) => !pair.endsWith("="))
    .join("; ");

const signIn = async (email: string) => {
  const { headers, response } = await auth().api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  return { cookie: cookiesOf(headers), response };
};

const challengeOf = async (email: string) => {
  const { cookie, response } = await signIn(email);
  return { cookie, redirect: "twoFactorRedirect" in response && response.twoFactorRedirect === true };
};

// -----
// Enrols the Login on a fresh session: enable, then one valid
// code. Returns the secret, the Backup codes and the session
// that is left signed in.
// -----
const enrol = async (email: string) => {
  const { cookie } = await signIn(email);
  const enabled = await auth().api.enableTwoFactor({ body: { password: PASSWORD }, headers: { cookie } });
  const secret = secretOf(enabled.totpURI);
  const verified = await auth().api.verifyTOTP({ body: { code: await codeNow(secret) }, headers: { cookie }, returnHeaders: true });
  return { secret, backupCodes: enabled.backupCodes, cookie: cookiesOf(verified.headers) || cookie };
};

const withCode = (body: { password: string; code?: string }): { password: string } => body;
const flagOf =async (id: string) => (await db.raw.select().from(authUser).where(eq(authUser.id, id)))[0]?.twoFactorEnabled;
const sessionsOf = async (id: string) => (await db.raw.select().from(authSession).where(eq(authSession.userId, id))).length;

beforeAll(async () => {
  db = await openTestDb();
});

afterAll(() => db.close());

describe("enrolment", () => {
  it("turns Two-factor on only after one valid code, and shows ten Backup codes", async () => {
    const email = await seedLogin("enrol");
    const { cookie } = await signIn(email);
    const enabled = await auth().api.enableTwoFactor({ body: { password: PASSWORD }, headers: { cookie } });

    expect(enabled.backupCodes).toHaveLength(10);
    expect(await flagOf("enrol")).toBe(false);

    await auth().api.verifyTOTP({ body: { code: await codeNow(secretOf(enabled.totpURI)) }, headers: { cookie } });
    expect(await flagOf("enrol")).toBe(true);
  });

  it("refuses to start enrolment with a wrong password", async () => {
    const email = await seedLogin("enrol-pw");
    const { cookie } = await signIn(email);
    await expect(auth().api.enableTwoFactor({ body: { password: "not-the-password" }, headers: { cookie } })).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });

  it("leaves Two-factor off when setup is abandoned, so the next sign-in has no challenge", async () => {
    const email = await seedLogin("abandoned");
    const { cookie } = await signIn(email);
    await auth().api.enableTwoFactor({ body: { password: PASSWORD }, headers: { cookie } });

    expect((await challengeOf(email)).redirect).toBe(false);
    expect(await flagOf("abandoned")).toBe(false);
  });
});

describe("the sign-in challenge", () => {
  it("asks for a second step after the password and signs in with a valid code", async () => {
    const email = await seedLogin("challenge");
    const { secret } = await enrol(email);
    const challenge = await challengeOf(email);

    expect(challenge.redirect).toBe(true);
    const done = await auth().api.verifyTOTP({ body: { code: await codeNow(secret) }, headers: { cookie: challenge.cookie }, returnHeaders: true });
    expect(done.response.token).toEqual(expect.any(String));
    expect(cookiesOf(done.headers)).toContain("session_token");
  });

  it("holds no session before the second step", async () => {
    const email = await seedLogin("nosession");
    await enrol(email);
    const before = await sessionsOf("nosession");
    await challengeOf(email);

    expect(await sessionsOf("nosession")).toBe(before);
  });

  it("accepts each Backup code once only", async () => {
    const email = await seedLogin("backup");
    const { backupCodes } = await enrol(email);
    const [first, second] = backupCodes;

    const one = await challengeOf(email);
    await auth().api.verifyBackupCode({ body: { code: first }, headers: { cookie: one.cookie } });

    const again = await challengeOf(email);
    await expect(auth().api.verifyBackupCode({ body: { code: first }, headers: { cookie: again.cookie } })).rejects.toMatchObject({ status: "UNAUTHORIZED" });

    const other = await challengeOf(email);
    await expect(auth().api.verifyBackupCode({ body: { code: second }, headers: { cookie: other.cookie } })).resolves.toBeDefined();
  });
});

describe("the lock", () => {
  it("locks the second step after 5 wrong codes, even for the right code, until the lock ends", async () => {
    const email = await seedLogin("lock");
    const { secret } = await enrol(email);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const challenge = await challengeOf(email);
      await expect(auth().api.verifyTOTP({ body: { code: "000000" }, headers: { cookie: challenge.cookie } })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
    }

    const locked = await challengeOf(email);
    await expect(auth().api.verifyTOTP({ body: { code: await codeNow(secret) }, headers: { cookie: locked.cookie } })).rejects.toMatchObject({ status: "TOO_MANY_REQUESTS" });

    await db.raw.update(authTwoFactor).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(authTwoFactor.userId, "lock"));
    const open = await challengeOf(email);
    await expect(auth().api.verifyTOTP({ body: { code: await codeNow(secret) }, headers: { cookie: open.cookie } })).resolves.toBeDefined();
  });

  it("locks a Backup code attempt the same way", async () => {
    const email = await seedLogin("lock-backup");
    const { backupCodes } = await enrol(email);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const challenge = await challengeOf(email);
      await expect(auth().api.verifyBackupCode({ body: { code: "wrong-code" }, headers: { cookie: challenge.cookie } })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
    }

    const locked = await challengeOf(email);
    await expect(auth().api.verifyBackupCode({ body: { code: backupCodes[0] }, headers: { cookie: locked.cookie } })).rejects.toMatchObject({ status: "TOO_MANY_REQUESTS" });
  });
});

describe("other sessions", () => {
  const extraSession = async (email: string) => (await signIn(email)).cookie;

  it("ends the other sessions when Two-factor is turned on and keeps the one that enrolled", async () => {
    const email = await seedLogin("revoke-on");
    await extraSession(email);
    const { cookie } = await signIn(email);
    expect(await sessionsOf("revoke-on")).toBe(2);

    const enabled = await auth().api.enableTwoFactor({ body: { password: PASSWORD }, headers: { cookie } });
    const done = await auth().api.verifyTOTP({ body: { code: await codeNow(secretOf(enabled.totpURI)) }, headers: { cookie }, returnHeaders: true });

    expect(await sessionsOf("revoke-on")).toBe(1);
    const kept = cookiesOf(done.headers);
    await expect(auth().api.getSession({ headers: { cookie: kept } })).resolves.toMatchObject({ user: { id: "revoke-on" } });
  });

  it("does not end other sessions when a sign-in completes its second step", async () => {
    const email = await seedLogin("revoke-not");
    const { secret, cookie } = await enrol(email);
    expect(cookie).not.toBe("");
    const before = await sessionsOf("revoke-not");

    const challenge = await challengeOf(email);
    await auth().api.verifyTOTP({ body: { code: await codeNow(secret) }, headers: { cookie: challenge.cookie } });

    expect(await sessionsOf("revoke-not")).toBe(before + 1);
  });

  it("ends the other sessions when Backup codes are regenerated, and voids the old ten", async () => {
    const email = await seedLogin("revoke-regen");
    const { cookie, backupCodes } = await enrol(email);
    const challenge = await challengeOf(email);
    await auth().api.verifyBackupCode({ body: { code: backupCodes[0] }, headers: { cookie: challenge.cookie } });
    expect(await sessionsOf("revoke-regen")).toBe(2);

    const fresh = await auth().api.generateBackupCodes({ body: { password: PASSWORD }, headers: { cookie } });

    expect(fresh.backupCodes).toHaveLength(10);
    expect(await sessionsOf("revoke-regen")).toBe(1);
    const next = await challengeOf(email);
    await expect(auth().api.verifyBackupCode({ body: { code: backupCodes[1] }, headers: { cookie: next.cookie } })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });

  it("refuses to regenerate Backup codes without the password", async () => {
    const email = await seedLogin("regen-pw");
    const { cookie } = await enrol(email);
    await expect(auth().api.generateBackupCodes({ body: { password: "not-the-password" }, headers: { cookie } })).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });

  it("ends the other sessions when Two-factor is turned off, which needs the password and a code", async () => {
    const email = await seedLogin("disable");
    const { cookie, secret, backupCodes } = await enrol(email);
    await extraSession(email);

    await expect(auth().api.disableTwoFactor({ body: withCode({ password: PASSWORD }), headers: { cookie } })).rejects.toMatchObject({ status: "BAD_REQUEST" });
    await expect(auth().api.disableTwoFactor({ body: withCode({ password: PASSWORD, code: "000000" }), headers: { cookie } })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
    await expect(auth().api.disableTwoFactor({ body: withCode({ password: "not-the-password", code: await codeNow(secret) }), headers: { cookie } })).rejects.toMatchObject({ status: "BAD_REQUEST" });
    expect(await flagOf("disable")).toBe(true);

    await auth().api.disableTwoFactor({ body: withCode({ password: PASSWORD, code: await codeNow(secret) }), headers: { cookie } });

    expect(await flagOf("disable")).toBe(false);
    expect(await sessionsOf("disable")).toBe(1);
    expect(backupCodes).toHaveLength(10);
    expect((await challengeOf(email)).redirect).toBe(false);
  });

  it("refuses to turn Two-factor off while the Account requires it, and allows it once the requirement is lifted", async () => {
    const email = await seedLogin("disable-required");
    const { cookie, secret } = await enrol(email);
    const [tenant] = await db.raw.select({ id: tenants.id, partyId: tenants.partyId }).from(tenants).where(eq(tenants.slug, "acct-disable-required"));
    await ensureTenantRoles(db.raw, tenant.id);
    const role = await findTenantRole(db.raw, tenant.id, "workspace_member");
    if (!role) throw new Error("workspace_member role missing");
    await db.raw.insert(partyRoles).values({ partyId: tenant.partyId, tenantId: tenant.id, roleId: role.id, roleScope: "tenant" });
    await db.raw.update(tenants).set({ twoFactorRequired: true }).where(eq(tenants.id, tenant.id));

    await expect(auth().api.disableTwoFactor({ body: withCode({ password: PASSWORD, code: await codeNow(secret) }), headers: { cookie } })).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(await flagOf("disable-required")).toBe(true);

    await db.raw.update(tenants).set({ twoFactorRequired: false }).where(eq(tenants.id, tenant.id));
    await auth().api.disableTwoFactor({ body: withCode({ password: PASSWORD, code: await codeNow(secret) }), headers: { cookie } });

    expect(await flagOf("disable-required")).toBe(false);
  });

  it("accepts a Backup code in place of an Authenticator code to turn Two-factor off", async () => {
    const email = await seedLogin("disable-backup");
    const { cookie, backupCodes } = await enrol(email);

    await auth().api.disableTwoFactor({ body: withCode({ password: PASSWORD, code: backupCodes[0] }), headers: { cookie } });

    expect(await flagOf("disable-backup")).toBe(false);
  });
});

describe("a password reset", () => {
  it("leaves Two-factor on, so the next sign-in still has a challenge", async () => {
    const email = await seedLogin("reset");
    await enrol(email);
    queued.length = 0;

    await auth().api.requestPasswordReset({ body: { email } });
    const mail = queued.find((entry) => entry.kind === "password-reset");
    const token = new URL(mail?.kind === "password-reset" ? mail.link : "http://none").searchParams.get("token") ?? "";
    await auth().api.resetPassword({ body: { token, newPassword: "new-password-22" } });

    expect(await flagOf("reset")).toBe(true);
    const { response } = await (async () => {
      const result = await auth().api.signInEmail({ body: { email, password: "new-password-22" }, returnHeaders: true });
      return result;
    })();
    expect("twoFactorRedirect" in response && response.twoFactorRedirect).toBe(true);
  });
});
