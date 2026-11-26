import type { Effect } from "effect";
import type { Project, ProjectDeleted, ProjectList, RepoProject } from "@repo/contracts/elise";
import type { AppDbType, AppTxDbType } from "#/lib/db-connection";
import type { DbError } from "#/lib/effect-query";
import { createProjectEffect, deleteProjectEffect, listProjectsEffect, moveRepoEffect, renameProjectEffect } from "#/modules/projects/queries";
import type { ProjectFailure } from "#/modules/projects/types";

export const listProjectsSvc = (db: AppDbType, accountId: string): Effect.Effect<ProjectList, DbError> => listProjectsEffect(db, accountId);

export const createProjectSvc = (db: AppTxDbType, accountId: string, userId: string, name: string): Effect.Effect<Project, ProjectFailure> =>
  createProjectEffect(db, accountId, userId, name);

export const renameProjectSvc = (db: AppTxDbType, accountId: string, userId: string, projectId: string, name: string): Effect.Effect<Project, ProjectFailure> =>
  renameProjectEffect(db, accountId, userId, projectId, name);

export const deleteProjectSvc = (db: AppTxDbType, accountId: string, userId: string, projectId: string): Effect.Effect<ProjectDeleted, ProjectFailure> =>
  deleteProjectEffect(db, accountId, userId, projectId);

export const moveRepoSvc = (db: AppTxDbType, accountId: string, userId: string, repoId: string, projectId: string | null): Effect.Effect<RepoProject, ProjectFailure> =>
  moveRepoEffect(db, accountId, userId, repoId, projectId);
