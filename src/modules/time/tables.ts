/**
 * time (L6) — punches and monthly timesheets.
 *
 * Prisma origin: TimePunch, TimeRecord/DayOccurrence/PontoDecisaoDia (collapsed
 * into the closed timesheet totals), PayrollPeriod.ponto_* (dropped).
 *
 * A timesheet row is upserted on the first punch of the month, so every punch
 * hangs off it. Adding a punch takes `FOR SHARE` on the timesheet and closing
 * takes `FOR UPDATE`: "adjustment on a closed timesheet" is rejected by the
 * owner without races (trap #6).
 */
import {sql} from "drizzle-orm"
import {check, foreignKey, integer, smallint, snakeCase, text, unique, uuid} from "drizzle-orm/pg-core"
import {companyId, competence, createdAt, id, isFirstOfMonth, timestamptz, updatedAt} from "#/shared/Columns.ts"

export const schema = snakeCase.schema("time")

export const punchSource = schema.enum("punch_source", ["app", "totem", "ajuste"])

export const timesheets = schema.table(
  "timesheets",
  {
    id: id(),
    companyId: companyId(),
    /** people.employees.id */
    employeeId: uuid().notNull(),
    competence: competence().notNull(),
    /** Totals are null while open and frozen when closed. */
    normalMinutes: integer(),
    overtimeMinutes: integer(),
    absenceDays: smallint(),
    closedAt: timestamptz(),
    /** platform.users.id */
    closedBy: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("timesheets_company_id_employee_id_competence_key").on(t.companyId, t.employeeId, t.competence),
    unique("timesheets_company_id_id_key").on(t.companyId, t.id),
    check("timesheets_competence_first_day", isFirstOfMonth(t.competence)),
    check(
      "timesheets_closed_totals",
      sql`(${t.closedAt} is null and ${t.normalMinutes} is null and ${t.overtimeMinutes} is null and ${t.absenceDays} is null)
       or (${t.closedAt} is not null and ${t.normalMinutes} >= 0 and ${t.overtimeMinutes} >= 0 and ${t.absenceDays} >= 0)`,
    ),
  ],
)

export const timePunches = schema.table(
  "time_punches",
  {
    id: id(),
    companyId: companyId(),
    timesheetId: uuid().notNull(),
    punchedAt: timestamptz().notNull(),
    source: punchSource().notNull(),
    /** Mandatory for manual adjustments. */
    reason: text(),
    /** platform.users.id — who keyed the adjustment. */
    createdBy: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "time_punches_timesheet_fk",
      columns: [t.companyId, t.timesheetId],
      foreignColumns: [timesheets.companyId, timesheets.id],
    }),
    /** Device retries / double taps collapse into one punch. */
    unique("time_punches_timesheet_id_punched_at_key").on(t.timesheetId, t.punchedAt),
    check("time_punches_adjustment_reason", sql`(${t.source} = 'ajuste') = (${t.reason} is not null)`),
    check("time_punches_adjustment_author", sql`${t.source} <> 'ajuste' or ${t.createdBy} is not null`),
  ],
)
