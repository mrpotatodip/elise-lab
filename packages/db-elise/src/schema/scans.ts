import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  FINDING_ORIGIN_VALUES,
  FINDING_SEVERITY_VALUES,
  FINDING_STATUS_VALUES,
  FINDING_TRIAGE_STATUS_VALUES,
  REPO_FINDING_STATE_VALUES,
  SCAN_KEY_SOURCE_VALUES,
  SCAN_STATE_VALUES,
  SCAN_STEP_VALUES,
  SOURCE_PROVIDER_VALUES,
  type FindingOriginValue,
  type FindingSeverityValue,
  type FindingStatusValue,
  type FindingTriageStatusValue,
  type ProfileMetValue,
  type RepoFindingStateValue,
  type ScanKeySourceValue,
  type ScanPhaseUsage,
  type ScanStateValue,
  type ScanStepValue,
  type SourceProviderValue,
} from "@repo/contracts/elise";
import { parties } from "./party";
import { tenants } from "./tenant";

const inList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));

// -----
// One row per repo an Account scans, so a repo has
// one history however its URL was spelled. Its
// identity is (provider, host, canonical), so a gitlab
// acme/app and a github acme/app are two Repos.
// canonical is the path (owner/name for github) in
// lowercase, without .git or a trailing slash. url
// keeps the first spelling seen, minus those two.
// -----
export const scanRepos = pgTable(
  "scan_repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider").$type<SourceProviderValue>().notNull().default("github"),
    // Lowercase. Null only for an upload app, which has no host. The default keeps a row written without it a github one.
    host: text("host").default("github.com"),
    canonical: text("canonical").notNull(),
    url: text("url").notNull(),
    defaultBranch: text("default_branch"),
    // Last answer GitHub gave at a Scan request. For display only: each Scan keeps its own.
    isPrivate: boolean("is_private"),
    // Set when a person removes an upload app: its zips are deleted, and the row stays so its Scans keep their History. Adding the app again clears it.
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    chkProvider: check("scan_repos_provider", sql`${t.provider} in (${inList(SOURCE_PROVIDER_VALUES)})`),
    chkHost: check("scan_repos_host", sql`${t.host} = lower(${t.host})`),
    // A constraint, not an index: only a constraint takes NULLS NOT DISTINCT in drizzle, and two upload apps of one name both have a null host.
    uqTenantIdentity: unique("uq_scan_repos_tenant_identity")
      .on(t.tenantId, t.provider, t.host, t.canonical)
      .nullsNotDistinct(),
    uqIdTenant: uniqueIndex("uq_scan_repos_id_tenant").on(t.id, t.tenantId),
  }),
);

// -----
// A branch of a repo that has its own history. It is
// known by its exact name (case counts), so "main"
// typed and "main" read from the remote are one row.
// scan_repos.default_branch is a pointer to the name
// git last reported as the default; it is not a row of
// its own. The app caps the rows per repo.
// -----
export const scanRepoBranches = pgTable(
  "scan_repo_branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    repoId: uuid("repo_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    chkName: check("scan_repo_branches_name", sql`length(${t.name}) > 0`),
    uqRepoName: uniqueIndex("uq_scan_repo_branches_repo_name").on(t.repoId, t.name),
    uqIdTenant: uniqueIndex("uq_scan_repo_branches_id_tenant").on(t.id, t.tenantId),
    fkRepoTenant: foreignKey({
      name: "scan_repo_branches_repo_tenant_fk",
      columns: [t.repoId, t.tenantId],
      foreignColumns: [scanRepos.id, scanRepos.tenantId],
    }).onDelete("cascade"),
  }),
);

// -----
// One row per scan, created when the scan is queued
// and updated at each step. id is the engine's scan ID.
// It holds the state the API reads, and what the agent
// spent (tokens, and its cost estimate). The files stay
// in R2; these rows let the dashboard sort and filter.
// -----
export const scans = pgTable(
  "scans",
  {
    id: text("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    repo: text("repo").notNull(),
    repoId: uuid("repo_id").notNull(),
    commitSha: text("commit_sha"),
    ref: text("ref"),
    branch: text("branch"),
    branchId: uuid("branch_id"),
    untrackedReason: text("untracked_reason"),
    // Nothing writes it since the GitHub App was retired: null on every new Scan, and the dashboard still reads old rows.
    isPrivate: boolean("is_private"),
    priorsGiven: integer("priors_given"),
    priorsCarried: integer("priors_carried"),
    priorsClosed: integer("priors_closed"),
    priorsUnchecked: integer("priors_unchecked"),
    // Set with the findings of a succeeded full-skill Scan: true when it ran out of money or a Runner Phase ran out of time (a Report that starts with PARTIAL: money ran out; or PARTIAL: a phase ran out of time;, or a unit deferred as money_exhausted). Null on a Scan recorded before this column, a lite Scan and a Scan that did not succeed.
    partial: boolean("partial"),
    // Set with the findings of a succeeded Runner Scan whose profile check ran: the profile it met (quick, standard or deep) or none. Null: not checked (a cloud Scan, a Partial Scan, a Scan that did not succeed, or a row from before this column). Plain text, not a database enum; the agent's own files are what it measures.
    profileMet: text("profile_met").$type<ProfileMetValue>(),
    // The number of candidate Findings the Trace producer last reported while the Scan ran (a count, never a title). Null: no producer has sent one.
    traceCandidateFindings: integer("trace_candidate_findings"),
    // How many candidate pairs the possible-duplicate Signal step left unasked because of its per-Scan cap. Null: the step did not run for this Scan.
    signalPairsSkipped: integer("signal_pairs_skipped"),
    // The Scan this one resumes (ADR 0016). Set once, at creation; the earlier Scan's own row never changes. At most one Scan resumes a given Scan.
    resumesScanId: text("resumes_scan_id"),
    status: text("status").$type<ScanStateValue>().notNull(),
    step: text("step").$type<ScanStepValue>(),
    skill: text("skill").notNull(),
    model: text("model").notNull(),
    effort: text("effort").notNull(),
    profile: text("profile").notNull(),
    budget: integer("budget"),
    maxBudgetUsd: numeric("max_budget_usd", { precision: 10, scale: 2 }).notNull(),
    // Which Anthropic key paid. A scan from before this column was the platform's.
    keySource: text("key_source").$type<ScanKeySourceValue>().notNull().default("platform"),
    error: text("error"),
    inputTokens: bigint("input_tokens", { mode: "number" }),
    outputTokens: bigint("output_tokens", { mode: "number" }),
    cacheReadTokens: bigint("cache_read_tokens", { mode: "number" }),
    cacheWriteTokens: bigint("cache_write_tokens", { mode: "number" }),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
    // What each Phase of the Scan spent, in the order they ran; they add up to the columns above. Null: no split (a row from before this column, a Scan whose agent log held none, or a Scan that has not read its usage).
    phaseUsage: jsonb("phase_usage").$type<ScanPhaseUsage[]>(),
    // What the check Phase said of each open problem it was handed (spec #464): {fingerprint, answer} with answer still_there, gone or not_reached. Null: nothing was handed over or the check wrote no file. Read for display only; it never changes a problem's state.
    openProblemChecks: jsonb("open_problem_checks").$type<
      { fingerprint: string; answer: "still_there" | "gone" | "not_reached" }[]
    >(),
    turns: integer("turns"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    chkStatus: check("scans_status", sql`${t.status} in (${inList(SCAN_STATE_VALUES)})`),
    chkStep: check("scans_step", sql`${t.step} is null or ${t.step} in (${inList(SCAN_STEP_VALUES)})`),
    chkKeySource: check("scans_key_source", sql`${t.keySource} in (${inList(SCAN_KEY_SOURCE_VALUES)})`),
    uqIdTenant: unique("uq_scans_id_tenant").on(t.id, t.tenantId),
    idxTenantCreated: index("idx_scans_tenant_created_at").on(t.tenantId, t.createdAt),
    fkRepoTenant: foreignKey({
      name: "scans_repo_tenant_fk",
      columns: [t.repoId, t.tenantId],
      foreignColumns: [scanRepos.id, scanRepos.tenantId],
    }).onDelete("cascade"),
    idxRepoCreated: index("idx_scans_repo_id_created_at").on(t.repoId, t.createdAt),
    fkBranchTenant: foreignKey({
      name: "scans_branch_tenant_fk",
      columns: [t.branchId, t.tenantId],
      foreignColumns: [scanRepoBranches.id, scanRepoBranches.tenantId],
    }).onDelete("set null"),
    fkResumesTenant: foreignKey({
      name: "scans_resumes_tenant_fk",
      columns: [t.resumesScanId, t.tenantId],
      foreignColumns: [t.id, t.tenantId],
    }),
    // A Scan is resumed at most once, so a chain of attempts is a line.
    uqResumesScan: uniqueIndex("uq_scans_resumes_scan_id")
      .on(t.resumesScanId)
      .where(sql`${t.resumesScanId} is not null`),
    // One active scan per repo. A scan that stalls is expired before a new one is queued.
    uqActivePerRepo: uniqueIndex("uq_scans_active_per_repo")
      .on(t.repoId)
      .where(sql`${t.status} in ('queued', 'running')`),
  }),
);

// -----
// One row per file a scan saved to R2. r2_key is
// where the bytes are, so every object in the bucket
// can be traced to its scan and account here.
// -----
export const scanFiles = pgTable(
  "scan_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    scanId: text("scan_id").notNull(),
    name: text("name").notNull(),
    r2Key: text("r2_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    fkScanTenant: foreignKey({
      name: "scan_files_scan_tenant_fk",
      columns: [t.scanId, t.tenantId],
      foreignColumns: [scans.id, scans.tenantId],
    }).onDelete("cascade"),
    uqScanName: uniqueIndex("uq_scan_files_scan_name").on(t.scanId, t.name),
    uqR2Key: uniqueIndex("uq_scan_files_r2_key").on(t.r2Key),
  }),
);

// -----
// One row per finding of a scan. fingerprint is a
// hash of the class, the file and the title, so the
// same problem keeps its fingerprint in a later scan
// even when its line moves.
// -----
export const scanFindings = pgTable(
  "scan_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    scanId: text("scan_id").notNull(),
    findingId: text("finding_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").$type<FindingStatusValue>().notNull(),
    severity: text("severity").$type<FindingSeverityValue>(),
    title: text("title").notNull(),
    class: text("class").notNull(),
    file: text("file"),
    line: integer("line"),
    actor: text("actor"),
    impact: text("impact"),
    evidence: text("evidence"),
    fix: text("fix"),
    needs: text("needs"),
    origin: text("origin").$type<FindingOriginValue>().notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    chkOrigin: check("scan_findings_origin", sql`${t.origin} in (${inList(FINDING_ORIGIN_VALUES)})`),
    fkScanTenant: foreignKey({
      name: "scan_findings_scan_tenant_fk",
      columns: [t.scanId, t.tenantId],
      foreignColumns: [scans.id, scans.tenantId],
    }).onDelete("cascade"),
    chkStatus: check("scan_findings_status", sql`${t.status} in (${inList(FINDING_STATUS_VALUES)})`),
    chkSeverity: check(
      "scan_findings_severity",
      sql`(${t.status} = 'confirmed' and ${t.severity} in (${inList(FINDING_SEVERITY_VALUES)}))
        or (${t.status} = 'needs_validation' and ${t.severity} is null)`,
    ),
    uqScanFinding: uniqueIndex("uq_scan_findings_scan_finding").on(t.scanId, t.findingId),
    idxTenantFingerprint: index("idx_scan_findings_tenant_fingerprint").on(t.tenantId, t.fingerprint),
  }),
);

// -----
// Where a repo's problems stand across its scans, one
// row per fingerprint. A scan updates it only when it
// succeeds, in the same transaction that records it.
//   open          found, not yet shown to be gone
//   fixed_by_code a later scan checked and it was gone
//   regressed     it was gone and came back
// unchecked means the latest scan could not re-check
// it, so it stays as it was. The words of the problem
// are in the scan_findings row of last_seen_scan_id.
// -----
export const scanRepoFindings = pgTable(
  "scan_repo_findings",
  {
    repoId: uuid("repo_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    state: text("state").$type<RepoFindingStateValue>().notNull(),
    unchecked: boolean("unchecked").notNull().default(false),
    firstSeenScanId: text("first_seen_scan_id").notNull(),
    lastSeenScanId: text("last_seen_scan_id").notNull(),
    fixedInScanId: text("fixed_in_scan_id"),
    possibleDuplicateOf: text("possible_duplicate_of"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ name: "scan_repo_findings_pkey", columns: [t.branchId, t.fingerprint] }),
    chkState: check("scan_repo_findings_state", sql`${t.state} in (${inList(REPO_FINDING_STATE_VALUES)})`),
    fkRepoTenant: foreignKey({
      name: "scan_repo_findings_repo_tenant_fk",
      columns: [t.repoId, t.tenantId],
      foreignColumns: [scanRepos.id, scanRepos.tenantId],
    }).onDelete("cascade"),
    fkBranchTenant: foreignKey({
      name: "scan_repo_findings_branch_tenant_fk",
      columns: [t.branchId, t.tenantId],
      foreignColumns: [scanRepoBranches.id, scanRepoBranches.tenantId],
    }).onDelete("cascade"),
    idxRepoState: index("idx_scan_repo_findings_repo_state").on(t.repoId, t.state),
    idxBranchState: index("idx_scan_repo_findings_branch_state").on(t.branchId, t.state),
  }),
);

// -----
// What a person decided about a problem, kept per
// repo and fingerprint so a rescan never overwrites
// it. Only the dashboard writes this table.
// -----
export const scanFindingTriage = pgTable(
  "scan_finding_triage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").$type<FindingTriageStatusValue>().notNull(),
    note: text("note"),
    acceptedUntil: timestamp("accepted_until", { withTimezone: true }),
    duplicateOf: text("duplicate_of"),
    setByPartyId: uuid("set_by_party_id").references(() => parties.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => ({
    chkStatus: check("scan_finding_triage_status", sql`${t.status} in (${inList(FINDING_TRIAGE_STATUS_VALUES)})`),
    chkAccepted: check(
      "scan_finding_triage_accepted",
      sql`(${t.status} = 'accepted_risk') = (${t.acceptedUntil} is not null) and (${t.status} <> 'accepted_risk' or ${t.note} is not null)`,
    ),
    chkDuplicate: check(
      "scan_finding_triage_duplicate",
      sql`(${t.status} = 'duplicate') = (${t.duplicateOf} is not null)`,
    ),
    fkRepoTenant: foreignKey({
      name: "scan_finding_triage_repo_tenant_fk",
      columns: [t.repoId, t.tenantId],
      foreignColumns: [scanRepos.id, scanRepos.tenantId],
    }).onDelete("cascade"),
    uqTenantRepoFingerprint: uniqueIndex("uq_scan_finding_triage_tenant_repo_fingerprint").on(
      t.tenantId,
      t.repoId,
      t.fingerprint,
    ),
  }),
);

export type TScanRepo = typeof scanRepos.$inferSelect;
export type TScanRepoBranch = typeof scanRepoBranches.$inferSelect;
export type TScanRepoFinding = typeof scanRepoFindings.$inferSelect;
export type TScan = typeof scans.$inferSelect;
export type TScanFile = typeof scanFiles.$inferSelect;
export type TFinding = typeof scanFindings.$inferSelect;
export type TFindingTriage = typeof scanFindingTriage.$inferSelect;
