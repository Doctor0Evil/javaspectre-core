// Build Mermaid flowcharts from structured definitions (no hand-typed syntax).

export class MermaidFlowBuilder {
  constructor(direction = "TD") {
    this.direction = direction;
    this.nodes = [];
    this.links = [];
    this.subgraphs = [];
  }

  addNode(id, label, opts = {}) {
    this.nodes.push({ id, label, opts });
    return this;
  }

  addLink(from, to, label = "", opts = {}) {
    this.links.push({ from, to, label, opts });
    return this;
  }

  addSubgraph(id, title, nodeIds = []) {
    this.subgraphs.push({ id, title, nodeIds });
    return this;
  }

  build() {
    const lines = [];
    lines.push(`flowchart ${this.direction}`);

    // Subgraphs first.
    for (const sg of this.subgraphs) {
      lines.push(`  subgraph ${sg.id} ${sg.title}`);
      for (const nid of sg.nodeIds) {
        const node = this.nodes.find(n => n.id === nid);
        if (!node) continue;
        const text = node.label.replace(/\n/g, "\\n");
        lines.push(`    ${node.id}[${text}]`);
      }
      lines.push("  end");
    }

    // Standalone nodes.
    for (const node of this.nodes) {
      if (this.subgraphs.some(sg => sg.nodeIds.includes(node.id))) continue;
      const text = node.label.replace(/\n/g, "\\n");
      lines.push(`  ${node.id}[${text}]`);
    }

    // Links.
    for (const link of this.links) {
      const lbl = link.label ? `|${link.label}|` : "";
      lines.push(`  ${link.from} --> ${lbl} ${link.to}`);
    }

    return lines.join("\n");
  }
}

export default MermaidFlowBuilder;
