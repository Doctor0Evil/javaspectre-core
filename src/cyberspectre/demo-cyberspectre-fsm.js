// javaspectre-core/src/cyberspectre/demo-cyberspectre-fsm.js
// !/usr/bin/env node

import { CyberspectreFsmDiagramGenerator } from "./CyberspectreFsmDiagramGenerator.js";
import {
  CyberspectreNodeStage,
  CyberspectreEvent
} from "./CyberspectreVirtualObjectPipeline.js";

// Minimal demo events (in practice, capture real CyberspectreEvent instances).
const voId = "cyber-vo-obj123";
const events = [
  new CyberspectreEvent({
    stage: CyberspectreNodeStage.GeminiTextNode,
    virtualObjectId: voId,
    almShardRef: "alm-shard-bostrom-456",
    hostDid: "did:bostrom:bostrom123",
    authorDid: "did:author:456",
    notes: "Start",
    safetyTier: "unknown"
  }),
  new CyberspectreEvent({
    stage: CyberspectreNodeStage.ParsedCometChatNanoswarm,
    virtualObjectId: voId,
    almShardRef: "alm-shard-bostrom-456",
    hostDid: "did:bostrom:bostrom123",
    authorDid: "did:author:456",
    notes: "Parsed",
    safetyTier: "show-with-warning"
  }),
  new CyberspectreEvent({
    stage: CyberspectreNodeStage.ComplianceGateYes,
    virtualObjectId: voId,
    almShardRef: "alm-shard-bostrom-456",
    hostDid: "did:bostrom:bostrom123",
    authorDid: "did:author:456",
    notes: "Compliant",
    safetyTier: "auto-use"
  }),
  new CyberspectreEvent({
    stage: CyberspectreNodeStage.VirtualObjectDefined,
    virtualObjectId: voId,
    almShardRef: "alm-shard-bostrom-456",
    hostDid: "did:bostrom:bostrom123",
    authorDid: "did:author:456",
    notes: "VO defined",
    safetyTier: "auto-use"
  }),
  new CyberspectreEvent({
    stage: CyberspectreNodeStage.XRBridgeGenerated,
    virtualObjectId: voId,
    almShardRef: "alm-shard-bostrom-456",
    hostDid: "did:bostrom:bostrom123",
    authorDid: "did:author:456",
    notes: "XR bridge",
    safetyTier: "show-with-warning"
  }),
  new CyberspectreEvent({
    stage: CyberspectreNodeStage.NeuromorphicReplicated,
    virtualObjectId: voId,
    almShardRef: "alm-shard-bostrom-456",
    hostDid: "did:bostrom:bostrom123",
    authorDid: "did:author:456",
    notes: "Neuromorphic replication",
    safetyTier: "show-with-warning"
  }),
  new CyberspectreEvent({
    stage: CyberspectreNodeStage.MergedWithVirtualObjectExcavator,
    virtualObjectId: voId,
    almShardRef: "alm-shard-bostrom-456",
    hostDid: "did:bostrom:bostrom123",
    authorDid: "did:author:456",
    notes: "Merged",
    safetyTier: "auto-use"
  })
];

const generator = new CyberspectreFsmDiagramGenerator({
  graphSafetyProfile: { maxNodes: 18, maxEdges: 64, maxDepth: 8 },
  audience: "engineer",
  showSafetyTiers: true
});

const { mermaid, summary } = generator.buildStateDiagram(events);

// eslint-disable-next-line no-console
console.log(mermaid);
// eslint-disable-next-line no-console
console.log("\nSummary:", JSON.stringify(summary, null, 2));
