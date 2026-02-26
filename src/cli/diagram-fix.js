// Safety-aware CLI that parses Mermaid diagrams in Markdown, normalizes them,
// runs structural checks, and can rewrite the file with fixed diagrams.

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
      "  javaspectre-diagram-fix <markdown-file> [--write] [--json] [--strict]",
      "",
      "Description:",
      "  Scans a Markdown file for ```mermaid blocks, parses them to ASTs,",
      "  enforces budgets (nodes/edges/depth), normalizes node ordering and",
      "  subgraph structure, and optionally rewrites the file with fixed diagrams.",
      "",
      "Options:",
      "  --write   Overwrite the file in-place with normalized diagrams.",
      "  --json    Emit a JSON report describing changes and violations.",
      "  --strict  Exit non-zero if any diagram has errors after normalization.",
      ""
    ].join("\n")
  );
}

function extractBlocksWithPositions(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let inBlock = false;
  let current = null;

  lines.forEach((line, idx) => {
    if (!inBlock && line.trim().startsWith("```mermaid")) {
      inBlock = true;
      current = {
        index: blocks.length,
        startLine: idx,
        codeLines: [],
        fenceLine: line
      };
      return;
    }
    if (inBlock && line.trim().startsWith("```")) {
      inBlock = false;
      current.endLine = idx;
      blocks.push(current);
      current = null;
      return;
    }
    if (inBlock && current) {
      current.codeLines.push(line);
    }
  });

  return { lines, blocks };
}

function parseBlockToAst(engine, block) {
  const code = block.codeLines.join("\n");
  const lines = code.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const graph = engine.createEmptyGraph("flowchart");
  const errors = [];

  if (lines.length === 0) {
    errors.push("Empty mermaid block.");
    return { graph, errors };
  }

  let i = 0;
  const first = lines;
  const flowMatch = /^flowchart\s+([A-Za-z]+)$/i.exec(first);
  if (flowMatch) {
    graph.direction = flowMatch;[2]
    i = 1;
  }

  const nodeRegex = /^([A-Za-z0-9_-]+)\[(.+)\]$|^([A-Za-z0-9_-]+)\((.+)\)$|^([A-Za-z0-9_-]+)\{(.+)\}$/;
  const edgeRegex = /^([A-Za-z0-9_-]+)\s+(-{1,2}\.->|==>|-->)\s*(\|(.+)\|)?\s*([A-Za-z0-9_-]+)$/;

  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
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
        if (nodeMatch && nodeMatch) {[2][1]
          id = nodeMatch;[2]
          label = nodeMatch;[1]
          shape = "rect";
        } else if (nodeMatch && nodeMatch) {[3][4]
          id = nodeMatch;[3]
          label = nodeMatch;[4]
          shape = "round";
        } else if (nodeMatch && nodeMatch) {[5][6]
          id = nodeMatch;[5]
          label = nodeMatch;[6]
          shape = "rhombus";
        }
        engine.addNode(graph, { id, label, shape });
      } catch (err) {
        errors.push(String(err.message || err));
      }
      continue;
    }

    if (edgeMatch) {
      try {
        const from = edgeMatch;[2]
        const op = edgeMatch;[1]
        const label = edgeMatch[4] || "";
        const to = edgeMatch;[5]
        let type = "arrow";
        if (op.includes(".-")) type = "dotted";
        else if (op.includes("==")) type = "thick";
        engine.addEdge(graph, { from, to, type, label });
      } catch (err) {
        errors.push(String(err.message || err));
      }
      continue;
    }

    errors.push(`Unrecognized mermaid fragment: "${line}"`);
  }

  return { graph, errors };
}

function normalizeGraph(graph) {
  const normalized = { ...graph };
  normalized.nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  normalized.edges = [...graph.edges].sort((a, b) => {
    if (a.from === b.from) return a.to.localeCompare(b.to);
    return a.from.localeCompare(b.from);
  });
  normalized.subgraphs = [...graph.subgraphs].map(sg => ({
    ...sg,
    nodes: [...sg.nodes].sort()
  }));
  return normalized;
}

function processFile(filePath, write) {
  const raw = fs.readFileSync(filePath, "utf8");
  const engine = new MermaidAstEngine({
    defaultDirection: "TD",
    maxNodes: 80,
    maxEdges: 160,
    maxDepth: 6
  });

  const { lines, blocks } = extractBlocksWithPositions(raw);
  const report = {
    file: path.resolve(filePath),
    diagramCount: blocks.length,
    totalErrors: 0,
    diagrams: []
  };

  let mutatedLines = [...lines];

  for (const block of blocks) {
    const { graph, errors: parseErrors } = parseBlockToAst(engine, block);
    const validation = engine.validate(graph);
    const allErrors = [...parseErrors, ...validation.errors];

    report.totalErrors += allErrors.length;

    const beforeRendered = block.codeLines.join("\n");
    const normalized = normalizeGraph(graph);
    const afterRendered = engine.render(normalized);

    const changed = beforeRendered.trim() !== afterRendered.trim();

    report.diagrams.push({
      index: block.index,
      startLine: block.startLine + 1,
      endLine: block.endLine + 1,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      subgraphCount: graph.subgraphs.length,
      direction: graph.direction,
      changed,
      errors: allErrors
    });

    if (write && changed) {
      const newBlockLines = [block.fenceLine, ...afterRendered.split(/\r?\n/), "```"];
      const before = mutatedLines.slice(0, block.startLine);
      const after = mutatedLines.slice(block.endLine + 1);
      mutatedLines.splice(0, mutatedLines.length, ...before, ...newBlockLines, ...after);
    }
  }

  if (write && report.diagramCount > 0) {
    fs.writeFileSync(filePath, mutatedLines.join("\n"), "utf8");
  }

  return report;
}

function printHuman(report) {
  // eslint-disable-next-line no-console
  console.log(`File: ${report.file}`);
  // eslint-disable-next-line no-console
  console.log(`Diagrams: ${report.diagramCount}, Total errors: ${report.totalErrors}`);
  // eslint-disable-next-line no-console
  console.log("");

  report.diagrams.forEach(diag => {
    // eslint-disable-next-line no-console
    console.log(
      `#${diag.index} lines ${diag.startLine}-${diag.endLine} ` +
        `nodes=${diag.nodeCount}, edges=${diag.edgeCount}, dir=${diag.direction}`
    );
    // eslint-disable-next-line no-console
    console.log(`  Changed: ${diag.changed ? "yes" : "no"}`);
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
    if (arg.startsWith("--")) flags.add(arg);
    else files.push(arg);
  }

  if (files.length !== 1) {
    printUsage();
    process.exit(1);
  }

  const filePath = files[0];
  const write = flags.has("--write");
  const strict = flags.has("--strict");
  const json = flags.has("--json");

  const report = processFile(filePath, write);

  if (json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  if (strict && report.totalErrors > 0) {
    process.exit(2);
  }
}

if (import.meta.url === `file://${__filename}`) {
  main();
}
