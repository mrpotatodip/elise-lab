import { desc, eq, inArray } from "drizzle-orm";
import { authSession, authUser } from "@repo/db-elise/schema";
import type { PoolDbType } from "#/lib/db-connection";

export const isPendingTwoFactorStep = async (db: PoolDbType, userId: string, path: string | undefined) => {
  if (path !== "/sign-in/email") return false;
  const [row] = await db.select({ on: authUser.twoFactorEnabled }).from(authUser).where(eq(authUser.id, userId));
  return row?.on === true;
};

export const trimSessions = async (db: PoolDbType, userId: string, keep: number, currentId: string) => {
  const rows = await db
    .select({ id: authSession.id })
    .from(authSession)
    .where(eq(authSession.userId, userId))
    .orderBy(desc(authSession.createdAt), desc(authSession.id));
  const ordered = [...rows.filter((row) => row.id === currentId), ...rows.filter((row) => row.id !== currentId)];
  const stale = ordered.slice(keep).map((row) => row.id);
  if (stale.length === 0) return;
  await db.delete(authSession).where(inArray(authSession.id, stale));
};
