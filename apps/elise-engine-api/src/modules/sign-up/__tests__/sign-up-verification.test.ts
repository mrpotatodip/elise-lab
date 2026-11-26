import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authUser } from "@repo/db-elise/schema";
import { buildApp } from "#/index";
import { fakeBindings, testExecutionContext } from "#/__tests__/fake-bindings";
import { testDeps } from "#/__tests__/test-deps";
import { openTestDb, type TestDb } from "#/__tests__/test-db";
import type { QueuedEmail } from "#/modules/email";

let test: TestDb;

const body = {
  firstName: "Ada",
  lastName: "Rossi",
  email: "ada@example.com",
  password: "correct-horse-battery",
  accountName: "Acme Labs",
  timezone: "Europe/Rome",
  turnstileToken: "tok",
};

const signUpWith = (enqueue: (mail: QueuedEmail) => Promise<void>, payload = body) => {
  const { app } = buildApp(
    testDeps({ enqueueEmail: async (_env, mail) => enqueue(mail), withOwner: (_c, run) => run(test.pool) }),
  );
  const { env } = fakeBindings();
  return app.fetch(
    new Request("http://localhost/sign-up", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    env,
    testExecutionContext,
  );
};

beforeAll(async () => {
  test = await openTestDb();
});

afterAll(async () => {
  await test.close();
});

describe("POST /sign-up and the Verification email", () => {
  it("creates an unverified Login, queues one verify-email with a 24 hour link and sets no session", async () => {
    const queued: QueuedEmail[] = [];
    const before = Date.now();
    const res = await signUpWith(async (mail) => {
      queued.push(mail);
    });

    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toBeNull();
    const [login] = await test.raw.select().from(authUser).where(eq(authUser.email, "ada@example.com"));
    expect(login?.emailVerified).toBe(false);
    expect(queued).toHaveLength(1);
    const mail = queued[0];
    expect(mail).toMatchObject({ kind: "verify-email", to: "ada@example.com" });
    expect(mail?.kind === "verify-email" && mail.link.startsWith("https://app.example.com/verify-email?token=")).toBe(
      true,
    );
    expect(mail?.kind === "verify-email" && Date.parse(mail.expiresAt) - before).toBeGreaterThan(23.9 * 3600 * 1000);
  });

  it("still answers 201 and keeps the Account when the queue is down", async () => {
    const res = await signUpWith(
      async () => {
        throw new Error("queue down");
      },
      { ...body, email: "bo@example.com", accountName: "Bo Co" },
    );

    expect(res.status).toBe(201);
    expect(await test.raw.select().from(authUser).where(eq(authUser.email, "bo@example.com"))).toHaveLength(1);
  });
});
