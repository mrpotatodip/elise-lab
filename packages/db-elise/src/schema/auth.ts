import { pgTable, text, timestamp, boolean, index, integer, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { parties } from "./party";

// ─────────────────────────────────────────────
// better-auth's core schema (email/password +
// bearer plugin only). Table names prefixed
// auth_, as in @repo/db-elise.
// ─────────────────────────────────────────────

export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // -----
  // True only after one valid Authenticator code at
  // enrolment (better-auth's twoFactor plugin).
  // -----
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  // -----
  // Every login belongs to exactly one Party,
  // a Person or an Organization; set on seed.
  // -----
  partyId: uuid("party_id")
    .notNull()
    .unique()
    .references(() => parties.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const authSession = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
  },
  (t) => ({
    idxUserId: index("idx_auth_session_user_id").on(t.userId),
  }),
);

export const authAccount = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => ({
    idxUserId: index("idx_auth_account_user_id").on(t.userId),
  }),
);

export const authVerification = pgTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    idxIdentifier: index("idx_auth_verification_identifier").on(t.identifier),
  }),
);

// -----
// One row per Login that started Two-factor setup.
// secret and backup_codes are sealed by better-auth
// under AUTH_SECRET. verified is false until the
// first valid code; failed_verification_count and
// locked_until are the second step's lockout.
// -----
export const authTwoFactor = pgTable(
  "auth_two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => ({
    idxUserId: index("idx_auth_two_factor_user_id").on(t.userId),
  }),
);

export const authUserRelations = relations(authUser, ({ many }) => ({
  sessions: many(authSession),
  accounts: many(authAccount),
}));

export const authSessionRelations = relations(authSession, ({ one }) => ({
  user: one(authUser, { fields: [authSession.userId], references: [authUser.id] }),
}));

export const authAccountRelations = relations(authAccount, ({ one }) => ({
  user: one(authUser, { fields: [authAccount.userId], references: [authUser.id] }),
}));

export type TAuthUser = typeof authUser.$inferSelect;
export type TNewAuthUser = typeof authUser.$inferInsert;
export type TAuthSession = typeof authSession.$inferSelect;
export type TAuthAccount = typeof authAccount.$inferSelect;
export type TAuthTwoFactor = typeof authTwoFactor.$inferSelect;
export type TAuthVerification = typeof authVerification.$inferSelect;
