import { Layer } from "effect";

// TODO: import entity & workflow implementation layers from modules
// import * as ConversationEntity from "./modules/agents/EntityLayer.ts"
// import * as PayrollRunEntity from "./modules/payroll/EntityLayer.ts"

export const layer = Layer.mergeAll(
  // TODO: ConversationEntity.layer
  // TODO: PayrollRunEntity.layer
  Layer.empty
)
