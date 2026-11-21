import { Config, Effect, Layer } from "effect";
import * as Http from "#/Http.ts"
import * as Runner from "#/Runner.ts"
import * as Layers from "#/Layers.ts"
import * as Cluster from "#/infra/Cluster.ts"
import { NodeRuntime } from "@effect/platform-node";

const RoleConfig = Config.Literals(["api", "runner", "all"], "ROLE")
  .pipe(Config.withDefault("all"))

const main = Effect.gen(function* () {
  const role = yield* RoleConfig

  const appLayer = role === "api"
    ? Http.layer.pipe(Layer.provide(Cluster.clientLayer))
    : role === "runner"
      ? Runner.layer.pipe(Layer.provide(Cluster.runnerLayer))
      : Layer.mergeAll(Http.layer, Runner.layer)
        .pipe(Layer.provide(Cluster.singleRunnerLayer))

  return yield* Layer.launch(appLayer.pipe(Layer.provide(Layers.base)))
})

NodeRuntime.runMain(main)
