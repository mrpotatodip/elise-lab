import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Data, Effect } from "effect";
import { scanRepos, tenantProjects } from "@repo/db-elise";
import { PROJECT_LIMIT_PER_TENANT, type Project, type ProjectDeleted, type ProjectList, type RepoProject } from "@repo/contracts/elise";
import type { AppDbType, AppTxDbType } from "#/lib/db-connection";
import { Conflict, DbError, Forbidden, NotFound, toDbError } from "#/lib/effect-query";
import { PG_UNIQUE_VIOLATION, pgErrorCode, pgErrorConstraint } from "#/lib/pg-error";
import { actorPartyOf, insertAuditEntry } from "#/modules/audit-trail";
import { PROJECT_LIMIT_REACHED, PROJECT_NAME_CONSTRAINT, PROJECT_NAME_TAKEN, PROJECT_NOT_FOUND, PROJECT_REPO_NOT_FOUND } from "#/modules/projects/constants";
import type { ProjectFailure } from "#/modules/projects/types";

class Refused extends Data.TaggedError("Refused")<{ failure: Conflict | Forbidden | NotFound }> {}

const refuse = (failure: Conflict | Forbidden | NotFound): never => {
  throw new Refused({ failure });
};

const classify = (cause: unknown): ProjectFailure => {
  if (cause instanceof Refused) return cause.failure;
  if (pgErrorCode(cause) === PG_UNIQUE_VIOLATION && pgErrorConstraint(cause) === PROJECT_NAME_CONSTRAINT) return new Conflict({ message: PROJECT_NAME_TAKEN });
  return toDbError(cause);
};

const toProject = (row: typeof tenantProjects.$inferSelect): Project => ({ id: row.id, name: row.name, createdAt: row.createdAt.toISOString() });

export const listProjectsEffect = (db: AppDbType, tenantId: string): Effect.Effect<ProjectList, DbError> =>
  Effect.tryPromise({
    try: () => db.select().from(tenantProjects).where(eq(tenantProjects.tenantId, tenantId)).orderBy(asc(tenantProjects.name)),
    catch: toDbError,
  }).pipe(Effect.map((rows) => rows.map(toProject)));

const projectOf = async (tx: Pick<AppDbType, "select">, tenantId: string, projectId: string) => {
  const [project] = await tx
    .select()
    .from(tenantProjects)
    .where(and(eq(tenantProjects.id, projectId), eq(tenantProjects.tenantId, tenantId)));
  return project ?? refuse(new NotFound({ message: PROJECT_NOT_FOUND }));
};

const actorOf = async (tx: Pick<AppDbType, "select">, userId: string) =>
  (await actorPartyOf(tx, userId)) ?? refuse(new Forbidden({ message: "Forbidden" }));

export const createProjectEffect = (db: AppTxDbType, tenantId: string, userId: string, name: string): Effect.Effect<Project, ProjectFailure> =>
  Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        const actorPartyId = await actorOf(tx, userId);
        const [{ total }] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(tenantProjects)
          .where(eq(tenantProjects.tenantId, tenantId));
        if (total >= PROJECT_LIMIT_PER_TENANT) return refuse(new Conflict({ message: PROJECT_LIMIT_REACHED }));
        const [row] = await tx.insert(tenantProjects).values({ tenantId, name }).returning();
        await insertAuditEntry(tx, { actorPartyId, action: "project.created", subjectId: row.id, tenantId, after: { name } });
        return toProject(row);
      }),
    catch: classify,
  });

export const renameProjectEffect = (db: AppTxDbType, tenantId: string, userId: string, projectId: string, name: string): Effect.Effect<Project, ProjectFailure> =>
  Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        const actorPartyId = await actorOf(tx, userId);
        const before = await projectOf(tx, tenantId, projectId);
        const [row] = await tx.update(tenantProjects).set({ name }).where(eq(tenantProjects.id, projectId)).returning();
        await insertAuditEntry(tx, { actorPartyId, action: "project.renamed", subjectId: projectId, tenantId, before: { name: before.name }, after: { name } });
        return toProject(row);
      }),
    catch: classify,
  });

export const deleteProjectEffect = (db: AppTxDbType, tenantId: string, userId: string, projectId: string): Effect.Effect<ProjectDeleted, ProjectFailure> =>
  Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        const actorPartyId = await actorOf(tx, userId);
        const project = await projectOf(tx, tenantId, projectId);
        await tx.delete(tenantProjects).where(eq(tenantProjects.id, projectId));
        await insertAuditEntry(tx, { actorPartyId, action: "project.deleted", subjectId: projectId, tenantId, before: { name: project.name } });
        return { id: projectId };
      }),
    catch: classify,
  });

export const moveRepoEffect = (db: AppTxDbType, tenantId: string, userId: string, repoId: string, projectId: string | null): Effect.Effect<RepoProject, ProjectFailure> =>
  Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        const actorPartyId = await actorOf(tx, userId);
        const [repo] = await tx
          .select({ projectId: scanRepos.projectId })
          .from(scanRepos)
          .where(and(eq(scanRepos.id, repoId), eq(scanRepos.tenantId, tenantId), isNull(scanRepos.removedAt)));
        if (!repo) return refuse(new NotFound({ message: PROJECT_REPO_NOT_FOUND }));
        if (projectId !== null) await projectOf(tx, tenantId, projectId);
        await tx.update(scanRepos).set({ projectId }).where(eq(scanRepos.id, repoId));
        await insertAuditEntry(tx, {
          actorPartyId,
          action: "repo.project.moved",
          subjectId: repoId,
          tenantId,
          before: { projectId: repo.projectId },
          after: { projectId },
        });
        return { repoId, projectId };
      }),
    catch: classify,
  });
