import { afterEach, describe, expect, it, vi } from "vitest";
import { stripeGateway } from "#/modules/stripe/lib";

const sentForm = async (brandingFileId?: string) => {
  const bodies: string[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    bodies.push(init.body);
    return Response.json({ url: "https://checkout.stripe.test/x" });
  });
  await stripeGateway("sk_test", brandingFileId).createCheckoutSession({
    customerId: "cus_1",
    accountId: "acc_1",
    priceId: "price_1",
    successUrl: "https://app.test/ok",
    cancelUrl: "https://app.test/no",
  });
  return new URLSearchParams(bodies[0]);
};

describe("Checkout Session branding", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the display name, icon and logo when a file id is configured", async () => {
    const form = await sentForm("file_brand");
    expect(Object.fromEntries([...form].filter(([key]) => key.startsWith("branding_settings")))).toEqual({
      "branding_settings[display_name]": "EliseLAB",
      "branding_settings[icon][type]": "file",
      "branding_settings[icon][file]": "file_brand",
      "branding_settings[logo][type]": "file",
      "branding_settings[logo][file]": "file_brand",
    });
  });

  it("sends the display name only when no file id is configured", async () => {
    const form = await sentForm();
    expect(Object.fromEntries([...form].filter(([key]) => key.startsWith("branding_settings")))).toEqual({ "branding_settings[display_name]": "EliseLAB" });
  });
});
