// javaspectre-core/src/cyberspectre/CyberspectreFsmDiagramGenerator.js

// Minimal graph safety profile for FSMs (mirrors diagram budgets in MermaidAstEngine).
class GraphSafetyProfile {
  constructor(config = {}) {
    this.profileName = config.profileName || "cyberspectre-fsm-default";
    this.maxNodes = typeof config.maxNodes === "number" ? config.maxNodes : 18;
    this.maxEdges = typeof config.maxEdges === "number" ? config.maxEdges : 64;
    this.maxDepth = typeof config.maxDepth === "number" ? config.maxDepth : 8;
  }

  enforceBudgets(summary) {
    const violations = [];
    if (summary.nodeCount > this.maxNodes) {
      violations.push(
        `Node budget exceeded: ${summary.nodeCount} > ${this.maxNodes}`
      );
    }
    if (summary.edgeCount > this.maxEdges) {
      violations.push(
        `Edge budget exceeded: ${summary.edgeCount} > ${this.maxEdges}`
      );
    }
    if (summary.maxDepth > this.maxDepth) {
      violations.push(
        `Depth budget exceeded: ${summary.maxDepth} > ${this.maxDepth}`
      );
    }
    return {
      ok: violations.length === 0,
      violations
    };
  }
}

// Utility to compute a simple depth metric from ordered stages.
function computeMaxDepth(edges, startState) {
  const adjacency = new Map();
  for (const e of edges) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    adjacency.get(e.from).push(e.to);
  }
  const visited = new Set();
  let maxDepth = 0;

  function dfs(node, depth) {
    if (visited.has(`${node}:${depth}`)) return;
    visited.add(`${node}:${depth}`);
    if (depth > maxDepth) maxDepth = depth;
    const next = adjacency.get(node) || [];
    for (const n of next) {
      dfs(n, depth + 1);
    }
  }

  dfs(startState, 0);
  return maxDepth;
}

/**
 * FSM generator for CyberspectreEvent sequences.
 *
 * Events must at least support:
 * - event.stage (string)
 * - event.virtualObjectId (string)
 * - event.safetyTier? ("auto-use" | "show-with-warning" | "quarantine" | "unknown")
 * - event.timestampIso? (for ordering tie-breaks)
 */
export class CyberspectreFsmDiagramGenerator {
  constructor(options = {}) {
    this.profile =
      options.graphSafetyProfile instanceof GraphSafetyProfile
        ? options.graphSafetyProfile
        : new GraphSafetyProfile(options.graphSafetyProfile || {});
    this.audience = options.audience || "engineer"; // or "citizen"
    this.showSafetyTiers = options.showSafetyTiers !== false;
  }

  /**
   * Build a Mermaid stateDiagram-v2 string from a list of events.
   * @param {CyberspectreEvent[]} events
   * @returns {{ mermaid: string, summary: object }}
   */
  buildStateDiagram(events) {
    if (!Array.isArray(events) || events.length === 0) {
      return {
        mermaid: "stateDiagram-v2\n  [*] --> [*]",
        summary: {
          nodeCount: 0,
          edgeCount: 0,
          maxDepth: 0,
          violations: ["No events provided"]
        }
      };
    }

    // Sort events by timestamp when present, otherwise keep original order.
    const sorted = [...events].sort((a, b) => {
      const ta = a.timestampIso ? Date.parse(a.timestampIso) : 0;
      const tb = b.timestampIso ? Date.parse(b.timestampIso) : 0;
      return ta - tb;
    });

    // Derive a key for this virtual object pipeline.
    const voId = sorted[0].virtualObjectId || "unknown-vo";

    // Collect unique states in order of first appearance.
    const stateOrder = [];
    const stateMeta = new Map();

    for (const ev of sorted) {
      const id = String(ev.stage || ev.fsmState || "UnknownStage");
      if (!stateMeta.has(id)) {
        stateOrder.push(id);
        stateMeta.set(id, {
          safetyTier: ev.safetyTier || "unknown"
        });
      }
    }

    // Deduplicate transitions but preserve logical order.
    const edges = [];
    for (let i = 0; i < stateOrder.length - 1; i += 1) {
      const from = stateOrder[i];
      const to = stateOrder[i + 1];
      // Avoid duplicates.
      if (!edges.some(e => e.from === from && e.to === to)) {
        edges.push({ from, to });
      }
    }

    const startState = stateOrder[0];
    const maxDepth = computeMaxDepth(edges, startState);

    const summary = {
      virtualObjectId: voId,
      nodeCount: stateOrder.length,
      edgeCount: edges.length,
      maxDepth
    };

    const budgetResult = this.profile.enforceBudgets(summary);
    summary.violations = budgetResult.violations;
    summary.ok = budgetResult.ok;

    // Build Mermaid stateDiagram-v2.
    const lines = [];
    lines.push("stateDiagram-v2");
    lines.push(`  %% Cyberspectre FSM for ${voId}`);
    lines.push("  direction LR");

    // Initial pseudo-state.
    lines.push(`  [*] --> ${this._sanitizeId(startState)}`);

    // State definitions with optional safety-tier annotations.
    for (const state of stateOrder) {
      const meta = stateMeta.get(state) || { safetyTier: "unknown" };
      const label = this._stateLabel(state, meta);
      lines.push(`  state "${label}" as ${this._sanitizeId(state)}`);
    }

    // Edges.
    for (const e of edges) {
      lines.push(
        `  ${this._sanitizeId(e.from)} --> ${this._sanitizeId(e.to)}`
      );
    }

    // Terminal state marker (last stage).
    const endState = stateOrder[stateOrder.length - 1];
    lines.push(`  ${this._sanitizeId(endState)} --> [*]`);

    // Optional audience-specific notes.
    if (!budgetResult.ok && this.audience === "engineer") {
      lines.push("  note right of " + this._sanitizeId(endState) + "");
      lines.push(
        `    Budget violations: ${budgetResult.violations.join("; ")}`
      );
      lines.push("  end note");
    }

    return {
      mermaid: lines.join("\n"),
      summary
    };
  }

  _sanitizeId(stage) {
    return String(stage).replace(/[^a-zA-Z0-9_]/g, "_");
  }

  _stateLabel(stage, meta) {
    if (!this.showSafetyTiers) {
      return stage;
    }
    const tier = meta.safetyTier || "unknown";
    // Keep label short for citizen audience.
    if (this.audience === "citizen") {
      return stage;
    }
    return `${stage} [${tier}]`;
  }
}

export default CyberspectreFsmDiagramGenerator;
