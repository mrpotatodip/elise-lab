import { describe, expect, it } from "vitest";
import { buildApp } from "#/index";
import { fakeBindings, testExecutionContext } from "#/__tests__/fake-bindings";
import { testDeps } from "#/__tests__/test-deps";
import { SIGN_UP_REFUSED } from "#/modules/sign-up/constants";
import type { Bindings } from "#/types/variables";

const body = { firstName: "Ada", lastName: "Rossi", email: "ada@example.com", password: "correct-horse-battery", accountName: "Acme Labs", timezone: "Europe/Rome", turnstileToken: "tok" };

type Payload = Omit<typeof body, "turnstileToken"> & { turnstileToken?: string };

const signUp = (verify: (token: string | undefined) => boolean, env: Bindings, payload: Payload = body) => {
  const seen: (string | undefined)[] = [];
  const { app } = buildApp(
    testDeps({
      verifyTurnstile: async (_env, token) => {
        seen.push(token);
        return verify(token);
      },
    }),
  );
  const res = app.fetch(new Request("http://localhost/sign-up", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), env, testExecutionContext);
  return { res, seen };
};

const limiter = (success: boolean) => ({ limit: async () => ({ success }) });

describe("POST /sign-up with Turnstile", () => {
  it("refuses a failed check with the one generic refusal, before any database work", async () => {
    const { env } = fakeBindings({ DATABASE_URL: "postgres://unreachable.invalid/none" });
    const { res, seen } = signUp(() => false, env);

    const answer = await res;
    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({ data: null, error: { code: "CONFLICT", message: SIGN_UP_REFUSED } });
    expect(seen).toEqual(["tok"]);
  });

  it("refuses a body with no token the same way", async () => {
    const { env } = fakeBindings();
    const { turnstileToken: _dropped, ...withoutToken } = body;
    const { res, seen } = signUp((token) => token !== undefined, env, withoutToken);

    const answer = await res;
    expect(answer.status).toBe(409);
    expect(await answer.json()).toMatchObject({ error: { message: SIGN_UP_REFUSED } });
    expect(seen).toEqual([undefined]);
  });

  it("answers 429 before it checks the token when a limit is spent", async () => {
    const { env } = fakeBindings({ SIGN_UP_TOTAL_LIMITER: limiter(false) });
    const { res, seen } = signUp(() => false, env);

    expect((await res).status).toBe(429);
    expect(seen).toEqual([]);
  });
});
