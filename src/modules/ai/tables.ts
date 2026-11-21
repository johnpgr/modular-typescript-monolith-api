/**
 * ai (L2) — LLM gateway bookkeeping: per-call usage and monthly budgets.
 *
 * Prisma origin: AiUsageEvent (budget used to be a plan limit; now its own table).
 */
import {sql} from "drizzle-orm"
import {check, index, integer, primaryKey, snakeCase, text, uuid} from "drizzle-orm/pg-core"
import {cents, companyId, competence, createdAt, id, isFirstOfMonth, updatedAt} from "#/shared/Columns.ts"

export const schema = snakeCase.schema("ai")

export const aiProvider = schema.enum("ai_provider", ["fake", "openai"])
export const aiUsageOutcome = schema.enum("ai_usage_outcome", [
  "concluido",
  /** Caller interrupted (e.g. SSE client disconnected); usage is partial. */
  "interrompido",
  "expirado",
  "falhou",
])

/**
 * One row per (company, month). Debit atomically:
 *   UPDATE ai.ai_budgets SET spent_cents = spent_cents + $1
 *   WHERE company_id = $2 AND competence = $3 AND spent_cents < limit_cents
 * No CHECK (spent <= limit): partial usage of an aborted stream may overshoot.
 */
export const aiBudgets = schema.table(
  "ai_budgets",
  {
    companyId: companyId(),
    competence: competence().notNull(),
    limitCents: cents().notNull(),
    spentCents: cents().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({name: "ai_budgets_pkey", columns: [t.companyId, t.competence]}),
    check("ai_budgets_competence_first_day", isFirstOfMonth(t.competence)),
    check("ai_budgets_limit_non_negative", sql`${t.limitCents} >= 0`),
    check("ai_budgets_spent_non_negative", sql`${t.spentCents} >= 0`),
  ],
)

export const aiUsage = schema.table(
  "ai_usage",
  {
    id: id(),
    companyId: companyId(),
    /** platform.users.id — null for system-initiated calls. */
    userId: uuid(),
    /** Key in the central task registry, e.g. "agents.turn". */
    task: text().notNull(),
    provider: aiProvider().notNull(),
    model: text().notNull(),
    outcome: aiUsageOutcome().notNull(),
    tokensIn: integer().notNull().default(0),
    tokensOut: integer().notNull().default(0),
    costCents: cents().notNull().default(0),
    durationMs: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "ai_usage_non_negative",
      sql`${t.tokensIn} >= 0 and ${t.tokensOut} >= 0 and ${t.costCents} >= 0 and ${t.durationMs} >= 0`,
    ),
    index("ai_usage_company_id_created_at_idx").on(t.companyId, t.createdAt),
  ],
)
