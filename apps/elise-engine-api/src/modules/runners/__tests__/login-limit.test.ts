import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { ForbiddenError } from "#/lib/errors";
import { RUNNER_LOGIN_LIMITED } from "#/modules/runners/constants";
import { requireLoginStartLimit, requireLoginStartTotalLimit } from "#/modules/runners/lib";
import type { AppEnv, Bindings } from "#/types/variables";

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

const startApp = () => {
  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    if (err instanceof ForbiddenError) return c.json({ data: null, error: { message: err.message } }, 403);
    throw err;
  });
  app.post("/login/start", requireLoginStartLimit, requireLoginStartTotalLimit, (c) =>
    c.json({ data: { started: true }, error: null }),
  );
  return app;
};

const starts = async (env: Partial<Bindings>, ips: string[]) => {
  const app = startApp();
  const answers: { status: number; body: string }[] = [];
  for (const ip of ips) {
    const res = await app.request("/login/start", { method: "POST", headers: { "cf-connecting-ip": ip } }, env);
    answers.push({ status: res.status, body: await res.text() });
  }
  return answers;
};

describe("the login start limits", () => {
  it("refuse one address past its cap with 403 and let another address through", async () => {
    const env = {
      RUNNER_LOGIN_START_LIMITER: countingLimiter(5),
      RUNNER_LOGIN_START_TOTAL_LIMITER: countingLimiter(100),
    };
    const answers = await starts(env, [...Array(7).fill("203.0.113.1"), "203.0.113.2"]);

    expect(answers.map((a) => a.status)).toEqual([200, 200, 200, 200, 200, 403, 403, 200]);
    expect(answers[5]?.body).toContain(RUNNER_LOGIN_LIMITED);
  });

  it("refuse starts from many addresses past the total", async () => {
    const env = {
      RUNNER_LOGIN_START_LIMITER: countingLimiter(5),
      RUNNER_LOGIN_START_TOTAL_LIMITER: countingLimiter(30),
    };
    const answers = await starts(
      env,
      Array.from({ length: 40 }, (_, i) => `203.0.113.${i}`),
    );

    expect(answers.filter((a) => a.status === 200)).toHaveLength(30);
    expect(answers.filter((a) => a.status === 403)).toHaveLength(10);
  });
});
