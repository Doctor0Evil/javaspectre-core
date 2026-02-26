// MermaidSafetyKernel: wraps Mermaid diagrams with ALN safety-budgets,
// trust tiers, and ledger-ready evidence objects.

import crypto from "node:crypto";

/**
 * GraphSafetyProfile
 * Mirrors ExcavationSafetyProfile but for diagram ASTs.
 */
export class GraphSafetyProfile {
  constructor(config = {}) {
    const {
      profileName = "mermaid-default-t1",
      maxNodes = 32,
      maxEdges = 96,
      maxSubgraphs = 4,
      maxDepth = 3,
      maxFanOutPerNode = 12,
      maxFanInPerNode = 12,
      maxTier = "T2",
      context = {},
    } = config;

    this.profileName = profileName;

    this.maxNodes = maxNodes;
    this.maxEdges = maxEdges;
    this.maxSubgraphs = maxSubgraphs;
    this.maxDepth = maxDepth;
    this.maxFanOutPerNode = maxFanOutPerNode;
    this.maxFanInPerNode = maxFanInPerNode;

    this.maxTier = maxTier;
    this.context = {
      role: context.role ?? "citizen",
      deviceClass: context.deviceClass ?? "edge-unknown",
      networkTrust: context.networkTrust ?? "unknown",
      consentLevel: context.consentLevel ?? "minimal",
      locationHint: context.locationHint ?? null,
    };
  }

  /**
   * Enforce structural safety budgets on the normalized AST.
   * Throws Error on violation, with a .violations array attached.
   */
  enforceBudgets(astSummary) {
    const violations = [];

    if (astSummary.nodeCount > this.maxNodes) {
      violations.push(
        `Node budget exceeded: ${astSummary.nodeCount} > ${this.maxNodes}`
      );
    }
    if (astSummary.edgeCount > this.maxEdges) {
      violations.push(
        `Edge budget exceeded: ${astSummary.edgeCount} > ${this.maxEdges}`
      );
    }
    if (astSummary.subgraphCount > this.maxSubgraphs) {
      violations.push(
        `Subgraph budget exceeded: ${astSummary.subgraphCount} > ${this.maxSubgraphs}`
      );
    }
    if (astSummary.maxDepth > this.maxDepth) {
      violations.push(
        `Depth budget exceeded: ${astSummary.maxDepth} > ${this.maxDepth}`
      );
    }

    for (const fan of astSummary.fanOut) {
      if (fan.count > this.maxFanOutPerNode) {
        violations.push(
          `Fan-out exceeded on node ${fan.id}: ${fan.count} > ${this.maxFanOutPerNode}`
        );
      }
    }
    for (const fan of astSummary.fanIn) {
      if (fan.count > this.maxFanInPerNode) {
        violations.push(
          `Fan-in exceeded on node ${fan.id}: ${fan.count} > ${this.maxFanInPerNode}`
        );
      }
    }

    const tierOrder = ["T0", "T1", "T2", "T3"];
    const maxTierIndex = tierOrder.indexOf(this.maxTier);
    for (const tier of astSummary.tiers) {
      const idx = tierOrder.indexOf(tier);
      if (idx > maxTierIndex) {
        violations.push(
          `Trust tier ${tier} not allowed under profile maxTier=${this.maxTier}`
        );
      }
    }

    if (violations.length > 0) {
      const err = new Error("GraphSafetyProfile.enforceBudgets violations");
      err.violations = violations;
      throw err;
    }

    return { ok: true, violations: [] };
  }

  toJSON() {
    return {
      profileName: this.profileName,
      maxNodes: this.maxNodes,
      maxEdges: this.maxEdges,
      maxSubgraphs: this.maxSubgraphs,
      maxDepth: this.maxDepth,
      maxFanOutPerNode: this.maxFanOutPerNode,
      maxFanInPerNode: this.maxFanInPerNode,
      maxTier: this.maxTier,
      context: this.context,
    };
  }
}

/**
 * MermaidSafetyKernel
 * - parses Mermaid source via injected parser
 * - normalizes AST
 * - enforces GraphSafetyProfile
 * - emits DiagramTransparencyEnvelope compatible with existing anchoring.
 */
export class MermaidSafetyKernel {
  /**
   * @param {Object} options
   *  - parser: async (source) => rawAst
   *  - graphSafetyProfile: GraphSafetyProfile
   */
  constructor(options = {}) {
    if (!options.parser || typeof options.parser !== "function") {
      throw new Error(
        "MermaidSafetyKernel requires a parser(source) => Promise<rawAst>."
      );
    }
    this.parser = options.parser;
    this.profile =
      options.graphSafetyProfile ?? new GraphSafetyProfile({ profileName: "mermaid-default-t1" });
  }

  /**
   * Core entrypoint for validating and sealing a Mermaid diagram.
   *
   * @param {string} runId       ALN / Javaspectre run identifier
   * @param {string} mermaidSource raw Mermaid diagram text
   * @param {Object} meta        { intent, mode, authorDid, ... }
   * @returns {Promise<{ ast, summary, envelope }>}
   */
  async validateAndSealDiagram(runId, mermaidSource, meta = {}) {
    if (!runId) {
      throw new Error("MermaidSafetyKernel.validateAndSealDiagram requires runId");
    }
    if (typeof mermaidSource !== "string" || !mermaidSource.trim()) {
      throw new Error("MermaidSafetyKernel.validateAndSealDiagram requires non-empty Mermaid source");
    }

    const parsedAt = new Date().toISOString();

    // 1. Parse using injected parser (Tree-sitter, mermaid-cli --ast, etc.)
    const rawAst = await this.parser(mermaidSource);

    // 2. Normalize to a stable internal schema.
    const normalized = this.normalizeAst(rawAst, mermaidSource);

    // 3. Compute structural summary (node/edge counts, depth, tiers, fan-in/out).
    const summary = this.computeSummary(normalized);

    // 4. Enforce safety budgets.
    this.profile.enforceBudgets(summary);

    // 5. Build a DiagramTransparencyEnvelope that your existing
    // AnchorManifest + AnchoringService can consume.
    const envelope = this.createDiagramEnvelope(
      runId,
      mermaidSource,
      normalized,
      summary,
      parsedAt,
      meta
    );

    return { ast: normalized, summary, envelope };
  }

  /**
   * Normalize raw AST to a canonical schema.
   * This is where you hide parser/version differences.
   */
  normalizeAst(rawAst, mermaidSource) {
    // This function should be customized for whichever AST you end up using.
    // The goal is to produce a structure like:
    // {
    //   version: "1.0.0",
    //   kind: "flowchart",
    //   nodes: [{ id, label, tier, annotations, positionHint }, ...],
    //   edges: [{ from, to, label }, ...],
    //   subgraphs: [{ id, label, tier, nodeIds }, ...],
    //   directives: [{ key, value }, ...]
    // }

    // For now, we implement a minimal placeholder that treats each
    // "A[" and arrow "A --> B" as nodes/edges via regex. You will
    // later replace this with a proper parser-backed normalization.
    const nodes = new Map();
    const edges = [];
    const directives = [];
    const subgraphs = [];

    const lines = mermaidSource.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Directive lines: %%key: value
      if (trimmed.startsWith("%%")) {
        const directiveBody = trimmed.slice(2).trim();
        const [rawKey, ...rest] = directiveBody.split(":");
        if (rawKey && rest.length > 0) {
          const key = rawKey.trim();
          const value = rest.join(":").trim();
          directives.push({ key, value });

          // Extract simple tier hints for global tier set.
          if (key === "tier" || key === "trust-max") {
            // No-op here, we aggregate later in computeSummary.
          }
        }
        continue;
      }

      // Node pattern: A[Label]
      const nodeMatch = trimmed.match(/^([A-Za-z0-9_]+)\s*\[/);
      if (nodeMatch) {
        const id = nodeMatch[1];
        if (!nodes.has(id)) {
          nodes.set(id, {
            id,
            label: trimmed,
            tier: this.extractTierFromLine(trimmed),
            annotations: this.extractAnnotationsFromLine(trimmed),
          });
        }
      }

      // Edge pattern: A --> B
      const edgeMatch = trimmed.match(
        /^([A-Za-z0-9_]+)\s*--[->]\s*([A-Za-z0-9_]+)/
      );
      if (edgeMatch) {
        const from = edgeMatch[1];
        const to = edgeMatch[2];
        edges.push({ from, to, label: null });
        if (!nodes.has(from)) {
          nodes.set(from, {
            id: from,
            label: from,
            tier: "T0",
            annotations: {},
          });
        }
        if (!nodes.has(to)) {
          nodes.set(to, {
            id: to,
            label: to,
            tier: "T0",
            annotations: {},
          });
        }
      }

      // Subgraph pattern: subgraph X [Label]
      if (trimmed.toLowerCase().startsWith("subgraph ")) {
        const parts = trimmed.split(/\s+/);
        const id = parts[1] ?? `sg_${subgraphs.length}`;
        const label = trimmed;
        const tier = this.extractTierFromLine(trimmed);
        subgraphs.push({ id, label, tier, nodeIds: [] });
      }
    }

    return {
      version: "1.0.0",
      kind: "mermaid-flowchart",
      nodes: Array.from(nodes.values()),
      edges,
      subgraphs,
      directives,
    };
  }

  extractTierFromLine(line) {
    // Look for %%tier: T1 or inline markers.
    const tierMatch = line.match(/%%\s*tier\s*:\s*(T[0-3])/i);
    if (tierMatch) {
      return tierMatch[1];
    }
    return "T0";
  }

  extractAnnotationsFromLine(line) {
    const annotations = {};
    const voMatch = line.match(/%%\s*vo\s*:\s*([^%]+)/i);
    if (voMatch) {
      annotations.vo = voMatch[1].trim();
    }
    const voSafetyMatch = line.match(/%%\s*vo-safety\s*:\s*([^%]+)/i);
    if (voSafetyMatch) {
      annotations.voSafety = voSafetyMatch[1].trim();
    }
    return annotations;
  }

  computeSummary(normalized) {
    const nodeCount = normalized.nodes.length;
    const edgeCount = normalized.edges.length;
    const subgraphCount = normalized.subgraphs.length;

    // Graph depth and fan-in/out are approximated here; you can replace
    // this with a proper graph traversal later.
    const adjacency = new Map();
    const reverseAdjacency = new Map();

    for (const edge of normalized.edges) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      adjacency.get(edge.from).push(edge.to);

      if (!reverseAdjacency.has(edge.to)) reverseAdjacency.set(edge.to, []);
      reverseAdjacency.get(edge.to).push(edge.from);
    }

    const fanOut = [];
    const fanIn = [];

    for (const node of normalized.nodes) {
      const out = adjacency.get(node.id) ?? [];
      const incoming = reverseAdjacency.get(node.id) ?? [];
      fanOut.push({ id: node.id, count: out.length });
      fanIn.push({ id: node.id, count: incoming.length });
    }

    const tiers = new Set();
    for (const node of normalized.nodes) {
      tiers.add(node.tier ?? "T0");
    }
    for (const sg of normalized.subgraphs) {
      if (sg.tier) tiers.add(sg.tier);
    }

    // Depth approximation: longest path in DAG ignoring cycles.
    const maxDepth = this.estimateDepth(normalized, adjacency);

    return {
      nodeCount,
      edgeCount,
      subgraphCount,
      maxDepth,
      fanOut,
      fanIn,
      tiers: Array.from(tiers),
    };
  }

  estimateDepth(normalized, adjacency) {
    const visited = new Map();
    const dfs = (nodeId) => {
      if (visited.has(nodeId)) return visited.get(nodeId);
      const children = adjacency.get(nodeId) ?? [];
      if (children.length === 0) {
        visited.set(nodeId, 1);
        return 1;
      }
      let maxChild = 0;
      for (const c of children) {
        maxChild = Math.max(maxChild, dfs(c));
      }
      const depth = 1 + maxChild;
      visited.set(nodeId, depth);
      return depth;
    };

    let globalMax = 0;
    for (const node of normalized.nodes) {
      globalMax = Math.max(globalMax, dfs(node.id));
    }
    return globalMax;
  }

  createDiagramEnvelope(runId, source, ast, summary, parsedAt, meta) {
    const serializedCore = JSON.stringify(
      { runId, ast, summary, parsedAt, meta, safetyProfile: this.profile.toJSON() },
      null,
      2
    );
    const contentHash = crypto
      .createHash("sha256")
      .update(serializedCore)
      .digest("hex");

    return {
      version: "1.0.0",
      kind: "MermaidDiagramEnvelope",
      timestamp: parsedAt,
      runId,
      intent: meta.intent ?? "unspecified",
      mode: meta.mode ?? "diagram-mermaid",
      authorDid: meta.authorDid ?? null,
      safetyProfile: this.profile.toJSON(),
      summary,
      contentHash,
      mermaidSource: source,
      ast,
      notes: meta.notes ?? [],
    };
  }
}

export default MermaidSafetyKernel;
