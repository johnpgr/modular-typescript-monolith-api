import {defineRelations} from "drizzle-orm"
import * as tables from "./tables.ts"

export const relations = defineRelations(tables, (r) => ({
  companies: {
    users: r.many.users(),
  },
  users: {
    company: r.one.companies({from: r.users.companyId, to: r.companies.id, optional: false}),
  },
  auditLog: {
    actor: r.one.users({
      from: [r.auditLog.companyId, r.auditLog.actorUserId],
      to: [r.users.companyId, r.users.id],
    }),
  },
}))
