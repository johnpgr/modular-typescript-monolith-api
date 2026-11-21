import { Layer } from "effect";
import * as Sql from "#/infra/Sql.ts"
import * as Observability from "#/infra/Observability.ts"
import { NodeCrypto } from "@effect/platform-node";

export const infra = Layer.mergeAll(
  Sql.layer,
  Observability.layer,
  NodeCrypto.layer,
)

export const base = Layer.mergeAll(
  // TODO: Finance.layer
  // TODO: Supply.layer
  Layer.empty
).pipe(Layer.provideMerge(infra))
