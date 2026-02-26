import crypto from "node:crypto";

export class MermaidAstEngine {
  constructor(options = {}) {
    this.maxNodes = options.maxNodes ?? 80;
    this.maxEdges = options.maxEdges ?? 120;
    this.maxDepth = options.maxDepth ?? 8;
    this.allowedShapes = new Set(options.allowedShapes ?? [
      "rect", "round", "stadium", "subroutine", "cyl", "circle", "doublecircle",
      "rhombus", "hexagon"
    ]);

    this.graph = this.createEmptyGraph();
  }

  createEmptyGraph() {
    return {
      nodes: {},          // id -> { id, label, shape, metadata }
      edges: [],          // { from, to, label?, metadata }
      subgraphs: [],      // { id, label, nodes: string[], metadata }
      direction: "LR",
      metadata: {}
    };
  }

  addNode(node) {
    const { id, label, shape = "rect", metadata = {} } = node;
    if (!id || typeof id !== "string") {
      throw new Error("Node must have a non-empty string id");
    }
    if (this.graph.nodes[id]) {
      throw new Error(`Duplicate node id '${id}'`);
    }
    if (!this.allowedShapes.has(shape)) {
      throw new Error(`Unsupported node shape '${shape}'`);
    }
    if (Object.keys(this.graph.nodes).length + 1 > this.maxNodes) {
      throw new Error(`Node budget exceeded (maxNodes=${this.maxNodes})`);
    }
    this.graph.nodes[id] = { id, label: label ?? id, shape, metadata };
    return this;
  }

  addEdge(edge) {
    const { from, to, label, metadata = {} } = edge;
    if (!from || !to) {
      throw new Error("Edge must have 'from' and 'to'");
    }
    if (!this.graph.nodes[from] || !this.graph.nodes[to]) {
      throw new Error(`Edge references unknown nodes: ${from} -> ${to}`);
    }
    if (this.graph.edges.length + 1 > this.maxEdges) {
      throw new Error(`Edge budget exceeded (maxEdges=${this.maxEdges})`);
    }
    this.graph.edges.push({ from, to, label: label ?? "", metadata });
    return this;
  }

  addSubgraph(subgraph) {
    const { id, label, nodes = [], metadata = {} } = subgraph;
    if (!id) throw new Error("Subgraph must have an id");
    const missing = nodes.filter(n => !this.graph.nodes[n]);
    if (missing.length > 0) {
      throw new Error(`Subgraph '${id}' references unknown nodes: ${missing.join(", ")}`);
    }
    this.graph.subgraphs.push({ id, label: label ?? id, nodes: [...nodes], metadata });
    return this;
  }

  setDirection(direction) {
    const allowed = new Set(["LR", "RL", "TB", "BT"]);
    if (!allowed.has(direction)) {
      throw new Error(`Unsupported graph direction '${direction}'`);
    }
    this.graph.direction = direction;
    return this;
  }

  // Validation: existence, reachability, cycles, depth vs maxDepth
  validate() {
    const errors = [];
    const warnings = [];

    const nodeIds = Object.keys(this.graph.nodes);

    // Edge endpoints exist
    for (const e of this.graph.edges) {
      if (!this.graph.nodes[e.from] || !this.graph.nodes[e.to]) {
        errors.push(`Edge ${e.from} -> ${e.to} references missing node`);
      }
    }

    // Build adjacency for DFS
    const adj = new Map();
    for (const id of nodeIds) adj.set(id, []);
    for (const e of this.graph.edges) adj.get(e.from).push(e.to);

    // Unreachable & depth / cycle detection
    const visited = new Set();
    const depths = new Map();
    const stack = new Set();

    const roots = nodeIds.filter(
      id => !this.graph.edges.some(e => e.to === id)
    );
    const dfs = (id, depth) => {
      if (depth > this.maxDepth) {
        errors.push(`Max depth exceeded at node '${id}' (depth=${depth}, maxDepth=${this.maxDepth})`);
      }
      if (stack.has(id)) {
        warnings.push(`Cycle detected involving node '${id}'`);
        return;
      }
      if (visited.has(id)) return;
      visited.add(id);
      stack.add(id);
      depths.set(id, depth);
      for (const n of adj.get(id)) dfs(n, depth + 1);
      stack.delete(id);
    };

    if (roots.length === 0 && nodeIds.length > 0) {
      warnings.push("No root nodes detected (all nodes have incoming edges)");
    }
    for (const r of roots) dfs(r, 0);

    const unreachable = nodeIds.filter(id => !visited.has(id));
    if (unreachable.length > 0) {
      warnings.push(`Unreachable nodes: ${unreachable.join(", ")}`);
    }

    const ok = errors.length === 0;
    return { ok, errors, warnings, budget: this.getBudgetStats() };
  }

  getBudgetStats() {
    const nodeCount = Object.keys(this.graph.nodes).length;
    const edgeCount = this.graph.edges.length;
    return {
      nodeCount,
      edgeCount,
      maxNodes: this.maxNodes,
      maxEdges: this.maxEdges,
      maxDepth: this.maxDepth,
      nodeUtilization: nodeCount / this.maxNodes,
      edgeUtilization: edgeCount / this.maxEdges
    };
  }

  // Serialize to Mermaid text (flowchart flavor)
  toMermaid() {
    const lines = [];
    lines.push(`flowchart ${this.graph.direction}`);
    for (const node of Object.values(this.graph.nodes)) {
      const shapeOpen = "[";
      const shapeClose = "]";
      lines.push(`  ${node.id}${shapeOpen}${node.label}${shapeClose}`);
    }
    for (const e of this.graph.edges) {
      const label = e.label ? ` |${e.label}| ` : " ";
      lines.push(`  ${e.from} -->${label}${e.to}`);
    }
    return lines.join("\n");
  }

  // AST hash for diffing / drift tracking
  contentHash() {
    const stable = JSON.stringify(this.graph, Object.keys(this.graph).sort());
    return crypto.createHash("sha256").update(stable).digest("hex");
  }

  getAst() {
    return JSON.parse(JSON.stringify(this.graph));
  }
}
