import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";
import { WEAK_REASON_SIGNAL_KIND, type Finding, type FindingsQuery, type FindingTriage, type FindingTriageBody } from "@repo/contracts/elise";
import { partyPersons, scanFindings, scanFindingTriage, scanRepoFindings, scanRepos, scanSignals, scans, type TFindingTriage } from "@repo/db-elise/schema";
import type { AppDbType, TenantDbType } from "#/lib/db-connection";
import { Forbidden, Invalid, toDbError, type DbError } from "#/lib/effect-query";
import { actorPartyOf, insertAuditEntry } from "#/modules/audit-trail";
import { repoIdentityOf, sameRepoIdentity } from "#/modules/scan-ledger";
import { SCAN_RECORDS_PROFILE_SKILL } from "#/modules/scan-records/constants";

// -----
// Worst first; a finding that still needs
// validation has no severity and goes last.
// -----
const severityRank = sql`case ${scanFindings.severity}
  when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 when 'informational' then 4 else 5 end`;

// -----
// Without a scanId, a repo's findings are those of
// its newest successful scan of the default branch, so an old scan's
// findings never mix with a newer one's. A Removed Repo has none.
// -----
const latestScanIds = (tenantId: string) =>
  sql`(select distinct on (repo_id) id from scans where tenant_id = ${tenantId} and status = 'succeeded' and ref is null and repo_id in (select id from scan_repos where tenant_id = ${tenantId} and removed_at is null) order by repo_id, created_at desc)`;

export type DecidedBy = { firstName: string; lastName: string } | null;

export const decidedByName = (person: DecidedBy | undefined): string | null => (person ? `${person.firstName} ${person.lastName}`.trim() : null);

export const triageView = (triage: TFindingTriage, decidedBy: DecidedBy | undefined = null): FindingTriage => ({
  status: triage.status,
  note: triage.note,
  acceptedUntil: triage.acceptedUntil?.toISOString() ?? null,
  duplicateOf: triage.duplicateOf,
  updatedAt: triage.updatedAt.toISOString(),
  decidedBy: decidedByName(decidedBy),
});

const triageFilter = (triage: FindingsQuery["triage"]): SQL | undefined => {
  if (!triage) return undefined;
  if (triage === "open") return or(isNull(scanFindingTriage.status), eq(scanFindingTriage.status, "open"));
  return eq(scanFindingTriage.status, triage);
};

export const listFindingsEffect = (db: AppDbType, tenantId: string, query: FindingsQuery): Effect.Effect<Finding[], DbError> =>
  Effect.tryPromise({
    try: async () => {
      const rows = await db
        .select({ finding: scanFindings, repo: scans.repo, triage: scanFindingTriage, person: partyPersons })
        .from(scanFindings)
        .innerJoin(scans, eq(scans.id, scanFindings.scanId))
        .leftJoin(
          scanFindingTriage,
          and(
            eq(scanFindingTriage.tenantId, scanFindings.tenantId),
            eq(scanFindingTriage.repoId, scans.repoId),
            eq(scanFindingTriage.fingerprint, scanFindings.fingerprint),
          ),
        )
        .leftJoin(partyPersons, eq(partyPersons.partyId, scanFindingTriage.setByPartyId))
        .where(
          and(
            eq(scanFindings.tenantId, tenantId),
            query.scanId ? eq(scanFindings.scanId, query.scanId) : inArray(scanFindings.scanId, latestScanIds(tenantId)),
            query.repo
              ? inArray(
                  scans.repoId,
                  db.select({ id: scanRepos.id }).from(scanRepos).where(sameRepoIdentity(tenantId, repoIdentityOf(query.repo))),
                )
              : undefined,
            query.severity ? eq(scanFindings.severity, query.severity) : undefined,
            query.status ? eq(scanFindings.status, query.status) : undefined,
            triageFilter(query.triage),
          ),
        )
        .orderBy(asc(severityRank), desc(scanFindings.createdAt), asc(scanFindings.findingId))
        .limit(query.limit + 1)
        .offset(query.cursor ? Number(query.cursor) : 0);
      return rows.map(({ finding, repo, triage, person }) => ({
        id: finding.id,
        scanId: finding.scanId,
        repo,
        findingId: finding.findingId,
        fingerprint: finding.fingerprint,
        status: finding.status,
        severity: finding.severity,
        title: finding.title,
        class: finding.class,
        file: finding.file,
        line: finding.line,
        actor: finding.actor,
        impact: finding.impact,
        evidence: finding.evidence,
        fix: finding.fix,
        needs: finding.needs,
        createdAt: finding.createdAt.toISOString(),
        triage: triage ? triageView(triage, person) : null,
      }));
    },
    catch: toDbError,
  });

// -----
// The repo a fingerprint belongs to, or null when the
// account has no such problem in that repo. The repo may
// be given in any spelling.
// -----
export const findingRepoIdEffect = (db: Pick<AppDbType, "select">, tenantId: string, repoUrl: string, fingerprint: string): Effect.Effect<string | null, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ repoId: scans.repoId })
        .from(scanFindings)
        .innerJoin(scans, eq(scans.id, scanFindings.scanId))
        .innerJoin(scanRepos, eq(scanRepos.id, scans.repoId))
        .where(and(eq(scanFindings.tenantId, tenantId), ne(scans.status, "running"), sameRepoIdentity(tenantId, repoIdentityOf(repoUrl)), eq(scanFindings.fingerprint, fingerprint)))
        .limit(1),
    catch: toDbError,
  }).pipe(Effect.map((rows) => rows[0]?.repoId ?? null));

const DAY_MS = 86_400_000;

const RESOLVED_TARGET_MESSAGE = {
  fixed: "That Finding is marked fixed; point to a Finding that is still open",
  false_positive: "That Finding is a false positive; point to a Finding that is still open",
  accepted_risk: "That Finding is an accepted risk; point to a Finding that is still open",
} as const;

const FIXED_BY_SCAN_MESSAGE = "A later Scan found that Finding fixed; point to a Finding that is still open";
const DIFFERENT_BRANCH_MESSAGE = "Both Findings must appear in Scans of the same Branch. Pick one from this Branch's list";

const duplicateRefusal = (db: TenantDbType, tenantId: string, repoId: string, fingerprint: string, target: string, now: Date): Effect.Effect<string | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      if (target === fingerprint) return "A Finding cannot be a duplicate of itself";
      await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`duplicate:${tenantId}:${repoId}`}))`);
      const shared = await db
        .select({ branchId: scans.branchId })
        .from(scanFindings)
        .innerJoin(scans, eq(scans.id, scanFindings.scanId))
        .where(
          and(
            eq(scanFindings.tenantId, tenantId),
            eq(scans.repoId, repoId),
            eq(scans.status, "succeeded"),
            eq(scans.skill, SCAN_RECORDS_PROFILE_SKILL),
            isNotNull(scans.branchId),
            inArray(scanFindings.fingerprint, [fingerprint, target]),
          ),
        )
        .groupBy(scans.branchId)
        .having(sql`count(distinct ${scanFindings.fingerprint}) = 2`);
      const branchIds = shared.flatMap((row) => (row.branchId ? [row.branchId] : []));
      if (branchIds.length === 0) return DIFFERENT_BRANCH_MESSAGE;
      const closed = await db
        .select({ branchId: scanRepoFindings.branchId })
        .from(scanRepoFindings)
        .where(and(eq(scanRepoFindings.tenantId, tenantId), inArray(scanRepoFindings.branchId, branchIds), eq(scanRepoFindings.fingerprint, target), eq(scanRepoFindings.state, "fixed_by_code")));
      if (closed.length === branchIds.length) return FIXED_BY_SCAN_MESSAGE;
      const [kept] = await db
        .select({ status: scanFindingTriage.status, acceptedUntil: scanFindingTriage.acceptedUntil })
        .from(scanFindingTriage)
        .where(and(eq(scanFindingTriage.tenantId, tenantId), eq(scanFindingTriage.repoId, repoId), eq(scanFindingTriage.fingerprint, target)));
      if (kept?.status === "duplicate") return "That Finding is itself a duplicate; point to the Finding it keeps";
      const expired = kept?.status === "accepted_risk" && (!kept.acceptedUntil || kept.acceptedUntil.getTime() <= now.getTime());
      if (kept && !expired && (kept.status === "fixed" || kept.status === "false_positive" || kept.status === "accepted_risk")) return RESOLVED_TARGET_MESSAGE[kept.status];
      const pointing = await db
        .select({ id: scanFindingTriage.id })
        .from(scanFindingTriage)
        .where(and(eq(scanFindingTriage.tenantId, tenantId), eq(scanFindingTriage.repoId, repoId), eq(scanFindingTriage.status, "duplicate"), eq(scanFindingTriage.duplicateOf, fingerprint)))
        .limit(1);
      return pointing.length > 0 ? "Other Findings are duplicates that point to it; undo them first" : null;
    },
    catch: toDbError,
  });

// -----
// Every triage decision, with its audit row, in the transaction
// db already is (withTenant), so a decision is never saved without
// its record and a failed audit row rolls the decision back. The row names
// the previous decision too. userId is null for the service
// token, which names no one; an accepted risk refuses it, and
// needs a reason and acceptDays.
// -----
export const setTriageEffect = (
  db: TenantDbType,
  tenantId: string,
  repoId: string,
  body: FindingTriageBody,
  userId: string | undefined,
  now: Date,
): Effect.Effect<FindingTriage, Forbidden | Invalid | DbError> =>
  Effect.gen(function* () {
    const accepting = body.status === "accepted_risk";
    const note = body.note?.trim() ? body.note : null;
    if (accepting && (body.acceptDays === undefined || !note)) return yield* new Invalid({ message: "An accepted risk needs a reason and a number of days" });
    const duplicateOf = body.status === "duplicate" ? (body.duplicateOf ?? null) : null;
    if (body.status === "duplicate" && !duplicateOf) return yield* new Invalid({ message: "A duplicate needs the Finding it duplicates" });
    if (duplicateOf) {
      const refusal = yield* duplicateRefusal(db, tenantId, repoId, body.fingerprint, duplicateOf, now);
      if (refusal) return yield* new Invalid({ message: refusal });
    }
    if (body.signalId) {
      const warned = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ id: scanSignals.id })
            .from(scanSignals)
            .where(and(eq(scanSignals.id, body.signalId ?? ""), eq(scanSignals.tenantId, tenantId), eq(scanSignals.repoId, repoId), eq(scanSignals.fingerprint, body.fingerprint), eq(scanSignals.kind, WEAK_REASON_SIGNAL_KIND))),
        catch: toDbError,
      });
      if (warned.length === 0) return yield* new Invalid({ message: "That Signal is not a weak-reason warning for this Finding" });
    }
    const actorPartyId = userId ? yield* Effect.tryPromise({ try: () => actorPartyOf(db, userId), catch: toDbError }) : null;
    if (accepting && !actorPartyId) return yield* new Forbidden({ message: "Forbidden" });
    const acceptedUntil = accepting && body.acceptDays !== undefined ? new Date(now.getTime() + body.acceptDays * DAY_MS) : null;
    return yield* Effect.tryPromise({
      try: async () => {
        const key = and(eq(scanFindingTriage.tenantId, tenantId), eq(scanFindingTriage.repoId, repoId), eq(scanFindingTriage.fingerprint, body.fingerprint));
        const [previous] = await db.select().from(scanFindingTriage).where(key);
        const [row] = await db
          .insert(scanFindingTriage)
          .values({ tenantId, repoId, fingerprint: body.fingerprint, status: body.status, note, acceptedUntil, duplicateOf, setByPartyId: actorPartyId })
          .onConflictDoUpdate({
            target: [scanFindingTriage.tenantId, scanFindingTriage.repoId, scanFindingTriage.fingerprint],
            set: { status: body.status, note, acceptedUntil, duplicateOf, setByPartyId: actorPartyId, updatedAt: now },
          })
          .returning();
        await insertAuditEntry(db, {
          actorPartyId,
          action: accepting ? "finding.risk.accepted" : "finding.triage.set",
          subjectId: row.id,
          tenantId,
          before: previous ? { status: previous.status, note: previous.note, acceptedUntil: previous.acceptedUntil?.toISOString() ?? null, duplicateOf: previous.duplicateOf } : undefined,
          after: { fingerprint: body.fingerprint, status: body.status, note, acceptedUntil: acceptedUntil?.toISOString() ?? null, duplicateOf, signalId: body.signalId },
        });
        const [person] = actorPartyId ? await db.select().from(partyPersons).where(eq(partyPersons.partyId, actorPartyId)) : [];
        return triageView(row, person);
      },
      catch: toDbError,
    });
  });
