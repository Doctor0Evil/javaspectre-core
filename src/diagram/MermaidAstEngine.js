// Mermaid AST builder, validator, and renderer for ALN-driven diagrams.

export class MermaidAstEngine {
  constructor(options) {
    this.defaultDirection = options?.defaultDirection || "TD"; // TD, LR, BT, RL
    this.maxNodes = typeof options?.maxNodes === "number" ? options.maxNodes : 80;
    this.maxEdges = typeof options?.maxEdges === "number" ? options.maxEdges : 160;
    this.maxDepth = typeof options?.maxDepth === "number" ? options.maxDepth : 6;
  }

  createEmptyGraph(kind = "flowchart") {
    return {
      kind,                 // "flowchart", "sequence", "state"
      direction: this.defaultDirection,
      nodes: [],            // { id, label, shape, lane, meta }
      edges: [],            // { from, to, type, label }
      subgraphs: []         // { id, title, nodes: [ids], meta }
    };
  }

  addNode(graph, node) {
    if (!node || !node.id) {
      throw new Error("MermaidAstEngine.addNode requires an id.");
    }
    if (graph.nodes.find(n => n.id === node.id)) {
      throw new Error(`Duplicate node id "${node.id}" is not allowed.`);
    }
    if (graph.nodes.length + 1 > this.maxNodes) {
      throw new Error(`Node budget exceeded (${this.maxNodes}).`);
    }
    const shape = node.shape || "rect";
    const allowedShapes = new Set(["rect", "round", "stadium", "subroutine", "rhombus"]);
    if (!allowedShapes.has(shape)) {
      throw new Error(`Unsupported shape "${shape}".`);
    }
    graph.nodes.push({
      id: node.id,
      label: node.label || node.id,
      shape,
      lane: node.lane || null,
      meta: node.meta || {}
    });
    return graph;
  }

  addEdge(graph, edge) {
    if (!edge || !edge.from || !edge.to) {
      throw new Error("MermaidAstEngine.addEdge requires from/to.");
    }
    if (graph.edges.length + 1 > this.maxEdges) {
      throw new Error(`Edge budget exceeded (${this.maxEdges}).`);
    }
    const type = edge.type || "arrow"; // arrow, dotted, thick
    const allowedTypes = new Set(["arrow", "dotted", "thick"]);
    if (!allowedTypes.has(type)) {
      throw new Error(`Unsupported edge type "${type}".`);
    }
    graph.edges.push({
      from: edge.from,
      to: edge.to,
      type,
      label: edge.label || ""
    });
    return graph;
  }

  addSubgraph(graph, subgraph) {
    if (!subgraph || !subgraph.id) {
      throw new Error("MermaidAstEngine.addSubgraph requires an id.");
    }
    if (graph.subgraphs.find(sg => sg.id === subgraph.id)) {
      throw new Error(`Duplicate subgraph id "${subgraph.id}".`);
    }
    const nodeIds = subgraph.nodes || [];
    graph.subgraphs.push({
      id: subgraph.id,
      title: subgraph.title || subgraph.id,
      nodes: nodeIds,
      meta: subgraph.meta || {}
    });
    return graph;
  }

  validate(graph) {
    const errors = [];

    const nodeIds = new Set(graph.nodes.map(n => n.id));
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.from)) {
        errors.push(`Edge from "${edge.from}" references missing node.`);
      }
      if (!nodeIds.has(edge.to)) {
        errors.push(`Edge to "${edge.to}" references missing node.`);
      }
    }

    const referenced = new Set();
    for (const edge of graph.edges) {
      referenced.add(edge.from);
      referenced.add(edge.to);
    }
    const unreachable = graph.nodes
      .filter(n => !referenced.has(n.id))
      .map(n => n.id);
    if (unreachable.length > 0) {
      errors.push(`Unreachable nodes: ${unreachable.join(", ")}`);
    }

    let depthExceeded = false;
    const adjacency = new Map();
    for (const edge of graph.edges) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      adjacency.get(edge.from).push(edge.to);
    }
    const roots = graph.nodes
      .filter(n => !graph.edges.some(e => e.to === n.id))
      .map(n => n.id);

    const visited = new Set();
    const stack = [];

    const dfs = (nodeId, depth) => {
      if (depth > this.maxDepth) {
        depthExceeded = true;
        return;
      }
      visited.add(nodeId);
      stack.push(nodeId);
      const neighbors = adjacency.get(nodeId) || [];
      for (const next of neighbors) {
        if (stack.includes(next)) {
          errors.push(`Cycle detected involving "${next}".`);
          continue;
        }
        if (!visited.has(next)) dfs(next, depth + 1);
      }
      stack.pop();
    };

    for (const root of roots) {
      if (!visited.has(root)) dfs(root, 0);
    }

    if (depthExceeded) {
      errors.push(`Graph depth exceeds maxDepth=${this.maxDepth}.`);
    }

    return { ok: errors.length === 0, errors };
  }

  render(graph) {
    const lines = [];
    if (graph.kind === "flowchart") {
      lines.push(`flowchart ${graph.direction}`);
    } else {
      throw new Error(`Unsupported graph kind "${graph.kind}" for render.`);
    }

    const nodeLine = (n) => {
      const label = n.label.replace(/\n/g, "<br/>");
      switch (n.shape) {
        case "rect":
          return `${n.id}[${label}]`;
        case "round":
          return `${n.id}(${label})`;
        case "stadium":
          return `${n.id}([${label}])`;
        case "subroutine":
          return `${n.id}[[${label}]]`;
        case "rhombus":
          return `${n.id}{${label}}`;
        default:
          return `${n.id}[${label}]`;
      }
    };

    for (const sg of graph.subgraphs) {
      lines.push(`subgraph ${sg.id}["${sg.title}"]`);
      lines.push("  direction TB");
      for (const nodeId of sg.nodes) {
        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node) continue;
        lines.push("  " + nodeLine(node));
      }
      lines.push("end");
      lines.push("");
    }

    const subgraphNodeIds = new Set(graph.subgraphs.flatMap(sg => sg.nodes));
    for (const node of graph.nodes) {
      if (!subgraphNodeIds.has(node.id)) {
        lines.push(nodeLine(node));
      }
    }

    const edgeOp = (type) => {
      if (type === "dotted") return "-.->";
      if (type === "thick") return "==>";
      return "-->";
    };
    for (const edge of graph.edges) {
      const label = edge.label ? `|${edge.label}|` : "";
      lines.push(`${edge.from} ${edgeOp(edge.type)}${label} ${edge.to}`);
    }

    return lines.join("\n");
  }
}

export default MermaidAstEngine;
