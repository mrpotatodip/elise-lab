import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { RepoParamSchema, UPLOAD_ARCHIVE_MAX_MB, UploadArchiveParamSchema, UploadArchiveQuerySchema } from "@repo/contracts/elise";
import { runEffect } from "#/lib/effect-query";
import { PayloadTooLargeError } from "#/lib/errors";
import { ARCHIVE_TOO_LARGE, MB } from "#/modules/archives/constants";
import { zValidator } from "#/lib/zod-validator";
import { listArchivesSvc, removeArchiveSvc, removeUploadAppSvc, uploadArchiveSvc } from "#/modules/archives/handlers";
import { listArchivesDoc, removeArchiveDoc, removeUploadAppDoc, uploadArchiveDoc } from "#/modules/archives/openapi";
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
  bodyLimit({
    maxSize: UPLOAD_ARCHIVE_MAX_MB * MB,
    onError: () => {
      throw new PayloadTooLargeError(ARCHIVE_TOO_LARGE);
    },
  }),
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

app.delete("/:repoId", removeUploadAppDoc, zValidator("header", AccountHeaderSchema), zValidator("param", RepoParamSchema), async (c) => {
  const { "x-account-id": accountId } = c.req.valid("header");
  const { repoId } = c.req.valid("param");
  const data = await c.get("deps").withTenant(c, accountId, (db) => runEffect(removeUploadAppSvc(db, c.env.REPORTS, accountId, repoId)));
  return c.json({ data, error: null });
});

export default app;
