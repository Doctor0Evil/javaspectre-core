import crypto from "node:crypto";
import MermaidAstEngine from "./MermaidAstEngine.js";

/**
 * MermaidDriftMeter
 * - Computes canonical AST hashes for diagrams.
 * - Computes drift metrics and a scalar driftScore.
 * - Decides when to downgrade trust and force re-anchoring.
 */
export class MermaidDriftMeter {
  constructor(options = {}) {
    this.maxAllowedDriftForT1 = typeof options.maxAllowedDriftForT1 === "number"
      ? options.maxAllowedDriftForT1
      : 0.15; // <= 15% change keeps T1 [file:1]
    this.maxAllowedDriftForT2 = typeof options.maxAllowedDriftForT2 === "number"
      ? options.maxAllowedDriftForT2
      : 0.35; // <= 35% change keeps T2 [file:1]
    this.forceReanchorThreshold = typeof options.forceReanchorThreshold === "number"
      ? options.forceReanchorThreshold
      : 0.40; // > 40% drift => mandatory re-anchoring [file:1][file:5]
  }

  /**
   * Stable, order-independent hash of an AST.
   * Expects AST in the normalized schema produced by MermaidAstEngine. [file:1]
   */
  computeAstHash(ast) {
    const stable = JSON.stringify(ast, Object.keys(ast).sort());
    return crypto.createHash("sha256").update(stable).digest("hex");
  }

  /**
   * Compute drift metrics between two ASTs.
   * Returns { addedNodes, removedNodes, addedEdges, removedEdges, driftScore }.
   */
  computeDrift(oldAst, newAst) {
    const oldNodes = new Map();
    const newNodes = new Map();
    const oldEdges = new Set();
    const newEdges = new Set();

    for (const n of oldAst.nodes ?? []) oldNodes.set(n.id, n);
    for (const n of newAst.nodes ?? []) newNodes.set(n.id, n);

    const edgeKey = (e) => `${e.from}->${e.to}#${e.label ?? ""}`;

    for (const e of oldAst.edges ?? []) oldEdges.add(edgeKey(e));
    for (const e of newAst.edges ?? []) newEdges.add(edgeKey(e));

    const addedNodes = [];
    const removedNodes = [];
    for (const id of newNodes.keys()) {
      if (!oldNodes.has(id)) addedNodes.push(id);
    }
    for (const id of oldNodes.keys()) {
      if (!newNodes.has(id)) removedNodes.push(id);
    }

    const addedEdges = [];
    const removedEdges = [];
    for (const e of newAst.edges ?? []) {
      const k = edgeKey(e);
      if (!oldEdges.has(k)) addedEdges.push(k);
    }
    for (const e of oldAst.edges ?? []) {
      const k = edgeKey(e);
      if (!newEdges.has(k)) removedEdges.push(k);
    }

    const baseNodes = Math.max(1, oldAst.nodes?.length ?? 1);
    const baseEdges = Math.max(1, oldAst.edges?.length ?? 1);

    const nodeDrift = (addedNodes.length + removedNodes.length) / baseNodes;
    const edgeDrift = (addedEdges.length + removedEdges.length) / baseEdges;

    // Simple symmetric drift scalar in [0, 1+] [file:1]
    const driftScore = Math.min(1, 0.5 * nodeDrift + 0.5 * edgeDrift);

    return {
      addedNodes,
      removedNodes,
      addedEdges,
      removedEdges,
      driftScore,
    };
  }

  /**
   * Evaluate drift against trust tiers and anchoring policy.
   *
   * currentTier: "T0" | "T1" | "T2" | "T3"
   * Returns:
   * {
   *   newTier,
   *   forceReanchor,
   *   reason,
   *   driftScore,
   *   metrics
   * }
   */
  evaluateDrift(currentTier, driftScore, metrics) {
    let newTier = currentTier;
    let forceReanchor = false;
    const reasons = [];

    if (currentTier === "T1") {
      if (driftScore > this.maxAllowedDriftForT1) {
        newTier = "T2";
        reasons.push(
          `driftScore ${driftScore.toFixed(3)} exceeded T1 limit ${this.maxAllowedDriftForT1}`
        );
      }
    } else if (currentTier === "T2") {
      if (driftScore > this.maxAllowedDriftForT2) {
        newTier = "T3";
        reasons.push(
          `driftScore ${driftScore.toFixed(3)} exceeded T2 limit ${this.maxAllowedDriftForT2}`
        );
      }
    }

    if (driftScore > this.forceReanchorThreshold) {
      forceReanchor = true;
      reasons.push(
        `driftScore ${driftScore.toFixed(3)} exceeded reanchor threshold ${this.forceReanchorThreshold}`
      );
    }

    if (!reasons.length) reasons.push("within tier thresholds; no change");

    return {
      newTier,
      forceReanchor,
      reason: reasons.join("; "),
      driftScore,
      metrics,
    };
  }

  /**
   * High-level helper:
   * - normalize raw Mermaid source into AST
   * - compute hash + drift vs previous snapshot
   * - evaluate drift policy
   *
   * oldSnapshot: { ast, hash, tier }
   * mermaidSource: string
   */
  analyzeChange(oldSnapshot, mermaidSource, engineOptions = {}) {
    const engine = new MermaidAstEngine(engineOptions);
    const parsed = engine.parse(mermaidSource); // expects you to expose parse() from engine [file:1]
    const ast = parsed.ast ?? parsed;
    const hash = this.computeAstHash(ast);

    if (!oldSnapshot || !oldSnapshot.ast || !oldSnapshot.hash) {
      // First version, no drift yet.
      return {
        hash,
        ast,
        driftScore: 0,
        metrics: {
          addedNodes: ast.nodes?.length ?? 0,
          removedNodes: 0,
          addedEdges: ast.edges?.length ?? 0,
          removedEdges: 0,
        },
        newTier: oldSnapshot?.tier ?? "T1",
        forceReanchor: true, // first adoption should anchor [file:5]
        reason: "no previous snapshot; treat as initial anchor candidate",
      };
    }

    const drift = this.computeDrift(oldSnapshot.ast, ast);
    const evalResult = this.evaluateDrift(
      oldSnapshot.tier ?? "T1",
      drift.driftScore,
      drift
    );

    return {
      hash,
      ast,
      driftScore: drift.driftScore,
      metrics: drift,
      ...evalResult,
    };
  }
}

export default MermaidDriftMeter;
