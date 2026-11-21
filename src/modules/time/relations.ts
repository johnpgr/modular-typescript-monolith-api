import {defineRelations} from "drizzle-orm"
import * as tables from "./tables.ts"

export const relations = defineRelations(tables, (r) => ({
  timesheets: {
    punches: r.many.timePunches({
      from: [r.timesheets.companyId, r.timesheets.id],
      to: [r.timePunches.companyId, r.timePunches.timesheetId],
    }),
  },
  timePunches: {
    timesheet: r.one.timesheets({
      from: [r.timePunches.companyId, r.timePunches.timesheetId],
      to: [r.timesheets.companyId, r.timesheets.id],
      optional: false,
    }),
  },
}))
