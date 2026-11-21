import {defineConfig} from "drizzle-kit"

/** One Postgres schema per module. `public` is left to Effect Cluster's storage tables. */
const moduleSchemas = ["platform", "ai", "gov_filing", "finance", "people", "time", "payroll", "supply", "agents"]

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/*/tables.ts",
  out: "./drizzle",
  schemaFilter: moduleSchemas,
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://postgres:postgres@localhost:5432/obrafacil",
  },
})
