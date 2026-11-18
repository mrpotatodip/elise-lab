import { Hono } from "hono";
import { RepoParamSchema, UploadArchiveParamSchema, UploadArchiveQuerySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { zValidator } from "#/lib/zod-validator";
import { listArchivesSvc, removeArchiveSvc, uploadArchiveSvc } from "#/modules/archives/handlers";
import { listArchivesDoc, removeArchiveDoc, uploadArchiveDoc } from "#/modules/archives/openapi";
import { AccountHeaderSchema } from "#/modules/scans/schemas";
import type { AppEnv } from "#/types/variables";

const app = new Hono<AppEnv>();

app.get("/:repoId/archives", listArchivesDoc, zValidator("header", AccountHeaderSchema), zValidator("param", RepoParamSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { repoId } = c.req.valid("param");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(listArchivesSvc(db, accountId, repoId)));
  return c.json({ data, error: null });
});

app.post(
  "/:repoId/archives",
  uploadArchiveDoc,
  zValidator("header", AccountHeaderSchema),
  zValidator("param", RepoParamSchema),
  zValidator("query", UploadArchiveQuerySchema),
  async (c) => {
    const { "x-account-id": accountId } = c.req.valid("header");
    const { repoId } = c.req.valid("param");
    const { label } = c.req.valid("query");
    const bytes = await c.req.arrayBuffer();
    const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(uploadArchiveSvc(db, c.env.REPORTS, accountId, repoId, label, bytes)));
    return c.json({ data, error: null }, 201);
  },
);

app.delete("/:repoId/archives/:archiveId", removeArchiveDoc, zValidator("header", AccountHeaderSchema), zValidator("param", UploadArchiveParamSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { repoId, archiveId } = c.req.valid("param");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(removeArchiveSvc(db, c.env.REPORTS, accountId, repoId, archiveId)));
  return c.json({ data, error: null });
});

export default app;
