/**
 * people (L5) — employees.
 *
 * Prisma origin: Employee (~110 columns → 14), Termination (1:1, folded in).
 * Employment status is *derived*: `terminated_on IS NULL` ⇒ active. The only
 * stored status is the orthogonal registration status set by gov rejections.
 */
import {sql} from "drizzle-orm"
import {char, check, snakeCase, text, unique, uuid} from "drizzle-orm/pg-core"
import {cents, companyId, createdAt, day, id, updatedAt} from "#/shared/Columns.ts"

export const schema = snakeCase.schema("people")

export const registrationStatus = schema.enum("registration_status", ["regular", "pendencia_cadastral"])

export const employees = schema.table(
  "employees",
  {
    id: id(),
    companyId: companyId(),
    /** platform.users.id — lets the assistant resolve "my payslip / my hours". */
    userId: uuid(),
    name: text().notNull(),
    /** Digits only. */
    cpf: char({length: 11}).notNull(),
    jobTitle: text().notNull(),
    salaryCents: cents().notNull(),
    /** Construction site ("obra"): free text by design. */
    site: text(),
    registrationStatus: registrationStatus().notNull().default("regular"),
    registrationIssue: text(),
    admittedOn: day().notNull(),
    terminatedOn: day(),
    terminationReason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("employees_company_id_cpf_key").on(t.companyId, t.cpf),
    unique("employees_company_id_user_id_key").on(t.companyId, t.userId),
    check("employees_cpf_digits", sql`${t.cpf} ~ '^[0-9]{11}$'`),
    check("employees_salary_positive", sql`${t.salaryCents} > 0`),
    check("employees_termination_after_admission", sql`${t.terminatedOn} >= ${t.admittedOn}`),
    check("employees_termination_consistency", sql`(${t.terminatedOn} is null) = (${t.terminationReason} is null)`),
    check(
      "employees_registration_consistency",
      sql`(${t.registrationStatus} = 'pendencia_cadastral') = (${t.registrationIssue} is not null)`,
    ),
  ],
)
