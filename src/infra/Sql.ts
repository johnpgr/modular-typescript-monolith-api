import {PgClient} from "@effect/sql-pg"
import {Config, Effect, Layer, Redacted} from "effect"

const LOCAL_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/obrafacil"

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const env = yield* Config.String("NODE_ENV")
      .pipe(Config.withDefault("development"))

    const url = env === "production"
      ? yield* Config.Redacted("DATABASE_URL")
      : yield* Config.Redacted("DATABASE_URL")
        .pipe(Config.withDefault(Redacted.make(LOCAL_DATABASE_URL)))

    return PgClient.layer({url})
  })
)
