#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { MermaidAstEngine } from "../src/mermaid/MermaidAstEngine.js";

function printUsage() {
  console.error("Usage: mermaid-ast-check <input.json> [--maxNodes N] [--maxEdges N] [--maxDepth N]");
}

function parseArgs(argv) {
  const args = { file: null, maxNodes: undefined, maxEdges: undefined, maxDepth: undefined };
  const it = argv[Symbol.iterator]();
  let current = it.next();
  while (!current.done) {
    const a = current.value;
    if (!args.file && !a.startsWith("--")) {
      args.file = a;
    } else if (a === "--maxNodes") {
      const n = it.next().value;
      args.maxNodes = Number.parseInt(n, 10);
    } else if (a === "--maxEdges") {
      const n = it.next().value;
      args.maxEdges = Number.parseInt(n, 10);
    } else if (a === "--maxDepth") {
      const n = it.next().value;
      args.maxDepth = Number.parseInt(n, 10);
    }
    current = it.next();
  }
  return args;
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (!args.file) {
    printUsage();
    process.exit(1);
  }
  const raw = fs.readFileSync(args.file, "utf8");
  const astJson = JSON.parse(raw);

  const engine = new MermaidAstEngine({
    maxNodes: args.maxNodes ?? astJson.budgets?.maxNodes,
    maxEdges: args.maxEdges ?? astJson.budgets?.maxEdges,
    maxDepth: args.maxDepth ?? astJson.budgets?.maxDepth
  });

  engine.graph = astJson.graph ?? astJson;

  const result = engine.validate();
  if (!result.ok) {
    console.error("Mermaid AST validation FAILED");
    console.error("Errors:");
    for (const e of result.errors) console.error("  -", e);
    if (result.warnings.length) {
      console.error("Warnings:");
      for (const w of result.warnings) console.error("  -", w);
    }
    console.error("Budget:", result.budget);
    process.exit(2);
  }

  console.log("Mermaid AST validation OK");
  if (result.warnings.length) {
    console.log("Warnings:");
    for (const w of result.warnings) console.log("  -", w);
  }
  console.log("Budget:", result.budget);
  console.log("contentHash:", engine.contentHash());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
