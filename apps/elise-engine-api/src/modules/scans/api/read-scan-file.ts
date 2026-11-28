import { Effect } from "effect";
import { Hono } from "hono";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import type { AppEnv } from "#/types/variables";
import { scanReads } from "#/modules/scan-ledger";
import { unsealerEffect } from "#/modules/sealed-data";
import { readScanFileSvc } from "#/modules/scans/handlers";
import { readScanFileDoc } from "#/modules/scans/openapi";
import { AccountHeaderSchema, ScanFileParamSchema } from "#/modules/scans/schemas";
import { scanFileHeaders } from "#/modules/scans/utils";

const app = new Hono<AppEnv>();

app.get(
  "/:scanId/files/:file",
  readScanFileDoc,
  zValidator("header", AccountHeaderSchema),
  zValidator("param", ScanFileParamSchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { scanId, file } = c.req.valid("param");
    const { body, contentType } = await c
      .get("deps")
      .withTenant(c, accountId, (db) =>
        runEffect(
          Effect.flatMap(unsealerEffect(db, c.env.DATA_MASTER_KEY, accountId), (unsealer) =>
            readScanFileSvc(c.env.REPORTS, scanReads(db, c.env.DATA_MASTER_KEY), accountId, scanId, file, unsealer),
          ),
        ),
      );
    return new Response(body, { headers: scanFileHeaders(file, contentType) });
  },
);

export default app;
