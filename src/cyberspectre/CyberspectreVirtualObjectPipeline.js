// Core stage enumeration aligned with Javaspectre virtual-object patterns.
export const CyberspectreNodeStage = Object.freeze({
  GeminiTextNode: "GeminiTextNode",
  ParsedCometChatNanoswarm: "ParsedCometChatNanoswarm",
  ComplianceGateYes: "ComplianceGateYes",
  ComplianceGateNo: "ComplianceGateNo",
  VirtualObjectDefined: "VirtualObjectDefined",
  DomSheetBuilt: "DomSheetBuilt",
  XRBridgeGenerated: "XRBridgeGenerated",
  TypeSketchExported: "TypeSketchExported",
  NeuromorphicReplicated: "NeuromorphicReplicated",
  MergedWithVirtualObjectExcavator: "MergedWithVirtualObjectExcavator"
});

// Canonical event envelope for Cyberspectre pipeline.
export class CyberspectreEvent {
  constructor({
    kind,
    stage,
    virtualObjectId,
    almShardRef,
    hostDid,
    authorDid,
    notes,
    safetyTier,
    fsmState,
    metadata
  }) {
    this.kind = kind || "VirtualObjectPipelineEvent";
    this.stage = stage;
    this.virtualObjectId = virtualObjectId;
    this.almShardRef = almShardRef;
    this.timestampIso = new Date().toISOString();
    this.hostDid = hostDid;
    this.authorDid = authorDid;
    this.notes = notes || "";
    // Safety / trust classification aligned with ExcavationSafetyProfile tiers.
    this.safetyTier = safetyTier || "unknown"; // auto-use | show-with-warning | quarantine | unknown
    // Explicit finite-state-machine state label (for Mermaid/AST + OTel FSM views).
    this.fsmState = fsmState || stage;
    // Free-form metadata, e.g. confidence/drift, XR bridge hints, neuromorphic target.
    this.metadata = metadata || {};
  }
}

// Simple in-process recorder; can be wired to SessionManager + Persistence.
export class CyberspectreIntrospectionEngine {
  constructor({ sink } = {}) {
    // sink(event) can forward into SQLite, Loki, OTEL, etc.
    this.sink = typeof sink === "function" ? sink : null;
  }

  record(event) {
    const payload = event instanceof CyberspectreEvent ? event : new CyberspectreEvent(event);
    // Minimal, JSON-structured logging; replace with coreLogger if present.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ topic: "CyberspectreEvent", payload }));
    if (this.sink) {
      this.sink(payload);
    }
    return payload;
  }
}

// Lightweight, deterministic compliance gate compatible with ExcavationSafetyProfile-style logic.
export class CyberspectreComplianceGate {
  constructor(config = {}) {
    this.nodeBudget = typeof config.nodeBudget === "number" ? config.nodeBudget : 20000;
    this.deepPassBudget =
      typeof config.deepPassBudget === "number" ? config.deepPassBudget : 2000;
    this.minConfidenceForAutoUse =
      typeof config.minConfidenceForAutoUse === "number"
        ? config.minConfidenceForAutoUse
        : 0.85;
    this.maxDriftForAutoUse =
      typeof config.maxDriftForAutoUse === "number" ? config.maxDriftForAutoUse : 0.2;
  }

  // Decide safety tier from confidence/drift.
  classify({ confidence, drift }) {
    const c = typeof confidence === "number" ? confidence : 0.0;
    const d = typeof drift === "number" ? drift : 1.0;

    if (c >= this.minConfidenceForAutoUse && d <= this.maxDriftForAutoUse) {
      return "auto-use";
    }
    if (c >= 0.4 && d <= 0.6) {
      return "show-with-warning";
    }
    return "quarantine";
  }

  // Budget check for XR/DOM/neuromorphic-heavy stages.
  enforceBudgets({ nodesProcessed, deepPassObjects }) {
    const violations = [];
    if (typeof nodesProcessed === "number" && nodesProcessed > this.nodeBudget) {
      violations.push(
        `DOM/XR node budget exceeded: ${nodesProcessed} > ${this.nodeBudget}`
      );
    }
    if (typeof deepPassObjects === "number" && deepPassObjects > this.deepPassBudget) {
      violations.push(
        `Deep-pass budget exceeded: ${deepPassObjects} > ${this.deepPassBudget}`
      );
    }
    return {
      ok: violations.length === 0,
      violations
    };
  }
}

// VirtualObjectExcavator wrapper specialized for the Cyberspectre flow.
export class VirtualObjectExcavator {
  constructor({ inspector, complianceGate } = {}) {
    this.inspector =
      inspector instanceof CyberspectreIntrospectionEngine
        ? inspector
        : new CyberspectreIntrospectionEngine();
    this.complianceGate =
      complianceGate instanceof CyberspectreComplianceGate
        ? complianceGate
        : new CyberspectreComplianceGate();
  }

  advanceStage(stage, virtualObjectId, almShardRef, hostDid, authorDid, notes, extras = {}) {
    const event = new CyberspectreEvent({
      kind: "VirtualObjectPipelineEvent",
      stage,
      virtualObjectId,
      almShardRef,
      hostDid,
      authorDid,
      notes,
      safetyTier: extras.safetyTier,
      fsmState: extras.fsmState || stage,
      metadata: extras.metadata
    });
    return this.inspector.record(event);
  }

  // Deterministic compliance gate using confidence/drift + budgets.
  validateCompliance({
    virtualObjectId,
    almShardRef,
    hostDid,
    authorDid,
    confidence,
    drift,
    nodesProcessed,
    deepPassObjects
  }) {
    const tier = this.complianceGate.classify({ confidence, drift });
    const budgetCheck = this.complianceGate.enforceBudgets({
      nodesProcessed,
      deepPassObjects
    });

    const notes = [
      `Compliance tier: ${tier}`,
      `confidence=${confidence != null ? confidence : "n/a"}`,
      `drift=${drift != null ? drift : "n/a"}`
    ];
    if (!budgetCheck.ok) {
      notes.push(`budget violations: ${budgetCheck.violations.join("; ")}`);
    }

    const stage =
      tier === "auto-use"
        ? CyberspectreNodeStage.ComplianceGateYes
        : CyberspectreNodeStage.ComplianceGateNo;

    this.advanceStage(stage, virtualObjectId, almShardRef, hostDid, authorDid, notes.join(" | "), {
      safetyTier: tier,
      fsmState: stage,
      metadata: {
        confidence,
        drift,
        budgetOk: budgetCheck.ok,
        violations: budgetCheck.violations
      }
    });

    return {
      tier,
      ok: tier === "auto-use" && budgetCheck.ok,
      budgetOk: budgetCheck.ok,
      violations: budgetCheck.violations
    };
  }

  // XR bridge stage with explicit DOM/XR metrics for later DOMSheet / OTel / Mermaid use.
  xrBridgeGenerated(virtualObjectId, almShardRef, hostDid, authorDid, metrics = {}) {
    const { nodesProcessed, xrSurfaces, xrAnchors } = metrics;
    return this.advanceStage(
      CyberspectreNodeStage.XRBridgeGenerated,
      virtualObjectId,
      almShardRef,
      hostDid,
      authorDid,
      "Generated XR-Bridge with THREE/WebXR and DOM-sheet anchors",
      {
        safetyTier: "show-with-warning",
        metadata: {
          nodesProcessed: nodesProcessed || 0,
          xrSurfaces: xrSurfaces || 0,
          xrAnchors: xrAnchors || 0
        }
      }
    );
  }

  // Neuromorphic replication stage — declares target repo/topology, so neuromorphic stack can subscribe.
  replicateToNeuromorphicRepo(
    virtualObjectId,
    almShardRef,
    hostDid,
    authorDid,
    target = {}
  ) {
    const { repoId, chipFamily, topologyHint } = target;
    return this.advanceStage(
      CyberspectreNodeStage.NeuromorphicReplicated,
      virtualObjectId,
      almShardRef,
      hostDid,
      authorDid,
      "Replicated to neuromorphic repo",
      {
        safetyTier: "show-with-warning",
        metadata: {
          repoId: repoId || "neuromorph-default",
          chipFamily: chipFamily || "generic-edge",
          topologyHint: topologyHint || "unspecified"
        }
      }
    );
  }

  // Merge stage explicitly marking fusion with core VirtualObjectExcavator pipeline.
  mergeWithVirtualObjectExcavator(
    virtualObjectId,
    almShardRef,
    hostDid,
    authorDid,
    catalogRef
  ) {
    return this.advanceStage(
      CyberspectreNodeStage.MergedWithVirtualObjectExcavator,
      virtualObjectId,
      almShardRef,
      hostDid,
      authorDid,
      "Merged with Javaspectre VirtualObjectExcavator catalog",
      {
        safetyTier: "auto-use",
        metadata: {
          catalogRef: catalogRef || "default-catalog"
        }
      }
    );
  }
}
