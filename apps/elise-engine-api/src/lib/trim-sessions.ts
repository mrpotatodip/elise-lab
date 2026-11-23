import { desc, eq, inArray } from "drizzle-orm";
import { authSession } from "@repo/db-elise/schema";
import type { PoolDbType } from "#/lib/db-connection";

export const trimSessions = async (db: PoolDbType, userId: string, keep: number) => {
  const rows = await db
    .select({ id: authSession.id })
    .from(authSession)
    .where(eq(authSession.userId, userId))
    .orderBy(desc(authSession.createdAt), desc(authSession.id));
  const stale = rows.slice(keep).map((row) => row.id);
  if (stale.length === 0) return;
  await db.delete(authSession).where(inArray(authSession.id, stale));
};
