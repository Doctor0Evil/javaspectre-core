#!/usr/bin/env node
// Tiny CLI: compare a diagram.ast.json against the last stored version,
// compute drift, and exit non-zero when re-anchoring is required.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import sqlite3 from "sqlite3";
import { fileURLToPath } from "node:url";
import MermaidDriftMeter from "../src/mermaid/MermaidDriftMeter.js";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

function printUsage() {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage: mermaid-drift-check diagram.ast.json --diagramId ID [--db PATH] [--tier T1|T2|T3]",
      "",
      "Compares the given Mermaid AST JSON against the last stored snapshot",
      "for diagramId, computes drift, and exits non-zero if the change",
      "requires re-anchoring under the configured thresholds.",
      "",
      "Options:",
      "  --diagramId ID   Logical ID for this diagram (required).",
      "  --db PATH        Path to javaspectre catalog SQLite DB.",
      "                   Default: ../db/javaspectre-catalog.sqlite3",
      "  --tier Tn        Current trust tier for this diagram (default: T1).",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {
    file: null,
    diagramId: null,
    dbPath: path.join(dirname, "..", "db", "javaspectre-catalog.sqlite3"),
    tier: "T1",
  };

  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (!args.file && !a.startsWith("--")) {
      args.file = a;
      i += 1;
      continue;
    }
    if (a === "--diagramId") {
      args.diagramId = argv[i + 1] ?? null;
      i += 2;
      continue;
    }
    if (a === "--db") {
      args.dbPath = argv[i + 1] ?? args.dbPath;
      i += 2;
      continue;
    }
    if (a === "--tier") {
      args.tier = argv[i + 1] ?? args.tier;
      i += 2;
      continue;
    }
    // Unknown flag
    i += 1;
  }

  return args;
}

function loadAst(filePath) {
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  const raw = fs.readFileSync(abs, "utf8");
  const parsed = JSON.parse(raw);
  // Allow both { graph: {...} } and raw AST
  return parsed.graph ?? parsed;
}

// Minimal persistence: assumes a table diagram_snapshots with columns
//   diagramid TEXT, snapshotid INTEGER, tier TEXT, astjson TEXT, hashed TEXT, createdatiso TEXT
// and we pick the latest row for a given diagramId. [file:1]
function loadLastSnapshot(dbPath, diagramId) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
    });

    const sql =
      "SELECT tier, astjson, hashed FROM diagram_snapshots " +
      "WHERE diagramid = ? ORDER BY snapshotid DESC LIMIT 1";

    db.get(sql, [diagramId], (err, row) => {
      db.close();
      if (err) return reject(err);
      if (!row) return resolve(null);

      let ast;
      try {
        ast = JSON.parse(row.astjson);
      } catch (e) {
        return reject(
          new Error(
            `Failed to parse stored astjson for diagramId=${diagramId}: ${String(
              e.message || e
            )}`
          )
        );
      }

      resolve({
        tier: row.tier || "T1",
        ast,
        hash: row.hashed || null,
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file || !args.diagramId) {
    printUsage();
    process.exit(1);
  }

  let newAst;
  try {
    newAst = loadAst(args.file);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Failed to read/parse AST file ${args.file}:`, String(err));
    process.exit(1);
  }

  let oldSnapshot = null;
  try {
    oldSnapshot = await loadLastSnapshot(args.dbPath, args.diagramId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `Failed to load previous snapshot for diagramId=${args.diagramId}:`,
      String(err)
    );
    process.exit(1);
  }

  const meter = new MermaidDriftMeter();
  const currentTier = args.tier || oldSnapshot?.tier || "T1";

  const analysis = oldSnapshot
    ? meter.analyzeChange(
        { ast: oldSnapshot.ast, hash: oldSnapshot.hash, tier: currentTier },
        JSON.stringify(newAst)
      )
    : meter.analyzeChange(null, JSON.stringify(newAst));

  const {
    driftScore,
    metrics,
    newTier,
    forceReanchor,
    reason,
    hash,
  } = analysis;

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        diagramId: args.diagramId,
        previousTier: currentTier,
        newTier,
        driftScore,
        forceReanchor,
        reason,
        addedNodes: metrics.addedNodes,
        removedNodes: metrics.removedNodes,
        addedEdges: metrics.addedEdges,
        removedEdges: metrics.removedEdges,
        newHash: hash,
        dbPath: args.dbPath,
      },
      null,
      2
    )
  );

  if (forceReanchor) {
    // eslint-disable-next-line no-console
    console.error(
      `mermaid-drift-check: driftScore=${driftScore.toFixed(
        3
      )} requires re-anchoring for diagramId=${args.diagramId}`
    );
    process.exit(2);
  }

  // eslint-disable-next-line no-console
  console.error(
    `mermaid-drift-check: driftScore=${driftScore.toFixed(
      3
    )}, newTier=${newTier}, no re-anchoring required`
  );
  process.exit(0);
}

if (import.meta.url === `file://${filename}`) {
  // eslint-disable-next-line no-floating-promises
  main();
}
