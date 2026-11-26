import { z } from "zod";
import { SIGN_UP_TURNSTILE_TOKEN_MAX } from "@repo/contracts/elise";
import { TURNSTILE_SITEVERIFY_TIMEOUT_MS, TURNSTILE_SITEVERIFY_URL } from "#/modules/sign-up/constants";

const SiteverifySchema = z.object({ success: z.boolean() });

type VerifyInput = {
  secret: string | undefined;
  token: string | undefined;
  ip: string | undefined;
  fetcher?: typeof fetch;
};

export const verifyTurnstileToken = async ({ secret, token, ip, fetcher = fetch }: VerifyInput): Promise<boolean> => {
  if (!secret || !token || token.length > SIGN_UP_TURNSTILE_TOKEN_MAX) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  const answer = await fetcher(TURNSTILE_SITEVERIFY_URL, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(TURNSTILE_SITEVERIFY_TIMEOUT_MS),
  })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  return SiteverifySchema.safeParse(answer).data?.success === true;
};
