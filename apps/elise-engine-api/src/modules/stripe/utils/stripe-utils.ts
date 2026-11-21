import type { SubscriptionStatusValue } from "@repo/contracts/elise";
import { STRIPE_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS } from "#/modules/stripe/constants";

export const subscriptionStatusOf = (stripeStatus: string): SubscriptionStatusValue => {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "incomplete";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "unpaid";
  }
};

const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export const stripeSignatureValid = async (rawBody: string, header: string | undefined, secret: string, nowSeconds: number): Promise<boolean> => {
  if (!header || !secret) return false;
  const parts = header.split(",").map((part) => ({ key: part.slice(0, part.indexOf("=")), value: part.slice(part.indexOf("=") + 1) }));
  const timestamp = parts.find(({ key }) => key === "t")?.value;
  const signatures = parts.filter(({ key, value }) => key === "v1" && value).map(({ value }) => value);
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > STRIPE_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  return signatures.some((signature) => sameText(signature, expected));
};
