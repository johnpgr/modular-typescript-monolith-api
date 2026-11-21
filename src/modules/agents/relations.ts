import {defineRelations} from "drizzle-orm"
import * as tables from "./tables.ts"

export const relations = defineRelations(tables, (r) => ({
  conversations: {
    messages: r.many.conversationMessages({
      from: [r.conversations.companyId, r.conversations.id],
      to: [r.conversationMessages.companyId, r.conversationMessages.conversationId],
    }),
  },
  conversationMessages: {
    conversation: r.one.conversations({
      from: [r.conversationMessages.companyId, r.conversationMessages.conversationId],
      to: [r.conversations.companyId, r.conversations.id],
      optional: false,
    }),
  },
}))
