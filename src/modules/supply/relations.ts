import {defineRelations} from "drizzle-orm"
import * as tables from "./tables.ts"

export const relations = defineRelations(tables, (r) => ({
  suppliers: {
    orders: r.many.purchaseOrders({
      from: [r.suppliers.companyId, r.suppliers.id],
      to: [r.purchaseOrders.companyId, r.purchaseOrders.supplierId],
    }),
  },
  purchaseRequests: {
    items: r.many.purchaseRequestItems({
      from: [r.purchaseRequests.companyId, r.purchaseRequests.id],
      to: [r.purchaseRequestItems.companyId, r.purchaseRequestItems.requestId],
    }),
    order: r.one.purchaseOrders({
      from: [r.purchaseRequests.companyId, r.purchaseRequests.id],
      to: [r.purchaseOrders.companyId, r.purchaseOrders.requestId],
    }),
  },
  purchaseRequestItems: {
    request: r.one.purchaseRequests({
      from: [r.purchaseRequestItems.companyId, r.purchaseRequestItems.requestId],
      to: [r.purchaseRequests.companyId, r.purchaseRequests.id],
      optional: false,
    }),
  },
  purchaseOrders: {
    request: r.one.purchaseRequests({
      from: [r.purchaseOrders.companyId, r.purchaseOrders.requestId],
      to: [r.purchaseRequests.companyId, r.purchaseRequests.id],
      optional: false,
    }),
    supplier: r.one.suppliers({
      from: [r.purchaseOrders.companyId, r.purchaseOrders.supplierId],
      to: [r.suppliers.companyId, r.suppliers.id],
      optional: false,
    }),
    installments: r.many.purchaseOrderInstallments({
      from: [r.purchaseOrders.companyId, r.purchaseOrders.id],
      to: [r.purchaseOrderInstallments.companyId, r.purchaseOrderInstallments.orderId],
    }),
    receipt: r.one.receipts({
      from: [r.purchaseOrders.companyId, r.purchaseOrders.id],
      to: [r.receipts.companyId, r.receipts.orderId],
    }),
  },
  purchaseOrderInstallments: {
    order: r.one.purchaseOrders({
      from: [r.purchaseOrderInstallments.companyId, r.purchaseOrderInstallments.orderId],
      to: [r.purchaseOrders.companyId, r.purchaseOrders.id],
      optional: false,
    }),
  },
  receipts: {
    order: r.one.purchaseOrders({
      from: [r.receipts.companyId, r.receipts.orderId],
      to: [r.purchaseOrders.companyId, r.purchaseOrders.id],
      optional: false,
    }),
    items: r.many.receiptItems({
      from: [r.receipts.companyId, r.receipts.id],
      to: [r.receiptItems.companyId, r.receiptItems.receiptId],
    }),
  },
  receiptItems: {
    receipt: r.one.receipts({
      from: [r.receiptItems.companyId, r.receiptItems.receiptId],
      to: [r.receipts.companyId, r.receipts.id],
      optional: false,
    }),
    requestItem: r.one.purchaseRequestItems({
      from: [r.receiptItems.companyId, r.receiptItems.requestItemId],
      to: [r.purchaseRequestItems.companyId, r.purchaseRequestItems.id],
      optional: false,
    }),
  },
}))
