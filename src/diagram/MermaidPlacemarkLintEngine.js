// Node-layer for Mermaid placemarker types and linting.

import MermaidAstEngine from "./MermaidAstEngine.js";
import MermaidVirtualObjectCompiler from "../mermaid/MermaidVirtualObjectCompiler.js";

export class MermaidPlacemarkLintEngine {
  constructor(options = {}) {
    this.astEngine = new MermaidAstEngine({
      defaultDirection: options.defaultDirection || "TD",
      maxNodes: options.maxNodes ?? 80,
      maxEdges: options.maxEdges ?? 160,
      maxDepth: options.maxDepth ?? 6
    });
    this.compiler = new MermaidVirtualObjectCompiler({
      defaultDomain: options.defaultDomain || "generic",
      requireSafety: options.requireSafety ?? true
    });
  }

  /**
   * Parse raw Mermaid text into an AST graph.
   * @param {string} text
   * @returns {{graph:Object, errors:string[]}}
   */
  parseToAst(text) {
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("MermaidPlacemarkLintEngine.parseToAst: empty input.");
    }
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const graph = this.astEngine.createEmptyGraph("flowchart");
    const errors = [];

    if (lines.length === 0) {
      errors.push("Empty Mermaid block.");
      return { graph, errors };
    }

    let i = 0;
    const first = lines[0];
    const flowMatch = /^flowchart\s+([A-Za-z]{2})/i.exec(first);
    if (flowMatch) {
      graph.direction = flowMatch[1];
      i = 1;
    }

    const nodeRegex =
      /^([A-Za-z0-9_-]+)\s*\[(.+?)\]$|^([A-Za-z0-9_-]+)\s*\(\s*(.+?)\s*\)$|^([A-Za-z0-9_-]+)\s*\{\s*(.+?)\s*\}$/;
    const edgeRegex =
      /^([A-Za-z0-9_-]+)\s*([-.]{1,2}>)\s*([A-Za-z0-9_-]+)(?:\s*\|\s*(.+?)\s*\|)?$/;

    for (; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      if (line.startsWith("subgraph") || line.startsWith("direction")) {
        continue;
      }

      const nodeMatch = nodeRegex.exec(line);
      const edgeMatch = edgeRegex.exec(line);

      if (nodeMatch) {
        try {
          let id;
          let label;
          let shape = "rect";
          if (nodeMatch[1] && nodeMatch[2]) {
            id = nodeMatch[1];
            label = nodeMatch[2];
            shape = "rect";
          } else if (nodeMatch[3] && nodeMatch[4]) {
            id = nodeMatch[3];
            label = nodeMatch[4];
            shape = "round";
          } else if (nodeMatch[5] && nodeMatch[6]) {
            id = nodeMatch[5];
            label = nodeMatch[6];
            shape = "rhombus";
          }
          this.astEngine.addNode(graph, { id, label, shape });
        } catch (err) {
          errors.push(
            `Line ${i + 1}: ${String(err.message || err)}`
          );
        }
        continue;
      }

      if (edgeMatch) {
        try {
          const from = edgeMatch[1];
          const op = edgeMatch[2];
          const to = edgeMatch[3];
          const label = edgeMatch[4] || "";
          let type = "arrow";
          if (op.includes(".")) type = "dotted";
          if (op.includes("=")) type = "thick";
          this.astEngine.addEdge(graph, { from, to, type, label });
        } catch (err) {
          errors.push(
            `Line ${i + 1}: ${String(err.message || err)}`
          );
        }
        continue;
      }

      errors.push(`Line ${i + 1}: Unrecognized Mermaid fragment: "${line}"`);
    }

    const validation = this.astEngine.validate(graph);
    if (!validation.ok) {
      validation.errors.forEach((e) => errors.push(e));
    }

    return { graph, errors };
  }

  /**
   * Attach placemarker metadata based on naming conventions.
   * - Nodes starting with "pm_" become kind:"placemarker".
   * - Label tags like "[TODO]" or "(gap)" mark placeholders.
   *
   * @param {Object} graph
   * @returns {Object} enrichedGraph
   */
  annotatePlacemarkers(graph) {
    const enriched = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        const meta = { ...(n.meta || {}) };
        const label = String(n.label || "");
        const id = String(n.id || "");

        let isPlaceholder = false;
        let role = meta.role || null;

        if (id.startsWith("pm_")) {
          isPlaceholder = true;
          role = role || "unspecified";
        }
        if (label.includes("[TODO]") || label.toLowerCase().includes("(gap)")) {
          isPlaceholder = true;
          if (!role) role = "diagram-gap";
        }

        if (isPlaceholder) {
          meta.placeholder = true;
          meta.role = role;
          meta.type = meta.type || "placeholder";
        }

        return { ...n, meta };
      })
    };
    return enriched;
  }

  /**
   * Run full lint: parse, annotate placemarkers, compile to virtual-objects,
   * and produce a gap report that ALN/Lua can consume.
   *
   * @param {string} mermaidText
   * @returns {Object} lintReport
   */
  lint(mermaidText) {
    const { graph, errors: parseErrors } = this.parseToAst(mermaidText);
    const graphWithPlacemarkers = this.annotatePlacemarkers(graph);
    let compiled = null;
    const compileErrors = [];

    try {
      compiled = this.compiler.compile(graphWithPlacemarkers);
      if (Array.isArray(compiled.errors)) {
        compiled.errors.forEach((e) => {
          compileErrors.push(
            typeof e === "string" ? e : JSON.stringify(e)
          );
        });
      }
    } catch (err) {
      compileErrors.push(
        `MermaidVirtualObjectCompiler error: ${String(err.message || err)}`
      );
    }

    const structuralIssues = [];
    const placeholderGaps = [];
    const policyGaps = [];

    for (const e of parseErrors) {
      structuralIssues.push({ kind: "parse-or-ast", message: e });
    }

    const instances = compiled?.instances || [];
    const definitions = compiled?.definitions || [];
    const policies = compiled?.policies || [];
    const envelopes = compiled?.envelopes || [];
    const anchors = compiled?.anchors || [];
    const edges = compiled?.edges || [];

    // Placeholder gaps
    for (const node of graphWithPlacemarkers.nodes) {
      const meta = node.meta || {};
      if (meta.placeholder) {
        placeholderGaps.push({
          nodeId: node.id,
          role: meta.role || "unspecified",
          label: node.label,
          hint: "ALN can propose a concrete subgraph for this placemarker."
        });
      }
    }

    // Policy coverage gaps (high-risk instances without a policy)
    const highRiskInstances = instances.filter(
      (inst) =>
        Array.isArray(inst.policyTags) &&
        inst.policyTags.includes("requires-governance")
    );
    const governedTargets = new Set(
      edges.filter((e) => e.relation === "governedby").map((e) => e.from)
    );
    for (const inst of highRiskInstances) {
      if (!governedTargets.has(inst.id)) {
        policyGaps.push({
          instanceId: inst.id,
          voKind: inst.voKind,
          message:
            "High-risk instance lacks a governing policy node; ALN or Lua should attach an ExcavationSafetyProfile."
        });
      }
    }

    // Envelope / anchor gaps
    const hasEnvelope = envelopes.length > 0;
    const hasAnchor = anchors.length > 0;
    if (hasEnvelope && !hasAnchor) {
      policyGaps.push({
        type: "anchoring-missing",
        message:
          "Diagram contains TransparencyEnvelope nodes but no AnchorManifest; add anchoring flow to Bostrom/EVM/DID."
      });
    }

    const ok =
      structuralIssues.length === 0 &&
      compileErrors.length === 0 &&
      placeholderGaps.length === 0 &&
      policyGaps.length === 0;

    return {
      ok,
      summary: {
        ok,
        nodeCount: graphWithPlacemarkers.nodes.length,
        edgeCount: graphWithPlacemarkers.edges.length,
        placeholders: placeholderGaps.length,
        policyGaps: policyGaps.length,
        parseErrorCount: parseErrors.length,
        compileErrorCount: compileErrors.length
      },
      structuralIssues,
      compileErrors,
      placeholderGaps,
      policyGaps,
      compiledModel: compiled,
      ast: graphWithPlacemarkers
    };
  }
}

export default MermaidPlacemarkLintEngine;
