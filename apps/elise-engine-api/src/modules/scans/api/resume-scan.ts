import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { tenantEffectOf } from "#/lib/tenant-effect";
import { zValidator } from "#/lib/zod-validator";
import type { AppEnv } from "#/types/variables";
import { submitResumeSvc } from "#/modules/scans/handlers";
import { resumeScanDoc } from "#/modules/scans/openapi";
import { AccountHeaderSchema, ScanIdParamSchema } from "#/modules/scans/schemas";

const app = new Hono<AppEnv>();

app.post(
  "/:scanId/resume",
  resumeScanDoc,
  zValidator("header", AccountHeaderSchema),
  zValidator("param", ScanIdParamSchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { scanId } = c.req.valid("param");
    const data = await runEffect(
      submitResumeSvc(c.env, tenantEffectOf(c, accountId), c.get("deps"), accountId, scanId),
    );
    return c.json({ data, error: null }, 201);
  },
);

export default app;
