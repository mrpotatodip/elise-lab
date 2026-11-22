import { describe, expect, it } from "vitest";
import { verifyTurnstileToken } from "#/modules/sign-up/lib";

const siteverify = (answer: Response | Error) => {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), body: new URLSearchParams(String(init?.body)) });
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { fetcher, calls };
};

type SiteverifyBody = { success?: boolean; "error-codes"?: string[] };

const reply = (body: SiteverifyBody, status = 200) => new Response(JSON.stringify(body), { status });

describe("verifyTurnstileToken", () => {
  it("passes a token that Siteverify accepts, and sends the secret, the token and the IP", async () => {
    const { fetcher, calls } = siteverify(reply({ success: true }));

    expect(await verifyTurnstileToken({ secret: "s3cret", token: "tok", ip: "203.0.113.9", fetcher })).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(Object.fromEntries(calls[0].body)).toEqual({ secret: "s3cret", response: "tok", remoteip: "203.0.113.9" });
  });

  it("refuses a token that Siteverify rejects", async () => {
    const { fetcher } = siteverify(reply({ success: false, "error-codes": ["invalid-input-response"] }));

    expect(await verifyTurnstileToken({ secret: "s3cret", token: "tok", ip: undefined, fetcher })).toBe(false);
  });

  it.each([
    ["no secret", undefined, "tok"],
    ["an empty secret", "", "tok"],
    ["no token", "s3cret", undefined],
    ["an empty token", "s3cret", ""],
    ["a token over the limit", "s3cret", "x".repeat(2049)],
  ])("refuses %s without asking Siteverify", async (_name, secret, token) => {
    const { fetcher, calls } = siteverify(reply({ success: true }));

    expect(await verifyTurnstileToken({ secret, token, ip: undefined, fetcher })).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["a network error", new Error("down")],
    ["a 500 answer", reply({ success: true }, 500)],
    ["an answer that is not JSON", new Response("<html>", { status: 200 })],
    ["an answer without success", reply({})],
  ])("fails closed on %s", async (_name, answer) => {
    const { fetcher } = siteverify(answer);

    expect(await verifyTurnstileToken({ secret: "s3cret", token: "tok", ip: undefined, fetcher })).toBe(false);
  });
});
