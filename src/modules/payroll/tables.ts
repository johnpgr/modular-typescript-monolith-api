/**
 * payroll (L7) — monthly runs, payslips and severances.
 *
 * Prisma origin: PayrollPeriod, PayrollEntry (+ PayrollItem dropped: the slim
 * formula has no rubrics), Termination's money columns → severances.
 *
 * Links to finance are by origin key, not by stored payable ids:
 *   FOLHA    → (origin "folha",    origin_id = payroll_runs.id, installment 1)
 *   RESCISAO → (origin "rescisao", origin_id = severances.id,   installment 1)
 */
import {type SQL, sql} from "drizzle-orm"
import {check, foreignKey, integer, smallint, snakeCase, text, unique, uuid} from "drizzle-orm/pg-core"
import {
  cents,
  companyId,
  competence,
  createdAt,
  day,
  id,
  isFirstOfMonth,
  timestamptz,
  updatedAt,
} from "#/shared/Columns.ts"

export const schema = snakeCase.schema("payroll")

export const payrollRunStatus = schema.enum("payroll_run_status", ["pendente", "calculando", "calculada", "paga", "falhou"])

export const payrollRuns = schema.table(
  "payroll_runs",
  {
    id: id(),
    companyId: companyId(),
    competence: competence().notNull(),
    status: payrollRunStatus().notNull().default("pendente"),
    /** platform.users.id */
    requestedBy: uuid().notNull(),
    failureReason: text(),
    calculatedAt: timestamptz(),
    paidAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** One payroll per month. Backs `PayrollRunEntity` (`${companyId}:${competence}`), trap #10. */
    unique("payroll_runs_company_id_competence_key").on(t.companyId, t.competence),
    unique("payroll_runs_company_id_id_key").on(t.companyId, t.id),
    check("payroll_runs_competence_first_day", isFirstOfMonth(t.competence)),
    check("payroll_runs_calculated_consistency", sql`(${t.status} in ('calculada', 'paga')) = (${t.calculatedAt} is not null)`),
    check("payroll_runs_paid_consistency", sql`(${t.status} = 'paga') = (${t.paidAt} is not null)`),
    check("payroll_runs_failure_consistency", sql`(${t.status} = 'falhou') = (${t.failureReason} is not null)`),
  ],
)

/**
 * Inputs are snapshots taken at calculation time (salary from people, totals
 * from the closed timesheet) so a payslip is reproducible after later changes.
 */
export const payslips = schema.table(
  "payslips",
  {
    id: id(),
    companyId: companyId(),
    runId: uuid().notNull(),
    /** people.employees.id */
    employeeId: uuid().notNull(),
    baseSalaryCents: cents().notNull(),
    overtimeMinutes: integer().notNull(),
    absenceDays: smallint().notNull(),
    grossCents: cents().notNull(),
    deductionsCents: cents().notNull(),
    netCents: cents()
      .notNull()
      .generatedAlwaysAs((): SQL => sql`gross_cents - deductions_cents`),
    /** Object-storage key; null until the runner renders the PDF. */
    pdfKey: text(),
    pdfGeneratedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "payslips_run_fk",
      columns: [t.companyId, t.runId],
      foreignColumns: [payrollRuns.companyId, payrollRuns.id],
    }),
    /** Resumable run: re-inserting a payslip after a crash is a no-op. */
    unique("payslips_run_id_employee_id_key").on(t.runId, t.employeeId),
    check("payslips_base_salary_positive", sql`${t.baseSalaryCents} > 0`),
    check("payslips_inputs_non_negative", sql`${t.overtimeMinutes} >= 0 and ${t.absenceDays} >= 0`),
    check("payslips_deductions_range", sql`${t.deductionsCents} between 0 and ${t.grossCents}`),
    check("payslips_pdf_consistency", sql`(${t.pdfKey} is null) = (${t.pdfGeneratedAt} is null)`),
  ],
)

export const severances = schema.table(
  "severances",
  {
    id: id(),
    companyId: companyId(),
    /** people.employees.id */
    employeeId: uuid().notNull(),
    /** Snapshot of people.employees.terminated_on. */
    terminatedOn: day().notNull(),
    baseSalaryCents: cents().notNull(),
    /** "Saldo de salário": days worked in the termination month. */
    salaryBalanceCents: cents().notNull(),
    /** 1/12 of salary per month worked in the year. */
    proportionalCents: cents().notNull(),
    totalCents: cents()
      .notNull()
      .generatedAlwaysAs((): SQL => sql`salary_balance_cents + proportional_cents`),
    createdAt: createdAt(),
  },
  (t) => [
    /** A termination always yields exactly one severance, even across crashes. */
    unique("severances_company_id_employee_id_key").on(t.companyId, t.employeeId),
    check(
      "severances_amounts_non_negative",
      sql`${t.baseSalaryCents} > 0 and ${t.salaryBalanceCents} >= 0 and ${t.proportionalCents} >= 0`,
    ),
  ],
)
