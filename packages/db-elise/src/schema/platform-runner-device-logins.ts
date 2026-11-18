import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { RUNNER_LOGIN_STATE_VALUES, type RunnerLoginStateValue } from "@repo/contracts/elise";
import { partyPersons } from "./party";
import { tenantRunners } from "./tenant-runners";
import { tenants } from "./tenant";

const inList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));

// -----
// A Runner login from the terminal, from start until collected. It
// has no Account until a member approves it, so it sits outside
// per-Account row-level security, like enroll and claim. Only the
// hashes of the two codes are stored. Approving fills the Account,
// the Runner row (made with no token), the approver and the approver's
// IP; the first check after that makes the token and marks it collected.
// -----
export const platformRunnerDeviceLogins = pgTable(
  "platform_runner_device_logins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userCodeHash: text("user_code_hash").notNull(),
    deviceCodeHash: text("device_code_hash").notNull(),
    suggestedName: text("suggested_name").notNull(),
    os: text("os").notNull(),
    cpu: text("cpu").notNull(),
    runnerVersion: text("runner_version").notNull(),
    requestIp: text("request_ip").notNull(),
    state: text("state").$type<RunnerLoginStateValue>().notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    runnerId: uuid("runner_id").references(() => tenantRunners.id, { onDelete: "cascade" }),
    approvedBy: uuid("approved_by").references(() => partyPersons.partyId, { onDelete: "restrict" }),
    approverIp: text("approver_ip"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uqUserCodeHash: uniqueIndex("uq_platform_runner_device_logins_user_code_hash").on(t.userCodeHash),
    uqDeviceCodeHash: uniqueIndex("uq_platform_runner_device_logins_device_code_hash").on(t.deviceCodeHash),
    chkState: check("platform_runner_device_logins_state", sql`${t.state} in (${inList(RUNNER_LOGIN_STATE_VALUES)})`),
    idxExpires: index("idx_platform_runner_device_logins_expires_at").on(t.expiresAt),
  }),
);

export type TPlatformRunnerDeviceLogin = typeof platformRunnerDeviceLogins.$inferSelect;
