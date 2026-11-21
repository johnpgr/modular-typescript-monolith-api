/**
 * agents (L9) — WhatsApp assistant conversations.
 *
 * Prisma origin: AgentConversation, AgentMessage, InboundMessage (the inbound
 * buffer is replaced by the `ConversationEntity` mailbox; webhook idempotency
 * moves to `conversation_messages.external_id`).
 */
import {sql} from "drizzle-orm"
import {check, foreignKey, index, snakeCase, text, unique, uuid} from "drizzle-orm/pg-core"
import {companyId, createdAt, id, timestamptz} from "#/shared/Columns.ts"

export const schema = snakeCase.schema("agents")

export const conversationChannel = schema.enum("conversation_channel", ["whatsapp"])
/** LLM roles (technical vocabulary, hence English). */
export const messageRole = schema.enum("message_role", ["user", "assistant", "tool"])

/** `ConversationEntity` id = conversations.id. */
export const conversations = schema.table(
  "conversations",
  {
    id: id(),
    companyId: companyId(),
    /** platform.users.id — resolved from the sender phone. */
    userId: uuid().notNull(),
    channel: conversationChannel().notNull(),
    lastMessageAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("conversations_company_id_user_id_channel_key").on(t.companyId, t.userId, t.channel),
    unique("conversations_company_id_id_key").on(t.companyId, t.id),
  ],
)

/** Ordered by `id` (UUIDv7). */
export const conversationMessages = schema.table(
  "conversation_messages",
  {
    id: id(),
    companyId: companyId(),
    conversationId: uuid().notNull(),
    role: messageRole().notNull(),
    content: text().notNull(),
    /** Tool invoked, for `role = 'tool'` (e.g. "consultar_saldo_horas"). */
    toolName: text(),
    /** Provider message id (WhatsApp `wamid`): duplicate webhooks hit the unique key. */
    externalId: text(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "conversation_messages_conversation_fk",
      columns: [t.companyId, t.conversationId],
      foreignColumns: [conversations.companyId, conversations.id],
    }).onDelete("cascade"),
    unique("conversation_messages_conversation_id_external_id_key").on(t.conversationId, t.externalId),
    check("conversation_messages_tool_name", sql`(${t.role} = 'tool') = (${t.toolName} is not null)`),
    index("conversation_messages_conversation_id_id_idx").on(t.conversationId, t.id),
  ],
)
