import { NodeClusterSocket } from "@effect/platform-node";
import { SingleRunner } from "effect/cluster";

// Single process (ROLE=all): local dev / Phase 1
export const singleRunnerLayer = SingleRunner.layer()

// Multi-process (ROLE=runner): hosts Entities & Workflows
export const runnerLayer = NodeClusterSocket.layer()

// Multi-process (ROLE=api): sends messages to runners, doesn't host actors
export const clientLayer = NodeClusterSocket.layer({clientOnly: true})
