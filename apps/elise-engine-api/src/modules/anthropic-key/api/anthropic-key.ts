import { Hono, type Context } from "hono";
import { SetAnthropicKeyBodySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { requirePower, userIdOf } from "#/lib/require-power";
import { tenantEffectOf } from "#/lib/tenant-effect";
import { zValidator } from "#/lib/zod-validator";
import { getAnthropicKeySvc, removeAnthropicKeySvc, setAnthropicKeySvc } from "#/modules/anthropic-key/handlers";
import { getAnthropicKeyDoc, removeAnthropicKeyDoc, setAnthropicKeyDoc } from "#/modules/anthropic-key/openapi";
import { checkAnthropicKey } from "#/modules/anthropic-key/utils";
import { enqueueEmailsQuietly } from "#/modules/email";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import { noticeAudienceEffect } from "#/modules/usage";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

const notifyKeyChange = async (c: Context<AppEnv>, accountId: string, userId: string, change: "set" | "removed") => {
  const deps = c.get("deps");
  const audience = await runEffect(tenantEffectOf(c, accountId)((db) => noticeAudienceEffect(db, accountId, userId, "company:usage:anthropic_key:update")));
  const changedAt = new Date().toISOString();
  const link = `${c.env.DASHBOARD_URL.replace(/\/+$/, "")}/settings/providers`;
  await enqueueEmailsQuietly(
    (mail) => deps.enqueueEmail(c.env, mail),
    audience.recipients.map((to) => ({ kind: "anthropic-key-changed", to, change, accountName: audience.accountName, actorName: audience.actorName, changedAt, link })),
  );
};

app.get("/", getAnthropicKeyDoc, zValidator("header", AccountHeaderSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(getAnthropicKeySvc(db, accountId)));
  return c.json({ data, error: null });
});

app.put("/", setAnthropicKeyDoc, requirePower("company:usage:anthropic_key:update"), zValidator("header", AccountHeaderSchema), zValidator("json", SetAnthropicKeyBodySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { apiKey } = c.req.valid("json");
  const userId = userIdOf(c);
  const data = await runEffect(setAnthropicKeySvc(c.env.KEY_ENCRYPTION_SECRET, tenantEffectOf(c, accountId), checkAnthropicKey, accountId, userId, apiKey));
  await notifyKeyChange(c, accountId, userId, "set");
  return c.json({ data, error: null });
});

app.delete("/", removeAnthropicKeyDoc, requirePower("company:usage:anthropic_key:update"), zValidator("header", AccountHeaderSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const userId = userIdOf(c);
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(removeAnthropicKeySvc(db, accountId, userId)));
  await notifyKeyChange(c, accountId, userId, "removed");
  return c.json({ data, error: null });
});

export default app;
