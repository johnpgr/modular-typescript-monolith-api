import { NodeHttpServer } from "@effect/platform-node";
import { Config, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { createServer } from "node:http";

// TODO: Add the other routes here
const Routes = HttpRouter.add("GET", "/health", HttpServerResponse.text("Healthy!"))

const ServerConfig = NodeHttpServer.layerConfig(createServer, {
  port: Config.Port("PORT").pipe(Config.withDefault(8080))
})

export const layer = Routes.pipe(HttpRouter.serve, Layer.provide(ServerConfig))
