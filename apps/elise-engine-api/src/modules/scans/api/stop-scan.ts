import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import type { AppEnv } from "#/types/variables";
import { stopScanSvc } from "#/modules/scans/handlers";
import { stopScanDoc } from "#/modules/scans/openapi";
import { AccountHeaderSchema, ScanIdParamSchema } from "#/modules/scans/schemas";

const app = new Hono<AppEnv>();

app.post(
  "/:scanId/stop",
  stopScanDoc,
  zValidator("header", AccountHeaderSchema),
  zValidator("param", ScanIdParamSchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { scanId } = c.req.valid("param");
    const data = await c
      .get("deps")
      .withTenant(c, accountId, (db) =>
        runEffect(stopScanSvc(db, accountId, scanId, new Date(), (id) => c.get("deps").teardownScan(c.env, id))),
      );
    return c.json({ data, error: null });
  },
);

export default app;
