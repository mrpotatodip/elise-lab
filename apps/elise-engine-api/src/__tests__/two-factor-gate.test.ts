import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildApp } from "#/index";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "./fake-bindings";
import { testDeps } from "./test-deps";

const ACCOUNT = "0b8c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4";

let setupRequired = false;
let checks = 0;

const app = buildApp(
  testDeps({
    sessionUserId: async () => "admin",
    twoFactorSetupRequired: async () => {
      checks += 1;
      return setupRequired;
    },
  }),
).app;

beforeEach(() => {
  setupRequired = false;
  checks = 0;
});

const call = (path: string, headers: Record<string, string>, method = "GET") => {
  const { env } = fakeBindings();
  return app.fetch(new Request(`http://localhost${path}`, { method, headers }), env, testExecutionContext);
};

const SESSION = { cookie: "session=abc", "x-account-id": ACCOUNT };

const ErrorBody = z.object({ error: z.object({ code: z.string() }).nullable().optional() });

const codeOf = async (res: Response) => ErrorBody.parse(await res.json()).error?.code;

describe("an admin session with no Two-factor", () => {
  it.each(["/repos", "/scans", "/usage", "/team", "/groups", "/files", "/findings", "/runners"])(
    "is refused on %s",
    async (path) => {
      setupRequired = true;
      const res = await call(path, SESSION);

      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe("TWO_FACTOR_SETUP_REQUIRED");
    },
  );

  it.each(["/auth/device/approve", "/stripe/checkout", "/stripe/portal", "/auth/two-factor/disable"])(
    "is refused on %s",
    async (path) => {
      setupRequired = true;
      const res = await call(path, SESSION, "POST");

      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe("TWO_FACTOR_SETUP_REQUIRED");
    },
  );

  it.each([
    "/me",
    "/auth/two-factor/enable",
    "/auth/two-factor/verify-totp",
    "/auth/sign-out",
    "/sign-up",
    "/stripe/webhook",
  ])("may still reach %s", async (path) => {
    setupRequired = true;
    const res = await call(path, SESSION, path === "/me" ? "GET" : "POST");

    expect(await codeOf(res)).not.toBe("TWO_FACTOR_SETUP_REQUIRED");
  });

  it("is let through once the Login has Two-factor", async () => {
    const res = await call("/repos", SESSION);

    expect(await codeOf(res)).not.toBe("TWO_FACTOR_SETUP_REQUIRED");
  });
});

describe("the service token", () => {
  it("is not asked about Two-factor", async () => {
    setupRequired = true;
    const res = await call("/repos", { authorization: `Bearer ${TEST_TOKEN}`, "x-account-id": ACCOUNT });

    expect(await codeOf(res)).not.toBe("TWO_FACTOR_SETUP_REQUIRED");
    expect(checks).toBe(0);
  });
});
