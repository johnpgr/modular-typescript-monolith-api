import {defineRelations} from "drizzle-orm"
import * as tables from "./tables.ts"

export const relations = defineRelations(tables, (r) => ({
  payrollRuns: {
    payslips: r.many.payslips({
      from: [r.payrollRuns.companyId, r.payrollRuns.id],
      to: [r.payslips.companyId, r.payslips.runId],
    }),
  },
  payslips: {
    run: r.one.payrollRuns({
      from: [r.payslips.companyId, r.payslips.runId],
      to: [r.payrollRuns.companyId, r.payrollRuns.id],
      optional: false,
    }),
  },
}))
