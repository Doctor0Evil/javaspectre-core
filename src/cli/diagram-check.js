// CLI for validating Mermaid diagrams in Markdown files using MermaidAstEngine.

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import MermaidAstEngine from "../diagram/MermaidAstEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printUsage() {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  javaspectre-diagram-check <markdown-file> [--json] [--strict]",
      "",
      "Description:",
      "  Scans the given Markdown file for Mermaid ```mermaid code blocks,",
      "  parses them into a structured AST, applies structural and safety",
      "  checks (node/edge/depth budgets, reachability, cycles), and emits",
      "  a report to stdout.",
      "",
      "Options:",
      "  --json    Output machine-readable JSON report instead of human text.",
      "  --strict  Exit with non-zero status if any diagram has errors.",
      ""
    ].join("\n")
  );
}

function extractMermaidBlocks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let inBlock = false;
  let current = null;

  lines.forEach((line, idx) => {
    if (!inBlock && line.trim().startsWith("```mermaid")) {
      inBlock = true;
      current = { index: blocks.length, startLine: idx + 1, code: [] };
      return;
    }
    if (inBlock && line.trim().startsWith("```")) {
      inBlock = false;
      current.endLine = idx + 1;
      blocks.push(current);
      current = null;
      return;
    }
    if (inBlock && current) {
      current.code.push(line);
    }
  });

  return blocks.map(b => ({
    index: b.index,
    startLine: b.startLine,
    endLine: b.endLine,
    code: b.code.join("\n")
  }));
}

// Very small parser: assumes a flowchart with explicit node lines and edges.
// This is intentionally conservative and works best with the AST-engine style
// output you already generate.
function parseMermaidToAst(engine, block) {
  const lines = block.code.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const graph = engine.createEmptyGraph("flowchart");

  if (lines.length === 0) {
    return { graph, errors: ["Empty mermaid block."] };
  }

  let i = 0;
  const first = lines;
  const flowMatch = /^flowchart\s+([A-Za-z]+)$/i.exec(first);
  if (flowMatch) {
    graph.direction = flowMatch;[3]
    i = 1;
  }

  const nodeRegex = /^([A-Za-z0-9_-]+)\[(.+)\]$|^([A-Za-z0-9_-]+)\((.+)\)$|^([A-Za-z0-9_-]+)\{(.+)\}$/;
  const edgeRegex = /^([A-Za-z0-9_-]+)\s+(-{1,2}\.->|==>|-->)\s*(\|(.+)\|)?\s*([A-Za-z0-9_-]+)$/;

  const errors = [];

  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;

    // Skip subgraph scaffolding; AST engine cares only about nodes + edges.
    if (line.startsWith("subgraph") || line === "end" || line.startsWith("direction ")) {
      continue;
    }

    const nodeMatch = nodeRegex.exec(line);
    const edgeMatch = edgeRegex.exec(line);

    if (nodeMatch) {
      try {
        let id;
        let label;
        let shape = "rect";

        if (nodeMatch && nodeMatch) {[1][3]
          id = nodeMatch;[3]
          label = nodeMatch;[1]
          shape = "rect";
        } else if (nodeMatch && nodeMatch) {[2]
          id = nodeMatch;[2]
          label = nodeMatch;
          shape = "round";
        } else if (nodeMatch && nodeMatch) {
          id = nodeMatch;
          label = nodeMatch;
          shape = "rhombus";
        }

        engine.addNode(graph, { id, label, shape });
      } catch (err) {
        errors.push(`Line ${block.startLine + i}: ${String(err.message || err)}`);
      }
      continue;
    }

    if (edgeMatch) {
      try {
        const from = edgeMatch;[3]
        const op = edgeMatch;[1]
        const label = edgeMatch || "";
        const to = edgeMatch;
        let type = "arrow";
        if (op.includes(".-")) type = "dotted";
        else if (op.includes("==")) type = "thick";
        engine.addEdge(graph, { from, to, type, label });
      } catch (err) {
        errors.push(`Line ${block.startLine + i}: ${String(err.message || err)}`);
      }
      continue;
    }

    // Non-empty line that didn't match anything: treat as warning.
    errors.push(
      `Line ${block.startLine + i}: Unrecognized mermaid syntax fragment "${line}".`
    );
  }

  const validation = engine.validate(graph);
  if (!validation.ok) {
    validation.errors.forEach(e => errors.push(e));
  }

  return { graph, errors };
}

function buildReport(filePath, blocks, engine) {
  const diagrams = [];
  let totalErrors = 0;

  for (const block of blocks) {
    const { graph, errors } = parseMermaidToAst(engine, block);
    totalErrors += errors.length;

    const summary = {
      index: block.index,
      startLine: block.startLine,
      endLine: block.endLine,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      subgraphCount: graph.subgraphs.length,
      direction: graph.direction,
      errors
    };

    diagrams.push(summary);
  }

  return {
    file: path.resolve(filePath),
    diagramCount: diagrams.length,
    totalErrors,
    diagrams
  };
}

function printHumanReport(report) {
  // eslint-disable-next-line no-console
  console.log(`File: ${report.file}`);
  // eslint-disable-next-line no-console
  console.log(`Diagrams: ${report.diagramCount}, Total errors: ${report.totalErrors}`);
  // eslint-disable-next-line no-console
  console.log("");

  report.diagrams.forEach(diag => {
    // eslint-disable-next-line no-console
    console.log(
      `Diagram #${diag.index} (lines ${diag.startLine}-${diag.endLine}) ` +
        `nodes=${diag.nodeCount}, edges=${diag.edgeCount}, dir=${diag.direction}`
    );
    if (diag.errors.length === 0) {
      // eslint-disable-next-line no-console
      console.log("  ✔ OK");
    } else {
      diag.errors.forEach(err => {
        // eslint-disable-next-line no-console
        console.log(`  ✖ ${err}`);
      });
    }
    // eslint-disable-next-line no-console
    console.log("");
  });
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const flags = new Set();
  const files = [];

  for (const arg of args) {
    if (arg.startsWith("--")) {
      flags.add(arg);
    } else {
      files.push(arg);
    }
  }

  if (files.length !== 1) {
    printUsage();
    process.exit(1);
  }

  const filePath = files;
  let markdown;
  try {
    markdown = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Failed to read file "${filePath}": ${String(err.message || err)}`);
    process.exit(1);
  }

  const blocks = extractMermaidBlocks(markdown);
  const engine = new MermaidAstEngine({
    defaultDirection: "TD",
    maxNodes: 80,
    maxEdges: 160,
    maxDepth: 6
  });

  const report = buildReport(filePath, blocks, engine);

  if (flags.has("--json")) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (flags.has("--strict") && report.totalErrors > 0) {
    process.exit(2);
  }
}

if (import.meta.url === `file://${__filename}`) {
  main();
}
