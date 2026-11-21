/**
 * finance (L4) — accounts payable and tiered approvals.
 *
 * Prisma origin: Payable (financial_payables), PaymentApproval.
 * Dropped: FinancialPartner/category/recurrence/invoice/boleto machinery.
 */
import {sql} from "drizzle-orm"
import {check, foreignKey, index, smallint, snakeCase, text, unique, uuid} from "drizzle-orm/pg-core"
import {cents, companyId, createdAt, day, id, timestamptz, updatedAt} from "#/shared/Columns.ts"

export const schema = snakeCase.schema("finance")

export const payableStatus = schema.enum("payable_status", ["pendente", "aprovada", "rejeitada", "paga", "cancelada"])
/** Approval tier ("alçada"): <= R$ 5.000 gestor, above that admin. */
export const approvalLevel = schema.enum("approval_level", ["gestor", "admin"])
export const approvalDecision = schema.enum("approval_decision", ["aprovada", "rejeitada"])

export const payables = schema.table(
  "payables",
  {
    id: id(),
    companyId: companyId(),
    /**
     * Opaque namespace owned by the caller ("compra", "folha", "rescisao", ...).
     * Deliberately `text`, not an enum: an enum would make finance (L4) encode
     * knowledge of upper layers and require a finance migration per new origin.
     */
    origin: text().notNull(),
    /** Id of the originating record in the caller's module (PO, payroll run, severance). */
    originId: uuid().notNull(),
    installment: smallint().notNull().default(1),
    installmentCount: smallint().notNull().default(1),
    /** Human-readable origin, e.g. "Pedido 42, Cimentos Silva, parcela 2/3" (see ADR 01). */
    description: text().notNull(),
    amountCents: cents().notNull(),
    dueDate: day().notNull(),
    costCenter: text(),
    status: payableStatus().notNull().default("pendente"),
    /** platform.users.id — null when created by the system. Creator cannot approve. */
    createdBy: uuid(),
    paidAt: timestamptz(),
    paidBy: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** Idempotency key for `createPayable`: INSERT ... ON CONFLICT DO NOTHING. */
    unique("payables_origin_key").on(t.companyId, t.origin, t.originId, t.installment),
    unique("payables_company_id_id_key").on(t.companyId, t.id),
    check("payables_amount_positive", sql`${t.amountCents} > 0`),
    check("payables_installment_range", sql`${t.installment} between 1 and ${t.installmentCount}`),
    check("payables_paid_consistency", sql`(${t.status} = 'paga') = (${t.paidAt} is not null)`),
    index("payables_company_id_status_due_date_idx").on(t.companyId, t.status, t.dueDate),
  ],
)

/**
 * The required tier is derived from `payables.amount_cents` (not stored on the
 * payable); `level` records which tier actually decided.
 */
export const payableApprovals = schema.table(
  "payable_approvals",
  {
    id: id(),
    companyId: companyId(),
    payableId: uuid().notNull().unique(),
    level: approvalLevel().notNull(),
    decision: approvalDecision().notNull(),
    /** platform.users.id */
    approverId: uuid().notNull(),
    comment: text(),
    decidedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "payable_approvals_payable_fk",
      columns: [t.companyId, t.payableId],
      foreignColumns: [payables.companyId, payables.id],
    }),
    check("payable_approvals_rejection_comment", sql`${t.decision} <> 'rejeitada' or ${t.comment} is not null`),
  ],
)
