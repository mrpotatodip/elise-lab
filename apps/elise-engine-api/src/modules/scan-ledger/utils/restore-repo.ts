import { and, isNotNull, sql, type SQL } from "drizzle-orm";
import { REPO_LIMIT_PER_TENANT } from "@repo/contracts/elise";
import { scanRepos } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";

export const REPO_LIMIT_MESSAGE = `An account can have at most ${REPO_LIMIT_PER_TENANT} repos`;

export const restoreRemovedRepo = async (
  db: Pick<AppDbType, "update">,
  accountId: string,
  repoWhere: SQL | undefined,
): Promise<string | null> => {
  const live = sql`(select count(*) from scan_repos where tenant_id = ${accountId} and removed_at is null) < ${REPO_LIMIT_PER_TENANT}`;
  const [row] = await db
    .update(scanRepos)
    .set({ removedAt: null, projectId: null })
    .where(and(repoWhere, isNotNull(scanRepos.removedAt), live))
    .returning({ id: scanRepos.id });
  return row?.id ?? null;
};
