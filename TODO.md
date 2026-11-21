# ObraFácil — TODO & Roadmap

Modular monolith in TypeScript (**Node 26**, **TS 7 `tsgo`**, **Effect v4 + Effect Cluster**, **Drizzle ORM 1.0 RC**, **Postgres 18**).

## Non-Negotiable Architecture Rules
1. **Strict layers (1 → 9):** `platform` (1) → `ai` (2) → `gov-filing` (3) → `finance` (4) → `people` (5) → `time` (6) → `payroll` (7) → `supply` (8) → `agents` (9). Modules only import lower layers.
2. **Public boundary (`mod.ts`):** Cross-module imports may ONLY target `src/modules/<module>/mod.ts`. Private files (`service.ts`, `tables.ts`, `domain.ts`) are never imported by other modules.
3. **Single writer:** Each module owns its own `tables.ts` (Drizzle). Other modules mutate foreign state only via the owner's service API (sharing transactions automatically via `SqlClient.withTransaction`).
4. **Upward communication only via messages/actors:** Lower layers never import upper layers. Use durable messaging / Cluster Entities & Events wired at the composition root.
5. **Heavy work runs in `Runner`:** PDFs, payroll runs, gov polling, and LLM turns execute in Cluster `Entity`/`Workflow` runners; HTTP routes stay `< 200 ms`.
6. **AI only through `ai` gateway:** No other module imports `@effect/ai-openai`. Agent tools call module `mod.ts`, never tables directly.
7. **Zero business logic in kernel:** `src/infra/*` and `src/shared/*` never import from `src/modules/*`.
8. **Multi-tenant (`company_id`):** Every business table is scoped by `company_id` and verified by automated tests.

---

## M0 — Skeleton & Guardrails

### Already Done
- [x] Repo initialized (Node 26, TS 7 `tsgo`, `oxlint`, `oxfmt`, `#/*` subpath imports)
- [x] Core dependencies installed (`effect@4.1.5`, `@effect/platform-node`, `@effect/sql-pg`, `@effect/ai-openai`, `drizzle-orm@rc`, `drizzle-kit@rc`, `@sentry/effect`, `pdfkit`)
- [x] `compose.yml` with Postgres 18 (`/var/lib/postgresql`) + Jaeger v2 (OTLP `4318`, UI `16686`)
- [x] `src/infra/Sql.ts` (dev default URL, strict `DATABASE_URL` in prod)
- [x] `src/infra/Observability.ts` (Sentry if `SENTRY_DSN`, local Jaeger OTLP if `OTEL_EXPORTER_OTLP_ENDPOINT`, `Layer.empty` otherwise)
- [x] `src/infra/Cluster.ts` (`singleRunnerLayer`, `runnerLayer`, `clientLayer`)
- [x] `src/Main.ts` (`ROLE=api|runner|all`), `src/Http.ts` (`/health`), `src/Runner.ts`, `src/Layers.ts` (`Sql`, `Observability`, `NodeCrypto`)

### Remaining in M0
- [ ] Configure Drizzle migrations (`drizzle.config.ts` scanning `src/modules/*/tables.ts` + migration runner via `PgMigrator` or `drizzle-kit`)
- [ ] Install & configure test runner: `vitest`, `@effect/vitest`, `@testcontainers/postgresql` (update `npm test` script)
- [ ] Create `docs/module-map.json` as source of truth (9 modules, layers 1–9, table ownership)
- [ ] Scaffold all 9 folders under `src/modules/` with empty `mod.ts` + `AGENTS.md`:
  - `platform`, `ai`, `gov-filing`, `finance`, `people`, `time`, `payroll`, `supply`, `agents`
- [ ] Create `src/shared/` primitives:
  - `Ids.ts` (branded `Schema` IDs: `CompanyId`, `UserId`, `EmployeeId`, etc.)
  - `Errors.ts` (common `Schema.TaggedError`s)
  - `Auth.ts` (`CurrentUser` / tenant `Context.Service`)
- [ ] Generate `.dependency-cruiser.cjs` from `docs/module-map.json` enforcing:
  - Layer direction (no upward imports, no cycles)
  - Cross-module imports only via `mod.ts` (blocks importing `tables.ts` / `service.ts` of another module)
  - `src/infra` and `src/shared` cannot import `src/modules`
- [ ] Add GitHub Actions CI (`typecheck`, `lint`, `dependency-cruiser`, `test`)
- [ ] **M0 Done Gate:** Prove CI fails on a forbidden cross-layer import or importing another module's `tables.ts`

---

## M1 — `platform` (L1) & `finance` (L4)

### `platform`
- [ ] Tables (`tables.ts`): `companies`, `users` (`unique(company_id, telefone)`), `audit_log` (insert-only)
- [ ] Auth: register company & users (`admin | gestor | comprador | rh`), JWT login (`companyId` + `role`)
- [ ] Tenant HTTP middleware injecting `CurrentUser` into Effect context
- [ ] Audit API (`recordAudit`) callable by all higher modules
- [ ] **Acceptance:** Route test fails if any business route lacks tenant auth; multi-tenant test proves Company A cannot read Company B's data

### `finance`
- [ ] Tables (`tables.ts`): `payables` (`unique(origem, origem_id, parcela)`), `payable_approvals`
- [ ] Document public vs private boundary of `finance/mod.ts` before coding
- [ ] Idempotent `createPayable` (using unique constraint, NOT `if (exists)`)
- [ ] Tiered approval (`<= R$ 5.000` gestor, `> R$ 5.000` admin; creator cannot approve)
- [ ] Pay approved payable command (will emit durable event in M3)
- [ ] **Acceptance:** Calling `createPayable` twice with the same `(origem, origem_id, parcela)` returns the same record

---

## M2 — `supply` (L8) calling `finance` (L4)

- [ ] Tables (`tables.ts`): `purchase_requests`, `purchase_orders`, `receipts`
- [ ] Flow: request → gestor approval → PO (supplier, amount, installments) → receipt
- [ ] Receipt creates 1 payable per installment **atomically in the same `sql.withTransaction` block** (calling `finance.createPayable`)
- [ ] Solve **Trap #1:** Payable listing displays readable origin description (e.g. `"Pedido 42, Cimentos Silva, parcela 2/3"`) without `finance` importing `supply`
- [ ] Write `docs/adr/01-origin-description.md`
- [ ] **Acceptance:** Forced failure after creating 2nd installment rolls back both receipt and all payables; `finance` has zero imports from `supply`

---

## M3 — Durable Messaging, Cluster Actors & Multi-Runner

- [ ] Design upward durable event mechanism on Postgres/Cluster (delivering `finance.payable.pago` to upper layers without upward imports)
- [ ] Implement consumer idempotency (`inbox` table `unique(message_id, consumidor)` or Cluster `PrimaryKey` deduplication)
- [ ] Wire `finance.payable.pago` → `supply` marks PO `"quitado"` once all distinct installments are paid
- [ ] **Actor Phase 1 (`SingleRunner`):** Build first durable `Entity` using `SqlMessageStorage` + `ClusterSchema.Persisted` + `TestClock` tests
- [ ] **Actor Phase 2 (`NodeClusterSocket`):** Run `ROLE=api` + 2× `ROLE=runner` locally/Docker to test sharding, cross-node RPC routing, and shard rebalancing on `kill -9`
- [ ] Write `docs/adr/02-payable-paid-events.md`
- [ ] **Acceptance:** `kill -9` mid-processing loses/duplicates nothing; duplicate + out-of-order payment events (3, 1, 3, 2) settle PO exactly once

---

## M4 — `people` (L5), `time` (L6) & `payroll` (L7)

### `people`
- [ ] Table: `employees` (`unique(company_id, cpf)`)
- [ ] Admit employee + enqueue gov admission event **in the same transaction** (stub `gov-filing` recording to DB for now)
- [ ] Change role/salary with audit log
- [ ] Terminate employee (solve **Trap #3** — decide ownership & write `docs/adr/03-termination-process.md`)
- [ ] React to `gov.evento.rejeitado` → mark employee `"pendência cadastral"`

### `time`
- [ ] Tables: `time_punches`, `timesheets` (`unique(employee_id, competência)`)
- [ ] Pure calculation in `domain.ts` (8h/workday, overtime, absences) with table-driven unit tests
- [ ] Close timesheet; reject manual adjustments on closed timesheet (**Trap #6** → `docs/adr/06-closed-timesheet.md`)
- [ ] Open hours balance query

### `payroll`
- [ ] Tables: `payroll_runs` (`unique(company_id, competência)`), `payslips` (`unique(run_id, employee_id)`)
- [ ] **`PayrollRunEntity` actor** (`entityId = ${companyId}:${competencia}`) — serializes concurrent triggers (**Trap #10** → `docs/adr/10-payroll-race-condition.md`)
- [ ] Requires all timesheets closed; calculates gross/11% flat deduction/net
- [ ] Resumable payslip + `pdfkit` PDF generation in runner + SSE status (**Trap #8** → `docs/adr/08-async-pdf.md`)
- [ ] Consolidated `"FOLHA"` payable + gov remuneration event per employee; marks payroll `"paga"` on `finance.payable.pago`
- [ ] Severance calculation (`"RESCISAO"` payable) triggered by termination
- [ ] **Acceptance:** Concurrent payroll runs execute only once; `kill -9` mid-run resumes with zero duplicate payslips or payables

---

## M5 — `gov-filing` (L3) & Unstable Government Mock

- [ ] Build standalone `mock-gov/` HTTP service (receives event → returns protocol → asynchronously decides `aceito` / `rejeitado` with configurable latency & failure rate)
- [ ] Table: `gov_events` (`unique(company_id, tipo, referência)`)
- [ ] **`GovEventEntity` actor** (`entityId = ${companyId}:${tipo}:${referencia}`): durable state machine (`pendente → enviado → consultando → aceito | rejeitado`)
- [ ] Timeouts on all network calls, exponential backoff + jitter (`Schedule`), dead-letter after 5 failures, admin reprocess endpoint
- [ ] Emit durable `gov.evento.aceito` and `gov.evento.rejeitado`
- [ ] Solve **Traps #4 & #5** → write `docs/adr/04-gov-io-outside-tx.md` & `docs/adr/05-gov-rejection-event.md`
- [ ] **Acceptance:** 500 events with 30% failure + 2s latency all reach final state or dead-letter with zero duplicate submissions

---

## M6 — `ai` Gateway (L2) & `agents` WhatsApp Assistant (L9)

### `ai`
- [ ] Tables: `ai_usage`, `ai_budgets`
- [ ] Central task registry (`task → model, timeout, retries`)
- [ ] Deterministic fake provider (default — zero API keys!) + optional `@effect/ai-openai` provider when `OPENAI_API_KEY` is set
- [ ] `complete` & `stream` with interruption/cancellation, total timeout, `OrcamentoEsgotado` tagged error, atomic budget debit (or **`AiBudgetEntity` actor** to compare actor vs SQL atomic update)
- [ ] **Acceptance:** Exhausted budget fails with `OrcamentoEsgotado` without calling provider; aborted stream cancels provider & records partial usage

### `agents`
- [ ] Tables: `conversations`, `conversation_messages`
- [ ] WhatsApp webhook with HMAC verification (`NodeCrypto` `Mac`) + webhook idempotency
- [ ] CLI WhatsApp simulator (`tools/whatsapp-sim.ts`)
- [ ] **`ConversationEntity` actor** (`entityId = conversationId`) — guarantees 1 turn at a time per conversation + idle passivation
- [ ] 4 agent tools calling module `mod.ts` ONLY: `consultar_saldo_horas`, `abrir_requisicao`, `status_pedido`, `meu_holerite`
- [ ] Solve **Traps #7 & #9** → write `docs/adr/07-tool-authorization.md` & `docs/adr/09-llm-outside-tx.md`
- [ ] **Acceptance:** Duplicate webhook → 1 reply; 3 messages in 1s → ordered replies; buyer cannot view another employee's payslip

---

## M7 — Observability & Chaos Verification

- [ ] End-to-end trace propagation verified in **local Jaeger** (`http://localhost:16686`): WhatsApp webhook → `ConversationEntity` → tool → module `mod.ts` → Postgres
- [ ] Test optional **Sentry** activation with `SENTRY_DSN`
- [ ] Expose operational metrics (mailbox backlog, oldest pending message, failures by type/entity)
- [ ] Run all **12 Chaos Scenarios** and log results in `docs/aprendizados.md`:
  - [ ] #1 `kill -9` runner mid-payroll → resumes, zero duplicates
  - [ ] #2 Two concurrent payrolls for same month across 2 runners → only 1 executes
  - [ ] #3 Out-of-order + duplicate `payable.pago` (3, 1, 3, 2) → PO settled once
  - [ ] #4 500 gov events at 30% error / 2s latency → all terminal/DLQ, zero duplicates
  - [ ] #5 Gov mock down 10 min → API stays fast, drains cleanly on recovery
  - [ ] #6 Duplicate WhatsApp webhook → single response
  - [ ] #7 3 messages in 1s from same user → strictly ordered, 1 turn at a time
  - [ ] #8 Company A exhausts AI budget → friendly message, Company B unaffected
  - [ ] #9 Client drops SSE mid-stream → LLM call interrupted, partial usage saved
  - [ ] #10 Forced error mid-receipt → zero receipt or payables persisted
  - [ ] #11 Cross-tenant access by ID → 404 + route coverage test enforces guard
  - [ ] #12 300 PDF payslips generating → HTTP API p95 latency unchanged

---

## Final Deliverables & Optional Bonus Branches
- [ ] All 10 ADRs written in `docs/adr/`
- [ ] `docs/aprendizados.md` complete with chaos findings
- [ ] 1-page architecture `README.md` with module map & local run instructions
- [ ] *(Bonus B4)* Model employee termination as a durable **`effect/workflow`** on top of Effect Cluster
- [ ] *(Bonus B6)* Extract `gov-filing` into an independent service communicating over Cluster/RPC
- [ ] *(Bonus B8)* Build top-layer `panels` summary module reading across 5 modules
