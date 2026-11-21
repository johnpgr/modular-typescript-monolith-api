import {defineRelations} from "drizzle-orm"
import * as tables from "./tables.ts"

export const relations = defineRelations(tables, (r) => ({
  payables: {
    approval: r.one.payableApprovals({
      from: [r.payables.companyId, r.payables.id],
      to: [r.payableApprovals.companyId, r.payableApprovals.payableId],
    }),
  },
  payableApprovals: {
    payable: r.one.payables({
      from: [r.payableApprovals.companyId, r.payableApprovals.payableId],
      to: [r.payables.companyId, r.payables.id],
      optional: false,
    }),
  },
}))
