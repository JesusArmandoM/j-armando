import { sql } from "drizzle-orm";
import { char, check, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { accountRoleName } from "./enums.ts";

// Identity side of the schema (docs/user-and-access-model.md): the account is
// keyed by a unique lowercase email, the password is optional (Quick Access)
// and roles are attributes of the account via the account_role table.

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored lowercase; enforced by chk_account_email_lowercase. */
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("chk_account_email_lowercase", sql`${t.email} = lower(${t.email})`)],
);

export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;

export const accountRole = pgTable(
  "account_role",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id),
    role: accountRoleName("role").notNull(),
  },
  (t) => [unique("uq_account_role_account_role").on(t.accountId, t.role)],
);

export type AccountRole = typeof accountRole.$inferSelect;
export type NewAccountRole = typeof accountRole.$inferInsert;

export const address = pgTable("address", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Null for addresses captured from a guest checkout before account creation. */
  accountId: uuid("account_id").references(() => account.id),
  recipientName: text("recipient_name"),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  state: char("state", { length: 2 }).notNull(),
  zip: text("zip").notNull(),
  country: char("country", { length: 2 }).notNull().default("US"),
  phone: text("phone"),
});

export type Address = typeof address.$inferSelect;
export type NewAddress = typeof address.$inferInsert;
