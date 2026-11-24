import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { tenantEffectOf } from "#/lib/tenant-effect";
import { zValidator } from "#/lib/zod-validator";
import type { AppEnv } from "#/types/variables";
import { submitScanSvc } from "#/modules/scans/handlers";
import { createScanDoc } from "#/modules/scans/openapi";
import { AccountHeaderSchema, CreateScanBodySchema } from "#/modules/scans/schemas";

const app = new Hono<AppEnv>();

app.post(
  "/",
  createScanDoc,
  zValidator("header", AccountHeaderSchema),
  zValidator("json", CreateScanBodySchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const body = c.req.valid("json");
    const data = await runEffect(submitScanSvc(c.env, tenantEffectOf(c, accountId), c.get("deps"), accountId, body));
    return c.json({ data, error: null }, 201);
  },
);

export default app;
