import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, max, sql } from "drizzle-orm";
import { Effect } from "effect";
import { REPO_LIMIT_PER_TENANT, type DiffEntry, type Repo, type RepoBranch, type RepoFinding, type ScanDiff } from "@repo/contracts/elise";
import { partyPersons, scanFindings, scanFindingTriage, scanRepoBranches, scanRepoFindings, scanRepos, scans } from "@repo/db-elise/schema";
import type { AppDbType, AppTxDbType } from "#/lib/db-connection";
import { Conflict, Invalid, NotFound, toDbError, type DbError } from "#/lib/effect-query";
import { addBranchesTx, classifyBranchFailure } from "#/modules/branches";
import { triageView } from "#/modules/findings/queries";
import { displayRepoUrlOf, repoIdentityOf, sameRepoIdentity } from "#/modules/scan-ledger";
import { sourceProviderOf, type SourceProviderId } from "#/providers/registry";
import { SCAN_RECORDS_PROFILE_SKILL } from "#/modules/scan-records/constants";
import { branchStateOf, openCountsOf, type OpenCountRow } from "#/modules/repos/utils";
import { weighedScanWhere } from "#/modules/verdict/queries";

type BranchScope = { repoId?: string; branchId?: string; branchIds?: readonly string[] };

// -----
// The Scans a Branch's findings are made of: every succeeded
// full Scan that belongs to the Branch, of any profile and any
// age. A failed Scan and a one-off Scan (no Branch) are not
// among them, nor an old lite Scan: its fingerprints are made
// another way, so its problems would be listed twice.
// -----
const branchScansWhere = (tenantId: string, scope: BranchScope) =>
  and(
    eq(scans.tenantId, tenantId),
    eq(scans.status, "succeeded"),
    eq(scans.skill, SCAN_RECORDS_PROFILE_SKILL),
    isNotNull(scans.branchId),
    scope.repoId ? eq(scans.repoId, scope.repoId) : undefined,
    scope.branchId ? eq(scans.branchId, scope.branchId) : undefined,
    scope.branchIds ? inArray(scans.branchId, [...scope.branchIds]) : undefined,
  );

// -----
// The latest Scan of each Branch: its newest Scan that weighs in
// a Verdict. A Partial Scan or a Scan that met no profile was
// not a full look, so it never makes a problem "not in the
// latest Scan". A Branch with no such Scan has no latest Scan.
// -----
const branchTips = (db: AppDbType, tenantId: string, scope: BranchScope) =>
  db
    .selectDistinctOn([scans.branchId], { branchId: sql<string>`${scans.branchId}`.as("tip_branch_id"), scanId: sql<string>`${scans.id}`.as("tip_scan_id") })
    .from(scans)
    .where(and(branchScansWhere(tenantId, scope), weighedScanWhere))
    .orderBy(scans.branchId, desc(scans.createdAt), desc(scans.id))
    .as("tips");

// -----
// The newest finding row of each problem (branch and
// fingerprint), the oldest Scan that saw it
// and whether the latest Scan saw it. Narrow, so that everything
// joined after it works on one row per problem, not one per
// Scan. The windows run before the DISTINCT ON picks, and the
// latest Scan is read in the same statement, so the two always
// agree.
// -----
const latestPerProblem = (db: AppDbType, tenantId: string, scope: BranchScope) => {
  const tips = branchTips(db, tenantId, scope);
  const problem = sql`partition by ${scans.branchId}, ${scanFindings.fingerprint}`;
  return db
    .selectDistinctOn([scans.branchId, scanFindings.fingerprint], {
      rowId: sql<string>`${scanFindings.id}`.as("latest_row_id"),
      branchId: scans.branchId,
      scanId: sql<string>`${scans.id}`.as("latest_scan_id"),
      repoId: scans.repoId,
      tenantId: scans.tenantId,
      fingerprint: scanFindings.fingerprint,
      firstSeenScanId: sql<string>`first_value(${scans.id}) over (${problem} order by ${scans.createdAt} asc, ${scans.id} asc)`.as("latest_first_seen_scan_id"),
      unchecked: sql<boolean>`(${tips.scanId} is not null and not coalesce(bool_or(${scans.id} = ${tips.scanId}) over (${problem}), false))`.as("latest_unchecked"),
    })
    .from(scanFindings)
    .innerJoin(scans, eq(scans.id, scanFindings.scanId))
    .leftJoin(tips, eq(tips.branchId, scans.branchId))
    .where(branchScansWhere(tenantId, scope))
    .orderBy(scans.branchId, scanFindings.fingerprint, desc(scans.createdAt), desc(scans.id), asc(scanFindings.id))
    .as("latest");
};

type LatestPerProblem = ReturnType<typeof latestPerProblem>;

const historyOn = (latest: LatestPerProblem) =>
  and(eq(scanRepoFindings.branchId, latest.branchId), eq(scanRepoFindings.fingerprint, latest.fingerprint));

const triageOn = (latest: LatestPerProblem) =>
  and(eq(scanFindingTriage.tenantId, latest.tenantId), eq(scanFindingTriage.repoId, latest.repoId), eq(scanFindingTriage.fingerprint, latest.fingerprint));

// -----
// Rows of one or more Branches, grouped by Branch in the order
// they came.
// -----
const byBranchOf = <Row extends { branchId: string | null }, Entry>(rows: readonly Row[], entryOf: (row: Row) => Entry) => {
  const byBranch = new Map<string, Entry[]>();
  for (const row of rows) {
    if (row.branchId === null) continue;
    const entries = byBranch.get(row.branchId);
    if (entries) entries.push(entryOf(row));
    else byBranch.set(row.branchId, [entryOf(row)]);
  }
  return byBranch;
};

// -----
// Every problem a branch's Scans found, one for each
// fingerprint: its words from the newest Scan that saw it, first
// seen at the oldest Scan, its state (branchStateOf) and what a
// person decided. A Scan never closes a problem. A branch has
// tens to hundreds, so counts, filters and pages are made from
// this one list. The map is keyed by branch.
// -----
export const repoFindingsEffect = (db: AppDbType, tenantId: string, branchId?: string): Effect.Effect<Map<string, RepoFinding[]>, DbError> =>
  Effect.tryPromise({
    try: () => {
      const latest = latestPerProblem(db, tenantId, { branchId });
      return db
        .select({
          finding: scanFindings,
          branchId: latest.branchId,
          firstSeenScanId: latest.firstSeenScanId,
          unchecked: latest.unchecked,
          history: scanRepoFindings,
          triage: scanFindingTriage,
          person: partyPersons,
          url: scanRepos.url,
        })
        .from(latest)
        .innerJoin(scanFindings, eq(scanFindings.id, latest.rowId))
        .innerJoin(scanRepos, eq(scanRepos.id, latest.repoId))
        .leftJoin(scanRepoFindings, historyOn(latest))
        .leftJoin(scanFindingTriage, triageOn(latest))
        .leftJoin(partyPersons, eq(partyPersons.partyId, scanFindingTriage.setByPartyId))
        .orderBy(latest.branchId, latest.fingerprint);
    },
    catch: toDbError,
  }).pipe(
    Effect.map((rows) =>
      byBranchOf(rows, (row): RepoFinding => {
        const { finding, firstSeenScanId, unchecked, history, triage, person, url } = row;
        return {
        id: finding.id,
        scanId: finding.scanId,
        repo: url,
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
        state: branchStateOf(row),
        unchecked,
        firstSeenScanId,
        fixedInScanId: history?.fixedInScanId ?? null,
        possibleDuplicateOf: history?.possibleDuplicateOf ?? null,
        };
      }),
    ),
  );

// -----
// Just what the open counts need for each problem: no
// evidence, impact or fix text. The same merge, latest Scan and
// state rule (branchStateOf) as the list, so the counts always
// match it. Keyed by branch.
// -----
const repoOpenCountRowsEffect = (db: AppDbType, tenantId: string, scope: BranchScope): Effect.Effect<Map<string, OpenCountRow[]>, DbError> =>
  Effect.tryPromise({
    try: () => {
      const latest = latestPerProblem(db, tenantId, scope);
      return db
        .select({
          branchId: latest.branchId,
          unchecked: latest.unchecked,
          severity: scanFindings.severity,
          history: { state: scanRepoFindings.state },
          triageStatus: scanFindingTriage.status,
        })
        .from(latest)
        .innerJoin(scanFindings, eq(scanFindings.id, latest.rowId))
        .leftJoin(scanRepoFindings, historyOn(latest))
        .leftJoin(scanFindingTriage, triageOn(latest));
    },
    catch: toDbError,
  }).pipe(
    Effect.map((rows) =>
      byBranchOf(rows, (row): OpenCountRow => {
        return { state: branchStateOf(row), unchecked: row.unchecked, severity: row.severity, triage: row.triageStatus ? { status: row.triageStatus } : null };
      }),
    ),
  );

// -----
// The default branch is a pointer only a scan with no ref moves.
// A repo whose scans all named a branch has tracked branches and
// no pointer, so its oldest tracked branch stands in for it.
// -----
const effectiveDefaultBranch = (pointer: string | null, trackedNames: readonly string[]): string | null => pointer ?? trackedNames[0] ?? null;

// -----
// The account's repos, or one, with how many scans each has,
// its latest scan and what is still open on its default branch.
// A removed upload app is not listed, but asked for by id it is
// still found, so its Scans keep their History.
// -----
export const listReposEffect = (db: AppDbType, tenantId: string, repoId?: string): Effect.Effect<Repo[], DbError> =>
  Effect.gen(function* () {
    const repos = yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(scanRepos)
          .where(and(eq(scanRepos.tenantId, tenantId), repoId ? eq(scanRepos.id, repoId) : isNull(scanRepos.removedAt)))
          .orderBy(asc(scanRepos.canonical)),
      catch: toDbError,
    });
    const totals = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ repoId: scans.repoId, total: count(), lastAt: max(scans.createdAt) })
          .from(scans)
          .where(and(eq(scans.tenantId, tenantId), repoId ? eq(scans.repoId, repoId) : undefined))
          .groupBy(scans.repoId),
      catch: toDbError,
    });
    const latest = yield* Effect.tryPromise({
      try: () =>
        db
          .selectDistinctOn([scans.repoId], { repoId: scans.repoId, id: scans.id, status: scans.status, createdAt: scans.createdAt })
          .from(scans)
          .where(and(eq(scans.tenantId, tenantId), repoId ? eq(scans.repoId, repoId) : undefined))
          .orderBy(scans.repoId, desc(scans.createdAt), desc(scans.id)),
      catch: toDbError,
    });
    const branches = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: scanRepoBranches.id, repoId: scanRepoBranches.repoId, name: scanRepoBranches.name })
          .from(scanRepoBranches)
          .where(and(eq(scanRepoBranches.tenantId, tenantId), repoId ? eq(scanRepoBranches.repoId, repoId) : undefined))
          .orderBy(asc(scanRepoBranches.createdAt), asc(scanRepoBranches.name)),
      catch: toDbError,
    });
    const tracked = repos.map((repo) => {
      const branchNames = branches.filter((branch) => branch.repoId === repo.id).map((branch) => branch.name);
      const defaultBranch = effectiveDefaultBranch(repo.defaultBranch, branchNames);
      const defaultBranchId = branches.find((branch) => branch.repoId === repo.id && branch.name === defaultBranch)?.id;
      return { repo, branchNames, defaultBranch, defaultBranchId };
    });
    const defaultBranchIds = tracked.flatMap((entry) => (entry.defaultBranchId ? [entry.defaultBranchId] : []));
    const findings = defaultBranchIds.length === 0 ? new Map<string, OpenCountRow[]>() : yield* repoOpenCountRowsEffect(db, tenantId, { branchIds: defaultBranchIds });
    return tracked.map(({ repo, branchNames, defaultBranch, defaultBranchId }) => {
      const last = latest.find((row) => row.repoId === repo.id);
      return {
        id: repo.id,
        provider: repo.provider,
        host: repo.host,
        url: repo.url,
        canonical: repo.canonical,
        isPrivate: repo.isPrivate,
        defaultBranch,
        branchNames,
        scans: totals.find((row) => row.repoId === repo.id)?.total ?? 0,
        lastScanId: last?.id ?? null,
        lastScanStatus: last?.status ?? null,
        lastScanAt: last?.createdAt.toISOString() ?? null,
        open: openCountsOf((defaultBranchId ? findings.get(defaultBranchId) : undefined) ?? []),
      };
    });
  });

export const getRepoEffect = (db: AppDbType, tenantId: string, repoId: string): Effect.Effect<Repo, NotFound | DbError> =>
  listReposEffect(db, tenantId, repoId).pipe(
    Effect.flatMap(([repo]) => (repo ? Effect.succeed(repo) : Effect.fail(new NotFound({ message: "Repo not found" })))),
  );

// -----
// A repo's branches, each with what is open on it, the commit
// of its newest succeeded scan (the commit to ask a verdict
// about) and its latest full Scan, from the same tips the merge
// measures "not in the latest full scan" against.
// -----
export const listRepoBranchesEffect = (db: AppDbType, tenantId: string, repoId: string): Effect.Effect<RepoBranch[], DbError> =>
  Effect.gen(function* () {
    const [repo] = yield* Effect.tryPromise({
      try: () => db.select({ defaultBranch: scanRepos.defaultBranch }).from(scanRepos).where(and(eq(scanRepos.tenantId, tenantId), eq(scanRepos.id, repoId))),
      catch: toDbError,
    });
    const rows = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: scanRepoBranches.id, name: scanRepoBranches.name })
          .from(scanRepoBranches)
          .where(and(eq(scanRepoBranches.tenantId, tenantId), eq(scanRepoBranches.repoId, repoId)))
          .orderBy(asc(scanRepoBranches.createdAt), asc(scanRepoBranches.name)),
      catch: toDbError,
    });
    const latest = yield* Effect.tryPromise({
      try: () =>
        db
          .selectDistinctOn([scans.branchId], { branchId: scans.branchId, id: scans.id, commitSha: scans.commitSha, createdAt: scans.createdAt })
          .from(scans)
          .where(and(eq(scans.tenantId, tenantId), eq(scans.repoId, repoId), eq(scans.status, "succeeded")))
          .orderBy(scans.branchId, desc(scans.createdAt), desc(scans.id)),
      catch: toDbError,
    });
    const tips = branchTips(db, tenantId, { repoId });
    const fullScans = yield* Effect.tryPromise({
      try: () => db.select({ branchId: tips.branchId, scanId: tips.scanId }).from(tips),
      catch: toDbError,
    });
    const findings = yield* repoOpenCountRowsEffect(db, tenantId, { repoId });
    const defaultBranch = effectiveDefaultBranch(repo?.defaultBranch ?? null, rows.map((branch) => branch.name));
    return rows.map((branch) => {
      const last = latest.find((row) => row.branchId === branch.id);
      return {
        id: branch.id,
        name: branch.name,
        isDefault: branch.name === defaultBranch,
        open: openCountsOf(findings.get(branch.id) ?? []),
        latestScanId: last?.id ?? null,
        latestCommit: last?.commitSha ?? null,
        latestScanAt: last?.createdAt.toISOString() ?? null,
        fullScanId: fullScans.find((row) => row.branchId === branch.id)?.scanId ?? null,
      };
    });
  });

const entryOf = (row: { fingerprint: string; status: DiffEntry["status"]; severity: DiffEntry["severity"]; title: string; class: string; file: string | null; line: number | null }): DiffEntry => ({
  fingerprint: row.fingerprint,
  status: row.status,
  severity: row.severity,
  title: row.title,
  class: row.class,
  file: row.file,
  line: row.line,
});

// -----
// What changed in a scan compared with the previous
// succeeded lite scan of the same branch.
//   stillOpen    in both, or re-checked and still there
//   new          first seen in this scan
//   regressed    seen before, gone, and back
//   fixed        the agent checked and it was gone
//   notRechecked in the previous list, missing from this
//                one with no evidence it was fixed
// -----
export const scanDiffEffect = (db: AppDbType, tenantId: string, scanId: string): Effect.Effect<ScanDiff, NotFound | Invalid | DbError> =>
  Effect.gen(function* () {
    const [scan] = yield* Effect.tryPromise({
      try: () => db.select().from(scans).where(and(eq(scans.tenantId, tenantId), eq(scans.id, scanId))),
      catch: toDbError,
    });
    if (!scan) return yield* new NotFound({ message: "Scan not found" });
    if (scan.status !== "succeeded" || scan.skill !== "lite") {
      return yield* new Invalid({ message: "Only a succeeded lite scan has recorded findings to compare" });
    }
    const { branchId } = scan;
    if (branchId === null) return yield* new Invalid({ message: "A scan with no tracked branch has no history to compare with" });
    const [previous] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: scans.id })
          .from(scans)
          .where(and(eq(scans.branchId, branchId), eq(scans.status, "succeeded"), eq(scans.skill, "lite"), lt(scans.createdAt, scan.createdAt)))
          .orderBy(desc(scans.createdAt), desc(scans.id))
          .limit(1),
      catch: toDbError,
    });
    const rowsOf = (id: string) =>
      Effect.tryPromise({
        try: () =>
          db
            .selectDistinctOn([scanFindings.fingerprint], {
              fingerprint: scanFindings.fingerprint,
              status: scanFindings.status,
              severity: scanFindings.severity,
              title: scanFindings.title,
              class: scanFindings.class,
              file: scanFindings.file,
              line: scanFindings.line,
              origin: scanFindings.origin,
            })
            .from(scanFindings)
            .where(eq(scanFindings.scanId, id))
            .orderBy(scanFindings.fingerprint),
        catch: toDbError,
      });
    const current = yield* rowsOf(scanId);
    const before = previous ? yield* rowsOf(previous.id) : [];
    const fingerprints = [...new Set([...current, ...before].map((row) => row.fingerprint))];
    const history =
      fingerprints.length === 0
        ? []
        : yield* Effect.tryPromise({
            try: () =>
              db
                .select({ fingerprint: scanRepoFindings.fingerprint, firstSeenScanId: scanRepoFindings.firstSeenScanId, fixedInScanId: scanRepoFindings.fixedInScanId })
                .from(scanRepoFindings)
                .where(and(eq(scanRepoFindings.branchId, branchId), inArray(scanRepoFindings.fingerprint, fingerprints))),
            catch: toDbError,
          });
    const historyOf = new Map(history.map((row) => [row.fingerprint, row]));
    const beforeIds = new Set(before.map((row) => row.fingerprint));
    const currentIds = new Set(current.map((row) => row.fingerprint));

    const diff: ScanDiff = { scanId, previousScanId: previous?.id ?? null, new: [], stillOpen: [], regressed: [], fixed: [], notRechecked: [] };
    for (const row of current) {
      if (row.origin === "carried" || beforeIds.has(row.fingerprint)) diff.stillOpen.push(entryOf(row));
      else if (historyOf.get(row.fingerprint)?.firstSeenScanId === scanId) diff.new.push(entryOf(row));
      else diff.regressed.push(entryOf(row));
    }
    for (const row of before.filter((item) => !currentIds.has(item.fingerprint))) {
      (historyOf.get(row.fingerprint)?.fixedInScanId === scanId ? diff.fixed : diff.notRechecked).push(entryOf(row));
    }
    return diff;
  });


export const REPO_LIMIT_MESSAGE = `An account can have at most ${REPO_LIMIT_PER_TENANT} repos`;

// -----
// Add a repo without scanning it, with the branches to track.
// The same repo in any spelling is the repo already there, so
// adding twice changes nothing. In one transaction: the repo
// (refused past the account's limit), then its branches (refused
// past the repo's limit), so a refusal leaves nothing behind.
// A removed upload app does not count toward the limit; adding
// it again brings it back, with its History and no zips.
// -----
export const addRepoEffect = (
  db: AppTxDbType,
  tenantId: string,
  url: string,
  branches: string[],
  provider?: SourceProviderId,
): Effect.Effect<string, Conflict | NotFound | DbError> =>
  Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        const identity = repoIdentityOf(url, provider);
        const [existing] = await tx.select({ id: scanRepos.id, removedAt: scanRepos.removedAt }).from(scanRepos).where(sameRepoIdentity(tenantId, identity));
        let repoId = existing?.id;
        if (existing?.removedAt) {
          const [{ total }] = await tx.select({ total: count() }).from(scanRepos).where(and(eq(scanRepos.tenantId, tenantId), isNull(scanRepos.removedAt)));
          if (total >= REPO_LIMIT_PER_TENANT) throw new Conflict({ message: REPO_LIMIT_MESSAGE });
          await tx.update(scanRepos).set({ removedAt: null }).where(and(eq(scanRepos.tenantId, tenantId), eq(scanRepos.id, existing.id)));
        }
        if (!repoId) {
          const [{ total }] = await tx.select({ total: count() }).from(scanRepos).where(and(eq(scanRepos.tenantId, tenantId), isNull(scanRepos.removedAt)));
          if (total >= REPO_LIMIT_PER_TENANT) throw new Conflict({ message: REPO_LIMIT_MESSAGE });
          const [created] = await tx
            .insert(scanRepos)
            .values({ tenantId, ...identity, url: displayRepoUrlOf(url, provider), defaultBranch: sourceProviderOf(identity.provider).fixedBranch })
            .onConflictDoNothing()
            .returning({ id: scanRepos.id });
          repoId = created?.id;
          if (!repoId) {
            const [raced] = await tx.select({ id: scanRepos.id }).from(scanRepos).where(sameRepoIdentity(tenantId, identity));
            repoId = raced.id;
          }
        }
        await addBranchesTx(tx, tenantId, repoId, branches);
        return repoId;
      }),
    catch: classifyBranchFailure,
  });
