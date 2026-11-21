import { Config, Redacted, Effect, Layer, Option } from "effect";
import * as Sentry from "@sentry/effect"
import { Otlp, OtlpSerialization } from "effect/observability";
import { FetchHttpClient } from "effect/http";

const ObservabilityConfig = Config.all({
  sentryDsn: Config.option(Config.Redacted("SENTRY_DSN")),
  otlpEndpoint: Config.option(Config.String("OTEL_EXPORTER_OTLP_ENDPOINT")),
  environment: Config.String("NODE_ENV").pipe(Config.withDefault("development"))
})

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const { sentryDsn, otlpEndpoint, environment } = yield* ObservabilityConfig

    if (Option.isSome(sentryDsn)) {
      return Sentry.effectLayer({
        dsn: Redacted.value(sentryDsn.value),
        environment,
        tracesSampleRate: environment === "production" ? 0.2 : 1.0,
      })
    }

    if (Option.isSome(otlpEndpoint)) {
      return Otlp.layer({
        baseUrl: otlpEndpoint.value,
        resource: { serviceName: "obrafacil" }
      }).pipe(
        Layer.provide(OtlpSerialization.layerJson),
        Layer.provide(FetchHttpClient.layer)
      )
    }

    return Layer.empty
  })
)
