import { Hono } from "hono";
import { FilesQuerySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { listFilesSvc } from "#/modules/files/handlers";
import { listFilesDoc } from "#/modules/files/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/", listFilesDoc, zValidator("header", AccountHeaderSchema), zValidator("query", FilesQuerySchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(listFilesSvc(db, accountId, c.req.valid("query"))));
  return c.json({ data, error: null });
});

export default app;
