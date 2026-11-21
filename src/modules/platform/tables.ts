/**
 * platform (L1) — tenants, users and the insert-only audit trail.
 *
 * Prisma origin: Company, User + CompanyUser (collapsed), AuditLog.
 */
import {sql} from "drizzle-orm"
import {boolean, char, check, foreignKey, index, jsonb, snakeCase, text, unique, uuid} from "drizzle-orm/pg-core"
import {companyId, createdAt, id, updatedAt} from "#/shared/Columns.ts"

export const schema = snakeCase.schema("platform")

export const companyPlan = schema.enum("company_plan", ["trial", "basico", "profissional"])
export const userRole = schema.enum("user_role", ["admin", "gestor", "comprador", "rh"])
export const auditActorType = schema.enum("audit_actor_type", ["user", "system"])

export const companies = schema.table(
  "companies",
  {
    id: id(),
    name: text().notNull(),
    /** Digits only. */
    cnpj: char({length: 14}).notNull().unique(),
    plan: companyPlan().notNull().default("trial"),
    /**
     * Inbound WhatsApp number (E.164 digits, no "+"). Routes a webhook to its
     * tenant *before* the sender is looked up by `users(company_id, phone)`.
     */
    whatsappNumber: text().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("companies_cnpj_digits", sql`${t.cnpj} ~ '^[0-9]{14}$'`),
    check("companies_whatsapp_number_e164", sql`${t.whatsappNumber} ~ '^[1-9][0-9]{7,14}$'`),
  ],
)

export const users = schema.table(
  "users",
  {
    id: id(),
    companyId: companyId().references(() => companies.id),
    name: text().notNull(),
    /** Stored lower-cased; globally unique so login needs only email + password. */
    email: text().notNull().unique(),
    passwordHash: text().notNull(),
    role: userRole().notNull(),
    /** E.164 digits, no "+". Identifies who is talking on WhatsApp. */
    phone: text(),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("users_company_id_phone_key").on(t.companyId, t.phone),
    unique("users_company_id_id_key").on(t.companyId, t.id),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_phone_e164", sql`${t.phone} ~ '^[1-9][0-9]{7,14}$'`),
  ],
)

/**
 * Insert-only. Revoke UPDATE/DELETE (or add a trigger) in a custom migration;
 * Drizzle does not model grants/triggers.
 */
export const auditLog = schema.table(
  "audit_log",
  {
    id: id(),
    companyId: companyId().references(() => companies.id),
    actorType: auditActorType().notNull(),
    actorUserId: uuid(),
    /** e.g. "employee.salary_changed" */
    action: text().notNull(),
    /** e.g. "people.employee" */
    entityType: text().notNull(),
    entityId: uuid().notNull(),
    before: jsonb(),
    after: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "audit_log_actor_fk",
      columns: [t.companyId, t.actorUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    check("audit_log_actor_consistency", sql`(${t.actorType} = 'user') = (${t.actorUserId} is not null)`),
    index("audit_log_entity_idx").on(t.companyId, t.entityType, t.entityId),
    index("audit_log_company_id_created_at_idx").on(t.companyId, t.createdAt),
  ],
)
