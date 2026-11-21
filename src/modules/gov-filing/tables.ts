/**
 * gov-filing (L3) — outbound government events (eSocial miniature).
 *
 * Prisma origin: EsocialEvent (+ EsocialRetorno folded into protocol/result columns).
 * The retry schedule lives in the `GovEventEntity` (Cluster), not in this table.
 */
import {sql} from "drizzle-orm"
import {check, index, integer, jsonb, snakeCase, text, unique} from "drizzle-orm/pg-core"
import {companyId, createdAt, id, timestamptz, updatedAt} from "#/shared/Columns.ts"

export const schema = snakeCase.schema("gov_filing")

export const govEventType = schema.enum("gov_event_type", ["admissao", "remuneracao", "desligamento"])
export const govEventStatus = schema.enum("gov_event_status", [
  "pendente",
  "enviado",
  "consultando",
  "aceito",
  "rejeitado",
  "dead_letter",
])

export const govEvents = schema.table(
  "gov_events",
  {
    id: id(),
    companyId: companyId(),
    type: govEventType().notNull(),
    /** Business key chosen by the caller, e.g. employee id or `${competence}:${employeeId}`. */
    reference: text().notNull(),
    payload: jsonb().notNull(),
    status: govEventStatus().notNull().default("pendente"),
    /** Returned by the government on submission. */
    protocol: text(),
    attempts: integer().notNull().default(0),
    /** Last transport/technical error (timeouts, 5xx). */
    lastError: text(),
    /** Business rejection reason returned by the government. */
    rejectionReason: text(),
    sentAt: timestamptz(),
    resolvedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** The same event is never enqueued (nor sent) twice. */
    unique("gov_events_company_id_type_reference_key").on(t.companyId, t.type, t.reference),
    check("gov_events_attempts_non_negative", sql`${t.attempts} >= 0`),
    check(
      "gov_events_protocol_after_send",
      sql`${t.status} not in ('enviado', 'consultando', 'aceito', 'rejeitado') or ${t.protocol} is not null`,
    ),
    check("gov_events_resolved_consistency", sql`(${t.status} in ('aceito', 'rejeitado')) = (${t.resolvedAt} is not null)`),
    check("gov_events_rejection_consistency", sql`(${t.status} = 'rejeitado') = (${t.rejectionReason} is not null)`),
    index("gov_events_company_id_status_idx").on(t.companyId, t.status),
  ],
)
