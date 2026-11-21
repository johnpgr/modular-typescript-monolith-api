/**
 * supply (L8) — purchase requests → orders → receipts.
 *
 * Prisma origin: PurchaseRequest, PurchaseRequestItem, PurchaseApproval (single
 * tier → columns), PurchaseOrder (+ payment_installments JSON → table),
 * PurchaseReceipt, PurchaseReceiptItem, FinancialPartner (→ suppliers).
 * Dropped: quotations/RFQ, supply contracts, stock, invoices, refunds.
 */
import {sql} from "drizzle-orm"
import {char, check, foreignKey, index, integer, numeric, primaryKey, smallint, snakeCase, text, unique, uuid} from "drizzle-orm/pg-core"
import {cents, companyId, createdAt, day, id, timestamptz, updatedAt} from "#/shared/Columns.ts"

export const schema = snakeCase.schema("supply")

export const purchaseRequestStatus = schema.enum("purchase_request_status", ["pendente", "aprovada", "rejeitada", "cancelada"])
export const purchaseOrderStatus = schema.enum("purchase_order_status", ["emitido", "recebido", "quitado", "cancelado"])

export const suppliers = schema.table(
  "suppliers",
  {
    id: id(),
    companyId: companyId(),
    name: text().notNull(),
    /** Digits only. */
    cnpj: char({length: 14}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("suppliers_company_id_cnpj_key").on(t.companyId, t.cnpj),
    unique("suppliers_company_id_id_key").on(t.companyId, t.id),
    check("suppliers_cnpj_digits", sql`${t.cnpj} ~ '^[0-9]{14}$'`),
  ],
)

export const purchaseRequests = schema.table(
  "purchase_requests",
  {
    id: id(),
    companyId: companyId(),
    /** platform.users.id */
    requestedBy: uuid().notNull(),
    /** Construction site ("obra"): free text by design. */
    site: text(),
    justification: text().notNull(),
    status: purchaseRequestStatus().notNull().default("pendente"),
    /** platform.users.id — the gestor who approved/rejected. */
    decidedBy: uuid(),
    decidedAt: timestamptz(),
    rejectionReason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("purchase_requests_company_id_id_key").on(t.companyId, t.id),
    check(
      "purchase_requests_decision_consistency",
      sql`(${t.status} in ('aprovada', 'rejeitada')) = (${t.decidedBy} is not null and ${t.decidedAt} is not null)`,
    ),
    check("purchase_requests_rejection_reason", sql`(${t.status} = 'rejeitada') = (${t.rejectionReason} is not null)`),
    index("purchase_requests_company_id_status_idx").on(t.companyId, t.status),
  ],
)

/** Normalizes the spec's `purchase_requests.itens (jsonb)`. */
export const purchaseRequestItems = schema.table(
  "purchase_request_items",
  {
    id: id(),
    companyId: companyId(),
    requestId: uuid().notNull(),
    line: smallint().notNull(),
    description: text().notNull(),
    quantity: numeric({precision: 12, scale: 3}).notNull(),
    unit: text().notNull(),
    estimatedUnitPriceCents: cents(),
  },
  (t) => [
    foreignKey({
      name: "purchase_request_items_request_fk",
      columns: [t.companyId, t.requestId],
      foreignColumns: [purchaseRequests.companyId, purchaseRequests.id],
    }).onDelete("cascade"),
    unique("purchase_request_items_request_id_line_key").on(t.requestId, t.line),
    unique("purchase_request_items_company_id_id_key").on(t.companyId, t.id),
    check("purchase_request_items_line_positive", sql`${t.line} >= 1`),
    check("purchase_request_items_quantity_positive", sql`${t.quantity} > 0`),
    check("purchase_request_items_price_non_negative", sql`${t.estimatedUnitPriceCents} >= 0`),
  ],
)

/**
 * The order total is *derived*: SUM(purchase_order_installments.amount_cents).
 * `status` is a guarded state machine; "quitado" flips exactly once via
 * `UPDATE ... WHERE status = 'recebido'` after the last installment is paid.
 */
export const purchaseOrders = schema.table(
  "purchase_orders",
  {
    id: id(),
    companyId: companyId(),
    requestId: uuid().notNull(),
    supplierId: uuid().notNull(),
    /** Human-facing sequential number per company ("Pedido 42"). */
    number: integer().notNull(),
    status: purchaseOrderStatus().notNull().default("emitido"),
    /** platform.users.id */
    createdBy: uuid().notNull(),
    settledAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "purchase_orders_request_fk",
      columns: [t.companyId, t.requestId],
      foreignColumns: [purchaseRequests.companyId, purchaseRequests.id],
    }),
    foreignKey({
      name: "purchase_orders_supplier_fk",
      columns: [t.companyId, t.supplierId],
      foreignColumns: [suppliers.companyId, suppliers.id],
    }),
    unique("purchase_orders_company_id_number_key").on(t.companyId, t.number),
    /** One order per request. */
    unique("purchase_orders_company_id_request_id_key").on(t.companyId, t.requestId),
    unique("purchase_orders_company_id_id_key").on(t.companyId, t.id),
    check("purchase_orders_number_positive", sql`${t.number} >= 1`),
    check("purchase_orders_settled_consistency", sql`(${t.status} = 'quitado') = (${t.settledAt} is not null)`),
    index("purchase_orders_company_id_supplier_id_idx").on(t.companyId, t.supplierId),
  ],
)

/**
 * Normalizes the spec's `purchase_orders.parcelas` / Prisma's
 * `payment_installments Json`. `(order_id, number)` maps 1:1 to the payable key
 * `(origin "compra", origin_id = order_id, installment = number)`, and
 * `paid_at` makes `finance.payable.pago` consumption idempotent and
 * order-independent (`UPDATE ... SET paid_at = $1 WHERE paid_at IS NULL`).
 */
export const purchaseOrderInstallments = schema.table(
  "purchase_order_installments",
  {
    companyId: companyId(),
    orderId: uuid().notNull(),
    number: smallint().notNull(),
    amountCents: cents().notNull(),
    dueDate: day().notNull(),
    paidAt: timestamptz(),
  },
  (t) => [
    primaryKey({name: "purchase_order_installments_pkey", columns: [t.orderId, t.number]}),
    foreignKey({
      name: "purchase_order_installments_order_fk",
      columns: [t.companyId, t.orderId],
      foreignColumns: [purchaseOrders.companyId, purchaseOrders.id],
    }).onDelete("cascade"),
    check("purchase_order_installments_number_positive", sql`${t.number} >= 1`),
    check("purchase_order_installments_amount_positive", sql`${t.amountCents} > 0`),
  ],
)

export const receipts = schema.table(
  "receipts",
  {
    id: id(),
    companyId: companyId(),
    orderId: uuid().notNull(),
    /** platform.users.id */
    receivedBy: uuid().notNull(),
    receivedAt: timestamptz().notNull().defaultNow(),
    notes: text(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "receipts_order_fk",
      columns: [t.companyId, t.orderId],
      foreignColumns: [purchaseOrders.companyId, purchaseOrders.id],
    }),
    /** One receipt per order: the receipt (and its payables) is created once. */
    unique("receipts_company_id_order_id_key").on(t.companyId, t.orderId),
    unique("receipts_company_id_id_key").on(t.companyId, t.id),
  ],
)

/** Normalizes the spec's `receipts.itens`. */
export const receiptItems = schema.table(
  "receipt_items",
  {
    companyId: companyId(),
    receiptId: uuid().notNull(),
    requestItemId: uuid().notNull(),
    quantity: numeric({precision: 12, scale: 3}).notNull(),
  },
  (t) => [
    primaryKey({name: "receipt_items_pkey", columns: [t.receiptId, t.requestItemId]}),
    foreignKey({
      name: "receipt_items_receipt_fk",
      columns: [t.companyId, t.receiptId],
      foreignColumns: [receipts.companyId, receipts.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "receipt_items_request_item_fk",
      columns: [t.companyId, t.requestItemId],
      foreignColumns: [purchaseRequestItems.companyId, purchaseRequestItems.id],
    }),
    check("receipt_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
)
